import { useContext } from 'react';
import { Kk } from './KioskContext';
import EqualizerControl from '../EqualizerControl';
import { S } from '../../styles/stone';

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
    pureDirect,
    handleTogglePureDirect,
  } = useContext(Kk);

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-1.5 font-sans ${
        isEqualizerOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}
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
        pureDirect={pureDirect}
        onDisablePureDirect={() => handleTogglePureDirect(false)}
      />
    </div>
  );
}
