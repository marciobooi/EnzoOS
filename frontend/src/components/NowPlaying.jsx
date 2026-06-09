export default function NowPlaying({ track, status }) {
  return (
    <div className="flex flex-col items-center text-center w-full max-w-lg">
      <div className="w-48 h-48 mb-6 bg-gray-800 rounded-xl shadow-2xl overflow-hidden flex items-center justify-center border border-gray-700">
         {track.albumArtUrl ? (
           <img src={track.albumArtUrl} alt="Album Art" className="w-full h-full object-cover" />
         ) : (
           <span className="text-gray-500 text-sm font-semibold tracking-wider uppercase">No Art</span>
         )}
      </div>
      <h1 className="text-4xl font-bold text-white truncate w-full px-4">{track.title}</h1>
      <h2 className="text-2xl text-gray-300 mt-2 truncate max-w-full">{track.artist}</h2>
      <h3 className="text-lg text-gray-500 mt-1 truncate max-w-full">{track.album}</h3>

      <div className="mt-4 px-3 py-1 bg-gray-800 rounded-full text-xs font-semibold tracking-wider uppercase text-accent">
        {status}
      </div>
    </div>
  );
}
