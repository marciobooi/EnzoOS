import { useContext } from 'react';
import { Kk } from './KioskContext';
import EqualizerControl from '../EqualizerControl';

export default function EqualizerOverlay() {
  const {
    isEqualizerOpen,
    setIsEqualizerOpen,
    eqPreset,
    eqBands,
    eqSaturation,
    eqNoiseFloor,
    eqPreAmp,
    handleEqPresetChange,
    handleBandChange,
    handleSaturationChange,
    handleNoiseFloorChange,
    handlePreAmpChange,
    dspActive,
    handleDeactivateDsp,
  } = useContext(Kk);

  return (
    <div
      className={`absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-1.5 font-sans ${
        isEqualizerOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <EqualizerControl
        currentPreset={eqPreset}
        onPresetChange={handleEqPresetChange}
        bands={eqBands}
        onBandChange={handleBandChange}
        saturation={eqSaturation}
        onSaturationChange={handleSaturationChange}
        noiseFloor={eqNoiseFloor}
        onNoiseFloorChange={handleNoiseFloorChange}
        preAmp={eqPreAmp}
        onPreAmpChange={handlePreAmpChange}
        onClose={() => setIsEqualizerOpen(false)}
        dspActive={dspActive}
        onDeactivateDsp={handleDeactivateDsp}
      />
    </div>
  );
}
