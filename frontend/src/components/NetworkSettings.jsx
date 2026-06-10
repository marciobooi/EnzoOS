import { useState, useEffect } from 'react';
import { X, Wifi } from 'lucide-react';

export default function NetworkSettings({ onClose }) {
  const [status, setStatus] = useState(null);
  const [networks, setNetworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const apiBase = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}/api`;

  useEffect(() => {
    fetchStatus();
    fetchNetworks();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/network/status`);
      const data = await res.json();
      if (data.success) setStatus(data.status);
    } catch (e) {
      console.error('Failed to fetch network status', e);
    }
  };

  const fetchNetworks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/network/scan`);
      const data = await res.json();
      if (data.success) setNetworks(data.networks);
    } catch (e) {
      console.error('Failed to fetch networks', e);
    }
    setLoading(false);
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch(`${apiBase}/network/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: selectedNetwork.ssid, password })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setSelectedNetwork(null);
        setPassword('');
        fetchStatus(); // Refresh status
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Connection attempt failed');
    }
    setIsConnecting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-lg shadow-2xl p-6 flex flex-col h-full max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
             <Wifi size={28} className="text-[var(--accent)]" />
             <span>Network Settings</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full">
             <X size={24} />
          </button>
        </div>

        {/* Current Status */}
        <div className="mb-6 p-4 bg-gray-800 rounded border border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="text-gray-400 text-sm font-semibold mb-1 uppercase">Active Connection</h3>
            <div className="text-xl text-white">
              {status ? (
                status.ethernet ? 'Ethernet (Wired)' :
                status.wifi ? `Wi-Fi (${status.activeSSID})` :
                'Disconnected'
              ) : 'Loading...'}
            </div>
          </div>
          <button onClick={fetchNetworks} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white">
            Refresh Scan
          </button>
        </div>

        {/* Wi-Fi Scanner */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-gray-400 py-10">Scanning for networks...</div>
          ) : (
            <div className="space-y-2">
              {networks.map((net, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 border border-gray-700 bg-gray-800 rounded hover:bg-gray-700 transition">
                  <div className="flex flex-col">
                    <span className="font-medium text-white text-lg">{net.ssid}</span>
                    <span className="text-xs text-gray-400">Signal: {net.signal}%</span>
                  </div>
                  <button
                    onClick={() => setSelectedNetwork(net)}
                    className="px-4 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-sm"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Password Prompt Modal Overlay */}
        {selectedNetwork && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-4 rounded-lg">
            <div className="bg-gray-800 p-6 rounded shadow-xl border border-gray-600 w-96">
              <h3 className="text-xl text-white mb-2">Connect to {selectedNetwork.ssid}</h3>
              <input
                type="password"
                placeholder="Wi-Fi Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 mb-4 bg-gray-900 border border-gray-600 text-white rounded focus:border-accent outline-none"
              />
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedNetwork(null)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-accent hover:bg-blue-600 rounded text-white font-bold"
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
