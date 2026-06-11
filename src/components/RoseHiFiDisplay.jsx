import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, VolumeX, Home, Volume1, Sliders } from 'lucide-react';

export default function RoseHiFiDisplay({
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
  hasToken
}) {
  const [showVolumeFeedback, setShowVolumeFeedback] = useState(false);
  const feedbackTimeout = useRef(null);

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

  return (
    <article className="music-player" aria-label="Music player">
      
      {/* 1. Album Column */}
      <section className="album-column" aria-label="Album artwork">
        <div className="album-art" aria-label="Dot matrix album art">
          <img src={albumImage} alt="Album art" />
        </div>
      </section>

      {/* 2. Details and Controls Column */}
      <section className="details-column" aria-label="Track details and playback controls">
        
        {/* Topline Readout & Audio Router */}
        <div className="track-details">
          <div className="hifi-topline">
            <button 
              onClick={onTransferPlayback}
              className={`status-pill cursor-pointer transition-colors ${
                isLocalDeviceActive 
                  ? 'text-emerald-400 hover:text-emerald-300' 
                  : 'text-[#ff8e00] hover:text-[#ffa733] animate-pulse'
              }`}
              title={isLocalDeviceActive ? 'Spotify Connect Active' : 'Click to Route Audio to Resonance'}
            >
              <span className={`status-dot ${isLocalDeviceActive ? 'bg-emerald-400' : 'bg-[#ff8e00]'}`}></span>
              {isLocalDeviceActive ? 'SPOTIFY CONNECT // ACTIVE' : 'ROUTE TO RESONANCE'}
            </button>
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
            <div className="truncate w-[75%]">
              <div className="track-artist truncate">{trackArtist}</div>
              <div className="track-album truncate">{trackAlbumName}</div>
            </div>

            {/* Dot Matrix Animated Visualizer */}
            <div className="hifi-visualizer shrink-0" aria-hidden="true">
              {[...Array(8)].map((_, i) => (
                <span 
                  key={i} 
                  style={{ 
                    animationPlayState: isPlaying ? 'running' : 'paused',
                    height: isPlaying ? undefined : '3px'
                  }} 
                  />
              ))}
            </div>
          </div>
        </div>

        {/* Playback Dotted Controls */}
        <div className="music-controls" aria-label="Playback controls">
          <button 
            onClick={handleToggleRepeat}
            className={`icon-button repeat ${repeatState !== 'off' ? 'active' : ''}`}
            type="button" 
            aria-label="Repeat"
            title={`Repeat: ${repeatState}`}
          >
            <Repeat className="h-5 w-5" />
          </button>
          
          <button 
            onClick={handlePrevious}
            className="icon-button prev" 
            type="button" 
            aria-label="Previous track"
          >
            <SkipBack className="h-5 w-5 fill-current" />
          </button>
          
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
          
          <button 
            onClick={handleNext}
            className="icon-button next" 
            type="button" 
            aria-label="Next track"
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </button>
          
          <button 
            onClick={handleToggleShuffle}
            className={`icon-button shuffle ${shuffleState ? 'active' : ''}`}
            type="button" 
            aria-label="Shuffle"
          >
            <Shuffle className="h-5 w-5" />
          </button>
        </div>

        {/* Interactive Seek Area */}
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

      </section>

      {/* 3. System Sidebar Column */}
      <aside className="controls-column" aria-label="System controls">
        <button 
          onClick={onToggleMenu}
          className={`icon-button menu ${!hasToken ? 'border-[#ff8e00] text-[#ff8e00] active animate-pulse' : ''}`} 
          type="button" 
          aria-label="System Definitions"
          title="Open System Definitions Menu"
        >
          <Sliders className="h-5 w-5" />
        </button>
        
        <button 
          onClick={stepVolumeUp}
          className="icon-button volume-up" 
          type="button" 
          aria-label="Volume up"
        >
          <Volume2 className="h-5 w-5" />
        </button>
        
        <button 
          onClick={stepVolumeDown}
          className="icon-button volume-down" 
          type="button" 
          aria-label="Volume down"
        >
          <Volume1 className="h-5 w-5" />
        </button>
        
        <button 
          onClick={handleToggleMute}
          className={`icon-button volume-mute ${isMuted ? 'active' : ''}`} 
          type="button" 
          aria-label="Mute volume"
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5 text-rose-500" />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
        </button>
      </aside>

    </article>
  );
}
