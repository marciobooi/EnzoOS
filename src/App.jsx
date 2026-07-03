import { useState, useEffect } from 'react';
import Kiosk from './pages/Kiosk';
import RemoteControl from './pages/RemoteControl';
import ToastContainer from './components/ui/ToastContainer';
import WelcomeWizard from './components/WelcomeWizard';
import { api } from './api';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // First-boot onboarding: show the wizard unless it has already been completed
  // (persisted in the DB). A "Run setup again" button dispatches the custom
  // 'resonance:show-welcome' event to re-open it on demand.
  useEffect(() => {
    let active = true;
    api.getOnboarding()
      .then(d => { if (active && !d?.complete) setShowWelcome(true); })
      .catch(() => {}); // backend unreachable → don't block the UI
    const reopen = () => setShowWelcome(true);
    window.addEventListener('resonance:show-welcome', reopen);
    return () => { active = false; window.removeEventListener('resonance:show-welcome', reopen); };
  }, []);

  const isRemote = currentPath === '/remote';

  return (
    <>
      <ToastContainer bottomOffset={isRemote ? 80 : 24} />
      {isRemote ? <RemoteControl /> : <Kiosk />}
      {showWelcome && <WelcomeWizard onClose={() => setShowWelcome(false)} />}
    </>
  );
}
