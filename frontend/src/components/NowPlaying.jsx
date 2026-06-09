export default function NowPlaying({ track, status }) {
  return (
    <div className="relative flex flex-col items-center text-center w-full max-w-2xl h-full justify-center">
      {/* Blurred background image for premium look */}
      {track.albumArtUrl && (
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-30 blur-3xl scale-110 pointer-events-none"
          style={{ backgroundImage: `url(${track.albumArtUrl})` }}
        ></div>
      )}

      <div className="w-64 h-64 mb-8 bg-black/40 rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center border border-white/10 ring-1 ring-white/5">
         {track.albumArtUrl ? (
           <img src={track.albumArtUrl} alt="Album Art" className="w-full h-full object-cover" />
         ) : (
           <span className="text-[var(--text-muted)] text-sm font-semibold tracking-wider uppercase">No Art</span>
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
