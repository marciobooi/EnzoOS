import { useContext } from 'react';
import { Play, Pause, Music } from 'lucide-react';
import { Tk } from './shared';

export default function MiniPlayer() {
  const {
    C, cardWhite, albumImage, trackName, trackArtist,
    isPlaying, progressPct, handlePlayPause, setActiveTab,
  } = useContext(Tk);

  if (!trackName || trackName === 'Nothing playing') return null;

  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style={cardWhite}
      onClick={() => setActiveTab('player')}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          {albumImage
            ? <img src={albumImage} alt="" className="w-full h-full object-cover" draggable={false} />
            : <Music className="h-4 w-4" style={{ color: C.text4 }} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: C.text1 }}>{trackName}</p>
          <p className="text-[11px] truncate" style={{ color: C.text3 }}>{trackArtist || 'Now Playing'}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); handlePlayPause(); }}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
          style={{ background: C.champagne }}>
          {isPlaying
            ? <Pause className="h-4 w-4" style={{ fill: '#1a1c1c', color: '#1a1c1c' }} />
            : <Play  className="h-4 w-4 ml-0.5" style={{ fill: '#1a1c1c', color: '#1a1c1c' }} />}
        </button>
      </div>
      <div className="h-[2px]" style={{ background: C.container }}>
        <div className="h-full transition-all duration-1000"
          style={{ width: `${progressPct}%`, background: C.champagne }} />
      </div>
    </div>
  );
}
