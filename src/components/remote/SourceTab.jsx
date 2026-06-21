import React, { useContext, useEffect, useState } from 'react';
import { Music, Radio, Airplay, Network, Bluetooth, Music2 } from 'lucide-react';
import { Tk, SpotifyIcon } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';

export default function SourceTab() {
  const {
    C, card, btnInset,
    source, handleToggleSource, setActiveTab,
  } = useContext(Tk);

  // Credential capture for the hi-res streaming sources. Without stored
  // credentials these were dead buttons that just silenced playback.
  const [credFor, setCredFor]   = useState(null); // 'tidal' | 'qobuz' | null
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [connected, setConnected] = useState({ tidal: false, qobuz: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [t, q] = await Promise.all([api.getTidalStatus(), api.getQobuzStatus()]);
        if (alive) setConnected({ tidal: !!t?.connected, qobuz: !!q?.connected });
      } catch { /* status is best-effort */ }
    })();
    return () => { alive = false; };
  }, []);

  const handleSelect = id => {
    // Tidal / Qobuz need credentials before they can be activated.
    if ((id === 'tidal' || id === 'qobuz') && !connected[id]) {
      setUsername(''); setPassword(''); setCredFor(id);
      return;
    }
    handleToggleSource(id);
    if (id === 'radio') setActiveTab('radio');
  };

  const submitCreds = async e => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { toast.error('Enter username and password'); return; }
    setBusy(true);
    try {
      if (credFor === 'tidal') await api.tidalConnect(username.trim(), password);
      else                     await api.qobuzAuth(username.trim(), password);
      setConnected(c => ({ ...c, [credFor]: true }));
      handleToggleSource(credFor);
      toast.success(`${credFor === 'tidal' ? 'Tidal' : 'Qobuz'} connected`);
      setCredFor(null); setUsername(''); setPassword('');
    } catch (err) {
      toast.error(err.message || 'Connection failed');
    } finally {
      setBusy(false);
    }
  };

  const sources = [
    { id: 'spotify',   label: 'Spotify',   Icon: () => <SpotifyIcon className="h-6 w-6" style={{ fill: source === 'spotify'   ? '#1ed760'    : C.text4 }} /> },
    { id: 'local',     label: 'Local',     Icon: () => <Music      className="h-6 w-6" style={{ color: source === 'local'     ? C.champagne : C.text4 }} /> },
    { id: 'radio',     label: 'Radio',     Icon: () => <Radio      className="h-6 w-6" style={{ color: source === 'radio'     ? C.champagne : C.text4 }} /> },
    { id: 'airplay',   label: 'AirPlay',   Icon: () => <Airplay    className="h-6 w-6" style={{ color: source === 'airplay'   ? C.champagne : C.text4 }} /> },
    { id: 'upnp',      label: 'UPnP',      Icon: () => <Network    className="h-6 w-6" style={{ color: source === 'upnp'      ? C.champagne : C.text4 }} /> },
    { id: 'bluetooth', label: 'Bluetooth', Icon: () => <Bluetooth  className="h-6 w-6" style={{ color: source === 'bluetooth' ? C.champagne : C.text4 }} /> },
    { id: 'tidal',     label: 'Tidal',     Icon: () => <Music2     className="h-6 w-6" style={{ color: source === 'tidal'     ? C.champagne : C.text4 }} /> },
    { id: 'qobuz',     label: 'Qobuz',     Icon: () => <Music      className="h-6 w-6" style={{ color: source === 'qobuz'     ? C.champagne : C.text4 }} /> },
  ];

  return (
    <div className="flex flex-col pt-5 pb-2">

      {/* header */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>Signal Chain</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Source</h2>
      </div>

      {/* source grid — 4 columns to fit all 8 sources */}
      <div className="px-4 grid grid-cols-4 gap-3">
        {sources.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => handleSelect(id)}
            className="relative flex flex-col items-center justify-center gap-3 py-5 rounded-xl active:scale-95 transition-all cursor-pointer input-btn"
            style={source === id ? { ...btnInset, border: `0.5px solid ${C.champagne}40` } : { ...card }}>
            <Icon />
            <span className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: source === id ? C.champagne : C.text4, fontFamily: C.fontLabel }}>
              {label}
            </span>
            {(id === 'tidal' || id === 'qobuz') && connected[id] && (
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full" style={{ background: '#1ed760' }} />
            )}
          </button>
        ))}
      </div>

      {/* credential capture modal */}
      {credFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => !busy && setCredFor(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={submitCreds}
            className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-3"
            style={{ ...card, background: C.containerLow || C.bg }}>
            <h3 className="text-[18px] font-medium" style={{ color: C.text1 }}>
              Connect {credFor === 'tidal' ? 'Tidal' : 'Qobuz'}
            </h3>
            <p className="text-[12px]" style={{ color: C.text3 }}>
              Enter your {credFor === 'tidal' ? 'Tidal' : 'Qobuz'} account credentials.
            </p>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Username / email" autoCapitalize="none" autoComplete="username"
              className="w-full rounded-xl px-4 py-3 text-[16px] focus:outline-none"
              style={{ ...card, color: C.text1 }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" autoComplete="current-password"
              className="w-full rounded-xl px-4 py-3 text-[16px] focus:outline-none"
              style={{ ...card, color: C.text1 }} />
            <div className="flex gap-2 mt-1">
              <button type="button" disabled={busy} onClick={() => setCredFor(null)}
                className="flex-1 py-3 rounded-full text-[14px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={{ ...card, color: C.text2 }}>
                Cancel
              </button>
              <button type="submit" disabled={busy}
                className="flex-1 py-3 rounded-full text-[14px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={{ background: C.champagne, color: '#1a1a1a', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
