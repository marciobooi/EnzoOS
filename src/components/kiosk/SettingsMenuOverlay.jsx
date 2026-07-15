import { useContext, useState, useEffect, useRef } from 'react';
import { Kk } from './KioskContext';
import DefinitionsMenu from '../DefinitionsMenu';

export default function SettingsMenuOverlay() {
  const [animKey, setAnimKey] = useState(0);
  const prevOpen = useRef(false);
  const {
    isMenuOpen,
    setIsMenuOpen,
    token,
    handleLogout,
    devices,
    isFetchingDevices,
    transferPlayback,
    fetchDevices,
    theme,
    handleThemeColorChange,
    otaProgress,
    setOtaProgress,
    otaPercent,
    setOtaPercent,
    source,
    handleToggleSource,
    updateStatus,
    setUpdateStatus,
    errorMessage,
    setErrorMessage,
    setIsDspWizardOpen,
    setIsThemeSettingsOpen,
    remoteAccessEnabled,
    setRemoteAccessEnabled,
    sendUpdate,
    setIsRemoteAccessOpen,
    setRemoteUrl,
    setRemoteHostUrl,
    setIsWifiOpen,
    setIsSystemAdminOpen,
  } = useContext(Kk);

  useEffect(() => {
    if (isMenuOpen && !prevOpen.current) setAnimKey(k => k + 1);
    prevOpen.current = isMenuOpen;
  }, [isMenuOpen]);

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-50 transform overlay-pop flex flex-col p-5 font-sans ${
        isMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{
        background: '#cbccc7',
        border: '1px solid #bbbcb8',
      }}
    >
      {/* Header & Close Button */}
      <div className="flex justify-between items-center mb-3 select-none shrink-0">
        <h4 className="text-sm font-light tracking-[0.25em] uppercase underline underline-offset-8 decoration-[#2a2826] decoration-1"
          style={{ color: '#9a9896' }}>
          System Configuration Control Panel
        </h4>
        <button
          onClick={() => setIsMenuOpen(false)}
          className="cursor-pointer text-sm font-extrabold font-sans px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80"
          style={{
            color: '#f0eeea',
            background: '#2a2826',
            border: 'none',
          }}
        >
          CLOSE
        </button>
      </div>

      {/* Horizontally Scrollable Content */}
      <div className="flex-grow overflow-x-auto overflow-y-hidden stone-scrollbar">
        <DefinitionsMenu key={animKey}
          isMenuOpen={isMenuOpen}
          token={token}
          handleLogout={handleLogout}
          devices={devices}
          isFetchingDevices={isFetchingDevices}
          onTransferPlayback={transferPlayback}
          onRefreshDevices={fetchDevices}
          theme={theme}
          onThemeChange={handleThemeColorChange}
          otaProgress={otaProgress}
          setOtaProgress={setOtaProgress}
          otaPercent={otaPercent}
          setOtaPercent={setOtaPercent}
          source={source}
          onSetSource={(src) => {
            // Direct-play sources: switch and close the menu immediately.
            // Streaming receiver sources (AirPlay, UPnP, BT, Tidal, Qobuz): keep the
            // menu open — the user still needs to connect from another device.
            // The server's SET_SOURCE handler now starts the daemon
            // (shairport-sync/upmpdcli/bluealsa) and wakes standby, so a single
            // handleToggleSource covers both the kiosk and the phone remote — no
            // separate REST /start call (which caused a stop/start churn).
            const receiverSources = ['airplay', 'upnp', 'bluetooth', 'tidal', 'qobuz'];
            handleToggleSource(src);
            if (!receiverSources.includes(src)) {
              setIsMenuOpen(false);
            }
            // else: menu stays open — user connects from phone/app while card shows "active"
          }}
          updateStatus={updateStatus}
          setUpdateStatus={setUpdateStatus}
          errorMessage={errorMessage}
          setErrorMessage={setErrorMessage}
          onOpenDspWizard={() => {
            // Leave the Definitions Menu open underneath (z-[60] sub-panels
            // already stack above this overlay's z-50, so nothing "flashes"
            // through) — closing it here meant the menu was already gone by
            // the time the user closed the sub-panel, dropping them straight
            // to the Player view instead of back to the Definitions Menu.
            setIsDspWizardOpen(true);
          }}
          onOpenThemeSettings={() => {
            setIsThemeSettingsOpen(true);
          }}
          remoteAccessEnabled={remoteAccessEnabled}
          onToggleRemoteAccess={(enabled) => {
            setRemoteAccessEnabled(enabled);
            sendUpdate('SET_REMOTE_ACCESS', { enabled });
          }}
          onOpenRemoteAccess={async () => {
            setIsRemoteAccessOpen(true);
            // URL fetch runs in background; QR updates once it resolves
            try {
              const r = await fetch('/api/system/lan-url');
              const d = await r.json();
              setRemoteUrl(d.url);
              if (d.hostUrl) setRemoteHostUrl(d.hostUrl);
            } catch {
              setRemoteUrl(`http://${window.location.hostname}:5000/remote`);
            }
          }}
          onOpenWifi={() => {
            setIsWifiOpen(true);
          }}
          onOpenSystemAdmin={() => {
            setIsSystemAdminOpen(true);
          }}
        />
      </div>
    </div>
  );
}
