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

createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <App />
  </I18nProvider>
)
