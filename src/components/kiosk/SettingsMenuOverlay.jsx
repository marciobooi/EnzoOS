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
  } = useContext(Kk);

  useEffect(() => {
    if (isMenuOpen && !prevOpen.current) setAnimKey(k => k + 1);
    prevOpen.current = isMenuOpen;
  }, [isMenuOpen]);

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
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
            // Also call the proper service-start REST endpoint for the three daemon-based
            // sources; SET_SOURCE alone does not start shairport-sync/upmpdcli/bluealsa.
            const serviceStart = {
              airplay:   '/api/player/airplay/start',
              upnp:      '/api/player/upnp/start',
              bluetooth: '/api/player/bluetooth/start',
            };
            handleToggleSource(src);
            if (serviceStart[src]) {
              fetch(serviceStart[src], { method: 'POST' }).catch(() => {});
              // menu stays open — user connects from phone/app while card shows "active"
            } else {
              setIsMenuOpen(false);
            }
          }}
          updateStatus={updateStatus}
          setUpdateStatus={setUpdateStatus}
          errorMessage={errorMessage}
          setErrorMessage={setErrorMessage}
          onOpenDspWizard={() => {
            setIsDspWizardOpen(true);
            setIsMenuOpen(false);
          }}
          onOpenThemeSettings={() => {
            setIsThemeSettingsOpen(true);
            setIsMenuOpen(false);
          }}
          remoteAccessEnabled={remoteAccessEnabled}
          onToggleRemoteAccess={(enabled) => {
            setRemoteAccessEnabled(enabled);
            sendUpdate('SET_REMOTE_ACCESS', { enabled });
          }}
          onOpenRemoteAccess={async () => {
            // Open overlay immediately (z-[60] sits above this overlay's z-50)
            // then close the menu — no flash of the player view
            setIsRemoteAccessOpen(true);
            setIsMenuOpen(false);
            // URL fetch runs in background; QR updates once it resolves
            try {
              const r = await fetch('/api/system/lan-url');
              const d = await r.json();
              setRemoteUrl(d.url);
            } catch {
              setRemoteUrl(`http://${window.location.hostname}:5000/remote`);
            }
          }}
        />
      </div>
    </div>
  );
}
