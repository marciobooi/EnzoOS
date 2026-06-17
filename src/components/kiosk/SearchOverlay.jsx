import { useContext } from 'react';
import { Search } from 'lucide-react';
import { Kk } from './KioskContext';
import TrackSearch from '../TrackSearch';

export default function SearchOverlay() {
  const {
    setIsSearchOpen,
    token,
    handlePlayTrack,
    handlePlayContext,
  } = useContext(Kk);

  return (
    <div className="absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-50 flex flex-col p-5 font-sans">
      <div className="flex justify-between items-center mb-3 select-none shrink-0">
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-700 flex items-center gap-2">
          <Search className="h-3.5 w-3.5" />
          Spotify Search &amp; Browse
        </h4>
        <button
          onClick={() => setIsSearchOpen(false)}
          className="text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer text-[10px] font-extrabold font-sans px-3.5 py-1 rounded-lg bg-white border border-zinc-250 shadow-sm active:scale-95"
        >
          CLOSE [X]
        </button>
      </div>
      <div className="flex-grow min-h-0 overflow-hidden">
        <TrackSearch
          token={token}
          onPlayTrack={handlePlayTrack}
          onPlayContext={handlePlayContext}
          isDrawer={false}
        />
      </div>
    </div>
  );
}
