export default function NowPlaying({ track, status }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-32 h-32 mb-4 bg-gray-800 rounded shadow-lg overflow-hidden flex items-center justify-center">
         {/* Placeholder for Album Art */}
         <span className="text-gray-500 text-sm">Album Art</span>
      </div>
      <h1 className="text-4xl font-bold text-white truncate max-w-full">{track.title}</h1>
      <h2 className="text-2xl text-gray-300 mt-2 truncate max-w-full">{track.artist}</h2>
      <h3 className="text-lg text-gray-500 mt-1 truncate max-w-full">{track.album}</h3>

      <div className="mt-4 px-3 py-1 bg-gray-800 rounded-full text-xs font-semibold tracking-wider uppercase text-accent">
        {status}
      </div>
    </div>
  );
}
