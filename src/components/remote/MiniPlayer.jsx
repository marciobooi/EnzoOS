import { useContext } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react';
import { Tk } from './shared';

export default function MiniPlayer() {
  const {
    C, cardWhite, albumImage, trackName, trackArtist, source, spotify, token,
    isPlaying, progressPct, handlePlayPause, handleNext, handlePrevious, setActiveTab,
  } = useContext(Tk);

  if (!trackName || trackName === 'Nothing playing') return null;

  const canSkip = source !== 'radio';
  const skipDisabled = spotify ? !token : false;

  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style={cardWhite}
      onClick={() => setActiveTab('player')}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          {albumImage
            ? <img src={albumImage} alt="" className="w-full h-full object-cover" draggable={false} />
            : <Music className="h-[18px] w-[18px]" style={{ color: C.text4 }} />}
        </div>
        <div className="flex-1 min-w-0 pl-1">
          <p className="text-[14px] font-semibold truncate" style={{ color: C.text1 }}>{trackName}</p>
          <p className="text-[12px] truncate" style={{ color: C.text3 }}>{trackArtist || 'Now Playing'}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {canSkip && (
            <button onClick={e => { e.stopPropagation(); handlePrevious(); }} disabled={skipDisabled}
              aria-label="Previous" className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-30 cursor-pointer">
              <SkipBack className="h-4 w-4 fill-current" style={{ color: C.text2 }} />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); handlePlayPause(); }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
            style={{ background: C.champagne }}>
            {isPlaying
              ? <Pause className="h-[18px] w-[18px]" style={{ fill: '#1a1c1c', color: '#1a1c1c' }} />
              : <Play  className="h-[18px] w-[18px] ml-0.5" style={{ fill: '#1a1c1c', color: '#1a1c1c' }} />}
          </button>
          {canSkip && (
            <button onClick={e => { e.stopPropagation(); handleNext(); }} disabled={skipDisabled}
              aria-label="Next" className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-30 cursor-pointer">
              <SkipForward className="h-4 w-4 fill-current" style={{ color: C.text2 }} />
            </button>
          )}
        </div>
      </div>
      {/* Progress hairline flush against the card's bottom edge — champagne
          fill on the shared muted track, radio omitted since there's no
          meaningful position/duration to show for a live stream. */}
      {canSkip && (
        <div className="h-[3px]" style={{ background: C.container }}>
          <div className="h-full transition-all duration-1000"
            style={{ width: `${progressPct}%`, background: C.champagne }} />
        </div>
      )}
    </div>
  );
}
