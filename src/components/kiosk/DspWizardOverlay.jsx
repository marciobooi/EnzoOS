import { useContext } from 'react';
import { Kk } from './KioskContext';
import DspWizard from '../DspWizard';

export default function DspWizardOverlay() {
  const {
    setIsDspWizardOpen,
    setDspActive,
  } = useContext(Kk);

  return (
    <div className="absolute inset-0 bg-[#070b13] border border-white/10 rounded-3xl shadow-2xl z-50 flex flex-col p-1.5 font-sans">
      <DspWizard
        onClose={() => setIsDspWizardOpen(false)}
        onCalibrationComplete={(active) => setDspActive(active)}
      />
    </div>
  );
}
