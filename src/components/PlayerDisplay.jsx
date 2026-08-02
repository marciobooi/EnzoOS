import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, VolumeX, Volume1, Sliders, Radio, Heart, Power, Search, Zap, Moon, Coffee, Flame, PartyPopper } from 'lucide-react';
import AutoScroll from './AutoScroll';
import { toVolumeDb, sanitizeTrackName } from '../lib/format';
import { api } from '../api';

// DJ mode mood buttons (server/dj.js MOODS) — ids must match exactly.
// Isolated here (not threaded through Kiosk.jsx's props/state) so the
// feature stays deletable by removing just this block + its JSX/CSS, per
// dj.js's own "don't spread this around" design.
const DJ_MOODS = [
  { id: 'hype',     label: 'Hype',     Icon: Zap },
  { id: 'chill',    label: 'Chill',    Icon: Moon },
  { id: 'casual',   label: 'Casual',   Icon: Coffee },
  { id: 'dramatic', label: 'Dramatic', Icon: Flame },
  { id: 'playful',  label: 'Playful',  Icon: PartyPopper },
];

// Real compact-cassette reel physics: the tape runs at a constant linear speed
// (4.76 cm/s), so a hub's angular speed is inversely proportional to how much
// tape its pack currently holds — an empty hub does one revolution in ~1.45s
// and slows as the pack grows. `outer` and the from/to scales mirror the pack
// shapes in cassette-audio.svg and their tape-transfer scale() keyframes, so
// the cog speed always matches the pack radius drawn behind it. The "empty"
// endpoints land the pack edge on the static gray reel disc (r≈55.09), which
// is drawn over the packs — shrinking further just hides tape behind it.
const TAPE_HUB_RADIUS = 30;            // cog hub radius in SVG units (≈11mm real)
const TAPE_HUB_SECONDS_PER_REV = 1.45; // real-deck period at empty-hub radius
const TAPE_PACKS = {
  'reel-left':  { outer: 83.656, from: 1,     to: 0.659 }, // supply pack empties
  'reel-right': { outer: 112.97, from: 0.488, to: 1 },     // take-up pack fills
};

const PlayerDisplay = React.memo(function PlayerDisplay({
  theme = 'amber',
  activeTheme = 'dot-matrix',
  visualizerMode = 'vu',
  isPlaying,
  isLocalDeviceActive,
  trackName,
  trackArtist,
  trackPosition,
  trackDuration,
  volume,
  isMuted,
  shuffleState,
  repeatState,
  handlePrevious,
  handlePlayPause,
  handleNext,
  handleSeek,
  commitSeek,
  handleVolumeChange,
  handleToggleMute,
  handleToggleShuffle,
  handleToggleRepeat,
  playbackState,
  onToggleMenu,
  onToggleAlbumInfo,
  onTransferPlayback,
  hasToken,
  spotify,
  onToggleSource,
  onToggleEqualizer,
  source,
  favoriteStations = [],
  onToggleFavoriteRadio,
  onToggleStandby,
  onToggleSearch,
  onToggleRadioSearch,
  signalInfo = null,
}) {
  const [showVolumeFeedback, setShowVolumeFeedback] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [djMood, setDjMood] = useState(null);

  // Local-only UI state (server/dj.js's own state.mood resets on every fresh
  // start() anyway) — clear the highlight whenever DJ mode isn't the active
  // source, so switching away and back never shows a stale selection.
  useEffect(() => {
    if (source !== 'dj') setDjMood(null);
  }, [source]);

  const handleMoodClick = useCallback((id) => {
    const next = djMood === id ? null : id; // tap the active mood again to clear it (back to random)
    setDjMood(next);
    api.setDjMood(next).catch(() => {});
  }, [djMood]);

  const feedbackTimeout = useRef(null);
  const volumePopupRef = useRef(null);
  const dbLRef = useRef(null);
  const dbRRef = useRef(null);
  const needleLRef = useRef(null);
  const needleRRef = useRef(null);
  const canvasRef = useRef(null);
  const cassetteObjRef = useRef(null);
  const cassetteTrackKeyRef = useRef(null);
  const trackPositionRef = useRef(0);
  const tapeTickRef = useRef({ pos: 0, t: 0 });
  const reelAnimsRef = useRef(null);

  const applyCassettePlaybackState = useCallback(() => {
    const svgRoot = cassetteObjRef.current?.contentDocument?.documentElement;
    if (svgRoot) svgRoot.classList.toggle('paused', !isPlaying);
    // The cogs are WAAPI-driven, so the SVG's .paused CSS rule can't reach them.
    const anims = reelAnimsRef.current;
    if (anims) Object.values(anims).forEach(anim => (isPlaying ? anim.play() : anim.pause()));
  }, [isPlaying]);

  // ω = v/r — keep the visible tape surface speed constant: each cog's
  // playbackRate follows the inverse of its pack's current radius, so the
  // take-up reel starts fast and slows as it fills while the supply reel
  // speeds up as it empties, like a real deck.
  const updateCassetteReelSpeeds = useCallback(() => {
    const anims = reelAnimsRef.current;
    if (!anims) return;
    const durationMs = trackDuration > 0 ? trackDuration : 180000;
    const progress = Math.min(Math.max(trackPositionRef.current / durationMs, 0), 1);
    Object.entries(TAPE_PACKS).forEach(([id, pack]) => {
      const anim = anims[id];
      if (!anim) return;
      const radius = pack.outer * (pack.from + (pack.to - pack.from) * progress);
      const rate = TAPE_HUB_RADIUS / radius;
      // playbackRate throws on non-finite values — skip rather than crash.
      if (Number.isFinite(rate)) anim.playbackRate = rate;
    });
  }, [trackDuration]);

  const initCassetteReels = useCallback(() => {
    const svgDoc = cassetteObjRef.current?.contentDocument;
    if (!svgDoc) return;
    const anims = {};
    Object.keys(TAPE_PACKS).forEach(id => {
      const el = svgDoc.getElementById(id);
      if (!el) return;
      // Replace the SVG's fixed-speed CSS spin with a WAAPI animation:
      // changing a WAAPI playbackRate preserves the current rotation angle,
      // so per-second speed updates never make the cog jump.
      el.getAnimations().forEach(anim => anim.cancel());
      el.style.animation = 'none';
      anims[id] = el.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: TAPE_HUB_SECONDS_PER_REV * 1000, iterations: Infinity }
      );
    });
    reelAnimsRef.current = anims;
    updateCassetteReelSpeeds();
  }, [updateCassetteReelSpeeds]);

  const syncCassetteTapeTransfer = useCallback(() => {
    const svgDoc = cassetteObjRef.current?.contentDocument;
    const svgRoot = svgDoc?.documentElement;
    if (!svgRoot) return;
    const durationSec = trackDuration > 0 ? trackDuration / 1000 : 180;
    const positionSec = Math.min(Math.max(trackPositionRef.current / 1000, 0), durationSec);
    svgRoot.style.setProperty('--transfer-duration', `${durationSec}s`);
    // Animation is a single forwards-filled pass keyed to song length: hard
    // reset it, then use a negative delay to land on the frame matching the
    // current playback position (frame 0 = left full / right empty).
    ['path5342', 'path5344'].forEach(id => {
      const el = svgDoc.getElementById(id);
      if (!el) return;
      el.style.animation = 'none';
      void el.getBoundingClientRect();
      el.style.animation = '';
      el.style.animationDelay = `-${positionSec}s`;
    });
  }, [trackDuration]);

  const initCassetteSvg = useCallback(() => {
    initCassetteReels();
    applyCassettePlaybackState();
    syncCassetteTapeTransfer();
  }, [initCassetteReels, applyCassettePlaybackState, syncCassetteTapeTransfer]);

  useEffect(() => {
    if (activeTheme === 'cassette') applyCassettePlaybackState();
  }, [activeTheme, applyCassettePlaybackState]);

  useEffect(() => {
    if (activeTheme !== 'cassette') return;
    const key = `${trackName}::${trackArtist}`;
    if (cassetteTrackKeyRef.current === key) return;
    cassetteTrackKeyRef.current = key;
    syncCassetteTapeTransfer();
  }, [activeTheme, trackName, trackArtist, syncCassetteTapeTransfer]);

  // The tape animation free-runs on wall clock, so it only stays honest while
  // playback advances 1s per second. Re-sync it whenever the reported position
  // jumps somewhere the running animation can't have reached on its own
  // (seek, server re-sync correction, resume after a long pause).
  useEffect(() => {
    // Track transitions can briefly report an undefined/NaN position — keep
    // the ref finite so the tape/reel math downstream never sees NaN.
    const position = Number.isFinite(trackPosition) ? trackPosition : 0;
    trackPositionRef.current = position;
    const now = performance.now();
    const last = tapeTickRef.current;
    const expected = last.pos + (isPlaying ? now - last.t : 0);
    tapeTickRef.current = { pos: position, t: now };
    if (activeTheme !== 'cassette') return;
    updateCassetteReelSpeeds();
    if (Math.abs(position - expected) > 2000) syncCassetteTapeTransfer();
  }, [trackPosition, isPlaying, activeTheme, syncCassetteTapeTransfer, updateCassetteReelSpeeds]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (volumePopupRef.current && !volumePopupRef.current.contains(event.target)) {
        setShowVolumePopup(false);
      }
    }
    if (showVolumePopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVolumePopup]);



  // Handle VU meter levels directly in DOM to avoid React re-render lag, with live ALSA audio updates and simulated watchdog fallback
  useEffect(() => {
    if (!isPlaying) {
      if (dbLRef.current) dbLRef.current.textContent = '-45.0 DB';
      if (dbRRef.current) dbRRef.current.textContent = '-45.0 DB';
      if (needleLRef.current) needleLRef.current.style.transform = 'translateX(-50%) rotate(-45deg)';
      if (needleRRef.current) needleRRef.current.style.transform = 'translateX(-50%) rotate(-45deg)';
      return;
    }

    let lastEventTime = Date.now();
    let fallbackInterval = null;

    const updateVU = (dbL, dbR) => {
      const leftText = `${dbL > 0 ? '+' : ''}${dbL.toFixed(1)} DB`;
      const rightText = `${dbR > 0 ? '+' : ''}${dbR.toFixed(1)} DB`;

      if (dbLRef.current) dbLRef.current.textContent = leftText;
      if (dbRRef.current) dbRRef.current.textContent = rightText;

      // Normalize between -45dB and +3dB
      const leftPct = Math.max(0, Math.min(1, (dbL + 45) / 48));
      const rightPct = Math.max(0, Math.min(1, (dbR + 45) / 48));

      const leftDeg = -45 + leftPct * 55; // maps to -45deg to +10deg
      const rightDeg = -45 + rightPct * 55;

      if (needleLRef.current) {
        needleLRef.current.style.transform = `translateX(-50%) rotate(${leftDeg}deg)`;
      }
      if (needleRRef.current) {
        needleRRef.current.style.transform = `translateX(-50%) rotate(${rightDeg}deg)`;
      }
    };

    const handleLevels = (e) => {
      lastEventTime = Date.now();
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      const { dbL, dbR } = e.detail;
      updateVU(dbL, dbR);
    };

    // Watchdog checking if we are receiving real events from WS
    const watchdogInterval = setInterval(() => {
      if (Date.now() - lastEventTime > 2000) {
        // Fall back to simulation if no real events received in 2 seconds
        if (!fallbackInterval) {
          fallbackInterval = setInterval(() => {
            const leftVal = Math.random() * 18 - 16.5;
            const rightVal = Math.random() * 18 - 16.5;
            updateVU(leftVal, rightVal);
          }, 150);
        }
      }
    }, 1000);

    window.addEventListener('resonance-audio-levels', handleLevels);
    
    return () => {
      window.removeEventListener('resonance-audio-levels', handleLevels);
      clearInterval(watchdogInterval);
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [isPlaying]);

  // Handle 7-band digital frequency visualizer rendering
  useEffect(() => {
    if (visualizerMode !== 'digital') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    // Mutable, not a snapshot — the ResizeObserver below keeps this current so
    // the bar-centering math never draws against a stale width (this used to
    // be captured once and reused for the whole animation, so a layout shift
    // right as playback started — before this effect's first paint settled —
    // left the bars centered against the wrong, smaller width forever).
    let rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const numBars = 7;
    const gap = 6;
    const heights = new Array(numBars).fill(0);
    const peaks = new Array(numBars).fill(0);
    const peakDecay = 0.35;
    const riseSpeed = 0.25;
    const fallSpeed = 0.08;

    let localDbL = -45;
    let localDbR = -45;
    let lastEventTime = Date.now();

    const handleLevels = (e) => {
      lastEventTime = Date.now();
      const { dbL, dbR } = e.detail;
      localDbL = dbL;
      localDbR = dbR;
    };
    window.addEventListener('resonance-audio-levels', handleLevels);

    // Bar gradient/glow/width come from the --spectrum-* custom properties on
    // the .spectrum-visualizer wrapper (defaults + per-accent overrides in
    // index.css, origami override in origami.css) instead of a hardcoded JS
    // map, so any theme can restyle the bars in CSS alone.
    const barStyle = getComputedStyle(canvas);
    const readVar = (name, fallback) => barStyle.getPropertyValue(name).trim() || fallback;
    const activeColor = {
      base: readVar('--spectrum-gradient-start', 'rgba(217, 119, 6, 0.8)'),
      mid: readVar('--spectrum-gradient-mid', '#f59e0b'),
      peak: readVar('--spectrum-gradient-end', '#fcd307'),
      glow: readVar('--spectrum-glow-color', 'rgba(245, 158, 11, 0.4)'),
      dotInactive: readVar('--spectrum-dot-inactive-color', 'rgba(255, 255, 255, 0.05)'),
    };
    const barWidthScale = parseFloat(readVar('--spectrum-bar-width-scale', '1')) || 1;

    let animationId;
    // Throttled to ~30fps: this is a 7-bar visualizer, not a precision
    // audio analyzer, so half the draw rate is visually indistinguishable
    // but roughly halves the canvas redraw cost of an unthrottled 60fps
    // rAF loop running continuously for as long as a track plays — a real
    // cost on the Pi4's GPU. The rAF call itself still fires every frame
    // (cheap) so the throttle check below stays accurate; only the actual
    // clear+draw work is skipped on off-frames.
    let lastDrawTime = 0;
    const FRAME_INTERVAL = 1000 / 30;

    const animate = (time) => {
      animationId = requestAnimationFrame(animate);
      if (time - lastDrawTime < FRAME_INTERVAL) return;
      lastDrawTime = time;

      ctx.clearRect(0, 0, rect.width, rect.height);

      const isSimulated = !isPlaying || (Date.now() - lastEventTime > 2000);

      for (let i = 0; i < numBars; i++) {
        let target;

        if (isSimulated) {
          if (isPlaying) {
            if (i === 0 || i === 1) { // Bass
              const slowWave = Math.sin(time * 0.006 + i * 1.5) * 0.35 + 0.35;
              const fastJitter = Math.random() * 0.3;
              target = Math.max(0.1, slowWave + fastJitter);
            } else if (i === 2 || i === 3 || i === 4) { // Mids
              const midWave = Math.sin(time * 0.003 - i * 0.8) * 0.25 + 0.25;
              const jitter = Math.random() * 0.2;
              target = Math.max(0.08, midWave + jitter);
            } else { // Treble
              const highWave = Math.sin(time * 0.01 + i * 2.0) * 0.15 + 0.15;
              const highNoise = Math.random() * 0.25;
              target = Math.max(0.05, highWave + highNoise);
            }
            target = Math.min(1.0, target);
          } else {
            target = 0.05 + Math.sin(time * 0.002 + i * 0.5) * 0.03;
          }
        } else {
          // Live levels
          const dbVal = (i < 3) ? localDbL : (i > 3 ? localDbR : (localDbL + localDbR) / 2);
          const rawPct = Math.max(0, Math.min(1, (dbVal + 45) / 45));

          if (i === 0 || i === 1) {
            target = rawPct * (0.8 + Math.random() * 0.2);
          } else if (i === 2 || i === 3 || i === 4) {
            const waveOffset = Math.sin(time * 0.008 + i) * 0.12;
            target = Math.max(0.05, rawPct * 0.75 + waveOffset);
          } else {
            target = Math.max(0.05, rawPct * 0.7 + (Math.random() * 0.2 - 0.1));
          }
          target = Math.min(1.0, target);
        }

        if (target > heights[i]) {
          heights[i] += (target - heights[i]) * riseSpeed;
        } else {
          heights[i] -= (heights[i] - target) * fallSpeed;
        }
        heights[i] = Math.max(0, Math.min(1, heights[i]));

        if (heights[i] >= peaks[i]) {
          peaks[i] = heights[i];
        } else {
          peaks[i] = Math.max(heights[i], peaks[i] - (peakDecay / 60));
        }
      }

      const isDotMatrix = activeTheme.includes('dot') || activeTheme.includes('matrix');
      const barWidth = Math.floor((rect.width - (numBars - 1) * gap) / numBars * barWidthScale);
      const totalWidth = numBars * barWidth + (numBars - 1) * gap;
      const startX = (rect.width - totalWidth) / 2;

      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barWidth + gap);
        const maxBarH = rect.height - 12;
        const currentH = heights[i] * maxBarH;

        if (isDotMatrix) {
          const dotSize = 3;
          const dotGap = 2;
          const maxDots = Math.floor(maxBarH / (dotSize + dotGap));
          const activeDots = Math.ceil(heights[i] * maxDots);
          const peakDotIdx = Math.floor(peaks[i] * maxDots);

          for (let dot = 0; dot < maxDots; dot++) {
            const dotY = rect.height - 6 - dot * (dotSize + dotGap);
            const isDotActive = dot < activeDots;
            const isPeakDot = dot === peakDotIdx;

            if (isDotActive) {
              ctx.fillStyle = activeColor.mid;
              ctx.shadowColor = activeColor.glow;
              ctx.shadowBlur = 4;
            } else if (isPeakDot && isPlaying) {
              ctx.fillStyle = activeColor.peak;
              ctx.shadowColor = activeColor.glow;
              ctx.shadowBlur = 6;
            } else {
              ctx.fillStyle = activeColor.dotInactive;
              ctx.shadowBlur = 0;
            }

            ctx.beginPath();
            ctx.arc(x + barWidth / 2, dotY, dotSize / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        } else {
          // Solid bars
          const barH = Math.max(2, currentH);
          const y = rect.height - 6 - barH;

          const gradient = ctx.createLinearGradient(x, rect.height - 6, x, y);
          gradient.addColorStop(0, activeColor.base);
          gradient.addColorStop(0.7, activeColor.mid);
          gradient.addColorStop(1.0, activeColor.peak);

          ctx.fillStyle = gradient;
          ctx.shadowColor = activeColor.glow;
          ctx.shadowBlur = 6;

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth, barH, 1.5);
          } else {
            ctx.rect(x, y, barWidth, barH);
          }
          ctx.fill();

          if (isPlaying) {
            const peakY = rect.height - 6 - peaks[i] * maxBarH;
            ctx.fillStyle = activeColor.peak;
            ctx.shadowBlur = 4;
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(x, Math.max(0, peakY - 2), barWidth, 1.5, 0.5);
            } else {
              ctx.rect(x, Math.max(0, peakY - 2), barWidth, 1.5);
            }
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }
    };

    animationId = requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        rect = entry.contentRect;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    });

    resizeObserver.observe(canvas.parentElement);

    return () => {
      window.removeEventListener('resonance-audio-levels', handleLevels);
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
    };
  }, [visualizerMode, isPlaying, theme, activeTheme]);

  // Trigger volume feedback pop-up on change
  useEffect(() => {
    setShowVolumeFeedback(true);
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => {
      setShowVolumeFeedback(false);
    }, 1500);

    return () => {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    };
  }, [volume, isMuted]);

  // Formatter for seek timer (mm:ss)
  const formatTime = (ms) => {
    if (!ms || isNaN(ms)) return '00:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Extract cover art
  const currentTrack = playbackState?.track_window?.current_track;
  const albumImage = currentTrack?.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&auto=format&fit=crop';
  const trackAlbumName = currentTrack?.album?.name || 'No Album Loaded';
  const isCurrentFavorite = currentTrack?.url ? favoriteStations.some(s => s.url === currentTrack.url) : false;
  // Tap the cover for album info when there's a real album; otherwise fall back
  // to the configuration menu (radio / nothing playing).
  const canShowInfo = !!onToggleAlbumInfo && source !== 'radio'
    && !!currentTrack?.album?.name && !!trackArtist && trackName !== 'SYSTEM IDLE';

  const [extractedRgb, setExtractedRgb] = useState('5, 10, 20');

  useEffect(() => {
    // The minimalist CSS rule this feeds is `div[data-active-theme="minimalist"]
    // { --ink: rgba(255,255,255,0.94); ... }` — a DIRECT (non-descendant) match
    // on Kiosk.jsx's own root div (the element that actually carries
    // data-active-theme), not on document.documentElement. That div has its
    // own static declaration for --ink/--ink-2/--ink-3/--ink-btn-bg/
    // --ink-btn-txt/--deep, which always wins over whatever gets set on an
    // ANCESTOR further up the tree (document.documentElement) — a local
    // declaration on the matching element itself beats inheriting from a
    // more distant ancestor, regardless of the JS-computed value. This is
    // why --album-art-url "already worked": Kiosk.jsx's div ALSO sets that
    // one directly via its own inline style, but nothing did the same for
    // the ink variables, so the luminance-based light/dark switch below was
    // computing correctly but never actually reaching the screen — reported
    // live: "now the album is white, the overlay is white, and it's
    // perfect, now the text is also white so that's bad" (AUDIT-2026-08-02).
    const el = document.querySelector('[data-active-theme]') || document.documentElement;

    if (activeTheme !== 'minimalist') {
      setExtractedRgb('5, 10, 20');
      el.style.removeProperty('--extracted-rgb');
      el.style.removeProperty('--deep');
      el.style.removeProperty('--album-art-url');
      return;
    }

    // Always set the album art URL so the CSS background-image layer works
    const artUrl = albumImage && !albumImage.includes('unsplash.com') ? albumImage : null;
    if (artUrl) {
      el.style.setProperty('--album-art-url', `url('${artUrl}')`);
    } else {
      el.style.removeProperty('--album-art-url');
    }

    if (!artUrl) {
      const fallback = '5, 10, 20';
      setExtractedRgb(fallback);
      el.style.setProperty('--extracted-rgb', fallback);
      el.style.setProperty('--deep', 'rgb(5, 10, 20)');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = artUrl;

    const applyColors = (r, g, b) => {
      // --extracted-rgb: full vivid colour (rgba opacity handles blending in CSS)
      const rgb = `${r}, ${g}, ${b}`;
      // --deep: very dark tint (12% brightness) for the solid left gradient edge
      const dr = Math.round(r * 0.12);
      const dg = Math.round(g * 0.12);
      const db = Math.round(b * 0.12);
      setExtractedRgb(rgb);
      el.style.setProperty('--extracted-rgb', rgb);
      el.style.setProperty('--deep', `rgb(${dr}, ${dg}, ${db})`);

      // Perceived luminance of the dominant colour (W3C formula).
      // The gradient at 52% is ~88% of this colour — if it's light, white
      // text becomes illegible. Switch ink to dark text when luminance > 0.45.
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const isLight = lum > 0.45;
      if (isLight) {
        el.style.setProperty('--ink',         'rgba(12, 8, 5, 0.92)');
        el.style.setProperty('--ink-2',       'rgba(12, 8, 5, 0.65)');
        el.style.setProperty('--ink-3',       'rgba(12, 8, 5, 0.38)');
        el.style.setProperty('--ink-btn-bg',  'rgb(15, 12, 8)');
        el.style.setProperty('--ink-btn-txt', '#ffffff');
      } else {
        el.style.setProperty('--ink',         'rgba(255, 255, 255, 0.94)');
        el.style.setProperty('--ink-2',       'rgba(255, 255, 255, 0.72)');
        el.style.setProperty('--ink-3',       'rgba(255, 255, 255, 0.38)');
        el.style.setProperty('--ink-btn-bg',  '#ffffff');
        el.style.setProperty('--ink-btn-txt', '#050a14');
      }
    };

    img.onload = () => {
      try {
        // Sample a 4×4 area for dominant hue average
        const canvas = document.createElement('canvas');
        canvas.width = 4; canvas.height = 4;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        ctx.drawImage(img, 0, 0, 4, 4);
        const pixels = ctx.getImageData(0, 0, 4, 4).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          rSum += pixels[i]; gSum += pixels[i + 1]; bSum += pixels[i + 2]; count++;
        }
        applyColors(Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count));
      } catch {
        applyColors(5, 10, 20);
      }
    };

    img.onerror = () => applyColors(5, 10, 20);

    return () => {
      el.style.removeProperty('--extracted-rgb');
      el.style.removeProperty('--deep');
      el.style.removeProperty('--album-art-url');
      el.style.removeProperty('--ink');
      el.style.removeProperty('--ink-2');
      el.style.removeProperty('--ink-3');
      el.style.removeProperty('--ink-btn-bg');
      el.style.removeProperty('--ink-btn-txt');
    };
  }, [albumImage, activeTheme]);

  return (
    <article
      className={`music-player ${isPlaying ? 'is-playing' : ''} ${activeTheme === 'cassette' ? 'music-player--cassette' : ''}`}
      aria-label="music-player"
      style={{ '--extracted-rgb': extractedRgb }}
    >
      
      {/* 1. Album Column */}
      <section className="album-column cursor-pointer" aria-label="Album artwork"
        onClick={canShowInfo ? onToggleAlbumInfo : onToggleMenu}
        title={canShowInfo ? 'Tap for album info' : 'Click to Open Configuration Menu'}>
        {source === 'radio' ? (
          <div className="album-art album-art--radio" aria-label="Radio station art">
            {albumImage && !albumImage.includes('unsplash.com') ? (
              <div className="radio-logo-wrap">
                <img src={albumImage} alt="Station logo" onError={e => { e.target.style.display = 'none'; }} />
              </div>
            ) : (
              <div className="radio-logo-placeholder">
                <Radio size={48} />
                <span style={{ fontSize: 8, fontFamily: 'Space Mono, monospace', letterSpacing: '0.15em', textTransform: 'uppercase' }}>WEB RADIO</span>
              </div>
            )}
          </div>
        ) : activeTheme === 'cassette' ? (
          <div className="album-art album-art--cassette" aria-label="Cassette album art">
            <object
              ref={cassetteObjRef}
              type="image/svg+xml"
              data="/cassette-audio.svg"
              className="cassette-svg"
              aria-hidden="true"
              onLoad={initCassetteSvg}
            />
          </div>
        ) : (
          <div className="album-art" aria-label="Dot matrix album art">
            <img src={albumImage} alt="Album art" />
          </div>
        )}
      </section>

      {/* 2. Details and Controls Column */}
      {(
        <section className="details-column" aria-label="Track details and playback controls">
          
          {/* Topline Readout & Audio Router */}
          <div className="track-details">
            <div className="hifi-topline">
              <button
                onClick={onToggleSource}
                className="status-pill cursor-pointer transition-colors border font-sans"
                title="Click to Switch Plugin Source"
                style={source === 'spotify'
                  ? { color: '#1a9e6a', borderColor: 'rgba(26,158,106,0.25)', background: 'rgba(26,158,106,0.07)' }
                  : { color: 'var(--theme-color)', borderColor: 'var(--theme-color-glow)', background: 'var(--theme-color-dim)' }
                }
              >
                <span className="status-dot"
                  style={{ background: source === 'spotify' ? '#1a9e6a' : 'var(--theme-color)' }} />
                PLUGIN: {source?.toUpperCase() || ''}
              </button>
           
              {spotify && (
                <button
                  onClick={onTransferPlayback}
                  className={`status-pill cursor-pointer transition-colors ${
                    isLocalDeviceActive
                      ? 'text-emerald-400 hover:text-emerald-300'
                      : 'theme-text hover:opacity-80 animate-pulse'
                  }`}
                  title={isLocalDeviceActive ? 'Spotify Connect Active' : 'Click to Route Audio to Resonance'}
                >
                  <span className={`status-dot ${isLocalDeviceActive ? 'bg-emerald-400' : 'theme-bg'}`}></span>
                  {isLocalDeviceActive ? 'SPOTIFY CONNECT // ACTIVE' : 'ROUTE TO RESONANCE'}
                </button>
              )}

              {source === 'dj' && (
                <div className="mood-row" role="group" aria-label="DJ mood">
                  {DJ_MOODS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleMoodClick(id)}
                      className={`mood-button ${djMood === id ? 'active' : ''}`}
                      title={djMood === id ? `${label} (tap to clear)` : `Pivot to ${label}`}
                      aria-label={label}
                      aria-pressed={djMood === id}
                    >
                      <Icon className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}

            </div>

            {/* Title Container & Live Volume Popup */}
            <div className="title-container mt-1">
              {/* Keyed by content: a track change remounts the line, replaying
                  its rise-in animation — lines whose text didn't change (same
                  artist on an album playthrough) stay put. */}
              <AutoScroll key={trackName} outerClass="w-[75%] track-title-enter" innerClass="track-title" speed={120} minDuration={8}>
                {sanitizeTrackName(trackName)}
              </AutoScroll>
              <div className={`volume-feedback ${showVolumeFeedback ? 'visible' : ''}`} aria-live="polite">
                {isMuted
                  ? <span style={{ color: '#1a1918' }}>MUTE</span>
                  : <span className="">
                      {toVolumeDb(volume)}<span> dB</span>
                    </span>
                }
              </div>
            </div>

            {/* Metadata & Mini Visualizer */}
            <div className="metadata-row mt-1.5">
              <div className="w-[60%] flex flex-col gap-0.5 overflow-hidden min-h-0 justify-center">
                <AutoScroll key={trackArtist} outerClass="track-artist-enter" innerClass="track-artist" speed={70}>{trackArtist}</AutoScroll>
                <AutoScroll key={trackAlbumName} outerClass="track-album-enter" innerClass="track-album" speed={70}>{trackAlbumName}</AutoScroll>
                
                {/* Audiophile HUD Telemetry & Signal Path — live data from /api/player/signal-path */}
                {(() => {
                  const idle = !playbackState || trackName === 'SYSTEM IDLE' || trackName === 'Ready to Stream';
                  const mpdFmt   = signalInfo?.mpd;
                  const camilla  = signalInfo?.camilla;
                  const isRunning = camilla?.state === 'Running';
                  const hasLive  = !idle && mpdFmt?.rate && isRunning;
                  const isClipping = (camilla?.clippedSamples ?? 0) > 0;

                  const codecLabel = idle ? 'OFFLINE'
                    : source === 'spotify' ? 'OGG VORBIS'
                    : source === 'radio'   ? 'AAC STREAM'
                    : 'PCM';

                  const rateLabel = idle ? '-- / --'
                    : hasLive
                    ? `${mpdFmt.bits}-bit / ${(mpdFmt.rate / 1000).toFixed(1)}kHz`
                    : source === 'spotify' ? '16-bit / 44.1kHz'
                    : source === 'radio'   ? '16-bit / 48.0kHz'
                    : '24-bit / 96.0kHz';

                  const pathLabel = idle
                    ? 'DSP Pipeline Suspended'
                    : (signalInfo?.path || (
                        source === 'spotify' ? 'Spotify → PipeWire → CamillaDSP → DAC'
                        : 'MPD → PipeWire → CamillaDSP → DAC'
                      ));

                  // Codec badge: idle uses Stone muted; all active sources use current theme color
                  const codecColor = idle ? 'border-[#c8c9c4]' : '';
                  const codecStyle = idle
                    ? { background: '#d0d1cc', color: '#9a9896', borderColor: '#c8c9c4' }
                    : { background: 'var(--theme-color-dim)', color: 'var(--theme-color)', borderColor: 'var(--theme-color-glow)' };

                  return (
                    <div className="flex items-center gap-1.5 mt-1 text-[8px] font-mono tracking-wider flex-wrap" style={{ color: '#9a9896' }}>
                      <span className={`codec-badge px-1 rounded-[3px] font-extrabold text-[7px] border ${codecColor}`} style={codecStyle}>
                        {codecLabel}
                      </span>
                      <span>{rateLabel}</span>
                      {isClipping && (
                        <span className="px-1 rounded-[3px] text-[7px] font-extrabold border bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse">
                          CLIP
                        </span>
                      )}
                      <span className="opacity-45">|</span>
                      <span className="text-[7.5px] opacity-75 truncate max-w-[120px] lg:max-w-none" title={pathLabel}>
                        {pathLabel}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Precision Mechanical VU Meters or 7-Band Digital (Click to Open EQ) */}
              <button
                onClick={onToggleEqualizer}
                className="hifi-visualizer shrink-0 cursor-pointer hover:opacity-90 transition-opacity bg-transparent border-0 p-0 flex items-stretch gap-[15px]"
                title="Open Parametric Equalizer"
                type="button"
              >
                {visualizerMode === 'vu' ? (
                  <>
                    {/* Left Channel Mechanical VU */}
                    <div className="vu-channel-box">
                      <div className="vu-title">
                        <span style={{ color: 'var(--color-faded)' }}>LINE LEVEL L</span>
                      </div>
                      <div className="vu-dial-area">
                        <div className="vu-dot-grid" />
                        <div className="vu-glow-overlay" />
                        <div className="vu-scale-marks">
                          <span>-20dB</span>
                          <span>-10dB</span>
                          <span>0dB</span>
                        </div>
                        <div ref={needleLRef} className="vu-needle" />
                      </div>
                      <div className="vu-readout-line">
                        
                        <span ref={dbLRef} className="text-[var(--theme-color)]">-45.0 DB</span>
                      </div>
                    </div>

                    {/* Right Channel Mechanical VU */}
                    <div className="vu-channel-box">
                      <div className="vu-title">
                        <span style={{ color: 'var(--color-faded)' }}>LINE LEVEL R</span>
                      </div>
                        
                      <div className="vu-dial-area">
                        <div className="vu-dot-grid" />
                        <div className="vu-glow-overlay" />
                        <div className="vu-scale-marks">
                          <span>-20dB</span>
                          <span>-10dB</span>
                          <span>0dB</span>
                        </div>
                        <div ref={needleRRef} className="vu-needle" />
                      </div>
                      <div className="vu-readout-line">
                        <span ref={dbRRef} className="text-[var(--theme-color)]">-45.0 DB</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="spectrum-visualizer w-full h-full p-1 relative overflow-hidden flex items-center justify-center rounded-xl border border-white/5">
                    <canvas 
                      ref={canvasRef} 
                      className="w-full h-full block"
                    />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Playback Dotted Controls */}
          <div className="music-controls" aria-label="Playback controls">
            {source === 'radio' && currentTrack?.url && (
              <button 
                onClick={() => onToggleFavoriteRadio({
                  name: trackName,
                  url: currentTrack.url,
                  favicon: currentTrack.album?.images?.[0]?.url || '',
                  country: '',
                  tags: ''
                })}
                className={`icon-button heart ${isCurrentFavorite ? 'active text-rose-500 border-rose-500' : ''}`}
                type="button" 
                aria-label="Favorite"
                title={isCurrentFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart className={`h-5 w-5 ${isCurrentFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
            )}

            {source !== 'radio' && (
              <button 
                onClick={handleToggleRepeat}
                className={`icon-button repeat ${repeatState !== 'off' ? 'active' : ''}`}
                type="button" 
                aria-label="Repeat"
                title={`Repeat: ${repeatState}`}
              >
                <Repeat className="h-5 w-5" />
              </button>
            )}
            
            {source !== 'radio' && (
              <button 
                onClick={handlePrevious}
                className="icon-button prev" 
                type="button" 
                aria-label="Previous track"
              >
                <SkipBack className="h-5 w-5 fill-current" />
              </button>
            )}
            
            <button 
              onClick={handlePlayPause}
              className={`icon-button play ${isPlaying ? 'playing' : ''}`}
              type="button" 
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current translate-x-0.5" />
              )}
            </button>

            {/* Minimalist hides the whole .controls-column sidebar (incl. its menu
                button), so give it its own reachable menu button next to play. */}
            {activeTheme === 'minimalist' && (
              <button
                onClick={onToggleMenu}
                className="icon-button menu"
                type="button"
                aria-label="System Definitions"
                title="Open System Definitions Menu"
              >
                <Sliders className="h-5 w-5" />
              </button>
            )}

            {source !== 'radio' && (
              <button 
                onClick={handleNext}
                className="icon-button next" 
                type="button" 
                aria-label="Next track"
              >
                <SkipForward className="h-5 w-5 fill-current" />
              </button>
            )}
            
            {source !== 'radio' && (
              <button 
                onClick={handleToggleShuffle}
                className={`icon-button shuffle ${shuffleState ? 'active' : ''}`}
                type="button" 
                aria-label="Shuffle"
              >
                <Shuffle className="h-5 w-5" />
              </button>
            )}

            {source === 'radio' && onToggleRadioSearch && (
              <button
                onClick={onToggleRadioSearch}
                className="icon-button search theme-text theme-border-glow"
                type="button"
                aria-label="Search Stations"
                title="Search Stations"
              >
                <Radio className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Interactive Seek Area */}
          {source !== 'radio' && (
            <div className="progress-area" aria-label="Track progress">
              <div className="relative w-full h-3.5 group">
                {/* Custom Dot Matrix Progress Bar background & fill */}
                <div className="progress-bar-dots absolute inset-0">
                  <div 
                    className="progress-fill-dots" 
                    style={{ width: `${(trackPosition / (trackDuration || 1)) * 100}%` }} 
                  />
                </div>
                {/* Transparent input slider on top */}
                <input
                  type="range"
                  min={0}
                  max={trackDuration || 0}
                  value={trackPosition || 0}
                  onChange={handleSeek}
                  onPointerUp={commitSeek}
                  onPointerCancel={commitSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              <div className="progress-times">
                <span className="time-elapsed">{formatTime(trackPosition)}</span>
                <span className="time-total">{formatTime(trackDuration)}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. System Sidebar Column */}
      <aside className="controls-column relative" aria-label="System controls">
        <button 
          onClick={onToggleMenu}
          className={`icon-button menu ${!hasToken ? 'theme-border theme-text active animate-pulse' : ''}`} 
          type="button" 
          aria-label="System Definitions"
          title="Open System Definitions Menu"
        >
          <Sliders className="h-5 w-5" />
        </button>

        {/* Universal search — searches local library, radio stations, Tidal,
            Qobuz AND Spotify (Spotify results only when a token exists), so it
            must be reachable from every source. It was originally gated on the
            Spotify source, which left radio with no visible way to find another
            station (the dotted antenna button next to play didn't read as
            "search"). */}
        {onToggleSearch && (
          <button
            onClick={onToggleSearch}
            className="icon-button search"
            type="button"
            aria-label="Search music and stations"
            title="Search Music, Stations & Streaming"
          >
            <Search className="h-5 w-5" />
          </button>
        )}
        
        {/* Volume Button & Popup */}
        <div ref={volumePopupRef} className="relative flex items-center justify-center">
          <button 
            onClick={() => setShowVolumePopup(!showVolumePopup)}
            className={`icon-button volume ${showVolumePopup ? 'active' : ''}`} 
            type="button" 
            aria-label="Toggle Volume Control"
            title="Adjust Volume"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-5 w-5 text-rose-500 animate-pulse" />
            ) : volume > 50 ? (
              <Volume2 className="h-5 w-5" />
            ) : (
              <Volume1 className="h-5 w-5" />
            )}
          </button>

          {showVolumePopup && (
            <div className="volume-popup absolute right-14 bottom-0 rounded-2xl p-4 flex items-center gap-3 z-[150] w-64 animate-volume-in"
              style={{ background: '#d6d7d2', border: '1px solid #bbbcb8', boxShadow: '0 4px 16px rgba(42,40,38,0.14)' }}>
              <button
                onClick={handleToggleMute}
                className="flex-shrink-0 cursor-pointer transition-colors"
                style={{ color: '#6a6866' }}
                type="button"
                aria-label="Toggle Mute"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" style={{ color: '#7a3535' }} />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              <input
                type="range" min="0" max="100"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="stone-range flex-grow"
                style={{
                  background: `linear-gradient(to right, var(--theme-color) 0%, var(--theme-color) ${
                    isMuted ? 0 : volume
                  }%, #c5c4c0 ${isMuted ? 0 : volume}%, #c5c4c0 100%)`
                }}
              />
              <div className="text-right shrink-0 min-w-[44px]">
                <div className="text-[10px] font-mono font-bold leading-tight" style={{ color: '#1a1918' }}>
                  {isMuted ? '−∞' : toVolumeDb(volume)}<span className="text-[8px]" style={{ color: '#9a9896' }}> dB</span>
                </div>
                <div className="text-[8px] font-mono leading-tight" style={{ color: '#9a9896' }}>{isMuted ? 'MUTE' : `${volume}%`}</div>
              </div>
            </div>
          )}
        </div>

        {/* Standby Power Button */}
        <button 
          onClick={() => onToggleStandby(true)}
          className="icon-button standby text-zinc-450 hover:text-rose-500 transition-colors" 
          type="button" 
          aria-label="Standby System"
          title="Enter Standby Mode"
        >
          <Power className="h-5 w-5" />
        </button>
      </aside>

    </article>
  );
});

export default PlayerDisplay;
