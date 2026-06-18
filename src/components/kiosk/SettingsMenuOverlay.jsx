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
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em]"
          style={{ color: '#9a9896' }}>
          System Configuration Control Panel
        </h4>
        <button
          onClick={() => setIsMenuOpen(false)}
          className="cursor-pointer text-[10px] font-extrabold font-sans px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80"
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
            handleToggleSource(src);
            setIsMenuOpen(false);
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
            setIsMenuOpen(false);
            try {
              const r = await fetch('/api/system/lan-url');
              const d = await r.json();
              setRemoteUrl(d.url);
            } catch {
              setRemoteUrl(`http://${window.location.hostname}:5000/remote`);
            }
            setIsRemoteAccessOpen(true);
          }}
        />
      </div>
    </div>
  );
}
