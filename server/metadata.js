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
import { MusicBrainzApi } from 'musicbrainz-api';
import { getCachedMetadata, setCachedMetadata, getSetting, setSetting } from './db.js';
import { sendError, badRequest } from './lib/errors.js';

const router = express.Router();

// Official MusicBrainz client — sets the required User-Agent and retries on
// 429/503 rate-limit responses for us.
const mbApi = new MusicBrainzApi({
  appName: 'ResonanceHiFiOS',
  appVersion: '1.0.0',
  appContactInfo: 'https://github.com/marciobooi/EnzoOS',
});

const CACHE_TTL   = 1000 * 60 * 60 * 24 * 30;            // 30 days
const TIMEOUT_MS  = 7000;

// In-memory L1 cache in front of the SQLite metadata_cache (L2). Avoids a disk
// read every time a cover is opened — aligns with the project's "storage
// silence" goal. Bounded (LRU-ish: re-insert on hit, evict oldest over cap).
const MEM_CACHE_MAX = 64;
const memCache = new Map(); // key → { data, updatedAt }
function memGet(key) {
  const e = memCache.get(key);
  if (!e) return null;
  if (Date.now() - e.updatedAt >= CACHE_TTL) { memCache.delete(key); return null; }
  memCache.delete(key); memCache.set(key, e); // mark as most-recently-used
  return e;
}
function memSet(key, data, updatedAt = Date.now()) {
  memCache.delete(key);
  memCache.set(key, { data, updatedAt });
  if (memCache.size > MEM_CACHE_MAX) memCache.delete(memCache.keys().next().value);
}

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
  const search = await mbThrottle(() =>
    mbApi.search('release', { query: `artist:"${artist}" AND release:"${album}"`, limit: 5 }));
  // Pick the most complete candidate rather than blindly taking the first
  // hit: search results already carry label-info/barcode/date, and MB often
  // lists a barebones digital release first while a properly documented CD
  // pressing sits at #2 — that's why label/catalog/barcode came back null
  // for many albums even though MB has the data.
  const score = (r) =>
    (r['label-info']?.some((li) => li.label?.name) ? 4 : 0) +
    (r['label-info']?.some((li) => li['catalog-number']) ? 2 : 0) +
    (r.barcode ? 2 : 0) + (r.date ? 1 : 0) +
    (r.status === 'Official' ? 2 : 0);
  const rel = (search.releases || []).slice().sort((a, b) => score(b) - score(a))[0];
  if (!rel) return null;
  const detail = await mbThrottle(() =>
    mbApi.lookup('release', rel.id, ['artists', 'labels', 'release-groups', 'genres']));
  const genres = (detail.genres || []).sort((a, b) => (b.count || 0) - (a.count || 0)).map((g) => g.name).slice(0, 6);
  const rg = detail['release-group'] || {};
  // "Album", "Live Album", "Compilation EP", etc.
  const albumType = [rg['primary-type'], ...(rg['secondary-types'] || [])].filter(Boolean).reverse().join(' ') || null;
  // Physical/digital format(s) of this pressing, de-duplicated: "CD", "12\" Vinyl".
  const media = [...new Set((detail.media || []).map((m) => m.format).filter(Boolean))].join(' + ') || null;
  const trackCount = (detail.media || []).reduce((n, m) => n + (m['track-count'] || 0), 0) || detail['track-count'] || null;
  return {
    mbid: detail.id,
    releaseGroupMbid: rg.id || null,
    artistMbid: detail['artist-credit']?.[0]?.artist?.id || null,
    title: detail.title,
    releaseDate: detail.date || rg['first-release-date'] || null,
    originalDate: rg['first-release-date'] || null,
    albumType,
    media,
    label: detail['label-info']?.[0]?.label?.name || null,
    catalog: detail['label-info']?.[0]?.['catalog-number'] || null,
    country: detail.country || null,
    barcode: detail.barcode || null,
    discCount: (detail.media || []).length || null,
    trackCount,
    genres,
  };
}

// ── MusicBrainz artist-level enrichment ──────────────────────────────────────
// Two extra throttled lookups (≈1.1 s each, results cached for 30 days like
// everything else) that unlock the "relational" layer the flat album snapshot
// was missing: official/streaming/social links and a discography summary.

// Map an artist's URL-relations to named links by hostname. MB relation type
// strings vary ("social network", "streaming", "free streaming", …) so the
// hostname is the more reliable discriminator.
async function fromMusicBrainzArtistLinks(artistMbid) {
  if (!artistMbid) return null;
  const detail = await mbThrottle(() => mbApi.lookup('artist', artistMbid, ['url-rels']));
  const links = { streaming: {}, socials: {} };
  let discogsArtistId = null;
  for (const rel of detail.relations || []) {
    const url = rel.url?.resource;
    if (!url || rel.ended) continue;
    let host;
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
    if (host.includes('spotify.com'))            links.streaming.spotify    ??= url;
    else if (host === 'music.apple.com')         links.streaming.appleMusic ??= url;
    else if (host.includes('youtube.com') || host === 'youtu.be') links.streaming.youtube ??= url;
    else if (host.endsWith('bandcamp.com'))      links.streaming.bandcamp   ??= url;
    else if (host.includes('soundcloud.com'))    links.streaming.soundcloud ??= url;
    else if (host.includes('tidal.com'))         links.streaming.tidal      ??= url;
    else if (host.includes('deezer.com'))        links.streaming.deezer     ??= url;
    else if (host.includes('instagram.com'))     links.socials.instagram    ??= url;
    else if (host.includes('twitter.com') || host === 'x.com') links.socials.twitter ??= url;
    else if (host.includes('tiktok.com'))        links.socials.tiktok       ??= url;
    else if (host.includes('facebook.com'))      links.socials.facebook     ??= url;
    else if (host.includes('discogs.com')) {
      const m = url.match(/discogs\.com\/artist\/(\d+)/);
      if (m) discogsArtistId = Number(m[1]);
    }
    else if (rel.type === 'official homepage')   links.homepage ??= url;
  }
  return { links, discogsArtistId };
}

// Discography summary from the artist's release-groups: how many proper
// albums vs singles/EPs exist, and the most recent release of any kind.
async function fromMusicBrainzDiscography(artistMbid) {
  if (!artistMbid) return null;
  const res = await mbThrottle(() =>
    mbApi.browse('release-group', { artist: artistMbid, limit: 100 }));
  const groups = res['release-groups'] || [];
  const isPlain = (rg) => !(rg['secondary-types'] || []).length; // exclude live/comp/remix
  const albums = groups.filter((rg) => rg['primary-type'] === 'Album' && isPlain(rg));
  const singlesEps = groups.filter((rg) => ['Single', 'EP'].includes(rg['primary-type']) && isPlain(rg));
  const dated = groups.filter((rg) => rg['first-release-date']);
  const latest = dated.sort((a, b) => (b['first-release-date'] || '').localeCompare(a['first-release-date'] || ''))[0];
  return {
    totalAlbums: albums.length,
    totalSinglesEPs: singlesEps.length,
    latestRelease: latest ? {
      title: latest.title,
      type: latest['primary-type'] || 'Release',
      date: latest['first-release-date'],
    } : null,
  };
}

async function fromLastfm(artist, album, key, lang = 'en') {
  if (!key) return null;
  const base = 'https://ws.audioscrobbler.com/2.0/';
  // Last.fm returns the wiki/bio in `lang` (ISO 639-1) when a translation exists,
  // otherwise it falls back to English on its side. Only append for non-English.
  const langParam = lang && lang !== 'en' ? `&lang=${enc(lang)}` : '';
  const [al, ar] = await Promise.allSettled([
    jget(`${base}?method=album.getinfo&api_key=${key}&artist=${enc(artist)}&album=${enc(album)}${langParam}&format=json`),
    jget(`${base}?method=artist.getinfo&api_key=${key}&artist=${enc(artist)}${langParam}&format=json`),
  ]);
  const album_ = al.status === 'fulfilled' ? al.value?.album : null;
  const artist_ = ar.status === 'fulfilled' ? ar.value?.artist : null;
  // album.getinfo returns a single track as an object, many as an array — normalise.
  const rawTracks = album_?.tracks?.track;
  const trackArr = Array.isArray(rawTracks) ? rawTracks : (rawTracks ? [rawTracks] : []);
  const tracks = trackArr.map((t) => ({
    name: t.name,
    duration: t.duration ? Number(t.duration) : null,
  })).filter((t) => t.name);
  return {
    albumSummary: cleanBio(album_?.wiki?.summary),
    artistBio: cleanBio(artist_?.bio?.summary),
    listeners: artist_?.stats?.listeners ? Number(artist_.stats.listeners) : null,
    playcount: album_?.playcount ? Number(album_.playcount) : null,
    tags: (album_?.tags?.tag || artist_?.tags?.tag || []).map((t) => t.name).slice(0, 6),
    similar: (artist_?.similar?.artist || []).map((a) => a.name).slice(0, 6),
    // Deep-linked variant of `similar` (name-only array kept for the existing
    // UIs): Last.fm returns each similar artist's page URL alongside the name.
    similarArtists: (artist_?.similar?.artist || [])
      .map((a) => ({ name: a.name, url: a.url || null }))
      .filter((a) => a.name).slice(0, 6),
    tracks,
    onTour: artist_?.ontour === '1',
  };
}

async function fromAudioDB(artist, album, key, lang = 'en') {
  const base = `https://www.theaudiodb.com/api/v1/json/${key || '2'}`;
  const [ar, al] = await Promise.allSettled([
    jget(`${base}/search.php?s=${enc(artist)}`),
    jget(`${base}/searchalbum.php?s=${enc(artist)}&a=${enc(album)}`),
  ]);
  const a = ar.status === 'fulfilled' ? ar.value?.artists?.[0] : null;
  const b = al.status === 'fulfilled' ? al.value?.album?.[0] : null;
  const num = (v) => (v != null && v !== '' && !isNaN(v) ? Number(v) : null);
  // TheAudioDB stores per-language bios/reviews as strBiographyEN / strBiographyPT
  // / strDescriptionEN / strDescriptionPT … Prefer the requested language, fall
  // back to English when that translation is absent.
  const LL = (lang || 'en').toUpperCase();
  const localized = (obj, field) => obj?.[`${field}${LL}`] || obj?.[`${field}EN`] || null;
  // TheAudioDB stores socials as bare domains ("facebook.com/yungblud") — normalise.
  const soc = (v) => (v ? (String(v).startsWith('http') ? v : `https://${v}`) : null);
  return {
    // artist / band
    theaudiodbArtistId: num(a?.idArtist),
    facebook: soc(a?.strFacebook),
    twitter: soc(a?.strTwitter),
    artistBio: localized(a, 'strBiography'),
    artistThumb: a?.strArtistThumb || null,
    artistBanner: a?.strArtistBanner || null,
    artistFanart: a?.strArtistFanart || a?.strArtistFanart2 || null,
    artistLogo: a?.strArtistLogo || null,
    style: a?.strStyle || null,
    mood: a?.strMood || null,
    genre: a?.strGenre || null,
    origin: a?.strCountry || null,
    formedYear: num(a?.intFormedYear),
    bornYear: num(a?.intBornYear),
    diedYear: num(a?.intDiedYear),
    members: num(a?.intMembers),
    gender: a?.strGender || null,
    website: a?.strWebsite || null,
    // album
    albumReview: localized(b, 'strDescription'),
    albumThumb: b?.strAlbumThumb || null,
    albumYear: num(b?.intYearReleased),
    albumGenre: b?.strGenre || null,
    albumLabel: b?.strLabel || null,
    albumScore: num(b?.intScore),
    releaseFormat: b?.strReleaseFormat || null,
    theme: b?.strTheme || null,
  };
}

async function aggregate(artist, album, keys, lang = 'en') {
  const [mb, lf, adb] = await Promise.allSettled([
    fromMusicBrainz(artist, album),
    fromLastfm(artist, album, keys.lastfm, lang),
    fromAudioDB(artist, album, keys.audiodb, lang),
  ]);
  const MB = mb.status === 'fulfilled' ? mb.value : null;
  const LF = lf.status === 'fulfilled' ? lf.value : null;
  const ADB = adb.status === 'fulfilled' ? adb.value : null;

  // Artist-level enrichment rides on the release lookup's artist MBID. These
  // run after the three primary sources (MB calls are serialised at 1 req/s
  // anyway) and each failure degrades gracefully to null.
  const [linksRes, discoRes] = await Promise.allSettled([
    fromMusicBrainzArtistLinks(MB?.artistMbid),
    fromMusicBrainzDiscography(MB?.artistMbid),
  ]);
  const LINKS = linksRes.status === 'fulfilled' ? linksRes.value : null;
  const DISCO = discoRes.status === 'fulfilled' ? discoRes.value : null;

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

  // High-res front cover from the Cover Art Archive (keyed by the release MBID).
  const coverArt = MB?.mbid ? `https://coverartarchive.org/release/${MB.mbid}/front-500` : null;

  return {
    artist,
    album,
    title: MB?.title || album,
    biography,
    review,
    genres,
    // ── imagery ──
    coverArt,                                   // album front (CAA, high-res)
    albumImage: ADB?.albumThumb || null,        // album thumb (TheAudioDB)
    artistImage: ADB?.artistThumb || null,      // artist portrait
    artistBanner: ADB?.artistBanner || null,
    artistFanart: ADB?.artistFanart || null,    // wide hero background
    artistLogo: ADB?.artistLogo || null,
    // ── album facts ──
    albumType: MB?.albumType || null,           // Album / EP / Live / Compilation
    releaseDate: MB?.releaseDate || (ADB?.albumYear ? String(ADB.albumYear) : null),
    originalDate: MB?.originalDate || null,      // first-ever release date
    label: MB?.label || ADB?.albumLabel || null,
    catalog: MB?.catalog || null,
    country: MB?.country || null,               // release country
    barcode: MB?.barcode || null,
    discCount: MB?.discCount || null,
    trackCount: MB?.trackCount || null,
    format: MB?.media || ADB?.releaseFormat || null,   // CD / Vinyl / Digital
    rating: ADB?.albumScore || null,            // /10
    theme: ADB?.theme || null,
    tracks: LF?.tracks || [],                    // [{ name, duration }]
    // ── band facts ──
    origin: ADB?.origin || null,                // where the band is from
    // formedYear is strictly the band-formation year now. It previously fell
    // back to bornYear, which conflated a solo artist's BIRTH year with when
    // their career started ("Formed 1997" for someone born in 1997). The two
    // are exposed separately; isSolo lets the UI pick the right label.
    formedYear: ADB?.formedYear || null,
    bornYear: ADB?.bornYear || null,
    isSolo: ADB?.members === 1,
    diedYear: ADB?.diedYear || null,
    members: ADB?.members || null,
    website: LINKS?.links?.homepage || ADB?.website || null,
    style: ADB?.style || null,
    mood: ADB?.mood || null,
    // ── popularity / discovery ──
    listeners: LF?.listeners || null,
    playcount: LF?.playcount || null,
    onTour: LF?.onTour || false,
    similar: LF?.similar || [],                  // names only (legacy UIs)
    similarArtists: LF?.similarArtists || [],    // [{ name, url }]
    // ── explicit ID namespaces ──
    // `mbid` (the release MBID) is kept for backwards compatibility, but ids{}
    // disambiguates what each identifier refers to.
    mbid: MB?.mbid || null,
    ids: {
      releaseMbid: MB?.mbid || null,
      releaseGroupMbid: MB?.releaseGroupMbid || null,
      artistMbid: MB?.artistMbid || null,
      discogsArtistId: LINKS?.discogsArtistId || null,
      theaudiodbArtistId: ADB?.theaudiodbArtistId || null,
    },
    // ── links (MusicBrainz URL-relations, TheAudioDB socials as fallback) ──
    streamingLinks: LINKS?.links?.streaming && Object.keys(LINKS.links.streaming).length
      ? LINKS.links.streaming : null,
    socials: (() => {
      const s = { ...(LINKS?.links?.socials || {}) };
      if (!s.facebook && ADB?.facebook) s.facebook = ADB.facebook;
      if (!s.twitter && ADB?.twitter) s.twitter = ADB.twitter;
      return Object.keys(s).length ? s : null;
    })(),
    // ── discography summary (MusicBrainz release-groups) ──
    discography: DISCO,
    // ── structured classification (from data already fetched — no new APIs) ──
    classifications: {
      primaryGenre: genres[0] || ADB?.genre || null,
      subGenres: genres.slice(1),
      vibeTags: [...new Set([ADB?.mood, ADB?.theme, ...(LF?.tags || [])].filter(Boolean))].slice(0, 8),
    },
    // ── tour utility ──
    // Last.fm only says WHETHER the artist tours; next-show data needs a
    // Bandsintown/Ticketmaster API key. These search deep-links need none.
    tour: {
      onTour: LF?.onTour || false,
      bandsintownSearchUrl: `https://www.bandsintown.com/en/search?query=${enc(artist)}`,
      ticketmasterSearchUrl: `https://www.ticketmaster.com/search?q=${enc(artist)}`,
    },
    sources,
    fetchedAt: Date.now(),
  };
}

// GET /api/metadata/album?artist=&album=  — on-demand, cached
router.get('/album', async (req, res) => {
  const artist = (req.query.artist || '').toString().trim();
  const album = (req.query.album || '').toString().trim();
  if (!artist || !album) return sendError(res, badRequest('artist and album are required'));

  // Language for editorial text (bio/review). Only supported locales are honoured;
  // anything else falls back to English. The cache key is namespaced by language so
  // English and Portuguese results don't overwrite each other.
  const SUPPORTED_META_LANGS = ['en', 'pt'];
  const reqLang = (req.query.lang || 'en').toString().toLowerCase();
  const lang = SUPPORTED_META_LANGS.includes(reqLang) ? reqLang : 'en';

  const keys = await resolveKeys();
  const lastfmConfigured = !!keys.lastfm;
  // v2: schema gained ids/links/discography/classifications — the version bump
  // makes stale flat-schema cache entries miss so they re-fetch enriched.
  const cacheKey = `album:v2:${artist}|${album}|${lang}`.toLowerCase();
  try {
    // L1: in-memory.
    const mem = memGet(cacheKey);
    if (mem) return res.json({ ...mem.data, lastfmConfigured, cached: true });
    // L2: SQLite — promote a hit into memory so repeat lookups skip the disk.
    const cached = await getCachedMetadata(cacheKey);
    if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
      memSet(cacheKey, cached.data, cached.updatedAt);
      return res.json({ ...cached.data, lastfmConfigured, cached: true });
    }
    const data = await aggregate(artist, album, keys, lang);
    // Only cache results that actually carry something useful.
    if (data.biography || data.review || data.label || data.genres.length || data.tracks.length) {
      memSet(cacheKey, data);
      await setCachedMetadata(cacheKey, data);
    }
    res.json({ ...data, lastfmConfigured, cached: false });
  } catch (err) {
    sendError(res, err, req);
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
    sendError(res, err, req);
  }
});

export default router;
