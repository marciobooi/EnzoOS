import { useContext, useEffect, useState } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Music, Heart, Radio, ListMusic, Info, Mic2, ChevronDown,
  Airplay, Network, Bluetooth, Music2,
} from 'lucide-react';
import { Tk, SpotifyIcon, fmt, sourceBadgeLabel, DJ_MOODS } from '../shared';
import AlbumInfoSheet from '../AlbumInfoSheet';
import LyricsSheet from '../LyricsSheet';
import TabletQueueModal from './TabletQueueModal';
import { useLocalQueue } from '../../../hooks/useLocalQueue';
import { useI18n } from '../../../i18n';
import { api } from '../../../api';

// Mirrors SourceTab's source list (icons + ids only, not its Qobuz/Tidal
// auth flow — tapping either of those here just hands off to the Source
// tab, which already owns that logic) so the hero's quick-switch carousel
// can't drift out of sync with what Source actually offers.
const INPUT_SOURCES = [
  { id: 'spotify',   label: 'Spotify',   Icon: SpotifyIcon, isSpotify: true },
  { id: 'local',     label: 'Local',     Icon: Music },
  { id: 'radio',     label: 'Radio',     Icon: Radio },
  { id: 'dj',        label: 'DJ',        Icon: Mic2 },
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
    albumImage, trackName, trackArtist, source, spotify, spotifyBacked, token,
    isPlaying, trackPosition, trackDuration, progressPct,
    volume, isMuted, shuffleState, repeatState,
    activeDevice, isCurrentFav, currentTrack,
    handlePlayPause, handleNext, handlePrevious,
    handleShuffle, handleRepeat, handleSeek, commitSeek,
    handleVolumeChange, handleMuteToggle,
    handleToggleFavRadio, handleToggleSource, setActiveTab,
    queue,
    favorites, handleToggleFavorite,
    liveFormat,
    fetchQueue,
  } = useContext(Tk);

  const [showInfo, setShowInfo]     = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue]   = useState(false);
  const [djMood, setDjMood] = useState(null);
  const handleMoodTap = (id) => {
    const next = djMood === id ? null : id; // tap the active one again to clear it
    setDjMood(next);
    api.setDjMood(next).catch(() => {});
  };
  // AUDIT-2026-08-03: fetch the real server-side mood whenever this becomes
  // the active source, rather than only ever clearing it — see the matching
  // fix in PlayerDisplay.jsx (kiosk) and PlayerTab.jsx (phone) for the full
  // story ("when I start dj ... idk which mood is selected").
  useEffect(() => {
    if (source !== 'dj') { setDjMood(null); return; }
    let alive = true;
    api.getDjStatus().then(d => { if (alive) setDjMood(d.mood || null); }).catch(() => {});
    return () => { alive = false; };
  }, [source]);

  // MPD's queue (local files/Tidal/Qobuz/etc.) isn't in playbackState like
  // Spotify's is — it's fetched separately. Previously this preview only
  // read the Spotify `queue`, so it silently stayed empty ("Nothing
  // queued") for every other source even though TabletQueueList's expanded
  // view (using the same hook) proved the queue itself was populated fine.
  const { isLocal, localQueue } = useLocalQueue();

  // Spotify's `queue` (unlike MPD's local one above) is only ever populated
  // by fetchQueue() — on the phone that's triggered by the effect that
  // watches `queueOpen` when QueuePanel is opened. Tablet has no
  // queueOpen/QueuePanel at all (this preview + TabletQueueList replace it
  // inline), so nothing ever called fetchQueue() here and `queue` stayed
  // permanently empty. Fetch on mount and again whenever the track changes
  // (a skip shifts what's "next"), same trigger granularity the phone gets
  // from a user re-opening the sheet. spotifyBacked (not spotify) so DJ mode
  // also fetches — fetchQueue itself routes to /api/dj/status's own upcoming
  // list there, since DJ never populates Spotify's real queue.
  useEffect(() => {
    if (spotifyBacked && token) fetchQueue();
  }, [spotifyBacked, token, trackName]); // eslint-disable-line react-hooks/exhaustive-deps

  const albumName = currentTrack?.album?.name || '';
  const canInfo   = source !== 'radio' && !!trackArtist && !!albumName && trackName !== 'Nothing playing';
  const canLyrics = source !== 'radio' && !!trackArtist && trackName !== 'Nothing playing';
  const trackUri  = currentTrack?.uri || currentTrack?.url || '';
  const isFav     = source === 'radio'
    ? isCurrentFav
    : favorites?.some(f => f.source === source && f.uri === trackUri);
  // art is null for local/MPD rows — queue/detailed only returns
  // id/title/artist/file, no per-track cover, same limitation the phone's
  // QueuePanel has for local queues (falls back to a generic icon there too).
  // Just 1 row: this is a glimpse, not a list — tapping the card opens
  // TabletQueueModal for the real (scrollable) queue. In landscape
  // .rt-main--player has overflow-y:hidden (a fixed dashboard, not a
  // scrolling document — see remote-tablet.css), so anything shown inline
  // here is unrecoverable height budget; 3 rows, then 2, both still tall
  // enough to push the input-source carousel below it out of the pane.
  const upNext = isLocal
    ? localQueue.slice(0, 1).map(tr => ({ uri: tr.id, name: tr.title, artists: [{ name: tr.artist }], art: null }))
    : (spotifyBacked && Array.isArray(queue)
      ? queue.slice(0, 1).map(tr => ({ ...tr, art: tr.album?.images?.[2]?.url || tr.album?.images?.[0]?.url }))
      : []);

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
    // DJ mode plays through Spotify Connect under the hood (dj.js issues
    // the exact same Web API play calls) — it just isn't literally
    // source === 'spotify', so it fell through to the generic 'STREAMING'
    // placeholder instead of a real quality label. Same fix in PlayerTab.jsx.
    return (source === 'spotify' || source === 'dj') ? 'SPOTIFY OGG' : 'STREAMING';
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
    // gap-8 not gap-[4rem]: landscape's .rt-main--player has overflow-y:hidden
    // (fixed dashboard, not a scrolling document), so this wrapper's 2 gaps
    // were unconditionally spending 128px of vertical budget on whitespace
    // alone — a real contributor to the input-source carousel getting pushed
    // out of the visible pane, alongside the Up Next preview height above.
    <div className="flex flex-col h-full min-h-0 gap-8">
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
              {sourceBadgeLabel(source)}
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
            {activeDevice && <span style={{ color: C.champagne }}> · {activeDevice.name}</span>}
          </p>

        </div>

        {spotify && !token && (
          <div className="rounded-xl p-5 flex flex-col gap-4 mb-6 text-center"
            style={{ background: cardWhite.background, border: cardWhite.border, boxShadow: ambientShadow }}>
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
            the active one again clears it back to random. Mirrors PlayerTab's
            phone version so the two can't drift apart. */}
        {source === 'dj' && (
          <div className="flex gap-3 overflow-x-auto pb-1 mb-6" style={{ scrollbarWidth: 'none' }}>
            {DJ_MOODS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => handleMoodTap(id)}
                aria-pressed={djMood === id}
                className="shrink-0 flex flex-col items-center justify-center gap-1.5 w-[84px] py-3.5 rounded-2xl active:scale-95 transition-all cursor-pointer"
                style={djMood === id
                  // Explicit border + glow, not just a solid fill — reported
                  // live: "the active card of dj we should add gold color
                  // and border so user know that active" (AUDIT-2026-08-02).
                  ? { background: C.champagne, color: '#1a1c1c', border: `2px solid ${C.champagne}`, boxShadow: '0 2px 12px rgba(212,175,55,0.35)' }
                  : { background: cardWhite.background, border: cardWhite.border, color: C.text2 }}>
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
              </button>
            ))}
          </div>
        )}

        {source !== 'radio' ? (
          <div className="mb-5">
            <div className="relative h-1 rounded-full mb-3" style={{ background: C.container }}>
              <div className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${progressPct}%`, background: accentFill }} />
              <div className="absolute w-4 h-4 rounded-full top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: `${progressPct}%`, background: '#ffffff', boxShadow: '0 4px 10px rgba(180,170,150,0.25)' }} />
              {/* -inset-y-5 (was -inset-y-2.5, ~24px touch height — still
                  short of the ~44px guideline): reported live as "hard to
                  swing, have to precisely place it" (AUDIT-2026-08-02). */}
              <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
                onChange={handleSeek}
                onPointerUp={commitSeek}
                onPointerCancel={commitSeek}
                disabled={spotify ? !token || !trackDuration : !trackDuration}
                className="absolute -inset-y-5 inset-x-0 w-full opacity-0 cursor-pointer disabled:cursor-default touch-pan-y" />
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

    {/* ── Stream meta + master volume — full-width strip below the hero
        (outside .rt-hero, so in landscape it spans both grid columns).
        .rt-hero-meta mirrors .rt-hero's width caps/centering so its edges
        stay aligned with the art/info block in both orientations. ── */}
    <div className="rt-hero-meta">
      {trackName && trackName !== 'Nothing playing' && (
        <div className="flex items-center gap-3 mb-4">
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
            className="w-11 h-11 inline-flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer"
            style={{ color: isFav ? C.error : C.text4 }}>
            <Heart className={`h-[18px] w-[18px] ${isFav ? 'fill-current' : ''}`} />
          </button>
          {canLyrics && (
            <button onClick={() => setShowLyrics(true)}
              className="w-11 h-11 inline-flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer"
              style={{ color: C.text4 }}>
              <Mic2 className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}

      {/* Master volume — always rendered: it drives the amp's volume, not
          track playback, so it stays useful even with nothing playing. */}
      <div className="flex items-center gap-2">
        <button onClick={handleMuteToggle} aria-label={isMuted ? t('player.unmute') : t('player.mute')}
          style={{ color: isMuted ? C.champagne : C.text2 }}
          className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer shrink-0">
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
            className="absolute -inset-y-5 inset-x-0 w-full opacity-0 cursor-pointer disabled:cursor-default touch-pan-y" />
        </div>
        <button style={{ color: C.text2 }} aria-label={t('player.maxVolume')}
          className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer shrink-0"
          onClick={() => handleVolumeChange({ target: { value: 100 } })}>
          <Volume2 className="h-4 w-4" />
        </button>
      </div>

      {/* up next — a one-track glimpse; tapping opens TabletQueueModal for
          the real (scrollable) queue instead of expanding in place. This
          pane doesn't scroll in landscape (see remote-tablet.css), so an
          inline-expanded list had nowhere to go past a couple of rows. */}
      {(spotify ? !!token : source !== 'radio') && (
        <button onClick={() => setShowQueue(true)}
          className="w-full rounded-2xl overflow-hidden mt-5 text-left active:scale-[0.99] transition-all cursor-pointer"
          style={{ background: cardWhite.background, border: cardWhite.border, boxShadow: ambientShadow }}>
          <div className="flex items-center justify-between p-4">
            <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider"
              style={{ color: C.text3, fontFamily: C.fontLabel }}>
              <ListMusic className="h-4 w-4" style={{ color: C.champagne }} />
              {t('queue.upNext') || 'Up Next'}
            </span>
            <ChevronDown className="h-4 w-4 -rotate-90" style={{ color: C.outline }} />
          </div>
          {upNext.length > 0 ? (
            <div className="px-4 pb-4 -mt-1 flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 flex items-center justify-center"
                style={{ background: C.container, border: `0.5px solid ${C.outline}` }}>
                {upNext[0].art
                  ? <img src={upNext[0].art} alt="" className="w-full h-full object-cover" draggable={false} />
                  : <Music className="h-3 w-3" style={{ color: C.text4 }} />}
              </div>
              <p className="text-[13px] truncate" style={{ color: C.text2 }}>
                {upNext[0].name} <span style={{ color: C.text4 }}>· {upNext[0].artists?.map(a => a.name).join(', ')}</span>
              </p>
            </div>
          ) : (
            <p className="text-[13px] px-4 pb-4 -mt-1" style={{ color: C.text4 }}>Nothing queued</p>
          )}
        </button>
      )}
    </div>

    {showQueue && <TabletQueueModal onClose={() => setShowQueue(false)} />}

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
