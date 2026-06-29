// Pure display/formatting helpers shared by the player UI.

// Map 0–100 slider value to a dB string for display (matches server toDb()).
export function toVolumeDb(vol) {
  if (vol <= 0) return '−∞';
  const db = -60 * (1 - vol / 100);
  return db === 0 ? '0.0' : db.toFixed(1);
}

// Time-of-day greeting for the kiosk welcome screen.
export function getGreeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good Morning';
  if (h >= 12 && h < 17) return 'Good Afternoon';
  if (h >= 17 && h < 21) return 'Good Evening';
  return 'Good Night';
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
