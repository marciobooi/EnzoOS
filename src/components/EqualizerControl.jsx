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
  onDeactivateDsp,
  light = false
}) {
  const bandLabels = ['60 Hz', '250 Hz', '1 kHz', '4 kHz', '16 kHz'];

  const handleResetBands = () => {
    onPresetChange('Clinical Reference');
  };

  const t = light ? {
    root:            'bg-white border border-zinc-100 text-zinc-800',
    overlay:         'bg-white/97 backdrop-blur-sm',
    overlayTitle:    'text-zinc-900',
    overlayText:     'text-zinc-500',
    overlayBtnClose: 'bg-zinc-50 border border-zinc-200 text-zinc-700 hover:bg-zinc-100',
    header:          'border-b border-zinc-100',
    headerTitle:     'text-zinc-800',
    headerBtn:       'text-zinc-400 hover:text-[var(--theme-color)]',
    closeBtn:        'text-zinc-400 hover:text-zinc-700',
    label:           'text-zinc-500',
    screw:           'border border-zinc-200 bg-zinc-100',
    screwPin:        'bg-zinc-400',
    presetSelect:    'bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800',
    presetOption:    'bg-white text-zinc-800',
    tubePanel:       'bg-zinc-50 border border-zinc-100',
    tubeLabel:       'text-zinc-600',
    sliderTrack:     'bg-zinc-200',
    sliderPanel:     'bg-zinc-50 border border-zinc-100',
    sliderLabel:     'text-zinc-500',
    sliderDot2:      'bg-zinc-300',
    guideLine:       'border-zinc-200/60',
    guideLineDash:   'border-zinc-200/40',
    footerText:      'text-zinc-400',
  } : {
    root:            'bg-[#0b0f19] border border-white/10 text-zinc-100',
    overlay:         'bg-[#070a12]/95 backdrop-blur-sm',
    overlayTitle:    'text-white',
    overlayText:     'text-zinc-400',
    overlayBtnClose: 'bg-white/5 border border-white/10 text-white hover:bg-white/10',
    header:          'border-b border-white/10',
    headerTitle:     'text-zinc-100',
    headerBtn:       'text-zinc-400 hover:text-[var(--theme-color)]',
    closeBtn:        'text-zinc-400 hover:text-white',
    label:           'text-zinc-400',
    screw:           'border border-white/20 bg-zinc-800',
    screwPin:        'bg-zinc-400',
    presetSelect:    'bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/10 text-zinc-100',
    presetOption:    'bg-zinc-950 text-zinc-100',
    tubePanel:       'bg-zinc-950/60 border border-white/5',
    tubeLabel:       'text-zinc-300',
    sliderTrack:     'bg-zinc-800',
    sliderPanel:     'bg-zinc-950/60 border border-white/5',
    sliderLabel:     'text-zinc-400',
    sliderDot2:      'bg-zinc-700',
    guideLine:       'border-white/5',
    guideLineDash:   'border-white/[0.02]',
    footerText:      'text-zinc-500',
  };

  return (
    <div className={`${t.root} rounded-2xl p-5 relative overflow-hidden h-full flex flex-col justify-between font-sans shadow-2xl`}>
      {/* CamillaDSP Active Overlay Warning */}
      {dspActive && (
        <div className={`absolute inset-0 ${t.overlay} z-[110] flex flex-col items-center justify-center p-6 text-center animate-fade-in font-mono`}>
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse mb-3">
            <Sliders className="h-6 w-6" />
          </div>
          <h3 className={`text-xs font-bold ${t.overlayTitle} uppercase tracking-[0.2em] mb-1`}>Room Correction Active</h3>
          <p className={`text-[9px] ${t.overlayText} max-w-sm leading-relaxed font-sans font-medium mb-4`}>
            Room acoustic calibration is currently active. The manual parametric equalizer is bypassed to prevent phase distortion and frequency overlap.
          </p>
          <div className="flex gap-3 w-full max-w-xs shrink-0">
            <button
              onClick={onClose}
              className={`flex-grow py-2 rounded-xl ${t.overlayBtnClose} font-extrabold text-[9px] uppercase tracking-wider active:scale-95 transition-all cursor-pointer font-sans`}
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

      {/* Glossy sheen — dark mode only */}
      {!light && (
        <div className="absolute inset-0 pointer-events-none opacity-30 bg-gradient-to-tr from-transparent via-white/5 to-white/10" />
      )}

      {/* Decorative metal screws */}
      <div className={`absolute top-2.5 left-2.5 w-3 h-3 rounded-full ${t.screw} flex items-center justify-center`}>
        <div className={`w-1.5 h-0.5 ${t.screwPin} transform rotate-45`} />
      </div>
      <div className={`absolute top-2.5 right-2.5 w-3 h-3 rounded-full ${t.screw} flex items-center justify-center`}>
        <div className={`w-1.5 h-0.5 ${t.screwPin} transform -rotate-45`} />
      </div>
      <div className={`absolute bottom-2.5 left-2.5 w-3 h-3 rounded-full ${t.screw} flex items-center justify-center`}>
        <div className={`w-1.5 h-0.5 ${t.screwPin} transform -rotate-12`} />
      </div>
      <div className={`absolute bottom-2.5 right-2.5 w-3 h-3 rounded-full ${t.screw} flex items-center justify-center`}>
        <div className={`w-1.5 h-0.5 ${t.screwPin} transform rotate-12`} />
      </div>

      {/* Header */}
      <div className={`flex items-center justify-between ${t.header} pb-3 mb-3 shrink-0`}>
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[var(--theme-color)]" />
          <span className={`font-sans font-extrabold text-[10px] tracking-[0.2em] ${t.headerTitle} uppercase`}>
            RESONANCE FREQUENCY SCHEMES
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleResetBands}
            className={`flex items-center gap-1 text-[10px] ${t.headerBtn} cursor-pointer transition-colors font-mono`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className={`${t.closeBtn} transition-colors cursor-pointer p-0.5`}
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
            <span className={`font-mono text-[9px] ${t.label} uppercase tracking-wider block mb-1.5`}>
              PRE-STAGE VALVE PRESET
            </span>
            <div className="relative w-full">
              <select
                value={currentPreset}
                onChange={(e) => onPresetChange(e.target.value)}
                className={`w-full ${t.presetSelect} rounded-lg px-3 py-2 font-mono text-[10px] focus:outline-none focus:border-[var(--theme-color)] cursor-pointer transition-all appearance-none pr-8`}
              >
                {EQ_PRESETS.map((p) => (
                  <option key={p.name} value={p.name} className={t.presetOption}>
                    {p.name}
                  </option>
                ))}
                {currentPreset === 'Custom' && (
                  <option value="Custom" className={t.presetOption}>
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
          <div className={`${t.tubePanel} rounded-xl p-3 space-y-2.5`}>
            <div>
              <div className="flex justify-between items-center text-[10px] mb-0.5">
                <span className={`font-mono ${t.tubeLabel} flex items-center gap-1`}>
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
                className={`w-full accent-amber-500 h-1 ${t.sliderTrack} rounded-full appearance-none cursor-pointer`}
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] mb-0.5">
                <span className={`font-mono ${t.tubeLabel} flex items-center gap-1`}>
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
                className={`w-full accent-cyan-400 h-1 ${t.sliderTrack} rounded-full appearance-none cursor-pointer`}
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] mb-0.5">
                <span className={`font-mono ${t.tubeLabel} flex items-center gap-1`}>
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
                className={`w-full accent-[var(--theme-color)] h-1 ${t.sliderTrack} rounded-full appearance-none cursor-pointer`}
              />
            </div>
          </div>
        </div>

        {/* Sliders Vertical Equalizer */}
        <div className={`lg:col-span-8 ${t.sliderPanel} rounded-xl p-4 flex flex-col justify-between overflow-hidden`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`font-mono text-[9px] ${t.sliderLabel} tracking-wider`}>
              5-BAND PARAMETRIC VALVE EQUALIZATION
            </span>
            <div className="flex gap-1.5">
              <span className="w-1.5 h-1.5 bg-[var(--theme-color)] rounded-full animate-pulse" />
              <span className={`w-1.5 h-1.5 ${t.sliderDot2} rounded-full`} />
            </div>
          </div>

          <div className="flex justify-around items-end h-[110px] pb-1 relative">
            <div className={`absolute left-0 right-0 top-0 border-t ${t.guideLine} pointer-events-none`} />
            <div className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t ${t.guideLineDash} border-dashed pointer-events-none`} />
            <div className={`absolute left-0 right-0 bottom-0 border-t ${t.guideLine} pointer-events-none`} />

            {(bands || [0,0,0,0,0]).map((rawBandVal, index) => {
              const bandVal = Number(rawBandVal) || 0;
              return (
                <div key={index} className="flex flex-col items-center h-full relative z-10 w-12 justify-end">
                  <span className="font-mono text-[9px] text-[var(--theme-color)] font-bold mb-1">
                    {bandVal > 0 ? `+${bandVal.toFixed(0)}` : bandVal.toFixed(0)}
                  </span>

                  <div className="relative w-10 h-[65px] flex items-center justify-center">
                    <div className={`absolute left-1/2 -translate-x-1/2 w-1.5 ${t.sliderTrack} h-full rounded-full pointer-events-none`}>
                      <div
                        className="absolute bottom-0 w-full rounded-full bg-gradient-to-t from-[var(--theme-color)]/70 to-[var(--theme-color)]"
                        style={{ height: `${((bandVal + 12) / 24) * 100}%` }}
                      />
                      <div
                        className="absolute left-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[var(--theme-color)] shadow-[0_0_6px_var(--theme-color-glow)]"
                        style={{
                          bottom: `${((bandVal + 12) / 24) * 100}%`,
                          transform: 'translate(-50%, 50%)'
                        }}
                      />
                    </div>

                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={bandVal}
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      onChange={(e) => onBandChange(index, Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-row-resize z-20"
                    />
                  </div>

                  <span className={`font-mono text-[8px] ${t.sliderLabel} tracking-wider mt-1.5 uppercase select-none`}>
                    {bandLabels[index]}
                  </span>
                </div>
              );
            })}
          </div>
          <p className={`font-mono text-[8px] text-center ${t.footerText} mt-2 leading-tight`}>
            Peaking Bi-quadratic filter units. Harmonic alignment is calculated at 44.1kHz standard routing depth.
          </p>
        </div>
      </div>
    </div>
  );
}
