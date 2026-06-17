import { useContext } from 'react';
import { Kk } from './KioskContext';
import DspWizard from '../DspWizard';

export default function DspWizardOverlay() {
  const {
    isDspWizardOpen,
    setIsDspWizardOpen,
    setDspActive,
  } = useContext(Kk);

  return (
    <div
      className={`absolute inset-0 bg-[#070b13] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-1.5 font-sans ${
        isDspWizardOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <DspWizard
        onClose={() => setIsDspWizardOpen(false)}
        onCalibrationComplete={(active) => setDspActive(active)}
      />
    </div>
  );
}
