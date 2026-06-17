import { useContext } from 'react';
import { Kk } from './KioskContext';
import DefinitionsMenu from '../DefinitionsMenu';

export default function SettingsMenuOverlay() {
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

  return (
    <div
      className={`absolute inset-0 bg-[#060c1a] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
        isMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      {/* Header & Close Button */}
      <div className="flex justify-between items-center mb-3 select-none shrink-0">
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">System Configuration Control Panel</h4>
        <button
          onClick={() => setIsMenuOpen(false)}
          className="text-zinc-300 hover:text-white transition-colors cursor-pointer text-[10px] font-extrabold font-sans px-3.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 shadow-sm active:scale-95"
        >
          CLOSE [X]
        </button>
      </div>

      {/* Horizontally Scrollable Content */}
      <div className="flex-grow overflow-x-auto overflow-y-hidden custom-scrollbar">
        <DefinitionsMenu
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
