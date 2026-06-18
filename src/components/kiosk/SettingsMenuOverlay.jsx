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
          className="cursor-pointer text-[10px] font-extrabold font-sans px-3.5 py-1 rounded-lg transition-all active:scale-95"
          style={{
            color: '#3a3836',
            background: '#d2d3ce',
            border: '1px solid #c5c4c0',
            boxShadow: '2px 2px 5px #b8b9b4, -2px -2px 5px #ecede8',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '1px 1px 3px #b8b9b4, -1px -1px 3px #ecede8'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '2px 2px 5px #b8b9b4, -2px -2px 5px #ecede8'}
          onMouseDown={e => e.currentTarget.style.boxShadow = 'inset 2px 2px 4px #b0b1ac, inset -2px -2px 4px #d8d9d4'}
          onMouseUp={e => e.currentTarget.style.boxShadow = '2px 2px 5px #b8b9b4, -2px -2px 5px #ecede8'}
        >
          CLOSE [X]
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
