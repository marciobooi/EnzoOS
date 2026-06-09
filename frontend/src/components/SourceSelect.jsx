const SOURCES = [
  { id: 'mpd', name: 'Local / MPD' },
  { id: 'spotify', name: 'Spotify' },
  { id: 'airplay', name: 'AirPlay' },
  { id: 'tidal', name: 'TIDAL' },
];

export default function SourceSelect({ currentSource, onChange }) {
  return (
    <div className="flex flex-col space-y-2 pt-4">
      <h3 className="text-gray-400 text-sm font-semibold mb-2 uppercase tracking-wide">Input Source</h3>
      {SOURCES.map(source => (
        <button
          key={source.id}
          onClick={() => onChange(source.id)}
          className={`px-4 py-3 rounded text-left transition-colors font-medium ${
            currentSource === source.id
              ? 'bg-accent text-white shadow-md'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {source.name}
        </button>
      ))}
    </div>
  );
}
