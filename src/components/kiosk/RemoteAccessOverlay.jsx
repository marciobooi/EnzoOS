import { useContext } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Kk } from './KioskContext';

export default function RemoteAccessOverlay() {
  const {
    isRemoteAccessOpen,
    setIsRemoteAccessOpen,
    remoteUrl,
    remoteAccessEnabled,
    setRemoteAccessEnabled,
    sendUpdate,
  } = useContext(Kk);

  return (
    <div
      className={`absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-[60] transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
        isRemoteAccessOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <div className="flex justify-between items-center mb-4 select-none shrink-0">
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">Remote Access Panel</h4>
        <button
          onClick={() => setIsRemoteAccessOpen(false)}
          className="text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer text-[10px] font-extrabold font-sans px-3.5 py-1 rounded-lg bg-white border border-zinc-250 shadow-sm active:scale-95"
        >
          CLOSE [X]
        </button>
      </div>

      <div className="flex-grow flex flex-row gap-8 items-center min-h-0">
        {/* Left: status + enable/disable */}
        <div className="flex flex-col gap-4 shrink-0 w-52">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${remoteAccessEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-200">
              {remoteAccessEnabled ? 'Access Enabled' : 'Access Disabled'}
            </span>
          </div>
          <p className="text-[9px] text-zinc-500 leading-relaxed">
            Allow mobile devices on the same network to connect and control this player.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setRemoteAccessEnabled(true); sendUpdate('SET_REMOTE_ACCESS', { enabled: true }); }}
              className={`py-2.5 px-4 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                remoteAccessEnabled
                  ? 'bg-[var(--theme-color)] text-black shadow-[0_0_12px_var(--theme-color-glow)]'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              Enable Remote
            </button>
            <button
              onClick={() => { setRemoteAccessEnabled(false); sendUpdate('SET_REMOTE_ACCESS', { enabled: false }); }}
              className={`py-2.5 px-4 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                !remoteAccessEnabled
                  ? 'bg-red-500/80 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              Disable Remote
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-white/5 shrink-0" />

        {/* Right: QR code + URL + instructions */}
        <div className="flex-grow flex flex-row items-center gap-10">
          <div className={`p-3 rounded-2xl shrink-0 transition-opacity duration-300 ${remoteAccessEnabled ? 'bg-white opacity-100' : 'bg-zinc-800 opacity-30'}`}>
            <QRCodeSVG
              value={remoteUrl}
              size={148}
              bgColor={remoteAccessEnabled ? '#ffffff' : '#1f2937'}
              fgColor="#000000"
              level="M"
            />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 mb-1.5">Remote URL</p>
              <p className="text-[11px] font-mono text-[var(--theme-color)] break-all">{remoteUrl}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 mb-0.5">How to connect</p>
              <p className="text-[9px] text-zinc-400">1 · Point your phone camera at the QR code</p>
              <p className="text-[9px] text-zinc-400">2 · Open the link in your mobile browser</p>
              <p className="text-[9px] text-zinc-400">3 · Both devices must be on the same Wi-Fi</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
