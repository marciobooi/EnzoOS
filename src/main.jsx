import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installAuthFetch } from './lib/authFetch.js'
import { initPwaInstall } from './lib/pwaInstall.js'
import { I18nProvider } from './i18n'

// Attach the remote-access token to API calls before anything renders.
installAuthFetch()
// Capture the Android/Chrome install prompt before any component mounts.
initPwaInstall()

// App-shell service worker: instant open for the installed PWA + offline
// shell. Registers only where it can work — a secure context (HTTPS with the
// trusted Resonance CA, or localhost/the kiosk) in a production build.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.warn('[PWA] service worker registration failed:', err.message))
  })
}

createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <App />
  </I18nProvider>
)
