import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music, Radio, Airplay, Network, Bluetooth, Music2, Search, ChevronLeft } from 'lucide-react';
import { Tk, SpotifyIcon } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';

export default function SourceTab() {
  const {
    C, card, btnInset,
    source, handleToggleSource, setActiveTab,
  } = useContext(Tk);

  const [connected, setConnected] = useState({ tidal: false, qobuz: false });

  // Qobuz username/password modal
  const [qobuzModal, setQobuzModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Tidal device-flow modal
  const [tidalAuth, setTidalAuth] = useState(null); // { userCode, verificationUri }
  const pollRef = useRef(null);

  // Shared search modal
  const [searchFor, setSearchFor] = useState(null); // 'tidal' | 'qobuz'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [t, q] = await Promise.all([api.getTidalStatus(), api.getQobuzStatus()]);
        if (alive) setConnected({ tidal: !!t?.connected, qobuz: !!q?.connected });
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; clearInterval(pollRef.current); };
  }, []);

  const openSearch = id => { setSearchFor(id); setQuery(''); setResults([]); };

  const handleSelect = id => {
    if (id === 'qobuz') {
      if (connected.qobuz) openSearch('qobuz');
      else { setUsername(''); setPassword(''); setQobuzModal(true); }
      return;
    }
    if (id === 'tidal') {
      if (connected.tidal) openSearch('tidal');
      else startTidalAuth();
      return;
    }
    handleToggleSource(id);
    if (id === 'radio') setActiveTab('radio');
  };

  const submitQobuz = async e => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { toast.error('Enter username and password'); return; }
    setBusy(true);
    try {
      await api.qobuzAuth(username.trim(), password);
      setConnected(c => ({ ...c, qobuz: true }));
      toast.success('Qobuz connected');
      setQobuzModal(false);
      openSearch('qobuz');
    } catch (err) {
      toast.error(err.message || 'Connection failed');
    } finally { setBusy(false); }
  };

  const startTidalAuth = async () => {
    try {
      const info = await api.tidalDeviceAuth();
      setTidalAuth({ userCode: info.userCode, verificationUri: info.verificationUri });
      clearInterval(pollRef.current);
      const deadline = Date.now() + (info.expiresIn || 300) * 1000;
      pollRef.current = setInterval(async () => {
        if (Date.now() > deadline) { clearInterval(pollRef.current); setTidalAuth(null); toast.error('Tidal login expired'); return; }
        try {
          const r = await api.tidalPoll(info.deviceCode);
          if (r.connected) {
            clearInterval(pollRef.current);
            setConnected(c => ({ ...c, tidal: true }));
            setTidalAuth(null);
            toast.success('Tidal connected');
            openSearch('tidal');
          }
        } catch { /* keep polling until deadline */ }
      }, (info.interval || 2) * 1000);
    } catch (err) {
      toast.error(err.message || 'Tidal login failed');
    }
  };

  const doSearch = async e => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const fn = searchFor === 'tidal' ? api.tidalSearch : api.qobuzSearch;
      setResults(await fn(query.trim()));
    } catch (err) {
      toast.error(err.message || 'Search failed');
    } finally { setSearching(false); }
  };

  const playTrack = async t => {
    try {
      const fn = searchFor === 'tidal' ? api.tidalPlayTrack : api.qobuzPlayTrack;
      await fn(t);
      setSearchFor(null);
      setActiveTab('player');
      toast.success('Playing');
    } catch (err) {
      toast.error(err.message || 'Playback failed');
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

  const inputStyle = { ...card, color: C.text1 };

  return (
    <div className="flex flex-col pt-5 pb-2">
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>Signal Chain</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Source</h2>
      </div>

      <div className="px-4 grid grid-cols-4 gap-3">
        {sources.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => handleSelect(id)}
            className="relative flex flex-col items-center justify-center gap-3 py-5 rounded-xl active:scale-95 transition-all cursor-pointer input-btn"
            style={source === id ? { ...btnInset, border: `0.5px solid ${C.champagne}40` } : { ...card }}>
            <Icon />
            <span className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: source === id ? C.champagne : C.text4, fontFamily: C.fontLabel }}>{label}</span>
            {(id === 'tidal' || id === 'qobuz') && connected[id] && (
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full" style={{ background: '#1ed760' }} />
            )}
          </button>
        ))}
      </div>

      {(connected.tidal || connected.qobuz) && (
        <p className="px-5 mt-4 text-[11px]" style={{ color: C.text3 }}>
          Tip: tap a connected hi-res source again to search and play.
        </p>
      )}

      {/* Qobuz credentials */}
      {qobuzModal && (
        <Sheet C={C} kicker="Hi-Res Source" title="Connect Qobuz" onBack={() => !busy && setQobuzModal(false)}>
          <form onSubmit={submitQobuz} className="flex flex-col gap-3 w-full max-w-sm mx-auto">
            <p className="text-[14px] mb-1" style={{ color: C.text4 }}>Sign in to stream Qobuz hi-res audio.</p>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Email / username"
              autoCapitalize="none" autoComplete="username" className="w-full rounded-xl px-4 py-3.5 text-[16px] focus:outline-none" style={inputStyle} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
              autoComplete="current-password" className="w-full rounded-xl px-4 py-3.5 text-[16px] focus:outline-none" style={inputStyle} />
            <button type="submit" disabled={busy}
              className="w-full py-3.5 rounded-full text-[15px] font-semibold active:scale-95 transition-all cursor-pointer mt-1"
              style={{ background: C.champagne, color: '#1a1c1c', opacity: busy ? 0.6 : 1, fontFamily: C.font }}>
              {busy ? 'Connecting…' : 'Connect'}</button>
          </form>
        </Sheet>
      )}

      {/* Tidal device flow */}
      {tidalAuth && (
        <Sheet C={C} kicker="Hi-Res Source" title="Connect Tidal"
          onBack={() => { clearInterval(pollRef.current); setTidalAuth(null); }}>
          <div className="flex flex-col items-center text-center gap-5 w-full max-w-sm mx-auto pt-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
              <Music2 className="h-6 w-6" style={{ color: C.champagne }} />
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: C.text4 }}>
              On any device open<br /><span style={{ color: C.champagne }}>{tidalAuth.verificationUri}</span><br />and enter this code:
            </p>
            <div className="px-6 py-4 rounded-2xl" style={{ ...card }}>
              <span className="text-[32px] font-bold tracking-[0.3em]" style={{ color: C.text1 }}>{tidalAuth.userCode}</span>
            </div>
            <p className="text-[12px]" style={{ color: C.text3 }}>Waiting for authorisation…</p>
          </div>
        </Sheet>
      )}

      {/* Search + play */}
      {searchFor && (
        <Sheet C={C} kicker={searchFor === 'tidal' ? 'Tidal' : 'Qobuz'} title="Search" onBack={() => setSearchFor(null)}>
          <form onSubmit={doSearch} className="flex gap-2 mb-3">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tracks…" autoFocus
              className="flex-1 rounded-xl px-4 py-3.5 text-[16px] focus:outline-none" style={inputStyle} />
            <button type="submit" disabled={searching} aria-label="Search"
              className="px-4 min-w-[44px] rounded-xl active:scale-95 cursor-pointer flex items-center justify-center" style={{ background: C.champagne }}>
              <Search className="h-5 w-5" style={{ color: '#1a1c1c' }} />
            </button>
          </form>
          <div className="flex flex-col gap-1.5">
            {searching && <p className="text-[13px] py-4 text-center" style={{ color: C.text3 }}>Searching…</p>}
            {!searching && results.length === 0 && <p className="text-[13px] py-4 text-center" style={{ color: C.text4 }}>No results yet.</p>}
            {results.map(t => (
              <button key={t.id} onClick={() => playTrack(t)}
                className="flex items-center gap-3 p-2 rounded-xl active:scale-[0.98] cursor-pointer text-left" style={{ ...card }}>
                {t.cover
                  ? <img src={t.cover} alt="" className="h-11 w-11 rounded-md object-cover" />
                  : <div className="h-11 w-11 rounded-md" style={{ background: C.containerLow }} />}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] truncate" style={{ color: C.text1 }}>{t.title}</p>
                  <p className="text-[12px] truncate" style={{ color: C.text3 }}>{t.artist}</p>
                </div>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

// Full-screen remote sheet — solid background (no dim), header with a back
// button that returns to the Source view. Portaled to <body> so it escapes the
// tab-slide transform (a transformed ancestor would otherwise trap the fixed
// element inside the content area, leaving the nav/mini-player visible).
// Module-scoped so the text inputs inside keep focus across re-renders.
function Sheet({ C, kicker, title, onBack, children }) {
  return createPortal(
    <div className="remote-root remote-sheet-in fixed inset-0 z-[9999] flex flex-col"
      style={{
        '--rc-outline': C.outline, '--rc-champagne': C.champagne,
        '--rc-container': C.container, '--rc-bg-white': C.bgWhite,
        background: C.bg, fontFamily: C.font, paddingTop: 'env(safe-area-inset-top)',
      }}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-4 shrink-0"
        style={{ background: C.bg, borderBottom: `0.5px solid ${C.outline}` }}>
        <button onClick={onBack} aria-label="Back to sources"
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          <ChevronLeft className="h-5 w-5" style={{ color: C.text3 }} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>{kicker}</p>
          <p className="text-[20px] font-medium truncate"
            style={{ color: C.text1, letterSpacing: '-0.01em' }}>{title}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>,
    document.body,
  );
}
