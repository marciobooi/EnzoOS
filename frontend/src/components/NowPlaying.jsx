export default function NowPlaying({ track, status }) {
  // Simple string hasher for generative art fallback
  const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash);
  };

  // Generate fallback gradients if no album art exists
  const isFallback = !track.albumArtUrl;
  const hash1 = isFallback ? hashString(track.artist || 'Artist') % 360 : 0;
  const hash2 = isFallback ? hashString(track.title || 'Title') % 360 : 0;
  const fallbackGradient = `linear-gradient(135deg, hsl(${hash1}, 60%, 40%), hsl(${hash2}, 70%, 30%))`;

  return (
    <div className="relative flex flex-col items-center text-center w-full max-w-2xl h-full justify-center">
      {/* Blurred background image for premium look */}
      <div
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-30 blur-3xl scale-110 pointer-events-none transition-all duration-1000"
        style={{
           backgroundImage: track.albumArtUrl ? `url(${track.albumArtUrl})` : 'none',
           background: isFallback ? fallbackGradient : undefined
        }}
      ></div>

      <div
        className="w-64 h-64 mb-8 bg-black/40 rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center border border-white/10 ring-1 ring-white/5 transition-all duration-1000"
        style={{ background: isFallback ? fallbackGradient : undefined }}
      >
         {track.albumArtUrl ? (
           <img src={track.albumArtUrl} alt="Album Art" className="w-full h-full object-cover" />
         ) : (
           <div className="flex items-center justify-center w-full h-full mix-blend-overlay opacity-50">
              <span className="text-white text-6xl font-bold uppercase">{track.title?.charAt(0) || '?'}</span>
           </div>
         )}
      </div>

      <h1 className="text-5xl font-bold text-[var(--text-main)] truncate w-full px-4 tracking-tight drop-shadow-md">
        {track.title}
      </h1>
      <h2 className="text-3xl text-[var(--accent)] mt-3 truncate max-w-full font-medium drop-shadow-sm">
        {track.artist}
      </h2>
      <h3 className="text-xl text-[var(--text-muted)] mt-2 truncate max-w-full">
        {track.album}
      </h3>

      <div className="mt-6 px-4 py-1.5 glass-panel rounded-full text-sm font-bold tracking-widest uppercase text-[var(--text-main)]">
        {status}
      </div>
    </div>
  );
}
