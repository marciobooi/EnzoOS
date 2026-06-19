import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, VolumeX, Home, Volume1, Sliders, Radio, Heart, Power, Search } from 'lucide-react';
import { S, cardShadow } from '../styles/stone';



// Always-rolling text ticker — classic LED display style, continuous scroll.
// Text is duplicated so the loop is seamless. Duration scales with text length
// so long titles move at the same reading pace as short ones.
function AutoScroll({ children, outerClass = '', innerClass = '', speed = 80, minDuration = 6 }) {
  const text = typeof children === 'string' ? children : '';
  // Rough pixel width estimate: let ResizeObserver refine via ref if needed.
  // 80 px/s → comfortable kiosk reading speed. Duration = text_chars × avg_px / speed.
  // We use char count × 18px as a proxy (Doto monospace is ~18px per char at base size).
  const duration = Math.max(minDuration, (text.length * 18) / speed);

  return (
    <div className={`overflow-hidden ${outerClass}`}>
      <span className={innerClass}
        style={{ display: 'inline-block', whiteSpace: 'nowrap',
                 animation: `marquee ${duration}s linear infinite` }}>
        {children}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{children}
      </span>
    </div>
  );
}

// Map 0–100 slider value to a dB string for display (matches server toDb())
function toVolumeDb(vol) {
  if (vol <= 0) return '−∞';
  return (-60 * (1 - vol / 100)).toFixed(0);
}

// Sanitise track names that come from MPD ICY/stream metadata.
// MPD can set %title% to the stream URL itself (common with HLS/AAC streams
// that have no ICY metadata), or to raw XML from Dalet-based automation.
function sanitizeTrackName(name) {
  if (!name) return name;
  // If the name IS a URL (MPD fallback for streams without ICY title), suppress it —
  // showing a raw URL as a track title is worse than showing nothing.
  if (name.startsWith('http://') || name.startsWith('https://')) return '';
  if (!name.includes('<')) return name;
  // RadioInfo XML (Portuguese/Spanish stations via Dalet automation systems)
  const song   = name.match(/<DB_SONG_NAME>([^<]+)<\/DB_SONG_NAME>/)?.[1];
  const artist = name.match(/<DB_LEAD_ARTIST_NAME>([^<]+)<\/DB_LEAD_ARTIST_NAME>/)?.[1];
  if (song) return artist ? `${song} — ${artist}` : song;
  // Generic fallback: strip all XML/HTML tags
  const stripped = name.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || name;
}

const PlayerDisplay = React.memo(function PlayerDisplay({
  theme = 'amber',
  activeTheme = 'dot-matrix',
  visualizerMode = 'vu',
  onVisualizerModeChange,
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
  handleVolumeChange,
  handleToggleMute,
  handleToggleShuffle,
  handleToggleRepeat,
  playbackState,
  onToggleMenu,
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
  const feedbackTimeout = useRef(null);
  const volumePopupRef = useRef(null);
  const dbLRef = useRef(null);
  const dbRRef = useRef(null);
  const needleLRef = useRef(null);
  const needleRRef = useRef(null);
  const canvasRef = useRef(null);

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
    const rect = canvas.getBoundingClientRect();
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

    // Dynamic color maps matching THEME_COLORS
    const colorMap = {
      amber: { base: 'rgba(217, 119, 6, 0.8)', mid: '#f59e0b', peak: '#fcd307', glow: 'rgba(245, 158, 11, 0.4)' },
      emerald: { base: 'rgba(5, 150, 105, 0.8)', mid: '#10b981', peak: '#34d399', glow: 'rgba(16, 185, 129, 0.4)' },
      cyan: { base: 'rgba(8, 145, 178, 0.8)', mid: '#06b6d4', peak: '#22d3ee', glow: 'rgba(6, 182, 212, 0.4)' },
      amethyst: { base: 'rgba(124, 58, 237, 0.8)', mid: '#a855f7', peak: '#c084fc', glow: 'rgba(168, 85, 247, 0.4)' },
      ruby: { base: 'rgba(220, 38, 38, 0.8)', mid: '#ef4444', peak: '#f87171', glow: 'rgba(239, 68, 68, 0.4)' }
    };
    const activeColor = colorMap[theme] || colorMap.amber;

    let animationId;

    const animate = (time) => {
      ctx.clearRect(0, 0, rect.width, rect.height);

      const isSimulated = !isPlaying || (Date.now() - lastEventTime > 2000);

      for (let i = 0; i < numBars; i++) {
        let target = 0.05;

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
      const barWidth = Math.floor((rect.width - (numBars - 1) * gap) / numBars);
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
              ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
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

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
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

  // Helper for step-volume buttons
  const stepVolumeUp = () => {
    const nextVol = Math.min(100, volume + 10);
    handleVolumeChange({ target: { value: nextVol } });
  };

  const stepVolumeDown = () => {
    const nextVol = Math.max(0, volume - 10);
    handleVolumeChange({ target: { value: nextVol } });
  };

  // Extract cover art
  const currentTrack = playbackState?.track_window?.current_track;
  const albumImage = currentTrack?.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&auto=format&fit=crop';
  const trackAlbumName = currentTrack?.album?.name || 'No Album Loaded';
  const isCurrentFavorite = currentTrack?.url ? favoriteStations.some(s => s.url === currentTrack.url) : false;

  const [extractedRgb, setExtractedRgb] = useState('5, 10, 20');

  useEffect(() => {
    if (activeTheme !== 'minimalist') {
      setExtractedRgb('5, 10, 20');
      document.documentElement.style.removeProperty('--extracted-rgb');
      return;
    }
    if (!albumImage) {
      setExtractedRgb('5, 10, 20');
      document.documentElement.style.setProperty('--extracted-rgb', '5, 10, 20');
      return;
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = albumImage;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 1, 1);
          const data = ctx.getImageData(0, 0, 1, 1).data;
          const r = data[0];
          const g = data[1];
          const b = data[2];
          
          // Darken the dominant color slightly (factor 0.18) to keep contrast high for white text
          const factor = 0.18;
          const dr = Math.round(r * factor);
          const dg = Math.round(g * factor);
          const db = Math.round(b * factor);
          
          const val = `${dr}, ${dg}, ${db}`;
          setExtractedRgb(val);
          document.documentElement.style.setProperty('--extracted-rgb', val);
        }
      } catch (err) {
        console.warn('Failed to extract dominant color:', err);
        setExtractedRgb('5, 10, 20');
        document.documentElement.style.setProperty('--extracted-rgb', '5, 10, 20');
      }
    };
    img.onerror = () => {
      setExtractedRgb('5, 10, 20');
      document.documentElement.style.setProperty('--extracted-rgb', '5, 10, 20');
    };

    return () => {
      document.documentElement.style.removeProperty('--extracted-rgb');
    };
  }, [albumImage, activeTheme]);

  return (
    <article 
      className={`music-player ${isPlaying ? 'is-playing' : ''}`} 
      aria-label="music-player"
      style={{ '--extracted-rgb': extractedRgb }}
    >
      
      {/* 1. Album Column */}
      <section className="album-column cursor-pointer" aria-label="Album artwork" onClick={onToggleMenu} title="Click to Open Configuration Menu">
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

           
            </div>

            {/* Title Container & Live Volume Popup */}
            <div className="title-container mt-1">
              <AutoScroll outerClass="w-[75%]" innerClass="track-title" speed={120} minDuration={8}>
                {sanitizeTrackName(trackName)}
              </AutoScroll>
              <div className={`volume-feedback ${showVolumeFeedback ? 'visible' : ''}`} aria-live="polite">
                {isMuted ? 'MUTE' : volume}
              </div>
            </div>

            {/* Metadata & Mini Visualizer */}
            <div className="metadata-row mt-1.5">
              <div className="truncate w-[60%] flex flex-col gap-0.5">
                <AutoScroll innerClass="track-artist" speed={70}>{trackArtist}</AutoScroll>
                <AutoScroll innerClass="track-album" speed={70}>{trackAlbumName}</AutoScroll>
                
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
                      <span className={`px-1 rounded-[3px] font-extrabold text-[7px] border ${codecColor}`} style={codecStyle}>
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
                  <div className="w-full h-full p-1 relative overflow-hidden flex items-center justify-center bg-black/20 rounded-xl border border-white/5">
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

        {/* Spotify Search Button */}
        {spotify && hasToken && onToggleSearch && (
          <button 
            onClick={onToggleSearch}
            className="icon-button search"
            type="button" 
            aria-label="Search Spotify"
            title="Search & Browse Spotify"
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
            <div className="volume-popup absolute right-14 bottom-0 bg-[#0d1527] border border-white/10 rounded-2xl p-4 flex items-center gap-3 shadow-2xl z-[150] w-64 animate-volume-in">
              <button
                onClick={handleToggleMute}
                className="text-zinc-400 hover:text-white transition-colors flex-shrink-0 cursor-pointer"
                type="button"
                aria-label="Toggle Mute"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5 text-rose-500" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="flex-grow h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[var(--theme-color)] transition-all focus:outline-none"
                style={{
                  background: `linear-gradient(to right, var(--theme-color) 0%, var(--theme-color) ${
                    isMuted ? 0 : volume
                  }%, rgba(255, 255, 255, 0.06) ${
                    isMuted ? 0 : volume
                  }%, rgba(255, 255, 255, 0.06) 100%)`
                }}
              />
              <div className="text-right shrink-0 min-w-[44px]">
                <div className="text-[10px] text-zinc-300 font-mono font-bold leading-tight">
                  {isMuted ? '−∞' : toVolumeDb(volume)}<span className="text-[8px] text-zinc-500"> dB</span>
                </div>
                <div className="text-[8px] text-zinc-600 font-mono leading-tight">{isMuted ? 'MUTE' : `${volume}%`}</div>
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
