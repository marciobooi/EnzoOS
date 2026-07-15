import { useContext, useState } from 'react';
import { Wifi, Lock, Check, Loader2 } from 'lucide-react';
import { Kk } from './KioskContext';
import { toast } from '../../lib/toast';
import { api } from '../../api';
import { S, cardShadow } from '../../styles/stone';
import { useI18n } from '../../i18n';
import OnScreenKeyboard from './OnScreenKeyboard';

export default function WifiOverlay() {
  const { isWifiOpen, setIsWifiOpen } = useContext(Kk);
  const { t } = useI18n();

  const [networks, setNetworks]   = useState([]);
  const [scanning, setScanning]   = useState(false);
  const [ssid, setSsid]           = useState('');
  const [password, setPassword]   = useState('');
  const [connecting, setConnecting] = useState(false);
  const [scanned, setScanned]     = useState(false);
  // Which field the on-screen keyboard is editing ('ssid' | 'password' | null).
  // The kiosk is touch-only — without this, tapping the password input did
  // nothing (Chromium --kiosk on X11 has no system keyboard to summon).
  const [kbField, setKbField]     = useState(null);

  const scan = async () => {
    setScanning(true);
    try {
      const d = await api.scanWifi();
      setNetworks(d.networks || []);
      setScanned(true);
    } catch (e) {
      toast.error(e.message || 'Wi-Fi scan failed');
    } finally {
      setScanning(false);
    }
  };

  const connect = async () => {
    if (!ssid) return;
    setConnecting(true);
    try {
      await api.connectWifi(ssid, password);
      toast.success(`${t('common.connected')}: ${ssid}`);
      setIsWifiOpen(false);
    } catch (e) {
      toast.error(e.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  // Scan once when the panel opens
  if (isWifiOpen && !scanned && !scanning) scan();

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-[60] transform overlay-pop flex flex-col p-5 font-sans ${
        isWifiOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 shrink-0"
        style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${S.border}` }}>
            <Wifi className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
          </div>
          <span className="text-sm font-light tracking-[0.25em] uppercase underline underline-offset-8 decoration-[#2a2826] decoration-1" style={{ color: S.label }}>
            {t('net.wifi')}
          </span>
        </div>
        <button
          onClick={() => { setIsWifiOpen(false); setScanned(false); }}
          className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
          style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
          {t('common.close').toUpperCase()}
        </button>
      </div>

      {/* Body — 2 col: network list left, connect form right */}
      <div className="flex-grow grid grid-cols-2 gap-4 min-h-0 overflow-hidden">

        {/* Networks */}
        <div className="flex flex-col gap-2 rounded-2xl p-4 overflow-y-auto stone-scrollbar min-h-0"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="flex items-center justify-between mb-1 shrink-0">
            <span className="text-sm font-light tracking-[0.2em] uppercase" style={{ color: S.label }}>
              {t('net.wifi')}
            </span>
            <button onClick={() => { setScanned(false); scan(); }} disabled={scanning}
              className="text-sm font-semibold cursor-pointer active:scale-95 transition-all"
              style={{ color: S.accent, opacity: scanning ? 0.5 : 1 }}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : t('net.scanning').replace('…', '')}
            </button>
          </div>

          {scanning && networks.length === 0 && (
            <p className="text-sm font-light" style={{ color: S.muted }}>{t('net.scanning')}</p>
          )}

          {!scanning && networks.length === 0 && scanned && (
            <p className="text-sm font-light" style={{ color: S.muted }}>No networks found.</p>
          )}

          {networks.map(n => {
            const selected = ssid === n.ssid;
            return (
              <button key={n.ssid} onClick={() => setSsid(n.ssid)}
                className="w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer active:scale-[0.99]"
                style={{
                  background: selected ? S.accent : S.surfaceLo,
                  border: `1px solid ${selected ? S.accent : S.border}`,
                  boxShadow: cardShadow,
                }}>
                <span className="flex items-center gap-2 min-w-0">
                  {n.security && <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: selected ? S.accentFg : S.muted }} />}
                  <span className="text-sm font-semibold truncate" style={{ color: selected ? S.accentFg : S.strong }}>
                    {n.ssid}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-light" style={{ color: selected ? S.accentFg : S.label, opacity: selected ? 0.85 : 1 }}>
                    {n.signal}dBm
                  </span>
                  {selected && <Check className="h-4 w-4" strokeWidth={1.5} style={{ color: S.accentFg }} />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Connect form — scrolls: on the 320px-tall panel the two inputs plus
            button overflow the column, and without overflow-y-auto the connect
            button below the fold was simply unreachable by touch. */}
        <div className="flex flex-col gap-3 rounded-2xl p-4 min-h-0 overflow-y-auto stone-scrollbar"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <span className="text-sm font-light tracking-[0.2em] uppercase shrink-0" style={{ color: S.label }}>
            {t('net.connect')}
          </span>

          {/* Inputs are readOnly + tap-to-edit: the kiosk has no physical
              keyboard, so tapping opens the on-screen keyboard overlay. */}
          <div className="flex flex-col gap-2 shrink-0">
            <label className="text-sm font-light" style={{ color: S.muted }}>{t('net.ssid')}</label>
            <input type="text" value={ssid} readOnly
              onClick={() => setKbField('ssid')}
              placeholder={t('net.ssid')}
              className="px-3 py-2.5 rounded-xl text-sm focus:outline-none cursor-pointer"
              style={{ background: S.bg, color: S.strong, border: `1px solid ${kbField === 'ssid' ? S.accent : S.track}` }} />
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <label className="text-sm font-light" style={{ color: S.muted }}>{t('net.password')}</label>
            <input type="password" value={password} readOnly
              onClick={() => setKbField('password')}
              placeholder={t('net.password')}
              className="px-3 py-2.5 rounded-xl text-sm focus:outline-none cursor-pointer"
              style={{ background: S.bg, color: S.strong, border: `1px solid ${kbField === 'password' ? S.accent : S.track}` }} />
          </div>

          <button onClick={connect} disabled={connecting || !ssid}
            className="mt-auto py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
            style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
            {connecting ? t('net.connecting') : t('net.connect')}
          </button>
        </div>
      </div>

      {/* On-screen keyboard — covers the whole panel while editing a field */}
      {kbField && (
        <OnScreenKeyboard
          label={kbField === 'ssid' ? t('net.ssid') : t('net.password')}
          value={kbField === 'ssid' ? ssid : password}
          onChange={v => (kbField === 'ssid' ? setSsid(v) : setPassword(v))}
          onDone={() => setKbField(null)}
        />
      )}
    </div>
  );
}
