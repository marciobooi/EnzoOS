import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, VolumeX, Search } from 'lucide-react';

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
  onToggleSearch
}) {
  const canvasRef = useRef(null);
  const [vuTheme, setVuTheme] = useState('amber'); // 'amber' | 'blue' | 'silver'
  
  // Refs for smooth needle animation physics
  const isPlayingRef = useRef(isPlaying);
  const currentL = useRef(0);
  const currentR = useRef(0);
  const velocityL = useRef(0);
  const velocityR = useRef(0);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Formatter for seek timer (mm:ss)
  const formatTime = (ms) => {
    if (!ms || isNaN(ms)) return '00:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Canvas Drawing Loop for VU Meters
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const draw = () => {
      // 1. Generate target needle levels (0.0 to 1.0)
      let targetL = 0;
      let targetR = 0;

      if (isPlayingRef.current) {
        const time = Date.now() * 0.006;
        // Build organic bouncing needles using overlapping sines and noise
        targetL = 0.35 + 0.3 * Math.sin(time) + 0.2 * Math.sin(time * 2.7) + 0.15 * Math.random();
        targetR = 0.35 + 0.3 * Math.sin(time + 1.2) + 0.2 * Math.sin(time * 2.3) + 0.15 * Math.random();
        
        // Add random spikes to simulate beats
        if (Math.random() > 0.95) {
          targetL = 0.85 + Math.random() * 0.15;
        }
        if (Math.random() > 0.95) {
          targetR = 0.85 + Math.random() * 0.15;
        }
      }

      // Clamp targets to [0, 1]
      targetL = Math.max(0.02, Math.min(1.0, targetL));
      targetR = Math.max(0.02, Math.min(1.0, targetR));

      // 2. Apply Spring Inertia Physics
      const spring = 0.18;
      const friction = 0.72;

      const forceL = (targetL - currentL.current) * spring;
      velocityL.current = (velocityL.current + forceL) * friction;
      currentL.current += velocityL.current;

      const forceR = (targetR - currentR.current) * spring;
      velocityR.current = (velocityR.current + forceR) * friction;
      currentR.current += velocityR.current;

      // 3. Clear Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 4. Configure Theme Colors
      let colors = {
        bgStart: '#0d0d0d',
        bgEnd: '#050505',
        bezel: '#222',
        dialLine: '#ff8e00',
        text: '#ff8e00',
        needle: '#e27b00',
        glow: 'rgba(255, 142, 0, 0.2)',
        lightVal: '#ff8e00'
      };

      if (vuTheme === 'blue') {
        colors = {
          bgStart: '#020d1a',
          bgEnd: '#00050d',
          bezel: '#011c38',
          dialLine: '#00d2ff',
          text: '#00d2ff',
          needle: '#ff3b30',
          glow: 'rgba(0, 210, 255, 0.25)',
          lightVal: '#00d2ff'
        };
      } else if (vuTheme === 'silver') {
        colors = {
          bgStart: '#1b1d22',
          bgEnd: '#101114',
          bezel: '#3a3f47',
          dialLine: '#e2e7ef',
          text: '#b1b6bf',
          needle: '#ff2d55',
          glow: 'rgba(255, 255, 255, 0.05)',
          lightVal: '#ffffff'
        };
      }

      // Draw Screen Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, colors.bgStart);
      bgGrad.addColorStop(1, colors.bgEnd);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw subtle horizontal scanlines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      for (let i = 0; i < canvas.height; i += 3) {
        ctx.fillRect(0, i, canvas.width, 1);
      }

      // Dial Configurations
      const dialRadius = 65;
      const leftCenter = { x: 105, y: 125 };
      const rightCenter = { x: 275, y: 125 };
      
      const startAngle = -135 * Math.PI / 180;
      const endAngle = -45 * Math.PI / 180;

      const drawDial = (center, val, channelLabel) => {
        // Draw Main Arc
        ctx.strokeStyle = colors.dialLine;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(center.x, center.y, dialRadius, startAngle, endAngle);
        ctx.stroke();

        // Draw Ticks & dB markings
        const dbMarks = [-20, -10, -7, -5, -3, -1, 0, 1, 2, 3];
        dbMarks.forEach((db) => {
          // Map dB to linear percentage
          // -20dB = 0%, 0dB = 75%, +3dB = 100%
          let pct = 0;
          if (db <= 0) {
            // -20 to 0 maps to 0 to 0.75
            pct = 0.75 * (db + 20) / 20;
          } else {
            // 0 to +3 maps to 0.75 to 1.0
            pct = 0.75 + 0.25 * db / 3;
          }

          const angle = startAngle + pct * (endAngle - startAngle);
          
          // Draw tick lines
          const isMajor = db === 0 || db === -20 || db === 3;
          const tickLen = isMajor ? 8 : 4;
          
          ctx.strokeStyle = db >= 0 ? '#ff3b30' : colors.dialLine;
          ctx.lineWidth = isMajor ? 2 : 1;
          ctx.beginPath();
          ctx.moveTo(
            center.x + (dialRadius - tickLen) * Math.cos(angle),
            center.y + (dialRadius - tickLen) * Math.sin(angle)
          );
          ctx.lineTo(
            center.x + dialRadius * Math.cos(angle),
            center.y + dialRadius * Math.sin(angle)
          );
          ctx.stroke();

          // Draw Text labels for major ticks
          if (isMajor || db === -7 || db === -3) {
            ctx.fillStyle = db >= 0 ? '#ff3b30' : colors.text;
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const textRadius = dialRadius - 15;
            ctx.fillText(
              db.toString(),
              center.x + textRadius * Math.cos(angle),
              center.y + textRadius * Math.sin(angle)
            );
          }
        });

        // Draw Red Warning Zone Arc
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(center.x, center.y, dialRadius, startAngle + 0.75 * (endAngle - startAngle), endAngle);
        ctx.stroke();

        // Draw Dial Center Hub
        ctx.fillStyle = colors.bezel;
        ctx.strokeStyle = colors.dialLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 8, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Draw Bouncing Needle
        // Map current channel value (0 to 1) to angle
        const needleAngle = startAngle + val * (endAngle - startAngle);
        ctx.strokeStyle = colors.needle;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(center.x + 3 * Math.cos(needleAngle + Math.PI/2), center.y + 3 * Math.sin(needleAngle + Math.PI/2));
        ctx.lineTo(
          center.x + (dialRadius + 2) * Math.cos(needleAngle),
          center.y + (dialRadius + 2) * Math.sin(needleAngle)
        );
        ctx.stroke();

        // Hub Cover dot
        ctx.fillStyle = colors.needle;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 3, 0, 2 * Math.PI);
        ctx.fill();

        // Subtext Label (L/R Channels)
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText(channelLabel, center.x, center.y - 20);
      };

      // Draw Left Dial
      drawDial(leftCenter, currentL.current, 'L CHANNEL');
      // Draw Right Dial
      drawDial(rightCenter, currentR.current, 'R CHANNEL');

      // Title header
      ctx.fillStyle = colors.text;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ANALOG LEVEL METERS', canvas.width / 2, 22);

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [vuTheme]);

  // Extract cover art
  const currentTrack = playbackState?.track_window?.current_track;
  const albumImage = currentTrack?.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&auto=format&fit=crop';

  return (
    <div className="w-full h-full flex items-center justify-between">
      
      {/* Subtle Screen Glare */}
      <div className="absolute top-0 left-0 w-full h-[30%] bg-gradient-to-b from-white/3 to-transparent pointer-events-none z-10" />

      {/* LEFT COMPONENT: Album Cover & Meta (Width: ~420px) */}
      <div className="w-[400px] flex items-center gap-5 border-r border-zinc-900/60 pr-5 h-full relative z-20">
        {/* Search Trigger Button */}
        <button 
          onClick={onToggleSearch}
          className="absolute top-0 right-4 p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-850 hover:border-[#ff8e00]/40 text-zinc-400 hover:text-[#ff8e00] transition-all cursor-pointer z-30 active:scale-95 shadow-sm"
          title="Open Music Search"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <div className="relative group shrink-0">
          <img 
            src={albumImage} 
            alt="Cover Art" 
            className={`w-40 h-40 object-cover rounded-lg shadow-[0_8px_20px_rgba(0,0,0,0.6)] border border-zinc-800 transition-transform duration-700 ${isPlaying ? 'scale-[1.02]' : ''}`}
          />
          {isPlaying && (
            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-black animate-pulse" />
          )}
        </div>

        <div className="flex flex-col justify-center min-w-0 flex-grow">
          <span className="text-[9px] uppercase font-bold tracking-[0.25em] text-[#ff8e00] mb-1.5 font-mono select-none">
            {isLocalDeviceActive ? 'SPOTIFY CONNECT // ACTIVE' : 'REMOTE RECEIVER'}
          </span>

          {/* Marquee title if length is long */}
          <div className="overflow-hidden relative w-full mb-1">
            <h2 className="text-xl font-bold tracking-tight text-white whitespace-nowrap overflow-hidden text-ellipsis select-text">
              {trackName}
            </h2>
          </div>
          
          <p className="text-sm text-zinc-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis mb-3 select-text">
            {trackArtist}
          </p>

          {/* Audiophile Status Badges */}
          <div className="flex items-center gap-2 mt-1 select-none">
            <span className="px-2 py-0.5 rounded text-[8px] font-extrabold tracking-wider bg-zinc-900 border border-zinc-800 text-zinc-500">
              PCM 44.1kHz
            </span>
            <span className="px-2 py-0.5 rounded text-[8px] font-extrabold tracking-wider bg-[#ff8e00]/10 border border-[#ff8e00]/25 text-[#ff8e00]">
              HI-RES AUDIO
            </span>
          </div>
        </div>
      </div>

      {/* CENTER COMPONENT: Controls & Playback Slider (Width: ~500px) */}
      <div className="flex-grow flex flex-col justify-between items-center px-8 h-full border-r border-zinc-900/60 relative z-20">
        
        {/* Top Row: Timers */}
        <div className="w-full flex items-center justify-between text-[11px] font-semibold text-zinc-500 font-mono tracking-wider pt-2 select-none">
          <span>{formatTime(trackPosition)}</span>
          <span className="text-zinc-600">/</span>
          <span>{formatTime(trackDuration)}</span>
        </div>

        {/* Middle Row: Progress Slider */}
        <div className="w-full px-1 py-2">
          <input 
            type="range"
            min={0}
            max={trackDuration}
            value={trackPosition}
            onChange={handleSeek}
            className="w-full h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-[#ff8e00] focus:outline-none hover:bg-zinc-850"
          />
        </div>

        {/* Playback Button Bezel */}
        <div className="flex items-center justify-center gap-6 py-2">
          {/* Shuffle Button */}
          <button 
            onClick={handleToggleShuffle}
            className={`p-2.5 rounded-xl border active:scale-95 flex items-center justify-center cursor-pointer transition-all ${
              shuffleState 
                ? 'border-[#ff8e00]/40 text-[#ff8e00] bg-[#ff8e00]/5 shadow-[0_0_12px_rgba(255,142,0,0.15)]' 
                : 'border-zinc-900 text-zinc-500 hover:text-zinc-350 hover:border-zinc-800'
            }`}
            title="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </button>

          {/* Skip Back */}
          <button 
            onClick={handlePrevious}
            className="p-2.5 rounded-xl border border-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-800 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            title="Prev Track"
          >
            <SkipBack className="h-4 w-4 fill-current" />
          </button>

          {/* Play / Pause */}
          <button 
            onClick={handlePlayPause}
            className={`p-4 rounded-full border transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-md ${
              isPlaying 
                ? 'bg-gradient-to-b from-[#ff8e00] to-[#d87800] border-[#ff8e00] text-black shadow-[#ff8e00]/10' 
                : 'bg-zinc-900 border-zinc-800 text-white hover:border-zinc-700'
            }`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="h-5 w-5 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Skip Forward */}
          <button 
            onClick={handleNext}
            className="p-2.5 rounded-xl border border-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-800 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            title="Next Track"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>

          {/* Repeat Button */}
          <button 
            onClick={handleToggleRepeat}
            className={`p-2.5 rounded-xl border active:scale-95 flex items-center justify-center cursor-pointer transition-all relative ${
              repeatState !== 'off'
                ? 'border-[#ff8e00]/40 text-[#ff8e00] bg-[#ff8e00]/5 shadow-[0_0_12px_rgba(255,142,0,0.15)]' 
                : 'border-zinc-900 text-zinc-500 hover:text-zinc-350 hover:border-zinc-800'
            }`}
            title={`Repeat: ${repeatState}`}
          >
            <Repeat className="h-4 w-4" />
            {repeatState === 'track' && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#ff8e00] text-[7px] text-black font-extrabold px-1 rounded-full scale-[0.8]">1</span>
            )}
          </button>
        </div>

        {/* Volume Control bar */}
        <div className="w-full flex items-center gap-3 text-zinc-500 text-[10px] font-mono pb-2 select-none">
          <button 
            onClick={handleToggleMute}
            className="hover:text-white transition-colors cursor-pointer shrink-0"
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5 text-rose-500" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <input 
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="flex-grow h-0.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-[#ff8e00] focus:outline-none hover:bg-zinc-850"
          />
          <span className="w-6 text-right font-bold">{isMuted ? '0%' : `${volume}%`}</span>
        </div>

      </div>

      {/* RIGHT COMPONENT: Twin Needle VU Meter (Width: ~380px) */}
      <div className="w-[380px] h-full flex flex-col justify-between items-center pl-5 relative z-20">
        
        {/* VU Canvas */}
        <div className="relative w-full h-[145px] rounded-lg overflow-hidden border border-zinc-900/40">
          <canvas 
            ref={canvasRef} 
            width={380} 
            height={145} 
            className="w-full h-full"
          />
        </div>

        {/* Theme selection overlay controls */}
        <div className="flex items-center gap-2 pb-2 select-none">
          <span className="text-[8px] font-bold text-zinc-600 tracking-wider font-mono">METER LIGHT:</span>
          {['amber', 'blue', 'silver'].map((t) => (
            <button
              key={t}
              onClick={() => setVuTheme(t)}
              className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all border cursor-pointer ${
                vuTheme === t
                  ? 'bg-zinc-800 text-white border-zinc-600 shadow-sm'
                  : 'bg-zinc-950 text-zinc-500 border-zinc-900 hover:text-zinc-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

      </div>

    </div>
  );
}
