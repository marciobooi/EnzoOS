import { useContext, useEffect, useRef, useState } from 'react';
import { Music, Radio, Airplay, Network, Bluetooth, Music2 } from 'lucide-react';
import { Tk, SpotifyIcon, Sheet } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';
import { reportError } from '../../lib/errors';
import { useI18n } from '../../i18n';

// `inline`: tablet passes this so the Qobuz/Tidal auth forms below replace
// the source grid in place instead of opening as a modal Sheet. Phone
// always omits it.
export default function SourceTab({ inline = false }) {
  const { t } = useI18n();
  const {
    C, card, btnInset, darkMode,
    source, handleToggleSource, setActiveTab,
    token, services,
  } = useContext(Tk);

  // "Properly configured" green dot — same treatment as the existing
  // Tidal/Qobuz connected indicator, extended to every source that has a
  // real configured/not-configured state: Spotify (OAuth token present),
  // and AirPlay/UPnP/Bluetooth (their backing systemd service is active —
  // `services` comes from GET /api/system/services, fetched on Source-tab
  // mount). Local/Radio need no setup, so they never show a dot.
  const isConfigured = {
    spotify: !!token,
    airplay: services?.['shairport-sync'] === 'active',
    upnp: services?.upmpdcli === 'active',
    bluetooth: services?.bluetooth === 'active',
  };

  // Tablet-only tile treatment (gated on `inline`, same as everywhere else
  // in this file — phone's grid is untouched): a stronger ambient shadow so
  // tiles read as floating cards, and the active tile gets a bold
  // champagne top-edge accent instead of the phone's subtle all-round
  // border, matching the reference "Definitions"-style card language.
  const tabletTileShadow = darkMode
    ? '0 10px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.28)'
    : '0 8px 24px rgba(180,170,150,0.16)';

  const [connected, setConnected] = useState({ tidal: false, qobuz: false });

  // Qobuz username/password modal
  const [qobuzModal, setQobuzModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Tidal device-flow modal
  const [tidalAuth, setTidalAuth] = useState(null); // { userCode, verificationUri }
  const pollRef = useRef(null);

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

  // Selecting a source activates it, then — for the ones with no "resume last
  // played" concept (Radio, Tidal, Qobuz once connected) — sends the user to
  // Search to actually pick something, otherwise the switch just goes silent.
  // Searching Tidal/Qobuz itself lives only in the unified Search tab now.
  const activateAndSearch = id => { handleToggleSource(id); setActiveTab('search'); };

  const handleSelect = id => {
    if (id === 'qobuz') {
      if (connected.qobuz) activateAndSearch('qobuz');
      else { setUsername(''); setPassword(''); setQobuzModal(true); }
      return;
    }
    if (id === 'tidal') {
      if (connected.tidal) activateAndSearch('tidal');
      else startTidalAuth();
      return;
    }
    handleToggleSource(id);
    if (id === 'radio') setActiveTab('search');
  };

  const submitQobuz = async e => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { reportError(t('source.enterCreds')); return; }
    setBusy(true);
    try {
      await api.qobuzAuth(username.trim(), password);
      setConnected(c => ({ ...c, qobuz: true }));
      toast.success(t('source.qobuzConnected'));
      setQobuzModal(false);
      activateAndSearch('qobuz');
    } catch (err) {
      reportError(err.message || t('source.connectionFailed'));
    } finally { setBusy(false); }
  };

  const startTidalAuth = async () => {
    try {
      const info = await api.tidalDeviceAuth();
      setTidalAuth({ userCode: info.userCode, verificationUri: info.verificationUri });
      clearInterval(pollRef.current);
      const deadline = Date.now() + (info.expiresIn || 300) * 1000;
      pollRef.current = setInterval(async () => {
        if (Date.now() > deadline) { clearInterval(pollRef.current); setTidalAuth(null); reportError(t('source.tidalExpired')); return; }
        try {
          const r = await api.tidalPoll(info.deviceCode);
          if (r.connected) {
            clearInterval(pollRef.current);
            setConnected(c => ({ ...c, tidal: true }));
            setTidalAuth(null);
            toast.success(t('source.tidalConnected'));
            activateAndSearch('tidal');
          }
        } catch { /* keep polling until deadline */ }
      }, (info.interval || 2) * 1000);
    } catch (err) {
      reportError(err.message || t('source.tidalLoginFailed'));
    }
  };

  const sources = [
    { id: 'spotify',   label: 'Spotify',   Icon: () => <SpotifyIcon className="h-7 w-7" style={{ fill: source === 'spotify'   ? '#1ed760'    : C.text4 }} /> },
    { id: 'local',     label: 'Local',     Icon: () => <Music      className="h-7 w-7" style={{ color: source === 'local'     ? C.champagne : C.text4 }} /> },
    { id: 'radio',     label: 'Radio',     Icon: () => <Radio      className="h-7 w-7" style={{ color: source === 'radio'     ? C.champagne : C.text4 }} /> },
    { id: 'airplay',   label: 'AirPlay',   Icon: () => <Airplay    className="h-7 w-7" style={{ color: source === 'airplay'   ? C.champagne : C.text4 }} /> },
    { id: 'upnp',      label: 'UPnP',      Icon: () => <Network    className="h-7 w-7" style={{ color: source === 'upnp'      ? C.champagne : C.text4 }} /> },
    { id: 'bluetooth', label: 'Bluetooth', Icon: () => <Bluetooth  className="h-7 w-7" style={{ color: source === 'bluetooth' ? C.champagne : C.text4 }} /> },
    { id: 'tidal',     label: 'Tidal',     Icon: () => <Music2     className="h-7 w-7" style={{ color: source === 'tidal'     ? C.champagne : C.text4 }} /> },
    { id: 'qobuz',     label: 'Qobuz',     Icon: () => <Music      className="h-7 w-7" style={{ color: source === 'qobuz'     ? C.champagne : C.text4 }} /> },
  ];

  const inputStyle = { ...card, color: C.text1 };

  // On tablet, an active auth form REPLACES the grid (inline swap) instead
  // of covering it as a modal — phone always shows the grid underneath.
  const hideGridForInline = inline && (qobuzModal || tidalAuth);

  return (
    <div className="flex flex-col pt-5 pb-2">
      {/* Tablet renders its own larger page header (TabletShell) instead of
          this compact kicker+title — phone (inline=false) always keeps it. */}
      {!inline && (
        <div className="px-5 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('source.signalChain')}</p>
          <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('nav.source')}</h2>
        </div>
      )}
      {!hideGridForInline && (
        <>
          <div className="px-4 grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
            {sources.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => handleSelect(id)}
                className="relative flex flex-col items-center justify-center gap-3 py-7 md:py-9 rounded-2xl active:scale-95 transition-all cursor-pointer input-btn"
                style={source === id
                  ? {
                      ...btnInset,
                      border: `0.5px solid ${C.champagne}40`,
                      ...(inline ? { borderTop: `3px solid ${C.champagne}`, boxShadow: tabletTileShadow } : {}),
                    }
                  : { ...card, ...(inline ? { boxShadow: tabletTileShadow } : {}) }}>
                <Icon />
                <span className="text-[12px] font-semibold uppercase tracking-wider"
                  style={{ color: source === id ? C.champagne : C.text4, fontFamily: C.fontLabel }}>{label}</span>
                {(((id === 'tidal' || id === 'qobuz') && connected[id]) || isConfigured[id]) && (
                  <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full" style={{ background: '#1ed760' }} />
                )}
              </button>
            ))}
          </div>

          {(connected.tidal || connected.qobuz) && (
            <p className="px-5 mt-4 text-[11px]" style={{ color: C.text3 }}>
              {t('source.connectedTip')}
            </p>
          )}
        </>
      )}

      {/* Qobuz credentials */}
      {qobuzModal && (
        <Sheet inline={inline} C={C} kicker={t('source.hiResSource')} title={t('source.connectQobuz')} onBack={() => !busy && setQobuzModal(false)}>
          <form onSubmit={submitQobuz} className="flex flex-col gap-3 w-full max-w-sm mx-auto">
            <p className="text-[14px] mb-1" style={{ color: C.text4 }}>{t('source.qobuzSignIn')}</p>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('wizard.connect.qobuzUser')}
              autoCapitalize="none" autoComplete="username" className="w-full rounded-xl px-4 py-3.5 text-[16px] focus:outline-none" style={inputStyle} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('wizard.connect.qobuzPass')}
              autoComplete="current-password" className="w-full rounded-xl px-4 py-3.5 text-[16px] focus:outline-none" style={inputStyle} />
            <button type="submit" disabled={busy}
              className="w-full py-3.5 rounded-full text-[15px] font-semibold active:scale-95 transition-all cursor-pointer mt-1"
              style={{ background: C.champagne, color: '#1a1c1c', opacity: busy ? 0.6 : 1, fontFamily: C.font }}>
              {busy ? t('net.connecting') : t('net.connect')}</button>
          </form>
        </Sheet>
      )}

      {/* Tidal device flow */}
      {tidalAuth && (
        <Sheet inline={inline} C={C} kicker={t('source.hiResSource')} title={t('source.connectTidal')}
          onBack={() => { clearInterval(pollRef.current); setTidalAuth(null); }}>
          <div className="flex flex-col items-center text-center gap-5 w-full max-w-sm mx-auto pt-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
              <Music2 className="h-7 w-7" style={{ color: C.champagne }} />
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: C.text4 }}>
              {t('source.tidalEnterCode').split('{url}')[0]}
              <span style={{ color: C.champagne }}>{tidalAuth.verificationUri}</span>
              {t('source.tidalEnterCode').split('{url}')[1]}
            </p>
            <div className="px-6 py-4 rounded-2xl" style={{ ...card }}>
              <span className="text-[32px] font-bold tracking-[0.3em]" style={{ color: C.text1 }}>{tidalAuth.userCode}</span>
            </div>
            <p className="text-[12px]" style={{ color: C.text3 }}>{t('source.waitingAuth')}</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
