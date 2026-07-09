import { useContext } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, Music, ListMusic, ChevronRight } from 'lucide-react';
import { Tk, fmt } from '../shared';

// Landscape-only (see .rt-rail in remote-tablet.css) persistent companion to
// whatever's on screen — Library/Search/Source/Settings used to leave the
// right third of the iPad blank while browsing; this turns that space into
// an always-visible transport + "Up Next" glimpse instead, the way desktop
// Spotify/Music keep a now-playing rail alongside browsing. Hidden on the
// Player tab itself (redundant with the hero) and hidden in portrait, where
// there isn't a third column's worth of width to give it — MiniPlayer's
// bottom dock covers that case instead.
export default function TabletNowPlayingRail() {
  const {
    C, card, cardWhite, btn, btnInset, darkMode,
    albumImage, trackName, trackArtist, source, spotify, token,
    isPlaying, trackPosition, trackDuration, progressPct,
    volume, isMuted, handleVolumeChange,
    handlePlayPause, handleNext, handlePrevious, handleSeek,
    setActiveTab, setQueueOpen, queue,
  } = useContext(Tk);

  const hasTrack = trackName && trackName !== 'Nothing playing';
  const upNext = spotify && Array.isArray(queue) ? queue.slice(0, 4) : [];

  if (!hasTrack) {
    return (
      <div className="rt-rail-inner flex flex-col items-center justify-center gap-3 h-full text-center px-6">
        <Music className="h-9 w-9" style={{ color: C.outline }} />
        <p className="text-[13px]" style={{ color: C.text4 }}>Nothing playing</p>
      </div>
    );
  }

  return (
    <div className="rt-rail-inner flex flex-col h-full px-5 pt-6 pb-5">
      <button onClick={() => setActiveTab('player')}
        className="w-full rounded-[28px] overflow-hidden cursor-pointer active:scale-[0.98] transition-all"
        style={{ ...card, aspectRatio: '1 / 1' }}>
        {albumImage
          ? <img src={albumImage} alt={trackName} className="w-full h-full object-cover" draggable={false} />
          : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="h-10 w-10" style={{ color: C.outline }} />
            </div>
          )}
      </button>

      <div className="mt-4 mb-4">
        <p className="text-[16px] font-semibold truncate" style={{ color: C.text1 }}>{trackName}</p>
        <p className="text-[13px] truncate" style={{ color: C.text4 }}>{trackArtist}</p>
      </div>

      {source !== 'radio' && (
        <div className="mb-4">
          <div className="relative h-1 rounded-full mb-1.5" style={{ background: C.container }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPct}%`, background: C.champagne }} />
            <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
              onChange={handleSeek}
              disabled={spotify ? !token || !trackDuration : !trackDuration}
              className="absolute inset-0 -top-2 w-full h-5 opacity-0 cursor-pointer disabled:cursor-default" />
          </div>
          <div className="flex justify-between text-[10px] font-semibold" style={{ color: C.text3, fontFamily: C.fontLabel }}>
            <span>{fmt(trackPosition)}</span>
            <span>{fmt(trackDuration)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 mb-4">
        <button onClick={handlePrevious} disabled={spotify ? !token : false}
          className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
          style={{ ...btn, color: C.text1 }}>
          <SkipBack className="h-4 w-4 fill-current" />
        </button>
        <button onClick={handlePlayPause} disabled={spotify ? !token : false}
          className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-25 active:scale-95 transition-all"
          style={isPlaying ? btnInset : btn}>
          {isPlaying
            ? <Pause className="h-5 w-5" style={{ fill: C.champagne, color: C.champagne }} />
            : <Play className="h-5 w-5 ml-0.5" style={{ fill: C.champagne, color: C.champagne }} />}
        </button>
        <button onClick={handleNext} disabled={spotify ? !token : false}
          className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
          style={{ ...btn, color: C.text1 }}>
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <Volume2 className="h-3.5 w-3.5 shrink-0" style={{ color: C.text3 }} />
        <div className="relative flex-1 h-1 rounded-full" style={{ background: C.container }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${isMuted ? 0 : volume}%`, background: C.champagne }} />
          <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
            onChange={handleVolumeChange} disabled={spotify ? !token : false}
            className="absolute inset-0 -top-2 w-full h-5 opacity-0 cursor-pointer disabled:cursor-default" />
        </div>
      </div>

      {(spotify ? !!token : source !== 'radio') && (
        <button onClick={() => setQueueOpen(true)}
          className="rounded-2xl p-3.5 text-left active:scale-[0.98] transition-all cursor-pointer mt-auto"
          style={cardWhite}>
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.text3, fontFamily: C.fontLabel }}>
              <ListMusic className="h-3.5 w-3.5" style={{ color: C.champagne }} />
              Up Next
            </span>
            <ChevronRight className="h-3.5 w-3.5" style={{ color: C.outline }} />
          </div>
          {upNext.length > 0 ? (
            <div className="mt-1.5 flex flex-col gap-1">
              {upNext.map((tr, i) => (
                <p key={`${tr.uri}-${i}`} className="text-[12px] truncate" style={{ color: C.text2 }}>{tr.name}</p>
              ))}
            </div>
          ) : (
            <p className="text-[12px] mt-1" style={{ color: C.text4 }}>View queue</p>
          )}
        </button>
      )}
    </div>
  );
}
