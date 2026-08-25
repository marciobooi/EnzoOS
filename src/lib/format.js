// Pure display/formatting helpers shared by the player UI.

// Map 0–100 slider value to a dB string for display.
// Cubic law taper — matches server event-service.js's getCachedVolumeDb()
// exactly (AUDIT-2026-08-01: the previous linear-in-dB curve put 50% at
// -30dB, reported live as "middle is like mute"). Keep the two in sync if
// either changes. Deliberately does NOT include the server-side Spotify
// Level Trim (event-service.js's getEffectiveVolumeDb(), Phase 2 cross-source
// loudness work) — the slider always displays what the USER set, the trim is
// an invisible compensation applied only to what CamillaDSP actually
// receives while Spotify/DJ is the active source.
export function toVolumeDb(vol) {
  if (vol <= 0) return '−∞';
  if (vol >= 100) return '0.0';
  const db = 60 * Math.log10(vol / 100);
  return db.toFixed(1);
}

// Time-of-day greeting for the kiosk welcome screen.
export function getGreeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good Morning';
  if (h >= 12 && h < 17) return 'Good Afternoon';
  if (h >= 17 && h < 21) return 'Good Evening';
  return 'Good Night';
}

// Extract the primary (lead) artist from a display credit string like
// "Seether, Amy Lee" (Spotify joins every track artist, features included,
// with ", "). External metadata/lyrics APIs (MusicBrainz, Last.fm, TheAudioDB,
// lyrics providers) key by a single canonical artist name — searching for the
// full joined string fails to match even for well-documented lead artists,
// since no database has an artist literally named "Seether, Amy Lee". Use
// this for API lookups; keep the full joined string for on-screen credits.
// AUDIT-2026-08-24: splitting on the first comma also truncates any artist
// whose REAL name contains one — "Earth, Wind & Fire", "Crosby, Stills &
// Nash", "Emerson, Lake & Palmer" — since by the time a caller has a plain
// joined string, the original per-artist array is already gone and there's
// no reliable way to tell an in-name comma from a join separator. Callers
// that still have the raw artists array (Spotify's track.artists[0] IS the
// lead artist, unambiguously) should pass THAT instead — see the
// albumInfoLeadArtist plumbing in Kiosk.jsx/RemoteControl.jsx and its
// callers. This string-split path is now only the fallback for sources
// (radio, local/MPD) that never had a real per-artist array to begin with.
export function primaryArtist(displayArtist) {
  if (!displayArtist) return displayArtist;
  if (Array.isArray(displayArtist)) {
    const first = displayArtist[0];
    return (typeof first === 'string' ? first : first?.name) || '';
  }
  return displayArtist.split(',')[0].trim();
}

// Sanitise track names that come from MPD ICY/stream metadata.
// MPD can set %title% to the stream URL itself (common with HLS/AAC streams
// that have no ICY metadata), or to raw XML from Dalet-based automation.
export function sanitizeTrackName(name) {
  if (!name) return name;
  // If the name IS a URL (MPD fallback for streams without ICY title), suppress it —
  // showing a raw URL as a track title is worse than showing nothing.
  if (name.startsWith('http://') || name.startsWith('https://')) return '';
  if (!name.includes('<')) return name;
  // RadioInfo XML (Portuguese/Spanish stations via Dalet automation systems)
  const song   = name.match(/<DB_SONG_NAME>([^<]+)<\/DB_SONG_NAME>/)?.[1];
  const artist = name.match(/<DB_LEAD_ARTIST_NAME>([^<]+)<\/DB_LEAD_ARTIST_NAME>/)?.[1];
  if (song) return artist ? `${song} — ${artist}` : song;
  // Generic fallback: strip all XML/HTML tags
  const stripped = name.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || name;
}
