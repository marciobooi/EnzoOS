// Home-screen / PWA install helper.
//
// Chrome/Android fires `beforeinstallprompt` once, early in page load — before
// the Settings tab ever mounts. We capture and stash it here so the in-app
// "Install as App" guide can offer a native one-tap install on demand. iOS
// Safari has no such event, so the guide falls back to manual instructions.

let deferredPrompt = null;
const listeners = new Set();

function notify() { listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } }); }

export function installAvailable() { return !!deferredPrompt; }

export function isStandalone() {
  return (typeof window !== 'undefined') && (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// Subscribe to availability changes (prompt captured / app installed).
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome === 'accepted';
}

export function initPwaInstall() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; notify(); });
}
