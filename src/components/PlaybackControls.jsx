import React from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat } from 'lucide-react';

export default function PlaybackControls({
  isPlaying,
  isLocalDeviceActive,
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
  handleToggleRepeat
}) {
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
      
      {/* Playback Keys Bezel */}
      <div className="flex items-center justify-center gap-3.5 py-3 px-4 rounded-xl bg-slate-950 border border-slate-900 shadow-inner">
        
        {/* Shuffle Button */}
        <button 
          onClick={handleToggleShuffle}
          className={`p-2.5 rounded-full bg-gradient-to-b from-[#252a36] to-[#12151d] border active:translate-y-0.5 active:shadow-inner shadow-md flex items-center justify-center cursor-pointer transition-all ${
            shuffleState 
              ? 'border-amber-500/50 text-amber-500 shadow-[0_0_8px_rgba(255,142,0,0.2)]' 
              : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
          }`}
          title={`SHUFFLE: ${shuffleState ? 'ACTIVE' : 'OFF'}`}
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>

        {/* Skip Back */}
        <button 
          onClick={handlePrevious}
          className="p-3.5 rounded-full bg-gradient-to-b from-[#252a36] to-[#12151d] border border-slate-800 text-slate-400 hover:text-white transition-all active:translate-y-0.5 active:shadow-inner hover:border-slate-700 shadow-md flex items-center justify-center cursor-pointer"
          title="PREV TRACK"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        {/* Play / Pause */}
        <button 
          onClick={handlePlayPause}
          className={`p-5 rounded-full border transition-all active:translate-y-0.5 active:shadow-inner flex items-center justify-center cursor-pointer shadow-lg ${
            isPlaying 
              ? 'bg-gradient-to-b from-emerald-600 to-emerald-800 border-emerald-500 text-white shadow-emerald-500/10' 
              : 'bg-gradient-to-b from-amber-600 to-amber-800 border-amber-500 text-white shadow-amber-500/10'
          }`}
          title={isPlaying ? 'PAUSE RECEIVER' : 'PLAY RECEIVER'}
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
          className="p-3.5 rounded-full bg-gradient-to-b from-[#252a36] to-[#12151d] border border-slate-800 text-slate-400 hover:text-white transition-all active:translate-y-0.5 active:shadow-inner hover:border-slate-700 shadow-md flex items-center justify-center cursor-pointer"
          title="NEXT TRACK"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Repeat Button */}
        <button 
          onClick={handleToggleRepeat}
          className={`p-2.5 rounded-full bg-gradient-to-b from-[#252a36] to-[#12151d] border active:translate-y-0.5 active:shadow-inner shadow-md flex items-center justify-center cursor-pointer transition-all relative ${
            repeatState !== 'off'
              ? 'border-amber-500/50 text-amber-500 shadow-[0_0_8px_rgba(255,142,0,0.2)]' 
              : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
          }`}
          title={`REPEAT: ${repeatState.toUpperCase()}`}
        >
          <Repeat className="h-3.5 w-3.5" />
          {repeatState === 'track' && (
            <span className="absolute -top-1 -right-1 bg-amber-500 text-[8px] text-black font-extrabold px-1 rounded-full scale-75">1</span>
          )}
        </button>

      </div>

      {/* Potentiometer sliders / parameters */}
      <div className="flex flex-col gap-3 py-3 px-5 rounded-xl bg-slate-950 border border-slate-900 shadow-inner text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">
        
        {/* Track Position Slider */}
        <div className="flex items-center gap-3">
          <span className="w-8">SEEK</span>
          <input 
            type="range" 
            min={0}
            max={trackDuration}
            value={trackPosition}
            onChange={handleSeek}
            className="flex-grow h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none hover:bg-slate-850"
          />
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handleToggleMute}
            className="w-8 text-left hover:text-white transition-colors cursor-pointer"
          >
            {isMuted ? 'MUTE' : 'VOL'}
          </button>
          <input 
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="flex-grow h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none hover:bg-slate-850"
          />
        </div>

      </div>

    </div>
  );
}
