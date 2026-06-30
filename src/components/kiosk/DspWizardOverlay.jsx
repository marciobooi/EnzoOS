import { useContext } from 'react';
import { Kk } from './KioskContext';
import DspWizard from '../DspWizard';
import { S } from '../../styles/stone';

export default function DspWizardOverlay() {
  const {
    setIsDspWizardOpen,
    setDspActive,
    pureDirect,
    handleTogglePureDirect,
  } = useContext(Kk);

  return (
    // Fixed full-screen — covers the player entirely, nothing bleeds through.
    <div
      className="fixed inset-0 z-[9998] flex flex-col"
      style={{ background: S.bg }}
    >
      <DspWizard
        onClose={() => setIsDspWizardOpen(false)}
        onCalibrationComplete={(active) => setDspActive(active)}
        pureDirect={pureDirect}
        onPureDirectChange={handleTogglePureDirect}
      />
    </div>
  );
}
