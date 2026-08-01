import { useContext, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Music, Heart, Radio, ListMusic, Info, Mic2,
} from 'lucide-react';
import { Tk, SpotifyIcon, fmt, sourceBadgeLabel, DJ_MOODS } from './shared';
import AlbumInfoSheet from './AlbumInfoSheet';
import LyricsSheet from './LyricsSheet';
import { useI18n } from '../../i18n';
import { api } from '../../api';

export default function PlayerTab() {
  const { t } = useI18n();
  const {
    C, card, cardWhite, btn, btnInset, darkMode,
    albumImage, trackName, trackArtist, source, spotify, token,
    isPlaying, trackPosition, trackDuration, progressPct,
    volume, isMuted, shuffleState, repeatState,
    activeDevice, isCurrentFav, currentTrack,
    handlePlayPause, handleNext, handlePrevious,
    handleShuffle, handleRepeat, handleSeek, commitSeek,
    handleVolumeChange, handleMuteToggle,
    handleToggleFavRadio, setActiveTab,
    setQueueOpen,
    favorites, handleToggleFavorite,
    liveFormat,
  } = useContext(Tk);

  const touchStartRef = useRef(null);
  const [showInfo, setShowInfo]     = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  // Local-only, like the kiosk's own copy — server/dj.js resets its mood to
  // null on every fresh start() anyway, so there's nothing worth persisting
  // beyond "did I tap one this session".
  const [djMood, setDjMood] = useState(null);
  const handleMoodTap = (id) => {
    const next = djMood === id ? null : id; // tap the active one again to clear it
    setDjMood(next);
    api.setDjMood(next).catch(() => {});
  };
  useEffect(() => { if (source !== 'dj') setDjMood(null); }, [source]);

  const albumName = currentTrack?.album?.name || '';
  const canInfo   = source !== 'radio' && !!trackArtist && !!albumName && trackName !== 'Nothing playing';
  const canLyrics = source !== 'radio' && !!trackArtist && trackName !== 'Nothing playing';
  const trackUri  = currentTrack?.uri || currentTrack?.url || '';
  const isFav     = source === 'radio'
    ? isCurrentFav
    : favorites?.some(f => f.source === source && f.uri === trackUri);

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
    if (liveFormat) {
      const { rate, bits } = liveFormat;
      if (bits >= 24 && rate >= 88200) return `HI-RES ${bits}/${Math.round(rate/1000)}k`;
      if (bits >= 24) return `LOSSLESS ${bits}bit`;
      if (bits >= 16 && rate >= 44100) return `CD QUALITY ${Math.round(rate/1000)}k`;
      return `${bits}bit/${Math.round(rate/1000)}k`;
    }
    if (source === 'tidal') return 'TIDAL LOSSLESS';
    if (source === 'qobuz') return 'QOBUZ HI-RES';
    if (source === 'radio') return 'LIVE STREAM';
    if (source === 'local') {
      const p = currentTrack?.uri || currentTrack?.file || '';
      if (p.includes('.flac') || p.includes('flac')) return 'FLAC LOSSLESS';
      if (p.includes('.mp3')) return 'MP3';
      if (p.includes('.wav')) return 'PCM WAV';
      return 'LOCAL FILE';
    }
    return source === 'spotify' ? 'SPOTIFY OGG' : 'STREAMING';
  })();

  return (
    <div className="flex flex-col px-5 pt-5">

      {/* album art — tap to reveal album info */}
      <div className={`relative mb-5 mx-auto ${canInfo ? 'cursor-pointer' : ''}`}
        style={{ width: '100%', maxWidth: 280, aspectRatio: '1 / 1' }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
        onClick={() => { if (canInfo) setShowInfo(true); }}>
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
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('player.nothingPlaying')}</span>
              </div>
            )
          }
        </div>
        <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full flex items-center gap-1.5" style={cardWhite}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.champagne }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: C.text3, fontFamily: C.fontLabel }}>
            {sourceBadgeLabel(source)}
          </span>
        </div>
        {canInfo && (
          <div className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center" style={cardWhite}>
            <Info className="h-4 w-4" style={{ color: C.champagne }} />
          </div>
        )}
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
        {trackName && trackName !== 'Nothing playing' && (
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => {
                if (source === 'radio') {
                  handleToggleFavRadio({ name: trackName, url: currentTrack?.url, favicon: albumImage || '', country: '', tags: '' });
                } else {
                  handleToggleFavorite({ source, uri: trackUri, title: trackName, artist: trackArtist, album: albumName, cover: albumImage });
                }
              }}
              aria-label={isFav ? t('player.removeFav') : t('player.addFav')}
              className="w-10 h-10 inline-flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer"
              style={{ color: isFav ? C.error : C.text4 }}>
              <Heart className={`h-5 w-5 ${isFav ? 'fill-current' : ''}`} />
            </button>
            {canLyrics && (
              <button onClick={() => setShowLyrics(true)}
                className="w-10 h-10 inline-flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer"
                style={{ color: C.text4 }}>
                <Mic2 className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Spotify connect prompt */}
      {spotify && !token && (
        <div className="rounded-xl p-5 flex flex-col gap-4 mb-5 text-center" style={cardWhite}>
          <div>
            <p className="text-[17px] font-medium" style={{ color: C.text1 }}>{t('settings.connectSpotify')}</p>
            <p className="text-[14px] mt-1" style={{ color: C.text4 }}>{t('player.signInPlayback')}</p>
          </div>
          <a href="/auth/spotify/login?from=remote"
            className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
            style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.font }}>
            <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
            {t('settings.connectSpotify')}
          </a>
        </div>
      )}

      {/* DJ mood cards — pin the announcer's energy, or pivot the lineup
          immediately if tapped mid-session (server/dj.js's setMood). Tapping
          the active one again clears it back to random. */}
      {source === 'dj' && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 mb-5 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
          {DJ_MOODS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => handleMoodTap(id)}
              aria-pressed={djMood === id}
              className="shrink-0 flex flex-col items-center justify-center gap-1.5 w-[72px] py-3 rounded-2xl active:scale-95 transition-all cursor-pointer"
              style={djMood === id
                ? { background: C.champagne, color: '#1a1c1c' }
                : { ...cardWhite, color: C.text2 }}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* progress bar */}
      {source !== 'radio' && (
        <div className="mb-5">
          <div className="relative h-1.5 rounded-full mb-2" style={{ background: C.container }}>
            <div className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progressPct}%`, background: C.champagne }} />
            <div className="absolute w-[18px] h-[18px] rounded-full top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${progressPct}%`, background: '#ffffff', border: `2px solid ${C.champagne}`, boxShadow: '0 1px 4px rgba(0,0,0,0.28)' }} />
            {/* -inset-y-5 expands the invisible touch target well beyond the
                1.5px-tall visual track (AUDIT-2026-08-02 — reported live as
                "hard to swing, have to precisely place it in the circle
                knob"); the 18px thumb drawn above is pointer-events-none, so
                without this the ACTUAL hit area used to be just 6px tall.
                touch-pan-y (touch-action: pan-y): the taller hit area made a
                NEW problem worse — a vertical page-scroll swipe starting
                anywhere over the input got captured as a slider-drag attempt
                instead of scrolling, reported live as "fighting with the
                page scroll". This tells the browser to let vertical panning
                through and only claim the gesture for genuinely horizontal
                drags. */}
            <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
              onChange={handleSeek}
              onPointerUp={commitSeek}
              onPointerCancel={commitSeek}
              disabled={spotify ? !token || !trackDuration : !trackDuration}
              className="absolute -inset-y-5 inset-x-0 w-full opacity-0 cursor-pointer disabled:cursor-default touch-pan-y" />
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
          <button onClick={handleRepeat} disabled={spotify ? !token : true} aria-label={t('player.repeat')}
            className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: repeatState !== 'off' ? C.champagne : C.text4 }}>
            <Repeat className="h-[18px] w-[18px]" />
          </button>
        ) : <div className="w-11" />}

        {source !== 'radio' ? (
          <button onClick={handlePrevious} disabled={spotify ? !token : false} aria-label={t('player.previous')}
            className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: C.text1, width: 52, height: 52 }}>
            <SkipBack className="h-6 w-6 fill-current" />
          </button>
        ) : <div style={{ width: 52 }} />}

        <button onClick={handlePlayPause} disabled={spotify ? !token : false} aria-label={isPlaying ? t('player.pause') : t('player.play')}
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
          <button onClick={handleNext} disabled={spotify ? !token : false} aria-label={t('player.next')}
            className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: C.text1, width: 52, height: 52 }}>
            <SkipForward className="h-6 w-6 fill-current" />
          </button>
        ) : (
          <button onClick={() => setActiveTab('search')}
            className="rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition-all"
            style={{ ...btn, color: C.champagne, width: 52, height: 52 }}>
            <Radio className="h-5 w-5" />
          </button>
        )}

        {source !== 'radio' ? (
          <button onClick={handleShuffle} disabled={spotify ? !token : true} aria-label={t('player.shuffle')}
            className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
            style={{ ...btn, color: shuffleState ? C.champagne : C.text4 }}>
            <Shuffle className="h-[18px] w-[18px]" />
          </button>
        ) : <div className="w-11" />}
      </div>

      {/* volume */}
      <div className="flex items-center gap-2">
        <button onClick={handleMuteToggle} aria-label={isMuted ? t('player.unmute') : t('player.mute')}
          style={{ color: isMuted ? C.champagne : C.text3 }}
          className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer shrink-0">
          <VolumeX className="h-[18px] w-[18px]" />
        </button>
        <div className="relative flex-1 h-1.5 rounded-full" style={{ background: C.container }}>
          <div className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${isMuted ? 0 : volume}%`, background: C.champagne }} />
          <div className="absolute w-[18px] h-[18px] rounded-full top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${isMuted ? 0 : volume}%`, background: '#ffffff', border: `2px solid ${C.champagne}`, boxShadow: '0 1px 4px rgba(0,0,0,0.28)' }} />
          <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
            onChange={handleVolumeChange} aria-label={t('player.volume')}
            disabled={spotify ? !token : false}
            className="absolute -inset-y-5 inset-x-0 w-full opacity-0 cursor-pointer disabled:cursor-default touch-pan-y" />
        </div>
        <button style={{ color: C.text3 }} aria-label="Maximum volume"
          className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer shrink-0"
          onClick={() => handleVolumeChange({ target: { value: 100 } })}>
          <Volume2 className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* queue button */}
      {(spotify ? !!token : source !== 'radio') && (
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

      {showInfo && (
        <AlbumInfoSheet artist={trackArtist} album={albumName} albumImage={albumImage}
          onClose={() => setShowInfo(false)} />
      )}
      {showLyrics && (
        <LyricsSheet title={trackName} artist={trackArtist} album={albumName}
          duration={trackDuration} position={trackPosition}
          onClose={() => setShowLyrics(false)} />
      )}
    </div>
  );
}
