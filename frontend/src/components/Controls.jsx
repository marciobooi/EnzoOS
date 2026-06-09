export default function Controls({ status, onPlay, onPause }) {
  return (
    <div className="flex flex-col items-center justify-center pt-4">
      <div className="flex space-x-6">
        <button className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
        </button>

        {status === 'playing' ? (
          <button
            onClick={onPause}
            className="w-16 h-16 flex items-center justify-center bg-accent text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg"
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
        ) : (
          <button
            onClick={onPlay}
            className="w-16 h-16 flex items-center justify-center bg-accent text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg"
          >
            <svg className="w-8 h-8 pl-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        )}

        <button className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
        </button>
      </div>
    </div>
  );
}
