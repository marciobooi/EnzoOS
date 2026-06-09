import { useEffect, useState } from 'react';
import NowPlaying from './components/NowPlaying';
import Controls from './components/Controls';
import SourceSelect from './components/SourceSelect';
import DspWizard from './components/DspWizard';

function App() {
  const [state, setState] = useState({
    status: 'paused',
    volume: 50,
    source: 'mpd',
    track: { title: 'Unknown', artist: 'Unknown', album: 'Unknown' },
    vuMeters: { left: -60, right: -60 }
  });

  const [ws, setWs] = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    // Connect to backend WebSocket via same-origin (works behind nginx; preserves HTTPS -> WSS)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}/ws`;
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
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'action',
        payload: { action, value }
      }));
    }
  };

  return (
    <div className="w-full h-screen bg-darker text-white flex flex-row items-center p-4">
      {/*
        Horizontal Layout for 1400x320 screen.
        Divided into 3 main columns:
        1. Source & Volume (Left)
        2. Now Playing / Metadata (Center)
        3. Controls & VU Meters (Right)
      */}

      <div className="flex-1 flex flex-col justify-between h-full pr-4 border-r border-gray-700">
        <SourceSelect currentSource={state.source} onChange={(src) => sendAction('source', src)} />

        <div className="mt-4 flex flex-col space-y-4">
          <button
            onClick={() => setShowWizard(true)}
            className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 transition-colors border border-gray-600"
          >
            DSP Settings Wizard
          </button>
          <label className="text-gray-400 text-sm mb-2 block">Volume ({state.volume}%)</label>
          <input
            type="range"
            min="0"
            max="100"
            value={state.volume}
            onChange={(e) => sendAction('volume', parseInt(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      </div>

      <div className="flex-[2] px-8 flex items-center justify-center h-full">
        <NowPlaying track={state.track} status={state.status} />
      </div>

      <div className="flex-1 flex flex-col justify-between h-full pl-4 border-l border-gray-700">
        <Controls status={state.status} onPlay={() => sendAction('play')} onPause={() => sendAction('pause')} />

        {/* Simple VU Meters visualization */}
        <div className="mt-4 flex flex-row justify-center space-x-4 h-24 items-end">
          <div className="w-8 bg-gray-800 rounded-t overflow-hidden relative">
            <div
              className="absolute bottom-0 w-full bg-green-500 vu-bar"
              style={{ height: `${Math.max(0, 100 + state.vuMeters.left)}%` }}
            ></div>
          </div>
          <div className="w-8 bg-gray-800 rounded-t overflow-hidden relative">
            <div
              className="absolute bottom-0 w-full bg-green-500 vu-bar"
              style={{ height: `${Math.max(0, 100 + state.vuMeters.right)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {showWizard && <DspWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}

export default App;
