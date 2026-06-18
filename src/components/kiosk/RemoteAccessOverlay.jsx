import { useContext } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Check } from 'lucide-react';
import { Kk } from './KioskContext';
import { S, cardShadow } from '../../styles/stone';

export default function RemoteAccessOverlay() {
  const {
    isRemoteAccessOpen,
    setIsRemoteAccessOpen,
    remoteUrl,
    remoteAccessEnabled,
    setRemoteAccessEnabled,
    sendUpdate,
  } = useContext(Kk);

  const toggle = (enabled) => {
    setRemoteAccessEnabled(enabled);
    sendUpdate('SET_REMOTE_ACCESS', { enabled });
  };

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-[60] transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
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
          <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
            remote access panel
          </span>
        </div>
        <button
          onClick={() => setIsRemoteAccessOpen(false)}
          className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
          style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
          CLOSE
        </button>
      </div>

      {/* ── Body — 2-col ────────────────────────────────────────────────────── */}
      <div className="flex-grow flex flex-row gap-6 items-stretch min-h-0">

        {/* Left — status + controls */}
        <div className="w-56 shrink-0 flex flex-col gap-5 rounded-2xl p-5"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>

          {/* Status indicator */}
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full shrink-0 transition-colors"
              style={{ background: remoteAccessEnabled ? '#1a9e6a' : S.track }} />
            <span className="text-sm font-semibold" style={{ color: remoteAccessEnabled ? S.strong : S.muted }}>
              {remoteAccessEnabled ? 'Access Enabled' : 'Access Disabled'}
            </span>
          </div>

          <p className="text-sm font-light leading-relaxed" style={{ color: S.label }}>
            Allow mobile devices on the same Wi-Fi to connect and control this player.
          </p>

          {/* Enable / Disable */}
          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={() => toggle(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer flex items-center justify-between px-4"
              style={{
                background: remoteAccessEnabled ? S.accent : S.surfaceLo,
                border: remoteAccessEnabled ? 'none' : `1px solid ${S.border}`,
                color: remoteAccessEnabled ? S.accentFg : S.muted,
                boxShadow: remoteAccessEnabled ? 'none' : cardShadow,
              }}>
              Enable Remote
              {remoteAccessEnabled && <Check className="w-4 h-4" strokeWidth={1.5} />}
            </button>
            <button
              onClick={() => toggle(false)}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{
                background: !remoteAccessEnabled ? `${S.errorHot}18` : S.surfaceLo,
                border: !remoteAccessEnabled ? `1px solid ${S.errorHot}50` : `1px solid ${S.border}`,
                color: !remoteAccessEnabled ? S.errorHot : S.muted,
                boxShadow: remoteAccessEnabled ? cardShadow : 'none',
              }}>
              Disable Remote
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px shrink-0 self-stretch" style={{ background: S.border }} />

        {/* Right — QR + URL + instructions */}
        <div className="flex-grow flex flex-row items-center gap-8 min-w-0">

          {/* QR code */}
          <div className="shrink-0 rounded-2xl p-3 transition-opacity duration-300"
            style={{
              background: '#ffffff',
              border: `1px solid ${S.border}`,
              boxShadow: cardShadow,
              opacity: remoteAccessEnabled ? 1 : 0.3,
            }}>
            <QRCodeSVG
              value={remoteUrl || 'http://resonance.local'}
              size={148}
              bgColor="#ffffff"
              fgColor="#1a1918"
              level="M"
            />
          </div>

          {/* URL + instructions */}
          <div className="flex flex-col gap-5 min-w-0">
            <div>
              <p className="text-sm font-light tracking-[0.25em] uppercase mb-2" style={{ color: S.label }}>
                remote url
              </p>
              <p className="text-base font-medium break-all" style={{ color: S.strong }}>
                {remoteUrl || '—'}
              </p>
            </div>

            <div>
              <p className="text-sm font-light tracking-[0.25em] uppercase mb-2" style={{ color: S.label }}>
                how to connect
              </p>
              <div className="flex flex-col gap-2">
                {[
                  'Point your phone camera at the QR code',
                  'Open the link in your mobile browser',
                  'Both devices must be on the same Wi-Fi',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-sm font-light shrink-0 tabular-nums w-4" style={{ color: S.label }}>{i + 1}</span>
                    <span className="text-sm font-light" style={{ color: S.muted }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
