import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, VolumeX, Home, Volume1, Sliders, Radio, Heart, Power } from 'lucide-react';

export default function PlayerDisplay({
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
  radioSearch,
  setRadioSearch,
  stationsList,
  isSearching,
  handleRadioSearch,
  onPlayRadio,
  favoriteStations = [],
  onToggleFavoriteRadio,
  onToggleStandby
}) {
  const [showVolumeFeedback, setShowVolumeFeedback] = useState(false);
  const [showSearch, setShowSearch] = useState(true);
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

  useEffect(() => {
    if (source === 'radio') {
      setShowSearch(true);
    }
  }, [source]);

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

  return (
    <article className={`music-player ${isPlaying ? 'is-playing' : ''}`} aria-label="music-player">
      
      {/* 1. Album Column */}
      <section className="album-column" aria-label="Album artwork">
        <div className="album-art" aria-label="Dot matrix album art">
          <img src={albumImage} alt="Album art" />
        </div>
      </section>

      {/* 2. Details and Controls Column */}
      {/* 2. Details and Controls Column */}
      {source === 'radio' && showSearch ? (
        <section className="details-column" aria-label="Web Radio controls">
          <div className="track-details h-full flex flex-col justify-between" style={{ minHeight: '230px' }}>
            <div className="hifi-topline">
              <button 
                onClick={onToggleSource}
                className="status-pill cursor-pointer transition-colors border text-amber-500 border-amber-500/20 bg-amber-500/5 font-sans"
              >
                <span className="status-dot bg-amber-500"></span>
                PLUGIN: WEB RADIO
              </button>
              <button
                onClick={() => setShowSearch(false)}
                className="status-pill cursor-pointer transition-all border border-zinc-650 hover:bg-white/5 px-2 py-0.5 rounded text-zinc-400 font-sans"
              >
                [CLOSE X]
              </button>
            </div>

            {/* Search Input Area */}
            <div className="flex gap-2 items-center mt-1 shrink-0">
              <Radio className="h-4 w-4 text-[var(--theme-color)] animate-pulse" />
              <input
                type="text"
                placeholder="Search Global Stations (Lofi, BBC, Jazz)..."
                value={radioSearch}
                onChange={(e) => setRadioSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRadioSearch();
                }}
                className="radio-search-input flex-grow bg-black/40 border border-white/10 rounded-xl px-4 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-650 focus:outline-none focus:border-[var(--theme-color)]"
              />
              <button
                onClick={handleRadioSearch}
                disabled={isSearching}
                className="radio-search-btn px-4 py-2 bg-[var(--theme-color)] text-black font-extrabold text-[10px] uppercase tracking-wider rounded-xl hover:opacity-85 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSearching ? '...' : 'SEARCH'}
              </button>
            </div>

            {/* List label: "FAVORITES" or "SEARCH RESULTS" */}
            <div className="flex justify-between items-center mt-2 px-1 text-[9px] uppercase tracking-wider font-extrabold text-zinc-500">
              <span>{radioSearch.trim() ? 'Search Results' : 'Favorite Stations'}</span>
              <span>({stationsList.length})</span>
            </div>

            {/* Scrollable list of stations */}
            <div className="flex-grow overflow-y-auto pr-1.5 mt-1 custom-scrollbar grid grid-cols-2 gap-2 max-h-[145px]">
              {stationsList.map((station, idx) => {
                const isFavorite = favoriteStations.some(s => s.url === station.url);
                return (
                  <div
                    key={`${station.url}-${idx}`}
                    className="radio-station-card p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-[var(--theme-color)] text-left flex items-center justify-between transition-all group"
                  >
                    <button
                      onClick={() => {
                        onPlayRadio(station.url, station.name, station.favicon);
                        setShowSearch(false);
                      }}
                      className="flex items-center gap-2 min-w-0 flex-grow text-left cursor-pointer bg-transparent border-0 p-0 outline-none"
                    >
                      <div className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center border border-white/10 shrink-0 overflow-hidden relative">
                        {station.favicon ? (
                          <img 
                            src={station.favicon} 
                            alt="" 
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : null}
                        <Radio className="w-3.5 h-3.5 text-zinc-400 absolute" style={{ zIndex: -1 }} />
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-[10px] font-bold text-white truncate group-hover:text-[var(--theme-color)]">{station.name}</span>
                        <span className="text-[8px] font-mono text-zinc-400 tracking-wider uppercase truncate">
                          {station.country ? station.country : 'Global'}{station.tags ? ` • ${station.tags.split(',')[0]}` : ''}
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        onClick={() => onToggleFavoriteRadio(station)}
                        className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'text-rose-500 fill-rose-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => {
                          onPlayRadio(station.url, station.name, station.favicon);
                          setShowSearch(false);
                        }}
                        className="radio-play-btn text-[8px] bg-white/5 border border-white/10 group-hover:border-[var(--theme-color)] group-hover:text-black group-hover:bg-[var(--theme-color)] px-2 py-0.5 rounded font-extrabold text-zinc-350 uppercase tracking-wider shrink-0 transition-colors cursor-pointer"
                      >
                        PLAY
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <section className="details-column" aria-label="Track details and playback controls">
          
          {/* Topline Readout & Audio Router */}
          <div className="track-details">
            <div className="hifi-topline">
              <button 
                onClick={onToggleSource}
                className={`status-pill cursor-pointer transition-colors border ${
                  source === 'spotify' 
                    ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' 
                    : 'text-amber-500 border-amber-500/20 bg-amber-500/5'
                }`}
                title="Click to Switch Plugin Source"
              >
                <span className={`status-dot ${source === 'spotify' ? 'bg-emerald-400' : 'bg-amber-500'}`}></span>
                PLUGIN: {source?.toUpperCase() || ''}
              </button>
              <span className="system-readout">DOT MATRIX / 2026</span>
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
              <span className="system-readout">DOT MATRIX / 2026</span>
            </div>

            {/* Title Container & Live Volume Popup */}
            <div className="title-container mt-1">
              <h1 className="track-title truncate w-[75%]" title={trackName}>
                {trackName}
              </h1>
              <div className={`volume-feedback ${showVolumeFeedback ? 'visible' : ''}`} aria-live="polite">
                {isMuted ? 'MUTE' : volume}
              </div>
            </div>

            {/* Metadata & Mini Visualizer */}
            <div className="metadata-row mt-1.5">
              <div className="truncate w-[60%] flex flex-col gap-0.5">
                <div className="track-artist truncate">{trackArtist}</div>
                <div className="track-album truncate">{trackAlbumName}</div>
                
                {/* Audiophile HUD Telemetry & Signal Path */}
                <div className="flex items-center gap-1.5 mt-1 text-[8px] font-mono text-zinc-400 tracking-wider">
                  <span className={`px-1 py-0.25 rounded-[3px] font-extrabold text-[7px] ${
                    !playbackState || trackName === 'SYSTEM IDLE' || trackName === 'Ready to Stream'
                      ? 'bg-zinc-800/40 text-zinc-500 border border-zinc-700/30'
                      : source === 'spotify' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                      source === 'radio' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                      'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  }`}>
                    {!playbackState || trackName === 'SYSTEM IDLE' || trackName === 'Ready to Stream'
                      ? 'OFFLINE'
                      : source === 'spotify' ? 'OGG VORBIS' : source === 'radio' ? 'AAC STREAM' : 'FLAC LOSSLESS'}
                  </span>
                  <span>
                    {!playbackState || trackName === 'SYSTEM IDLE' || trackName === 'Ready to Stream'
                      ? '-- / -- • -- kbps'
                      : source === 'spotify' ? '16-bit / 44.1kHz • 320kbps' : 
                      source === 'radio' ? '16-bit / 48.0kHz • 192kbps' : 
                      '24-bit / 96.0kHz • 2822kbps'}
                  </span>
                  <span className="opacity-45">|</span>
                  <span className="text-[7.5px] opacity-75 truncate max-w-[120px] lg:max-w-none" title={
                    !playbackState || trackName === 'SYSTEM IDLE' || trackName === 'Ready to Stream'
                      ? 'DSP Pipeline Suspended'
                      : source === 'spotify' ? 'Spotify → Resampler 96kHz → CamillaDSP → DAC' : 
                      source === 'radio' ? 'Stream → Resampler 96kHz → CamillaDSP → DAC' : 
                      'Local → Direct Audio → CamillaDSP → DAC'
                  }>
                    {!playbackState || trackName === 'SYSTEM IDLE' || trackName === 'Ready to Stream'
                      ? 'DSP Pipeline Suspended'
                      : source === 'spotify' ? 'Spotify → Resampler 96kHz → CamillaDSP → DAC' : 
                      source === 'radio' ? 'Stream → Resampler 96kHz → CamillaDSP → DAC' : 
                      'Local → Direct Audio → CamillaDSP → DAC'}
                  </span>
                </div>
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
                        <span className="text-zinc-400">LINE LEVEL L</span>
                        <span ref={dbLRef} className="text-[var(--theme-color)]">-45.0 DB</span>
                      </div>
                    </div>

                    {/* Right Channel Mechanical VU */}
                    <div className="vu-channel-box">
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
                        <span className="text-zinc-400">LINE LEVEL R</span>
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

            {source === 'radio' && (
              <button 
                onClick={() => setShowSearch(true)}
                className="icon-button search text-amber-500 border-amber-500/50"
                type="button" 
                aria-label="Search"
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
            <div className="volume-popup absolute right-14 bottom-0 bg-[#0d1527] border border-white/10 rounded-2xl p-4 flex items-center gap-3 shadow-2xl z-[150] w-64 animate-fade-in">
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
              <span className="text-[10px] text-zinc-450 font-mono font-bold w-8 text-right shrink-0">
                {isMuted ? 0 : volume}%
              </span>
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
}
