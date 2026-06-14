/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sliders, RotateCcw, Flame, AudioLines, Sparkles, X, ChevronDown } from 'lucide-react';

export const EQ_PRESETS = [
  { name: 'Clinical Reference', bands: [0, 0, 0, 0, 0], saturation: 0, noiseFloor: 0, preAmp: 0.0 },
  { name: 'Warm Valve', bands: [3, 2, 0, -1, 1], saturation: 6, noiseFloor: 2, preAmp: 1.5 },
  { name: 'Bass Boost', bands: [6, 4, 1, 0, -1], saturation: 4, noiseFloor: 1, preAmp: 2.0 },
  { name: 'Vocal Clarity', bands: [-2, 1, 4, 3, 1], saturation: 2, noiseFloor: 1, preAmp: 0.5 },
  { name: 'Hi-Fi Spatial', bands: [2, 1, 0, 2, 5], saturation: 5, noiseFloor: 3, preAmp: -1.0 }
];

export default function EqualizerControl({
  currentPreset,
  onPresetChange,
  bands,
  onBandChange,
  saturation,
  onSaturationChange,
  noiseFloor,
  onNoiseFloorChange,
  preAmp,
  onPreAmpChange,
  onClose,
  dspActive,
  onDeactivateDsp
}) {
  const bandLabels = ['60 Hz', '250 Hz', '1 kHz', '4 kHz', '16 kHz'];

  const handleResetBands = () => {
    onPresetChange('Clinical Reference');
  };

  return (
    <div className="bg-[#0b0f19] border border-white/10 rounded-2xl p-5 relative overflow-hidden h-full flex flex-col justify-between text-zinc-100 font-sans shadow-2xl">
      {/* CamillaDSP Active Overlay Warning */}
      {dspActive && (
        <div className="absolute inset-0 bg-[#070a12]/95 backdrop-blur-sm z-[110] flex flex-col items-center justify-center p-6 text-center animate-fade-in font-mono">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse mb-3">
            <Sliders className="h-6 w-6" />
          </div>
          <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] mb-1">Room Correction Active</h3>
          <p className="text-[9px] text-zinc-400 max-w-sm leading-relaxed font-sans font-medium mb-4">
            Room acoustic calibration is currently active. The manual parametric equalizer is bypassed to prevent phase distortion and frequency overlap.
          </p>
          <div className="flex gap-3 w-full max-w-xs shrink-0">
            <button
              onClick={onClose}
              className="flex-grow py-2 rounded-xl bg-white/5 border border-white/10 text-white font-extrabold text-[9px] uppercase tracking-wider active:scale-95 transition-all cursor-pointer hover:bg-white/10 font-sans"
            >
              Keep DSP & Close
            </button>
            <button
              onClick={onDeactivateDsp}
              className="flex-grow py-2 rounded-xl bg-amber-500 text-black font-extrabold text-[9px] uppercase tracking-wider active:scale-95 transition-all cursor-pointer hover:bg-amber-400 font-sans"
            >
              Use Manual EQ
            </button>
          </div>
        </div>
      )}
      {/* Glossy sheen */}
      <div className="absolute inset-0 pointer-events-none opacity-30 bg-gradient-to-tr from-transparent via-white/5 to-white/10" />
      
      {/* Decorative metal screws */}
      <div className="absolute top-2.5 left-2.5 w-3 h-3 rounded-full border border-white/20 bg-zinc-800 flex items-center justify-center">
        <div className="w-1.5 h-0.5 bg-zinc-400 transform rotate-45" />
      </div>
      <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full border border-white/20 bg-zinc-800 flex items-center justify-center">
        <div className="w-1.5 h-0.5 bg-zinc-400 transform -rotate-45" />
      </div>
      <div className="absolute bottom-2.5 left-2.5 w-3 h-3 rounded-full border border-white/20 bg-zinc-800 flex items-center justify-center">
        <div className="w-1.5 h-0.5 bg-zinc-400 transform -rotate-12" />
      </div>
      <div className="absolute bottom-2.5 right-2.5 w-3 h-3 rounded-full border border-white/20 bg-zinc-800 flex items-center justify-center">
        <div className="w-1.5 h-0.5 bg-zinc-400 transform rotate-12" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[var(--theme-color)]" />
          <span className="font-sans font-extrabold text-[10px] tracking-[0.2em] text-zinc-100 uppercase">
            RESONANCE FREQUENCY SCHEMES
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleResetBands}
            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-[var(--theme-color)] cursor-pointer transition-colors font-mono"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer p-0.5"
              title="Close Equalizer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-grow overflow-hidden">
        {/* Preset Selector Panel */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-3 overflow-hidden">
          <div className="pr-1">
            <span className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider block mb-1.5">
              PRE-STAGE VALVE PRESET
            </span>
            <div className="relative w-full">
              <select
                value={currentPreset}
                onChange={(e) => onPresetChange(e.target.value)}
                className="w-full bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/10 rounded-lg px-3 py-2 font-mono text-[10px] text-zinc-100 focus:outline-none focus:border-[var(--theme-color)] cursor-pointer transition-all appearance-none pr-8"
              >
                {EQ_PRESETS.map((p) => (
                  <option key={p.name} value={p.name} className="bg-zinc-950 text-zinc-100">
                    {p.name}
                  </option>
                ))}
                {currentPreset === 'Custom' && (
                  <option value="Custom" className="bg-zinc-950 text-zinc-100">
                    Custom Settings
                  </option>
                )}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--theme-color)]">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Tube Parameters */}
          <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-3 space-y-2.5">
            <div>
              <div className="flex justify-between items-center text-[10px] mb-0.5">
                <span className="font-mono text-zinc-300 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-500" /> Saturation
                </span>
                <span className="font-mono text-amber-500">{saturation}/10</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={saturation}
                onChange={(e) => onSaturationChange(Number(e.target.value))}
                className="w-full accent-amber-500 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] mb-0.5">
                <span className="font-mono text-zinc-300 flex items-center gap-1">
                  <AudioLines className="w-3.5 h-3.5 text-cyan-400" /> Noise Floor
                </span>
                <span className="font-mono text-cyan-400">{noiseFloor}/10</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={noiseFloor}
                onChange={(e) => onNoiseFloorChange(Number(e.target.value))}
                className="w-full accent-cyan-400 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] mb-0.5">
                <span className="font-mono text-zinc-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--theme-color)]" /> Pre-Amp
                </span>
                <span className="font-mono text-[var(--theme-color)]">
                  {Number(preAmp) > 0 ? `+${Number(preAmp).toFixed(1)}` : Number(preAmp).toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min="-6"
                max="6"
                step="0.5"
                value={preAmp}
                onChange={(e) => onPreAmpChange(Number(e.target.value))}
                className="w-full accent-[var(--theme-color)] h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Sliders Vertical Equalizer */}
        <div className="lg:col-span-8 bg-zinc-950/60 border border-white/5 rounded-xl p-4 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[9px] text-zinc-400 tracking-wider">
              5-BAND PARAMETRIC VALVE EQUALIZATION
            </span>
            <div className="flex gap-1.5">
              <span className="w-1.5 h-1.5 bg-[var(--theme-color)] rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full" />
            </div>
          </div>
          
          <div className="flex justify-around items-end h-[110px] pb-1 relative">
            {/* Horizontal guide lines */}
            <div className="absolute left-0 right-0 top-0 border-t border-white/5 pointer-events-none" />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-white/[0.02] border-dashed pointer-events-none" />
            <div className="absolute left-0 right-0 bottom-0 border-t border-white/5 pointer-events-none" />

            {/* EQ Frequency Sliders */}
            {(bands || [0,0,0,0,0]).map((rawBandVal, index) => {
              const bandVal = Number(rawBandVal) || 0;
              return (
                <div key={index} className="flex flex-col items-center h-full relative z-10 w-12 justify-end">
                  {/* dB Tracker value overlay */}
                  <span className="font-mono text-[9px] text-[var(--theme-color)] font-bold mb-1">
                    {bandVal > 0 ? `+${bandVal.toFixed(0)}` : bandVal.toFixed(0)}
                  </span>
                  
                  {/* Wider interactive container for the vertical slider */}
                  <div className="relative w-10 h-[65px] flex items-center justify-center">
                    {/* Visual groove and knob (events disabled to prevent blocking clicks) */}
                    <div className="absolute left-1/2 -translate-x-1/2 w-1.5 bg-zinc-800 h-full rounded-full pointer-events-none">
                      {/* Styled slider track */}
                      <div 
                        className="absolute bottom-0 w-full rounded-full bg-gradient-to-t from-[var(--theme-color)]/70 to-[var(--theme-color)]" 
                        style={{ height: `${((bandVal + 12) / 24) * 100}%` }}
                      />
                      {/* Styled slider knob */}
                      <div 
                        className="absolute left-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[var(--theme-color)] shadow-[0_0_6px_var(--theme-color-glow)]"
                        style={{ 
                          bottom: `${((bandVal + 12) / 24) * 100}%`,
                          transform: 'translate(-50%, 50%)'
                        }}
                      />
                    </div>

                    {/* Hidden input overlaying the entire wide container */}
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={bandVal}
                      orient="vertical" /* Backwards compatibility */
                      style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
                      onChange={(e) => onBandChange(index, Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-row-resize z-20"
                    />
                  </div>
                  
                  {/* Freq Label */}
                  <span className="font-mono text-[8px] text-zinc-400 tracking-wider mt-1.5 uppercase select-none">
                    {bandLabels[index]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="font-mono text-[8px] text-center text-zinc-500 mt-2 leading-tight">
            Peaking Bi-quadratic filter units. Harmonic alignment is calculated at 44.1kHz standard routing depth.
          </p>
        </div>
      </div>
    </div>
  );
}
