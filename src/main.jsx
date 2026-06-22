import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installAuthFetch } from './lib/authFetch.js'
import { initPwaInstall } from './lib/pwaInstall.js'

// Attach the remote-access token to API calls before anything renders.
installAuthFetch()
// Capture the Android/Chrome install prompt before any component mounts.
initPwaInstall()

createRoot(document.getElementById('root')).render(
  <>
    <App />
  </>
)
