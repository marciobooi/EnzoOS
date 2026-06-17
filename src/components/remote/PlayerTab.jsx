import React, { useContext, useRef } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Music, Heart, Radio, ListMusic,
} from 'lucide-react';
import { Tk, SpotifyIcon, fmt } from './shared';

export default function PlayerTab() {
  const {
    C, card, cardWhite, btn, btnInset, darkMode,
    albumImage, trackName, trackArtist, source, spotify, token,
    isPlaying, trackPosition, trackDuration, progressPct,
    volume, isMuted, shuffleState, repeatState,
    activeDevice, isCurrentFav, currentTrack, playbackState,
    handlePlayPause, handleNext, handlePrevious,
    handleShuffle, handleRepeat, handleSeek,
    handleVolumeChange, handleMuteToggle,
    handleToggleFavRadio, setActiveTab,
    queueOpen, setQueueOpen,
  } = useContext(Tk);

  const touchStartRef = useRef(null);

  const handleTouchStart = e => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = e => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) handleNext();
    else handlePrevious();
  };

  const qualityLabel = (() => {
    if (source === 'radio') return 'AAC STREAM';
    if (source === 'local') {
      const path = currentTrack?.uri || '';
      if (path.endsWith('.flac') || path.includes('flac')) return 'FLAC LOSSLESS';
      if (path.endsWith('.mp3'))  return 'MP3';
      if (path.endsWith('.wav'))  return 'PCM WAV';
      return 'LOCAL FILE';
    }
    return 'OGG VORBIS';
  })();

  return (
    <div className="flex flex-col px-5 pt-5">

      {/* album art */}
      <div className="relative mb-5 mx-auto" style={{ width: '100%', maxWidth: 280, aspectRatio: '1 / 1' }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {albumImage && (
          <div className="absolute inset-0 rounded-[28px] -z-10 scale-[0.88] blur-2xl"
            style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover', opacity: darkMode ? 0.22 : 0.14 }} />
        )}
        <div className="w-full h-full rounded-[28px] overflow-hidden flex items-center justify-center"
          style={{
            ...card,
            boxShadow: darkMode
              ? '0 24px 48px rgba(0,0,0,0.8), 4px 4px 12px rgba(0,0,0,0.7), -4px -4px 12px rgba(20,40,75,0.4)'
              : '0 24px 48px rgba(0,0,0,0.07), 4px 4px 10px rgba(0,0,0,0.025), -4px -4px 10px rgba(255,255,255,0.9)',
          }}>
          {albumImage
            ? <img src={albumImage} alt={trackName} className="w-full h-full object-cover" draggable={false} />
            : (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <Music className="h-14 w-14" style={{ color: C.outline }} />
                <span className="text-[11px] uppercase tracking-widest font-semibold"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>Nothing Playing</span>
              </div>
            )
          }
        </div>
        <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full flex items-center gap-1.5" style={cardWhite}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.champagne }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: C.text3, fontFamily: C.fontLabel }}>
            {spotify ? 'Spotify' : source === 'radio' ? 'Radio' : 'Local'}
          </span>
        </div>
      </div>

      {/* track info */}
      <div className="text-center mb-5">
        <h2 className="text-[22px] font-medium truncate"
          style={{ color: C.text1, letterSpacing: '-0.01em' }}>{trackName}</h2>
        <p className="text-[15px] mt-1 truncate" style={{ color: C.text4 }}>
          {trackArtist}
          {activeDevice && <span style={{ color: C.champagne }}> · {activeDevice.name}</span>}
        </p>
        {trackName && trackName !== 'Nothing playing' && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: `${C.champagne}18`, color: C.champagne, border: `0.5px solid ${C.champagne}35`, fontFamily: C.fontLabel }}>
              {qualityLabel}
            </span>
          </div>
        )}
        {source === 'radio' && currentTrack?.url && (
          <button
            onClick={() => handleToggleFavRadio({ name: trackName, url: currentTrack.url, favicon: albumImage || '', country: '', tags: '' })}
            className="mt-2.5 active:scale-90 transition-all cursor-pointer"
            style={{ color: isCurrentFav ? C.error : C.outline }}>
            <Heart className={`h-5 w-5 ${isCurrentFav ? 'fill-current' : ''}`} />
          </button>
        )}
      </div>

      {/* Spotify connect prompt */}
      {spotify && !token && (
        <div className="rounded-xl p-5 flex flex-col gap-4 mb-5 text-center" style={cardWhite}>
          <div>
            <p className="text-[17px] font-medium" style={{ color: C.text1 }}>Connect Spotify</p>
            <p className="text-[14px] mt-1" style={{ color: C.text4 }}>Sign in to control playback.</p>
          </div>
          <a href="/auth/spotify/login?from=remote"
            className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
            style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.font }}>
            <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
            Connect with Spotify
          </a>
        </div>
      )}

      {/* progress bar */}
      {source !== 'radio' && (
        <div className="mb-5">
          <div className="relative h-1 rounded-full mb-2" style={{ background: C.container }}>
            <div className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progressPct}%`, background: C.champagne }} />
            <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
              onChange={handleSeek}
              disabled={spotify ? !token || !trackDuration : !trackDuration}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
          </div>
          <div className="flex justify-between text-[11px] font-semibold"
            style={{ color: C.text3, fontFamily: C.fontLabel, letterSpacing: '0.04em' }}>
            <span>{fmt(trackPosition)}</span>
            <span>{fmt(trackDuration)}</span>
          </div>
        </div>
      )}
      {source === 'radio' && <div className="mb-5" />}

      {/* transport controls */}
      <div className="flex items-center justify-between mb-6 px-1">
        {source !== 'radio' ? (
          <button onClick={handleRepeat} disabled={spotify ? !token : true}
            className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: repeatState !== 'off' ? C.champagne : C.text4 }}>
            <Repeat className="h-4 w-4" />
          </button>
        ) : <div className="w-11" />}

        {source !== 'radio' ? (
          <button onClick={handlePrevious} disabled={spotify ? !token : false}
            className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: C.text1, width: 52, height: 52 }}>
            <SkipBack className="h-6 w-6 fill-current" />
          </button>
        ) : <div style={{ width: 52 }} />}

        <button onClick={handlePlayPause} disabled={spotify ? !token : false}
          className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-25 transition-all active:scale-95"
          style={{
            width: 80, height: 80,
            ...(isPlaying ? btnInset : {
              ...btn,
              boxShadow: darkMode
                ? '6px 6px 14px rgba(0,0,0,0.8), -6px -6px 14px rgba(20,40,75,0.5)'
                : '6px 6px 14px rgba(0,0,0,0.05), -6px -6px 14px rgba(255,255,255,1)',
            }),
          }}>
          {isPlaying
            ? <Pause className="h-8 w-8" style={{ fill: C.champagne, color: C.champagne }} />
            : <Play className="h-8 w-8 ml-1" style={{ fill: C.champagne, color: C.champagne }} />}
        </button>

        {source !== 'radio' ? (
          <button onClick={handleNext} disabled={spotify ? !token : false}
            className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: C.text1, width: 52, height: 52 }}>
            <SkipForward className="h-6 w-6 fill-current" />
          </button>
        ) : (
          <button onClick={() => setActiveTab('radio')}
            className="rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition-all"
            style={{ ...btn, color: C.champagne, width: 52, height: 52 }}>
            <Radio className="h-5 w-5" />
          </button>
        )}

        {source !== 'radio' ? (
          <button onClick={handleShuffle} disabled={spotify ? !token : true}
            className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: shuffleState ? C.champagne : C.text4 }}>
            <Shuffle className="h-4 w-4" />
          </button>
        ) : <div className="w-11" />}
      </div>

      {/* volume */}
      <div className="flex items-center gap-3">
        <button onClick={handleMuteToggle} style={{ color: C.text3 }}
          className="active:scale-90 transition-all cursor-pointer shrink-0">
          <VolumeX className="h-4 w-4" />
        </button>
        <div className="relative flex-1 h-1 rounded-full" style={{ background: C.container }}>
          <div className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${isMuted ? 0 : volume}%`, background: C.champagne }} />
          <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            disabled={spotify ? !token : false}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
        </div>
        <button style={{ color: C.text3 }}
          className="active:scale-90 transition-all cursor-pointer shrink-0"
          onClick={() => handleVolumeChange({ target: { value: 100 } })}>
          <Volume2 className="h-4 w-4" />
        </button>
      </div>

      {/* queue button */}
      {spotify && token && (
        <div className="flex justify-center mt-5">
          <button onClick={() => setQueueOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full active:scale-95 transition-all cursor-pointer"
            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
            <ListMusic className="h-4 w-4" style={{ color: C.champagne }} />
            <span className="text-[12px] font-semibold uppercase tracking-wider"
              style={{ color: C.text3, fontFamily: C.fontLabel }}>Up Next</span>
          </button>
        </div>
      )}
    </div>
  );
}
