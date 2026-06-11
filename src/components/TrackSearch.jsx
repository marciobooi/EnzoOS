import React, { useState } from 'react';
import { Search, Music, Play, Loader } from 'lucide-react';
import { api } from '../api';

export default function TrackSearch({ token, onPlayTrack, isDrawer = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      setIsLoading(true);
      const data = await api.searchTracks(token, query);
      setResults(data.tracks?.items || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={isDrawer ? "flex flex-col h-full font-mono relative" : "p-6 rounded-2xl bg-gradient-to-b from-[#22252c] to-[#0f1013] border border-[#303643] shadow-xl flex flex-col h-full font-mono relative"}>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-zinc-900/60">
        <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
          <Search className="h-4 w-4 theme-text" />
          Source Catalogue Search
        </h3>
      </div>

      {/* Form Input */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input 
          type="text" 
          placeholder="SEARCH TRACK / ARTIST..." 
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-grow py-2 px-3 rounded-lg bg-zinc-950 border border-zinc-900 theme-text placeholder-zinc-800 text-xs focus:outline-none focus:border-zinc-850 transition-colors uppercase tracking-wider font-semibold animate-none"
        />
        <button 
          type="submit"
          disabled={isLoading}
          className="py-2 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 border border-zinc-800 hover:text-white transition-colors cursor-pointer flex items-center justify-center min-w-[50px] active:scale-95"
        >
          {isLoading ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </button>
      </form>

      {/* Results list */}
      <div className={`space-y-2.5 overflow-y-auto flex-grow custom-scrollbar pr-1 ${isDrawer ? 'max-h-[80vh]' : 'max-h-[290px]'}`}>
        {results.map((track) => (
          <div 
            key={track.id}
            className="p-2.5 rounded-xl border border-zinc-900 bg-zinc-950/40 flex items-center justify-between gap-3 hover:border-zinc-850 transition-colors"
          >
            {/* Track Info */}
            <div className="flex items-center gap-2.5 min-w-0 flex-grow">
              {track.album?.images[2]?.url ? (
                <img 
                  src={track.album.images[2].url} 
                  alt={track.name} 
                  className="w-8 h-8 object-cover rounded shrink-0 border border-zinc-900"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-zinc-950 border border-zinc-900 shrink-0 flex items-center justify-center text-zinc-700">
                  <Music className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate uppercase">{track.name}</p>
                <p className="text-[9px] text-zinc-500 truncate">{track.artists.map(a => a.name).join(', ')}</p>
              </div>
            </div>

            {/* Play trigger */}
            <button 
              onClick={() => onPlayTrack(track.uri)}
              className="p-2 rounded-lg theme-bg hover:opacity-90 text-black hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-md"
              title="PLAY SOURCE CHANNEL"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>
          </div>
        ))}

        {results.length === 0 && !isLoading && (
          <div className="text-center py-8 text-zinc-505 text-[10px] flex flex-col items-center justify-center border border-dashed border-zinc-900 rounded-xl select-none">
            <Search className="h-5 w-5 text-zinc-700 mb-2 animate-pulse" />
            <span>NO SEARCH QUERY LOADED.</span>
            <span>ENTER SOURCE PARAMETERS TO LOAD TRACKS.</span>
          </div>
        )}
      </div>

    </div>
  );
}
