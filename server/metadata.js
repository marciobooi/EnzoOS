/**
 * Premium metadata aggregator — a "hybrid meta-engine" that merges deep,
 * royalty-free music data from several open/community sources into one object:
 *
 *   • MusicBrainz  — factual credits: label, country, release date, track count,
 *                    genres (no API key; strict 1 req/sec rate limit).
 *   • Last.fm      — editorial: artist biography, tags, listeners, similar
 *                    artists (optional — set LASTFM_API_KEY).
 *   • TheAudioDB   — biographies, album reviews, clean artwork (free dev key '2',
 *                    or set THEAUDIODB_KEY for a production key).
 *
 * Results are merged with Promise.allSettled (one source failing never breaks
 * the response) and cached in SQLite so each album hits the network only once.
 *
 * Exposed as GET /api/metadata/album?artist=&album= — called on demand only
 * when the user taps the now-playing cover.
 */
import express from 'express';
import { getCachedMetadata, setCachedMetadata, getSetting, setSetting } from './db.js';

const router = express.Router();

const UA = 'ResonanceHiFiOS/1.0 (https://github.com/marciobooi/EnzoOS)';
const CACHE_TTL   = 1000 * 60 * 60 * 24 * 30;            // 30 days
const TIMEOUT_MS  = 7000;

// Keys are resolved per request: DB setting first (managed from the remote
// Settings tab), then env var, then a sensible default. This lets users add
// keys at runtime without editing .env or restarting.
async function resolveKeys() {
  const [lf, adb, dc] = await Promise.all([
    getSetting('lastfm_api_key').catch(() => null),
    getSetting('theaudiodb_key').catch(() => null),
    getSetting('discogs_token').catch(() => null),
  ]);
  return {
    lastfm:  (lf  || process.env.LASTFM_API_KEY  || '').trim(),
    audiodb: (adb || process.env.THEAUDIODB_KEY  || '2').trim(),   // '2' = free dev key
    discogs: (dc  || process.env.DISCOGS_TOKEN   || '').trim(),
  };
}

const enc = (s) => encodeURIComponent(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jget(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ── MusicBrainz: serialise calls to honour the 1 req/sec policy ──────────────
let mbChain = Promise.resolve();
function mbThrottle(fn) {
  const run = mbChain.then(fn, fn);
  mbChain = run.then(() => sleep(1100), () => sleep(1100));
  return run;
}

// Strip Last.fm's trailing "Read more on Last.fm" / <a> link from bios.
function cleanBio(text) {
  if (!text) return null;
  return text.replace(/<a[^>]*>.*?<\/a>/gi, '').replace(/\s*Read more on Last\.fm.*$/is, '').trim() || null;
}

async function fromMusicBrainz(artist, album) {
  const q = enc(`artist:"${artist}" AND release:"${album}"`);
  const search = await mbThrottle(() =>
    jget(`https://musicbrainz.org/ws/2/release/?query=${q}&fmt=json&limit=1`, { 'User-Agent': UA }));
  const rel = search.releases?.[0];
  if (!rel) return null;
  const detail = await mbThrottle(() =>
    jget(`https://musicbrainz.org/ws/2/release/${rel.id}?inc=artist-credits+labels+release-groups+genres&fmt=json`, { 'User-Agent': UA }));
  const genres = (detail.genres || []).sort((a, b) => (b.count || 0) - (a.count || 0)).map((g) => g.name).slice(0, 6);
  return {
    mbid: detail.id,
    artistMbid: detail['artist-credit']?.[0]?.artist?.id || null,
    title: detail.title,
    releaseDate: detail.date || detail['release-group']?.['first-release-date'] || null,
    label: detail['label-info']?.[0]?.label?.name || null,
    catalog: detail['label-info']?.[0]?.['catalog-number'] || null,
    country: detail.country || null,
    barcode: detail.barcode || null,
    trackCount: detail['track-count'] || null,
    genres,
  };
}

async function fromLastfm(artist, album, key) {
  if (!key) return null;
  const base = 'https://ws.audioscrobbler.com/2.0/';
  const [al, ar] = await Promise.allSettled([
    jget(`${base}?method=album.getinfo&api_key=${key}&artist=${enc(artist)}&album=${enc(album)}&format=json`),
    jget(`${base}?method=artist.getinfo&api_key=${key}&artist=${enc(artist)}&format=json`),
  ]);
  const album_ = al.status === 'fulfilled' ? al.value?.album : null;
  const artist_ = ar.status === 'fulfilled' ? ar.value?.artist : null;
  return {
    albumSummary: cleanBio(album_?.wiki?.summary),
    artistBio: cleanBio(artist_?.bio?.summary),
    listeners: artist_?.stats?.listeners ? Number(artist_.stats.listeners) : null,
    playcount: album_?.playcount ? Number(album_.playcount) : null,
    tags: (album_?.tags?.tag || artist_?.tags?.tag || []).map((t) => t.name).slice(0, 6),
    similar: (artist_?.similar?.artist || []).map((a) => a.name).slice(0, 6),
  };
}

async function fromAudioDB(artist, album, key) {
  const base = `https://www.theaudiodb.com/api/v1/json/${key || '2'}`;
  const [ar, al] = await Promise.allSettled([
    jget(`${base}/search.php?s=${enc(artist)}`),
    jget(`${base}/searchalbum.php?s=${enc(artist)}&a=${enc(album)}`),
  ]);
  const artist_ = ar.status === 'fulfilled' ? ar.value?.artists?.[0] : null;
  const album_ = al.status === 'fulfilled' ? al.value?.album?.[0] : null;
  return {
    artistBio: artist_?.strBiographyEN || null,
    artistThumb: artist_?.strArtistThumb || null,
    artistBanner: artist_?.strArtistBanner || null,
    style: artist_?.strStyle || null,
    mood: artist_?.strMood || null,
    formedYear: artist_?.intFormedYear || null,
    albumReview: album_?.strDescriptionEN || null,
    albumThumb: album_?.strAlbumThumb || null,
    albumYear: album_?.intYearReleased || null,
    albumGenre: album_?.strGenre || null,
  };
}

async function aggregate(artist, album, keys) {
  const [mb, lf, adb] = await Promise.allSettled([
    fromMusicBrainz(artist, album),
    fromLastfm(artist, album, keys.lastfm),
    fromAudioDB(artist, album, keys.audiodb),
  ]);
  const MB = mb.status === 'fulfilled' ? mb.value : null;
  const LF = lf.status === 'fulfilled' ? lf.value : null;
  const ADB = adb.status === 'fulfilled' ? adb.value : null;

  // Prefer the richest biography/review available; merge factual + editorial.
  const biography = ADB?.artistBio || LF?.artistBio || null;
  const review = ADB?.albumReview || LF?.albumSummary || null;
  const genres = (MB?.genres?.length ? MB.genres
    : LF?.tags?.length ? LF.tags
    : (ADB?.albumGenre ? [ADB.albumGenre] : [])).filter(Boolean);

  const sources = [];
  if (MB) sources.push('MusicBrainz');
  if (LF) sources.push('Last.fm');
  if (ADB && (ADB.artistBio || ADB.albumReview || ADB.albumThumb)) sources.push('TheAudioDB');

  return {
    artist,
    album,
    title: MB?.title || album,
    biography,
    review,
    genres,
    releaseDate: MB?.releaseDate || (ADB?.albumYear ? String(ADB.albumYear) : null),
    label: MB?.label || null,
    catalog: MB?.catalog || null,
    country: MB?.country || null,
    barcode: MB?.barcode || null,
    trackCount: MB?.trackCount || null,
    listeners: LF?.listeners || null,
    playcount: LF?.playcount || null,
    similar: LF?.similar || [],
    style: ADB?.style || null,
    mood: ADB?.mood || null,
    formedYear: ADB?.formedYear || null,
    artistImage: ADB?.artistThumb || null,
    albumImage: ADB?.albumThumb || null,
    mbid: MB?.mbid || null,
    sources,
    fetchedAt: Date.now(),
  };
}

// GET /api/metadata/album?artist=&album=  — on-demand, cached
router.get('/album', async (req, res) => {
  const artist = (req.query.artist || '').toString().trim();
  const album = (req.query.album || '').toString().trim();
  if (!artist || !album) return res.status(400).json({ error: 'artist and album are required' });

  const keys = await resolveKeys();
  const lastfmConfigured = !!keys.lastfm;
  const cacheKey = `album:${artist}|${album}`.toLowerCase();
  try {
    const cached = await getCachedMetadata(cacheKey);
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
      return res.json({ ...cached.data, lastfmConfigured, cached: true });
    }
    const data = await aggregate(artist, album, keys);
    // Only cache results that actually carry something useful.
    if (data.biography || data.review || data.label || data.genres.length) {
      await setCachedMetadata(cacheKey, data);
    }
    res.json({ ...data, lastfmConfigured, cached: false });
  } catch (err) {
    console.error('[Metadata] aggregate failed:', err.message);
    res.status(500).json({ error: 'metadata lookup failed' });
  }
});

// GET /api/metadata/keys — current keys (for the Settings form to pre-fill).
// The free TheAudioDB dev key '2' is reported as empty (not user-configured).
router.get('/keys', async (req, res) => {
  const k = await resolveKeys();
  res.json({
    lastfm: k.lastfm || '',
    theaudiodb: k.audiodb && k.audiodb !== '2' ? k.audiodb : '',
    discogs: k.discogs || '',
  });
});

// POST /api/metadata/keys — save provided keys to the DB (empty string clears).
router.post('/keys', async (req, res) => {
  const { lastfm, theaudiodb, discogs } = req.body || {};
  try {
    if (lastfm !== undefined)     await setSetting('lastfm_api_key', String(lastfm).trim());
    if (theaudiodb !== undefined) await setSetting('theaudiodb_key', String(theaudiodb).trim());
    if (discogs !== undefined)    await setSetting('discogs_token', String(discogs).trim());
    res.json({ success: true });
  } catch (err) {
    console.error('[Metadata] save keys failed:', err.message);
    res.status(500).json({ error: 'could not save keys' });
  }
});

export default router;
