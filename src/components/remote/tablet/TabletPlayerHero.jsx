import { useContext, useState } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Music, Heart, Radio, ListMusic, Info, Mic2, ChevronDown,
  Airplay, Network, Bluetooth, Music2,
} from 'lucide-react';
import { Tk, SpotifyIcon, fmt } from '../shared';
import AlbumInfoSheet from '../AlbumInfoSheet';
import LyricsSheet from '../LyricsSheet';
import TabletQueueList from './TabletQueueList';
import { useI18n } from '../../../i18n';

// Mirrors SourceTab's source list (icons + ids only, not its Qobuz/Tidal
// auth flow — tapping either of those here just hands off to the Source
// tab, which already owns that logic) so the hero's quick-switch carousel
// can't drift out of sync with what Source actually offers.
const INPUT_SOURCES = [
  { id: 'spotify',   label: 'Spotify',   Icon: SpotifyIcon, isSpotify: true },
  { id: 'local',     label: 'Local',     Icon: Music },
  { id: 'radio',     label: 'Radio',     Icon: Radio },
  { id: 'airplay',   label: 'AirPlay',   Icon: Airplay },
  { id: 'upnp',      label: 'UPnP',      Icon: Network },
  { id: 'bluetooth', label: 'Bluetooth', Icon: Bluetooth },
  { id: 'tidal',     label: 'Tidal',     Icon: Music2 },
  { id: 'qobuz',     label: 'Qobuz',     Icon: Music },
];

// iPad's flagship "Now Playing" screen. Same data/handlers as the phone's
// PlayerTab (all read off the shared Tk context — nothing duplicated), but
// laid out for the room a tablet actually has: a large hero image with its
// own ambient glow, bigger transport targets, and an inline "Up Next"
// preview instead of a tap-to-reveal sheet. Portrait vs. landscape is a
// single CSS Grid (`.rt-hero` in remote-tablet.css) reordering art/info —
// no separate component or JS branch needed.
export default function TabletPlayerHero() {
  const { t } = useI18n();
  const {
    C, card, cardWhite, darkMode,
    albumImage, trackName, trackArtist, source, spotify, token,
    isPlaying, trackPosition, trackDuration, progressPct,
    volume, isMuted, shuffleState, repeatState,
    activeDevice, isCurrentFav, currentTrack,
    handlePlayPause, handleNext, handlePrevious,
    handleShuffle, handleRepeat, handleSeek,
    handleVolumeChange, handleMuteToggle,
    handleToggleFavRadio, handleToggleSource, setActiveTab,
    queue,
    favorites, handleToggleFavorite,
    liveFormat,
  } = useContext(Tk);

  const [showInfo, setShowInfo]     = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue]   = useState(false);

  const albumName = currentTrack?.album?.name || '';
  const canInfo   = source !== 'radio' && !!trackArtist && !!albumName && trackName !== 'Nothing playing';
  const canLyrics = source !== 'radio' && !!trackArtist && trackName !== 'Nothing playing';
  const trackUri  = currentTrack?.uri || currentTrack?.url || '';
  const isFav     = source === 'radio'
    ? isCurrentFav
    : favorites?.some(f => f.source === source && f.uri === trackUri);
  const upNext = spotify && Array.isArray(queue) ? queue.slice(0, 3) : [];

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

  // Reference design tokens (matched against the target mock's Tailwind
  // config: secondary-fixed #efe0cd / on-secondary-fixed #221a0f / the
  // "ambient-shadow" utility). A single soft warm-gray drop shadow, not
  // this app's usual dual-tone neumorphic one — and a pale cream accent
  // fill for the play button and slider fills, not the saturated gold used
  // for badges/favorites elsewhere. Dark mode has no reference to match, so
  // it keeps this file's existing look.
  const ambientShadow = darkMode
    ? '0 10px 24px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.35)'
    : '0 10px 30px rgba(180,170,150,0.08)';
  const accentFill      = darkMode ? C.champagne : '#efe0cd';
  const accentFillHex   = darkMode ? '#12203a'    : '#221a0f';

  // Album info / lyrics replace the WHOLE main content pane on tablet
  // (sidebar stays interactive around it) instead of covering the screen as
  // a modal — see the `inline` prop on both components.
  if (showInfo) {
    return (
      <AlbumInfoSheet inline artist={trackArtist} album={albumName} albumImage={albumImage}
        onClose={() => setShowInfo(false)} />
    );
  }
  if (showLyrics) {
    return (
      <LyricsSheet inline title={trackName} artist={trackArtist} album={albumName}
        duration={trackDuration} position={trackPosition}
        onClose={() => setShowLyrics(false)} />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-[4rem]">
    <div className="rt-hero">

      {/* ── Art — the cover is a fixed square smaller than its grid column,
          so the column centers it and the badge/info chips anchor to a
          wrapper sized to the cover itself (not the column, which would
          float them off into the empty space beside the art). ── */}
      <div className={`rt-hero-art flex items-center justify-center ${canInfo ? 'cursor-pointer' : ''}`}
        onClick={() => { if (canInfo) setShowInfo(true); }}>
        <div className="relative" style={{ width: 'min(20rem, 32dvh)', height: 'min(20rem, 32dvh)' }}>
          {albumImage && (
            <div className="absolute inset-0 rounded-[36px] -z-10 scale-[0.86] blur-3xl"
              style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover', opacity: darkMode ? 0.28 : 0.16 }} />
          )}
          <div className="w-full h-full rounded-[18px] overflow-hidden flex items-center justify-center"
            style={{ ...card, boxShadow: ambientShadow }}>
            {albumImage
              ? <img src={albumImage} alt={trackName} className="w-full h-full object-cover" draggable={false} />
              : (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <Music className="h-16 w-16" style={{ color: C.outline }} />
                  <span className="text-[12px] uppercase tracking-widest font-semibold"
                    style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('player.nothingPlaying')}</span>
                </div>
              )
            }
          </div>
          <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full flex items-center gap-1.5" style={cardWhite}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.champagne }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: C.text3, fontFamily: C.fontLabel }}>
              {spotify ? 'Spotify' : source === 'radio' ? 'Radio' : 'Local'}
            </span>
          </div>
          {canInfo && (
            <div className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center" style={cardWhite}>
              <Info className="h-4 w-4" style={{ color: C.champagne }} />
            </div>
          )}
        </div>
      </div>

      {/* controls*/}
      <div className="rt-hero-info flex flex-col">
        <div className="mb-5">
          <h2 className="text-[46px] font-bold leading-tight truncate"
            style={{ color: C.text1, letterSpacing: '-0.02em' }}>{trackName}</h2>
          <p className="text-[22px] mt-1.5 truncate" style={{ color: C.text4 }}>
            {trackArtist}
            {/* {activeDevice && <span style={{ color: C.champagne }}> · {activeDevice.name}</span>} */}
          </p>

        </div>

        {spotify && !token && (
          <div className="rounded-xl p-5 flex flex-col gap-4 mb-6 text-center" style={cardWhite}>
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

        {source !== 'radio' ? (
          <div className="mb-5">
            <div className="relative h-1 rounded-full mb-3" style={{ background: C.container }}>
              <div className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${progressPct}%`, background: accentFill }} />
              <div className="absolute w-4 h-4 rounded-full top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: `${progressPct}%`, background: '#ffffff', boxShadow: '0 4px 10px rgba(180,170,150,0.25)' }} />
              <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
                onChange={handleSeek}
                disabled={spotify ? !token || !trackDuration : !trackDuration}
                className="absolute -inset-y-2.5 inset-x-0 w-full opacity-0 cursor-pointer disabled:cursor-default" />
            </div>
            <div className="flex justify-between text-[12px] font-semibold"
              style={{ color: C.text3, fontFamily: C.fontLabel, letterSpacing: '0.04em' }}>
              <span>{fmt(trackPosition)}</span>
              <span>{fmt(trackDuration)}</span>
            </div>
          </div>
        ) : <div className="mb-5" />}

        {/* transport controls — larger targets than the phone */}
        <div className="flex items-center justify-between mb-5 px-1">
          {source !== 'radio' ? (
            <button onClick={handleRepeat} disabled={spotify ? !token : true} aria-label={t('player.repeat')}
              className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
              style={{ color: repeatState !== 'off' ? C.champagne : C.text2 }}>
              <Repeat className="h-4 w-4" />
            </button>
          ) : <div className="w-10" />}

          {source !== 'radio' ? (
            <button onClick={handlePrevious} disabled={spotify ? !token : false} aria-label={t('player.previous')}
              className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
              style={{ color: C.text1, width: 56, height: 56 }}>
              <SkipBack className="h-7 w-7" strokeWidth={1.75} />
            </button>
          ) : <div style={{ width: 56 }} />}

          <button onClick={handlePlayPause} disabled={spotify ? !token : false} aria-label={isPlaying ? t('player.pause') : t('player.play')}
            className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-25 transition-all active:scale-95"
            style={{ width: 70, height: 70, background: accentFill, boxShadow: ambientShadow }}>
            {isPlaying
              ? <Pause className="h-7 w-7" style={{ fill: accentFillHex, color: accentFillHex }} />
              : <Play className="h-7 w-7 ml-1" style={{ fill: accentFillHex, color: accentFillHex }} />}
          </button>

          {source !== 'radio' ? (
            <button onClick={handleNext} disabled={spotify ? !token : false} aria-label={t('player.next')}
              className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
              style={{ color: C.text1, width: 56, height: 56 }}>
              <SkipForward className="h-7 w-7" strokeWidth={1.75} />
            </button>
          ) : (
            <button onClick={() => setActiveTab('search')}
              className="rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition-all"
              style={{ color: C.champagne, width: 56, height: 56 }}>
              <Radio className="h-5 w-5" />
            </button>
          )}

          {source !== 'radio' ? (
            <button onClick={handleShuffle} disabled={spotify ? !token : true} aria-label={t('player.shuffle')}
              className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
              style={{ color: shuffleState ? C.champagne : C.text2 }}>
              <Shuffle className="h-4 w-4" />
            </button>
          ) : <div className="w-10" />}
        </div>


      </div>
    </div>

    {/* info */}
    <div>
      <div>
          {trackName && trackName !== 'Nothing playing' && (
            <div className="mt-3 flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                style={{ background: `${C.champagne}18`, color: C.champagne, border: `0.5px solid ${C.champagne}35`, fontFamily: C.fontLabel }}>
                {qualityLabel}
              </span>
              <button
                onClick={() => {
                  if (source === 'radio') {
                    handleToggleFavRadio({ name: trackName, url: currentTrack?.url, favicon: albumImage || '', country: '', tags: '' });
                  } else {
                    handleToggleFavorite({ source, uri: trackUri, title: trackName, artist: trackArtist, album: albumName, cover: albumImage });
                  }
                }}
                aria-label={isFav ? t('player.removeFav') : t('player.addFav')}
                className="w-9 h-9 inline-flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer"
                style={{ color: isFav ? C.error : C.text4 }}>
                <Heart className={`h-[18px] w-[18px] ${isFav ? 'fill-current' : ''}`} />
              </button>
              {canLyrics && (
                <button onClick={() => setShowLyrics(true)}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer"
                  style={{ color: C.text4 }}>
                  <Mic2 className="h-[18px] w-[18px]" />
                </button>
              )}
            </div>
          )}

                  {/* volume */}
        <div className="flex items-center gap-2 mb-5">
          <button onClick={handleMuteToggle} aria-label={isMuted ? t('player.unmute') : t('player.mute')}
            style={{ color: isMuted ? C.champagne : C.text2 }}
            className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer shrink-0">
            <VolumeX className="h-4 w-4" />
          </button>
          <div className="relative flex-1 h-1 rounded-full" style={{ background: C.container }}>
            <div className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${isMuted ? 0 : volume}%`, background: accentFill }} />
            <div className="absolute w-4 h-4 rounded-full top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${isMuted ? 0 : volume}%`, background: '#ffffff', boxShadow: '0 4px 10px rgba(180,170,150,0.25)' }} />
            <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
              onChange={handleVolumeChange} aria-label={t('player.volume')}
              disabled={spotify ? !token : false}
              className="absolute -inset-y-2.5 inset-x-0 w-full opacity-0 cursor-pointer disabled:cursor-default" />
          </div>
          <button style={{ color: C.text2 }} aria-label="Maximum volume"
            className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer shrink-0"
            onClick={() => handleVolumeChange({ target: { value: 100 } })}>
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
        </div>

        {/* up next — expands in place; no separate queue screen to navigate to */}
        {(spotify ? !!token : source !== 'radio') && (
          <div className="rounded-2xl overflow-hidden" style={cardWhite}>
            <button onClick={() => setShowQueue(v => !v)}
              className="w-full p-4 text-left active:scale-[0.99] transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>
                  <ListMusic className="h-4 w-4" style={{ color: C.champagne }} />
                  {t('queue.upNext') || 'Up Next'}
                </span>
                <ChevronDown className="h-4 w-4 transition-transform" style={{ color: C.outline, transform: showQueue ? 'rotate(180deg)' : 'none' }} />
              </div>
              {!showQueue && (
                upNext.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {upNext.map((tr, i) => (
                      <p key={`${tr.uri}-${i}`} className="text-[13px] truncate" style={{ color: C.text2 }}>
                        {tr.name} <span style={{ color: C.text4 }}>· {tr.artists?.map(a => a.name).join(', ')}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] mt-1" style={{ color: C.text4 }}>Nothing queued</p>
                )
              )}
            </button>
            {showQueue && (
              <div className="px-4 pb-3" style={{ borderTop: `0.5px solid ${C.outline}` }}>
                <TabletQueueList />
              </div>
            )}
          </div>
        )}
    </div>

    {/* ── Input source — quick-switch carousel, full width below the
        art/info split. `mt-auto` (the parent is a full-height flex column,
        see the wrapping div above) pins it to the bottom of the pane
        instead of just trailing the hero with fixed spacing, matching the
        reference layout — it only falls back to sitting right under the
        hero if the content is ever taller than the viewport, same as
        ordinary flow. Simple sources activate immediately; Tidal/Qobuz
        (which may need an auth form) hand off to the Source tab instead of
        duplicating that flow here. ── */}
    <div className="mt-auto pt-6 shrink-0">
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-3 px-1"
        style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('source.signalChain')}</p>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {INPUT_SOURCES.map(({ id, label, Icon, isSpotify }) => {
          const active = source === id;
          const onTap = () => {
            if (id === 'tidal' || id === 'qobuz') { setActiveTab('source'); return; }
            handleToggleSource(id);
          };
          return (
            <button key={id} onClick={onTap}
              className="shrink-0 flex flex-col items-center justify-center gap-2.5 py-5 rounded-3xl active:scale-95 transition-all cursor-pointer"
              style={{
                width: 124,
                background: active
                  ? `linear-gradient(${C.champagne}14, ${C.champagne}14), ${cardWhite.background}`
                  : cardWhite.background,
                boxShadow: ambientShadow,
                border: active ? `1.5px solid ${C.champagne}80` : cardWhite.border,
              }}>
              <Icon className="h-7 w-7" style={isSpotify ? { fill: active ? C.text2 : C.text3 } : { color: active ? C.text2 : C.text3 }} />
              <span className="text-[10.5px] font-semibold uppercase tracking-wider"
                style={{ color: C.text1, fontFamily: C.fontLabel }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
    </div>
  );
}
