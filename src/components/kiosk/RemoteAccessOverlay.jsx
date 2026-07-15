import { useContext, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Check, Clock } from 'lucide-react';
import { Kk } from './KioskContext';
import { S, cardShadow } from '../../styles/stone';
import { useI18n } from '../../i18n';

export default function RemoteAccessOverlay() {
  const { t } = useI18n();
  const {
    isRemoteAccessOpen,
    setIsRemoteAccessOpen,
    remoteUrl,
    remoteHostUrl,
    remoteAccessEnabled,
    setRemoteAccessEnabled,
    sendUpdate,
  } = useContext(Kk);

  // remoteUrl (IP-based, always dynamic) is the default QR target — it works
  // on any network. remoteHostUrl (resonance.local) is offered as an
  // alternate: prettier and DHCP-stable, but it needs mDNS to resolve on the
  // phone, which fails on plenty of real networks.
  const [qrUrl, setQrUrl] = useState('');
  const [hostQrUrl, setHostQrUrl] = useState('');
  const [showHostname, setShowHostname] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // /api/auth/qr-token is loopback-only (minting an auth token for anyone on
  // the LAN would be an auth bypass). When this overlay is viewed from
  // another device's browser (http://resonance.local:5000/...) the fetch
  // 403s — track that and say so, instead of silently showing a tokenless
  // QR that would only lead the phone to the gate screen.
  const [qrForbidden, setQrForbidden] = useState(false);

  // Fetch a fresh QR token whenever the overlay opens (or remoteUrl first lands).
  const doFetchRef = useRef(null);
  useEffect(() => {
    if (!isRemoteAccessOpen || !remoteUrl) return;
    let alive = true;
    let refreshTimeout = null;

    const doFetch = async () => {
      clearTimeout(refreshTimeout);
      try {
        const r = await fetch('/api/auth/qr-token');
        if (r.status === 403) { if (alive) setQrForbidden(true); return; }
        const d = await r.json();
        if (!alive || !d.token) return;
        setQrForbidden(false);
        const sep = remoteUrl.includes('?') ? '&' : '?';
        setQrUrl(`${remoteUrl}${sep}qr=${d.token}`);
        if (remoteHostUrl) {
          const hostSep = remoteHostUrl.includes('?') ? '&' : '?';
          setHostQrUrl(`${remoteHostUrl}${hostSep}qr=${d.token}`);
        }
        setPairCode(d.code || '');
        setExpiresAt(d.expiresAt);
        setSecondsLeft(Math.floor(d.ttlSeconds));
        // Refresh 30 s before expiry so the QR is always valid while visible.
        refreshTimeout = setTimeout(doFetch, Math.max(0, d.ttlSeconds - 30) * 1000);
      } catch {
        // Server unreachable (e.g. mid-restart during an OTA update). Without
        // this retry the refresh chain died here permanently and the overlay
        // kept showing a stale QR that would never redeem.
        if (alive) refreshTimeout = setTimeout(doFetch, 5000);
      }
    };

    doFetchRef.current = doFetch;
    doFetch();
    return () => { alive = false; clearTimeout(refreshTimeout); doFetchRef.current = null; };
  }, [isRemoteAccessOpen, remoteUrl, remoteHostUrl]);

  // The QR token is single-use (server/auth.js) — as soon as one device
  // redeems it, the still-displayed code is dead for the next ~10 minutes
  // until the timer above rotates it. A second person scanning that same
  // on-screen QR in the meantime got a confusing "expired" error even
  // though the countdown looked fine. The server broadcasts QR_TOKEN_REDEEMED
  // the instant any device pairs — jump the queue and pull a fresh code now.
  useEffect(() => {
    const onRedeemed = () => doFetchRef.current?.();
    window.addEventListener('resonance-qr-redeemed', onRedeemed);
    return () => window.removeEventListener('resonance-qr-redeemed', onRedeemed);
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const fmtTTL = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const toggle = (enabled) => {
    setRemoteAccessEnabled(enabled);
    sendUpdate('SET_REMOTE_ACCESS', { enabled });
  };

  const usingHostname = showHostname && !!hostQrUrl;
  const qrValue = (usingHostname ? hostQrUrl : qrUrl) || remoteUrl || 'http://resonance.local';
  const displayUrl = usingHostname ? (remoteHostUrl || '—') : (remoteUrl || '—');

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-[60] transform overlay-pop flex flex-col p-5 font-sans ${
        isRemoteAccessOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 mb-4 shrink-0"
        style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${S.border}` }}>
            <Smartphone className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
          </div>
          <span className="text-sm font-light tracking-[0.25em] uppercase underline underline-offset-8 decoration-[#2a2826] decoration-1" style={{ color: S.label }}>
            {t('remoteAccess.title')}
          </span>
        </div>
        <button
          onClick={() => setIsRemoteAccessOpen(false)}
          className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
          style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
          {t('remoteAccess.close')}
        </button>
      </div>

      {/* ── Body — 3-col grid ───────────────────────────────────────────────── */}
      <div className="flex-grow grid grid-cols-3 gap-4 min-h-0 overflow-hidden">

        {/* Col 1 — status + controls */}
        <div className="flex flex-col gap-4 rounded-2xl p-4 overflow-y-auto stone-scrollbar"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>

          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-colors"
              style={{ background: remoteAccessEnabled ? '#1a9e6a' : S.track }} />
            <span className="text-base font-semibold" style={{ color: remoteAccessEnabled ? S.strong : S.muted }}>
              {remoteAccessEnabled ? t('remoteAccess.enabled') : t('remoteAccess.disabled')}
            </span>
          </div>

          <p className="text-sm font-light leading-relaxed" style={{ color: S.label }}>
            {t('remoteAccess.description')}
          </p>

          <div className="flex gap-2 mt-auto">
            <button onClick={() => toggle(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer flex items-center justify-between px-4"
              style={{
                background: remoteAccessEnabled ? S.accent : S.surfaceLo,
                border: remoteAccessEnabled ? 'none' : `1px solid ${S.border}`,
                color: remoteAccessEnabled ? S.accentFg : S.muted,
                boxShadow: remoteAccessEnabled ? 'none' : cardShadow,
              }}>
              {t('remoteAccess.enableBtn')}
              {remoteAccessEnabled && <Check className="w-4 h-4" strokeWidth={1.5} />}
            </button>
            <button onClick={() => toggle(false)}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{
                background: !remoteAccessEnabled ? `${S.errorHot}18` : S.surfaceLo,
                border: !remoteAccessEnabled ? `1px solid ${S.errorHot}50` : `1px solid ${S.border}`,
                color: !remoteAccessEnabled ? S.errorHot : S.muted,
                boxShadow: remoteAccessEnabled ? cardShadow : 'none',
              }}>
              {t('remoteAccess.disableBtn')}
            </button>
          </div>
        </div>

        {/* Col 2 — QR code (hero, centered) */}
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl p-4 overflow-hidden min-h-0"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <p className="text-sm font-light tracking-[0.25em] uppercase shrink-0" style={{ color: S.label }}>
            {t('remoteAccess.scanToConnect')}
          </p>
          <div className="rounded-2xl p-3 transition-opacity duration-300 w-[50%] flex-1 flex items-center justify-center min-h-0"
            style={{
              border: `1px solid ${S.border}`,
              boxShadow: cardShadow,
              opacity: remoteAccessEnabled && !qrForbidden ? 1 : 0.25,
            }}>
            <QRCodeSVG
              value={qrValue}
              size={130}
              fgColor="#1a1918"
              bgColor="transparent"
              level="M"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          {qrForbidden && (
            <p className="text-[11px] text-center leading-relaxed shrink-0 px-2" style={{ color: S.muted }}>
              {t('remoteAccess.qrForbidden')}
            </p>
          )}
          {/* Countdown badge */}
          {secondsLeft > 0 && remoteAccessEnabled && (
            <div className="flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" style={{ color: S.label }} />
              <span className="text-[11px] font-light tabular-nums" style={{ color: S.label }}>
                {fmtTTL(secondsLeft)}
              </span>
            </div>
          )}
          {/* Manual pairing code — fallback for phones where the installed
              home-screen app intercepts the QR's URL and drops its token
              (a real iOS limitation, not a bug in the scan itself). Typed
              into the remote's gate screen instead of scanned. */}
          {pairCode && remoteAccessEnabled && (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: S.label }}>
                {t('remoteAccess.orEnterCode')}
              </span>
              <span className="text-lg font-bold tabular-nums tracking-[0.15em]" style={{ color: S.strong }}>
                {pairCode}
              </span>
            </div>
          )}
          {/* The default QR uses the direct IP link (works on any network).
              resonance.local is offered as an alternate — prettier and stable
              across DHCP changes, but it needs mDNS to resolve on the phone,
              which fails on plenty of real networks (stale caches, guest
              Wi-Fi, some Android browsers). */}
          {remoteHostUrl && remoteAccessEnabled && (
            <button
              onClick={() => setShowHostname(v => !v)}
              className="cursor-pointer text-[10px] uppercase tracking-wider underline underline-offset-2 shrink-0"
              style={{ color: S.label }}>
              {usingHostname ? t('remoteAccess.useIp') : t('remoteAccess.useHostname')}
            </button>
          )}
        </div>

        {/* Col 3 — URL + instructions */}
        <div className="flex flex-col gap-4 rounded-2xl p-4 pb-8 overflow-y-auto stone-scrollbar"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>

          <div className="shrink-0">
            <p className="text-sm font-light tracking-[0.25em] uppercase mb-1.5" style={{ color: S.label }}>
              {t('remoteAccess.remoteUrl')}
            </p>
            <p className="text-base font-bold break-all leading-snug" style={{ color: S.strong }}>
              {displayUrl}
            </p>
            {usingHostname && (
              <p className="text-[11px] font-light leading-relaxed mt-1" style={{ color: S.muted }}>
                {t('remoteAccess.hostnameNote')}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 min-h-0 pb-6">
            <p className="text-sm font-light tracking-[0.25em] uppercase shrink-0" style={{ color: S.label }}>
              {t('remoteAccess.howToConnect')}
            </p>
            {[
              t('remoteAccess.step1'),
              t('remoteAccess.step2'),
              t('remoteAccess.step3'),
              t('remoteAccess.step4'),
              t('remoteAccess.step5'),
            ].map((step, i, arr) => (
              <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl shrink-0 ${i === arr.length - 1 ? 'mb-2' : ''}`}
                style={{ background: S.surfaceLo, border: `1px solid ${S.border}` }}>
                <span className="text-xs font-black shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: S.accent, color: S.accentFg }}>{i + 1}</span>
                <span className="text-sm font-light" style={{ color: S.muted }}>{step}</span>
              </div>
            ))}
          </div>
          <div className="h-6 shrink-0" /> 
        </div>
      </div>
    </div>
  );
}
