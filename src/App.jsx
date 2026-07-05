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

  // The physical kiosk is the only context that ever requests the exact
  // `/kiosk` path (hardcoded in scripts/xinitrc's --app= URL, loopback-only
  // per server/auth.js). Every other path — bare `/`, `/remote`, or anything
  // a LAN device lands on after the server's loopback-redirect — must get
  // RemoteControl instead: it's the only one of the two that gates itself
  // behind the QR/token pairing flow. Kiosk assumes it's always trusted and
  // has no such gate, so defaulting *it* to "anything unrecognized" meant a
  // stray non-loopback request (e.g. the bare HTTPS root) rendered Kiosk and
  // 401-stormed every API call instead of showing the pairing screen.
  const isRemote = currentPath !== '/kiosk';

  return (
    <>
      <ToastContainer bottomOffset={isRemote ? 80 : 24} />
      {isRemote ? <RemoteControl /> : <Kiosk />}
      {showWelcome && <WelcomeWizard onClose={() => setShowWelcome(false)} />}
    </>
  );
}
