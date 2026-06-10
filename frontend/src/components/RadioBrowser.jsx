import { useState } from 'react';

export default function RadioBrowser({ onClose }) {
  const [query, setQuery] = useState('');
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiBase = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}/api`;

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/radio/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        setStations(data.stations);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Network error occurred while searching');
    }
    setLoading(false);
  };

  const handlePlay = async (station) => {
    try {
      const res = await fetch(`${apiBase}/radio/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: station.url, name: station.name })
      });
      const data = await res.json();
      if (data.success) {
        onClose(); // Close the modal upon successful play
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to play station.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="glass-panel w-full max-w-3xl rounded-2xl shadow-2xl p-8 flex flex-col h-full max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-[var(--text-main)] tracking-wide">Web Radio</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
             <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex space-x-4 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stations by name, genre, or country..."
            className="flex-1 bg-black/40 border border-white/20 text-[var(--text-main)] px-4 py-3 rounded-xl outline-none focus:border-[var(--accent)] transition-colors text-lg"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-8 bg-[var(--accent)] text-white font-bold rounded-xl hover:brightness-110 transition-all shadow-lg"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {error && <div className="text-red-400 text-center py-4">{error}</div>}

          {stations.length === 0 && !loading && !error && (
            <div className="text-center text-[var(--text-muted)] py-10 text-lg">
              Search for your favorite radio stations from around the world.
            </div>
          )}

          {stations.map((station) => (
            <div key={station.id} className="flex items-center justify-between p-4 border border-white/10 bg-black/30 rounded-xl hover:bg-black/50 transition-colors">
              <div className="flex items-center space-x-4">
                {/* Station Favicon */}
                {station.favicon ? (
                  <img src={station.favicon} alt="" className="w-12 h-12 rounded object-cover bg-white/5" onError={(e) => e.target.style.display = 'none'} />
                ) : (
                  <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center text-[var(--text-muted)]">📻</div>
                )}

                <div className="flex flex-col">
                  <span className="text-[var(--text-main)] text-xl font-medium">{station.name}</span>
                  <span className="text-[var(--text-muted)] text-sm">{station.country} {station.tags && `• ${station.tags.split(',').slice(0,3).join(', ')}`}</span>
                </div>
              </div>

              <button
                onClick={() => handlePlay(station)}
                className="px-6 py-2 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all font-bold rounded-lg"
              >
                Play
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
