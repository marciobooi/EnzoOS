export default function NowPlaying({ track, status }) {
  // Generative art fallback
  const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash);
  };

  const isFallback = !track.albumArtUrl;
  const hash1 = isFallback ? hashString(track.artist || 'Artist') % 360 : 0;
  const hash2 = isFallback ? hashString(track.title || 'Title') % 360 : 0;
  const fallbackGradient = `linear-gradient(135deg, hsl(${hash1}, 60%, 20%), hsl(${hash2}, 70%, 10%))`;

  return (
    <div className="flex flex-row items-center w-full h-full gap-8 z-10">

      {/* Square Album Art (exactly sized for 320px screen height with margins) */}
      <div
        className="relative w-[260px] h-[260px] rounded-lg overflow-hidden shrink-0 shadow-2xl border border-white/10"
        style={{ background: isFallback ? fallbackGradient : undefined }}
      >
         {track.albumArtUrl ? (
           <img src={track.albumArtUrl} alt="Album Art" className="w-full h-full object-cover" />
         ) : (
           <div className="flex items-center justify-center w-full h-full mix-blend-overlay opacity-30">
              <span className="text-white text-6xl font-bold uppercase">{track.title?.charAt(0) || '?'}</span>
           </div>
         )}
         {/* Subtle inner gloss to mimic glass */}
         <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>
      </div>

      {/* Track Info */}
      <div className="flex flex-col justify-center gap-1 overflow-hidden">
        <div className="flex items-center gap-3 mb-2">
           <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold bg-[#007aff]/20 text-[#007aff] border border-[#007aff]/30">
             {status}
           </span>
           <span className="text-[10px] text-white/40 font-mono tracking-widest">
             Hi-Res Audio
           </span>
        </div>

        <h1 className="text-5xl font-bold text-white truncate w-full tracking-tight mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          {track.title}
        </h1>
        <h2 className="text-2xl text-[#ffb800] truncate max-w-full font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
          {track.artist}
        </h2>
        <h3 className="text-lg text-white/50 mt-1 truncate max-w-full">
          {track.album}
        </h3>
      </div>

    </div>
  );
}
