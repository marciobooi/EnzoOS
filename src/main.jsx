import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installAuthFetch } from './lib/authFetch.js'

// Attach the remote-access token to API calls before anything renders.
installAuthFetch()

createRoot(document.getElementById('root')).render(
  <>
    <App />
  </>
)
