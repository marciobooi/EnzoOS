import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DspWizard from './components/DspWizard';
import NetworkSettings from './components/NetworkSettings';
import SystemSettings from './components/SystemSettings';
import KioskView from './views/KioskView';
import MobileView from './views/MobileView';

function AppContent() {
  const [state, setState] = useState({
    status: 'paused',
    volume: 50,
    source: 'mpd',
    track: { title: 'Unknown', artist: 'Unknown', album: 'Unknown' },
    vuMeters: { left: -60, right: -60 }
  });

  const [ws, setWs] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  // Theming state
  const [theme, setTheme] = useState('dark-minimalist');
  const [vuStyle, setVuStyle] = useState('digital');

  useEffect(() => {
    // Load theme immediately to prevent flash
    fetch(`${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}/api/system/settings`)
      .then(r => r.json())
      .then(d => {
        if(d.success) {
           setTheme(d.settings.theme || 'dark-minimalist');
           setVuStyle(d.settings.vuMeterStyle || 'digital');
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    // Connect to WebSocket using the current host via the Nginx reverse proxy
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use window.location.port if running dev server on a specific port, otherwise rely on Nginx default
    const portString = window.location.port ? `:${window.location.port}` : '';
    // But since API proxy needs to be deterministic, we point WS directly to the same host
    const wsUrl = `${protocol}//${window.location.hostname}${portString}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('Connected to Hi-Fi Backend');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'state_update') {
        setState(data.payload);
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from Hi-Fi Backend');
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  const sendAction = (action, value = null) => {
    // Optimistic UI Update: Instantly update the local state to eliminate perceived latency.
    setState(prevState => {
      let newState = { ...prevState };
      if (action === 'play') newState.status = 'playing';
      if (action === 'pause') newState.status = 'paused';
      if (action === 'volume') newState.volume = value;
      if (action === 'source') newState.source = value;
      return newState;
    });

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'action',
        payload: { action, value }
      }));
    }
  };

  const viewProps = {
    state,
    sendAction,
    vuStyle,
    onOpenWizard: () => setShowWizard(true),
    onOpenNetwork: () => setShowNetwork(true),
    onOpenSystem: () => setShowSystem(true)
  };

  return (
    <div data-theme={theme} className="w-full h-full text-[var(--text-main)] transition-colors duration-500">
      <Routes>
        <Route path="/" element={<KioskView {...viewProps} />} />
        <Route path="/remote" element={<MobileView {...viewProps} />} />
      </Routes>

      {showWizard && <DspWizard onClose={() => setShowWizard(false)} />}
      {showNetwork && <NetworkSettings onClose={() => setShowNetwork(false)} />}
      {showSystem && (
        <SystemSettings
          onClose={() => setShowSystem(false)}
          onThemeChange={(newTheme, newVuStyle) => {
            setTheme(newTheme);
            setVuStyle(newVuStyle);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
