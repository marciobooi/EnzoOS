import { useContext } from 'react';
import { Kk } from './KioskContext';
import TrackSearch from '../TrackSearch';
import { S } from '../../styles/stone';

export default function SearchOverlay() {
  const { setIsSearchOpen, token, handlePlayTrack, handlePlayContext } = useContext(Kk);

  return (
    <div
      className="absolute inset-0 rounded-3xl z-50 flex flex-col p-4 font-sans"
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}
    >
      {/* Close button — top right, minimal */}
      <div className="flex items-center justify-end mb-2 shrink-0">
        <button
          onClick={() => setIsSearchOpen(false)}
          className="text-[9px] font-extrabold uppercase tracking-[0.15em] px-3 py-1.5 rounded-xl cursor-pointer active:scale-95 transition-all"
          style={{ background: S.accent, color: S.accentFg }}
        >
          Close
        </button>
      </div>

      <div className="flex-grow min-h-0 overflow-hidden">
        <TrackSearch
          token={token}
          onPlayTrack={(uri) => { handlePlayTrack(uri); setIsSearchOpen(false); }}
          onPlayContext={(uri) => { handlePlayContext(uri); setIsSearchOpen(false); }}
          isDrawer={false}
        />
      </div>
    </div>
  );
}
