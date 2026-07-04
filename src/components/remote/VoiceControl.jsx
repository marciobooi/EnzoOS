import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tk } from './shared';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { parseVoiceCommand } from '../../lib/voiceCommands';
import VoiceOrb from './VoiceOrb';

// Push-to-talk voice control for the remote (works as an installed PWA —
// Web Speech API is available in iOS ≥14.5 Safari/standalone and Android
// Chrome). Full-screen dark overlay with the liquid-orb animation; tap the
// mic in the top bar to open, speak a command, the transcript is parsed by
// src/lib/voiceCommands.js and executed against the same handlers the touch
// UI uses. Tap anywhere to cancel.

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

// The mic button always shows — hiding it just reads as "voice doesn't
// exist" (observed on iPhone Safari, where webkitSpeechRecognition is only
// exposed when iOS Dictation is enabled). When speech isn't usable the
// overlay explains exactly why: missing API (Firefox / Dictation off) or
// insecure origin (mic is blocked on plain http://), with the fix inline.
export const voiceSupported = () => true;

export default function VoiceControl({ onClose }) {
  const { t, lang } = useI18n();
  const ctx = useContext(Tk);
  const { C, darkMode } = ctx;
  const [display, setDisplay] = useState('');
  const [mood, setMood] = useState('listen');   // listen | ok | error
  const [phase, setPhase] = useState('listening'); // listening | done
  const levelRef = useRef(0);
  const recRef = useRef(null);
  const closedRef = useRef(false);
  const finalHandled = useRef(false);

  // Latest ctx in a ref so the recognition callbacks never act on stale state.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const finish = (msg, ok = true, delay = 1500) => {
    setPhase('done');
    setMood(ok ? 'ok' : 'error');
    setDisplay(msg);
    levelRef.current = ok ? 0.9 : 0.6;
    setTimeout(() => { if (!closedRef.current) { closedRef.current = true; onClose(); } }, delay);
  };

  const execute = async (transcript) => {
    const c = ctxRef.current;
    const cmd = parseVoiceCommand(transcript);
    if (!cmd) return finish(t('voice.didntCatch'), false, 2200);
    try {
      switch (cmd.intent) {
        case 'pause':
          if (c.isPlaying) await c.handlePlayPause();
          return finish(t('voice.paused'));
        case 'play':
          if (!c.isPlaying) await c.handlePlayPause();
          return finish(t('voice.playing'));
        case 'next':
          await c.handleNext();
          return finish(t('voice.nextTrack'));
        case 'previous':
          await c.handlePrevious();
          return finish(t('voice.prevTrack'));
        case 'volumeUp':
        case 'volumeDown':
        case 'volumeSet': {
          const v = cmd.intent === 'volumeSet' ? cmd.arg
            : Math.max(0, Math.min(100, c.volume + (cmd.intent === 'volumeUp' ? 10 : -10)));
          c.handleVolumeChange({ target: { value: String(v) } });
          return finish(t('voice.volumeSet', { v }));
        }
        case 'mute':
          if (!c.isMuted) await c.handleMuteToggle();
          return finish(t('voice.muted'));
        case 'unmute':
          if (c.isMuted) await c.handleMuteToggle();
          return finish(t('voice.unmuted'));
        case 'source':
          c.handleToggleSource(cmd.arg);
          return finish(t('voice.sourceSwitched', { s: cmd.arg }));
        case 'standby':
          c.handleToggleStandby(true);
          return finish(t('voice.standbyOn'));
        case 'wake':
          c.handleToggleStandby(false);
          return finish(t('voice.standbyOff'));
        case 'sleepTimer':
          c.handleSetSleepTimer(cmd.arg);
          return finish(cmd.arg ? t('voice.sleepSet', { m: cmd.arg }) : t('voice.sleepOff'));
        case 'shuffle': {
          if (!c.spotify || !c.token) return finish(t('voice.notConnected'), false, 2000);
          if (cmd.arg === 'on' && c.shuffleState) return finish(t('voice.shuffleOn'));
          if (cmd.arg === 'off' && !c.shuffleState) return finish(t('voice.shuffleOff'));
          const willBeOn = !c.shuffleState;
          await c.handleShuffle();
          return finish(willBeOn ? t('voice.shuffleOn') : t('voice.shuffleOff'));
        }
        case 'repeat': {
          if (!c.spotify || !c.token) return finish(t('voice.notConnected'), false, 2000);
          const mode = cmd.arg || { off: 'context', context: 'track', track: 'off' }[c.repeatState] || 'off';
          await api.setRepeat(c.token, mode);
          c.requestWSStateSync();
          const key = mode === 'off' ? 'repeatOff' : mode === 'track' ? 'repeatTrack' : 'repeatAll';
          return finish(t(`voice.${key}`));
        }
        case 'favorite':
        case 'unfavorite': {
          if (!c.trackName || c.trackName === 'Nothing playing') return finish(t('voice.nothingPlaying'), false, 2000);
          if (c.source === 'radio') {
            const url = c.currentTrack?.url;
            if (!url) return finish(t('voice.nothingPlaying'), false, 2000);
            if (cmd.intent === 'favorite' && c.isCurrentFav) return finish(t('voice.alreadyFavorite'));
            if (cmd.intent === 'unfavorite' && !c.isCurrentFav) return finish(t('voice.notFavorite'));
            await c.handleToggleFavRadio({ name: c.trackName, url, favicon: c.albumImage || '', country: '', tags: '' });
            return finish(cmd.intent === 'favorite' ? t('voice.favorited') : t('voice.unfavorited'));
          }
          const uri = c.currentTrack?.uri || c.currentTrack?.url || '';
          if (!uri) return finish(t('voice.nothingPlaying'), false, 2000);
          const isFav = c.favorites?.some(f => f.source === c.source && f.uri === uri);
          if (cmd.intent === 'favorite' && isFav) return finish(t('voice.alreadyFavorite'));
          if (cmd.intent === 'unfavorite' && !isFav) return finish(t('voice.notFavorite'));
          await c.handleToggleFavorite({
            source: c.source, uri, title: c.trackName, artist: c.trackArtist,
            album: c.currentTrack?.album?.name || '', cover: c.albumImage,
          });
          return finish(cmd.intent === 'favorite' ? t('voice.favorited') : t('voice.unfavorited'));
        }
        case 'nowPlaying': {
          if (!c.trackName || c.trackName === 'Nothing playing') return finish(t('voice.nothingPlaying'), false, 2000);
          return finish(c.trackArtist ? `${c.trackName} — ${c.trackArtist}` : c.trackName, true, 2600);
        }
        case 'routeHere': {
          if (!c.token || !c.resonanceDevice?.id) return finish(t('voice.routeUnavailable'), false, 2200);
          await c.handleTransferPlayback(c.resonanceDevice.id);
          return finish(t('voice.routedHere'));
        }
        case 'seekForward':
        case 'seekBack': {
          if (!c.trackDuration) return finish(t('voice.nothingPlaying'), false, 2000);
          const deltaMs = cmd.arg * 1000 * (cmd.intent === 'seekBack' ? -1 : 1);
          const newMs = Math.max(0, Math.min(c.trackDuration, (c.trackPosition || 0) + deltaMs));
          await c.handleSeek({ target: { value: String(newMs) } });
          return finish(cmd.intent === 'seekForward' ? t('voice.seekForward', { s: cmd.arg }) : t('voice.seekBack', { s: cmd.arg }));
        }
        case 'playRadio': {
          const r = await fetch(`/api/player/radio-search?q=${encodeURIComponent(cmd.arg)}&limit=1`);
          const stations = await r.json();
          const s = Array.isArray(stations) && stations[0];
          if (!s) return finish(t('voice.noResults', { q: cmd.arg }), false, 2200);
          c.wakeKiosk?.();
          c.handleToggleSource('radio');
          await api.localPlayRadio(s.url_resolved || s.url, s.name, s.favicon);
          return finish(t('voice.playingRadio', { name: s.name }));
        }
        case 'playArtist': {
          if (!c.token) return finish(t('voice.notConnected'), false, 2200);
          const d = await api.searchAll(c.token, cmd.arg, 'artist', 1);
          const artist = d?.artists?.items?.[0];
          if (!artist) return finish(t('voice.noResults', { q: cmd.arg }), false, 2200);
          c.wakeKiosk?.();
          if (c.source !== 'spotify') c.handleToggleSource('spotify');
          await c.handlePlayContext(artist.uri);
          return finish(t('voice.playingTrack', { name: artist.name }));
        }
        case 'playMusic': {
          if (!c.token) return finish(t('voice.notConnected'), false, 2200);
          const d = await api.searchAll(c.token, cmd.arg, 'track', 1);
          const track = d?.tracks?.items?.[0];
          if (!track) return finish(t('voice.noResults', { q: cmd.arg }), false, 2200);
          c.wakeKiosk?.();
          if (c.source !== 'spotify') c.handleToggleSource('spotify');
          await c.handlePlayTrack(track.uri);
          return finish(t('voice.playingTrack', { name: track.name }));
        }
        default:
          return finish(t('voice.didntCatch'), false, 2200);
      }
    } catch (e) {
      return finish(e.message || t('voice.didntCatch'), false, 2200);
    }
  };

  const insecure = typeof window !== 'undefined' && !window.isSecureContext;
  const httpsUrl = typeof window !== 'undefined'
    ? `https://${window.location.hostname}:5001/remote`
    : '';

  useEffect(() => {
    // No Web Speech API: Firefox, or iPhone with Dictation disabled
    // (iOS only exposes webkitSpeechRecognition when Settings → General →
    // Keyboard → Enable Dictation is on).
    if (!SR) {
      setPhase('done');
      setMood('error');
      setDisplay(t('voice.unsupported'));
      return;
    }
    // Browsers block ALL mic access on insecure origins — don't even try;
    // show the pointer to the HTTPS address instead (overlay stays open
    // until tapped so the URL can be read).
    if (insecure) {
      setPhase('done');
      setMood('error');
      setDisplay(t('voice.needsHttps'));
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = lang === 'pt' ? 'pt-PT' : 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    // decay the orb's voice level between speech events
    const decay = setInterval(() => { levelRef.current = Math.max(0, levelRef.current - 0.06); }, 80);

    rec.onresult = (e) => {
      let transcript = '';
      let isFinal = false;
      for (const res of e.results) {
        transcript += res[0].transcript;
        if (res.isFinal) isFinal = true;
      }
      levelRef.current = 1;
      setDisplay(transcript.trim());
      if (isFinal && !finalHandled.current) {
        finalHandled.current = true;
        try { rec.stop(); } catch { /* already stopped */ }
        execute(transcript.trim());
      }
    };
    rec.onerror = (e) => {
      if (finalHandled.current) return;
      finalHandled.current = true;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') finish(t('voice.micDenied'), false, 2600);
      else finish(t('voice.noSpeech'), false, 1800);
    };
    rec.onend = () => {
      // silence timeout with no result at all
      if (!finalHandled.current) { finalHandled.current = true; finish(t('voice.noSpeech'), false, 1600); }
    };

    levelRef.current = 0.35; // small idle swell so the orb feels alive
    try { rec.start(); } catch { finish(t('voice.micDenied'), false, 2600); }

    return () => {
      clearInterval(decay);
      closedRef.current = true;
      try { rec.abort(); } catch { /* already gone */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    try { recRef.current?.abort(); } catch { /* already gone */ }
    onClose();
  };

  // Frosted overlay in the remote's own theme — light stays light, dark
  // stays dark — with the champagne orb floating over it (alpha canvas).
  // Modest blur radius: a full-screen backdrop-filter recomposites on every
  // animation frame of the orb canvas — 24px was measurably janky on phones.
  const overlayBg = darkMode
    ? { background: 'rgba(10,15,30,0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }
    : { background: 'rgba(249,249,249,0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' };

  return createPortal(
    <div className="remote-root fixed inset-0 z-[10020] flex flex-col items-center justify-center"
      style={{ ...overlayBg, fontFamily: C.font, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={cancel}>
      <VoiceOrb levelRef={levelRef} mood={mood} size={280} />
      <p className="px-8 text-center text-[19px] font-medium min-h-[56px] mt-2"
        style={{ color: C.text1, letterSpacing: '-0.01em' }}>
        {display || (phase === 'listening' ? t('voice.listening') : '')}
      </p>
      {insecure && (
        <a href={httpsUrl} onClick={e => e.stopPropagation()}
          className="mt-3 px-5 py-2.5 rounded-full text-[14px] font-semibold"
          style={{ background: `${C.champagne}22`, color: C.primary, border: `0.5px solid ${C.champagne}66` }}>
          {httpsUrl}
        </a>
      )}
      <p className="absolute left-0 right-0 text-center text-[12px] uppercase tracking-widest"
        style={{ color: C.text3, fontFamily: C.fontLabel, bottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
        {t('voice.tapToCancel')}
      </p>
    </div>,
    document.body,
  );
}
