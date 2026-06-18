import React, { useState, useEffect } from 'react';
import { Sliders, Music, Download, LogOut, Radio, Waves, Smartphone, ShieldCheck } from 'lucide-react';
import { api } from '../api';

export default function DefinitionsMenu({
  token,
  handleLogout,
  theme,
  onThemeChange,
  source,
  onSetSource,
  updateStatus,
  setUpdateStatus,
  otaPercent,
  setOtaPercent,
  setOtaProgress,
  errorMessage,
  setErrorMessage,
  onOpenDspWizard,
  onOpenThemeSettings,
  remoteAccessEnabled = true,
  onToggleRemoteAccess,
  onOpenRemoteAccess
}) {
  // Local health metrics state
  const [healthData, setHealthData] = useState({ cpuTemp: 40, ramLoad: 30, wifiSignal: -60 });

  // Auto check updates on mount
  useEffect(() => {
    const checkInitialUpdates = async () => {
      try {
        if (updateStatus !== 'updating') {
          setUpdateStatus('checking');
          const data = await api.getUpdateStatus();
          if (data.updateAvailable) {
            setUpdateStatus('available');
          } else {
            setUpdateStatus('no-update');
          }
        }
      } catch (err) {
        console.warn('Initial update check failed, defaulting to up-to-date status:', err);
        setUpdateStatus('no-update');
      }
    };

    checkInitialUpdates();
  }, [setUpdateStatus]);

  // Poll system health metrics
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await api.getSystemHealth();
        if (data.success) {
          setHealthData({
            cpuTemp: data.cpuTemp,
            ramLoad: data.ramLoad,
            wifiSignal: data.wifiSignal
          });
        }
      } catch (err) {
        console.warn('Failed to fetch hardware health telemetry:', err);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Theme Cycler Logic
  const themesList = ['amber', 'emerald', 'cyan', 'amethyst', 'ruby'];
  const handleCycleTheme = () => {
    if (onOpenThemeSettings) {
      onOpenThemeSettings();
      return;
    }
    const currentIdx = themesList.indexOf(theme || 'amber');
    const nextTheme = themesList[(currentIdx + 1) % themesList.length];
    onThemeChange(nextTheme);
  };

  // OTA update check / execute
  const handleUpdateClick = async () => {
    if (updateStatus === 'available') {
      try {
        if (setOtaProgress) setOtaProgress([]);
        if (setOtaPercent) setOtaPercent(0);
        setUpdateStatus('updating');
        localStorage.setItem('resonance_updating', 'true');
        await api.triggerUpdate();
      } catch (err) {
        localStorage.removeItem('resonance_updating');
        setUpdateStatus('error');
        setErrorMessage(err.message || 'Update failed.');
      }
    } else if (updateStatus !== 'updating' && updateStatus !== 'checking') {
      try {
        setUpdateStatus('checking');
        const data = await api.getUpdateStatus();
        if (data.updateAvailable) {
          setUpdateStatus('available');
        } else {
          setUpdateStatus('no-update');
        }
      } catch (err) {
        console.warn('Manual update check failed, defaulting to up-to-date status:', err);
        setUpdateStatus('no-update');
      }
    }
  };

  // ── Stone palette tokens ────────────────────────────────────────────────────
  const S = {
    label:    '#9a9896', // category labels (tertiary)
    text:     '#3a3836', // body text (secondary)
    strong:   '#1a1918', // primary / active text
    muted:    '#6a6866', // helper text
    accent:   '#2a2826', // active indicator / ACTIVE badge
    track:    '#c5c4c0', // progress bar track
    errorHot: '#7a3535', // CPU overtemp
  };

  return (
    <div className="flex flex-row gap-6 font-sans h-full py-3 pr-4 pl-1 items-stretch select-none"
      style={{ color: S.strong }}>

      {/* 1. SPOTIFY CARD */}
      <button
        onClick={() => onSetSource('spotify')}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'spotify' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '0ms' }}
      >
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>STREAM SERVICE</span>

        <div className="my-auto flex justify-center py-2">
          <svg viewBox="0 0 24 24"
            className="h-16 w-16 transition-all duration-300"
            style={{ fill: source === 'spotify' ? S.accent : S.track }}
          >
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/>
          </svg>
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span style={{ color: source === 'spotify' ? S.strong : S.muted }} className="font-extrabold">SPOTIFY</span>
          {source === 'spotify' && <span className="font-black" style={{ color: S.accent }}>ACTIVE</span>}
        </div>
      </button>

      {/* 2. LOCAL MUSIC CARD */}
      <button
        onClick={() => onSetSource('local')}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'local' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '30ms' }}
      >
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>LOCAL SYSTEM</span>

        <div className="my-auto flex justify-center py-2">
          <Music strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'local' ? S.accent : S.track }} />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span style={{ color: source === 'local' ? S.strong : S.muted }} className="font-extrabold">LOCAL PLAYER</span>
          {source === 'local' && <span className="font-black" style={{ color: S.accent }}>ACTIVE</span>}
        </div>
      </button>

      {/* 3. WEB RADIO CARD */}
      <button
        onClick={() => onSetSource('radio')}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'radio' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '60ms' }}
      >
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>STREAM RADIO</span>

        <div className="my-auto flex justify-center py-2">
          <Radio strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'radio' ? S.accent : S.track }} />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span style={{ color: source === 'radio' ? S.strong : S.muted }} className="font-extrabold">WEB RADIO</span>
          {source === 'radio' && <span className="font-black" style={{ color: S.accent }}>ACTIVE</span>}
        </div>
      </button>

      {/* 4. THEME SETTINGS CARD */}
      <button
        onClick={handleCycleTheme}
        className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '90ms' }}
      >
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>APPEARANCE</span>

        <div className="my-auto flex justify-center py-2">
          <Sliders strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: S.track }} />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span style={{ color: S.muted }}>THEME SETTINGS</span>
          <span style={{ color: S.strong }} className="font-extrabold">EDIT</span>
        </div>
      </button>

      {/* 4b. ACOUSTIC PROFILE CARD */}
      <button
        onClick={onOpenDspWizard}
        className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '120ms' }}
      >
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>ACOUSTIC PROFILER</span>

        <div className="my-auto flex justify-center py-2">
          <Waves strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: S.track }} />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span style={{ color: S.muted }}>DSP TUNING</span>
          <span style={{ color: S.strong }} className="font-extrabold">WIZARD</span>
        </div>
      </button>

      {/* 4c. REMOTE ACCESS CARD */}
      <button
        onClick={() => {
          if (onOpenRemoteAccess) onOpenRemoteAccess();
          else if (onToggleRemoteAccess) onToggleRemoteAccess(!remoteAccessEnabled);
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          remoteAccessEnabled ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '150ms' }}
      >
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>ACCESS PANEL</span>

        <div className="my-auto flex justify-center py-2">
          <Smartphone strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: remoteAccessEnabled ? S.accent : S.track,
                     opacity: remoteAccessEnabled ? 1 : 0.5 }} />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span style={{ color: remoteAccessEnabled ? S.strong : S.muted }} className="font-extrabold">REMOTE VIEW</span>
          <span style={{ color: remoteAccessEnabled ? S.accent : S.label }} className="font-black">
            {remoteAccessEnabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>
      </button>

      {/* 5. UPDATE SYSTEM CARD */}
      <button
        onClick={handleUpdateClick}
        disabled={updateStatus === 'updating' || updateStatus === 'checking'}
        className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '180ms' }}
      >
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>SYSTEM FIRMWARE</span>

        <div className="my-auto flex justify-center py-2 w-full">
          {updateStatus === 'updating' ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[12px] font-extrabold" style={{ color: S.strong }}>{otaPercent}%</span>
              <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: S.track }}>
                <div className="h-full transition-all" style={{ width: `${otaPercent}%`, background: S.accent }} />
              </div>
            </div>
          ) : (
            <Download className="h-16 w-16 transition-all duration-300"
              style={{ color: updateStatus === 'available' ? S.accent : S.track }}
              strokeWidth={updateStatus === 'available' ? 1.5 : 1}
            />
          )}
        </div>

        <div className="text-[9px] font-extrabold uppercase tracking-wider text-center w-full"
          style={{ color: updateStatus === 'available' ? S.accent : S.muted }}>
          {updateStatus === 'checking'  && 'CHECKING...'}
          {updateStatus === 'updating'  && (otaPercent === 100 ? 'REBOOTING...' : 'UPDATING')}
          {updateStatus === 'available' && 'DEPLOY UPDATE'}
          {updateStatus === 'no-update' && 'UP TO DATE'}
          {updateStatus === null        && 'CHECK UPDATE'}
          {updateStatus === 'error'     && 'FAILED'}
        </div>
      </button>

      {/* 5b. SYSTEM HEALTH CARD */}
      <div className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden menu-card menu-card-enter"
        style={{ animationDelay: '210ms' }}>
        <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>SYSTEM METRICS</span>

        <div className="flex flex-col gap-2.5 my-auto w-full">
          {/* CPU Temp */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-[9px] font-bold" style={{ color: S.muted }}>
              <span>CPU TEMP</span>
              <span style={{ color: healthData.cpuTemp > 65 ? S.errorHot : S.strong }}
                className={healthData.cpuTemp > 65 ? 'font-extrabold' : ''}>
                {healthData.cpuTemp}°C
              </span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: S.track }}>
              <div className="h-full transition-all duration-500"
                style={{ width: `${Math.min(100, (healthData.cpuTemp / 85) * 100)}%`,
                         background: healthData.cpuTemp > 65 ? S.errorHot : S.accent }} />
            </div>
          </div>

          {/* RAM Usage */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-[9px] font-bold" style={{ color: S.muted }}>
              <span>RAM USAGE</span>
              <span style={{ color: S.strong }}>{healthData.ramLoad}%</span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: S.track }}>
              <div className="h-full transition-all duration-500"
                style={{ width: `${healthData.ramLoad}%`, background: S.accent }} />
            </div>
          </div>

          {/* Wi-Fi Signal */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-[9px] font-bold" style={{ color: S.muted }}>
              <span>WI-FI STRENGTH</span>
              <span style={{ color: S.strong }}>{healthData.wifiSignal} dBm</span>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] font-bold tracking-wider" style={{ color: S.muted }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: healthData.wifiSignal > -70 ? '#4a7c59' : S.muted }} />
              <span>{healthData.wifiSignal > -50 ? 'EXCELLENT' : healthData.wifiSignal > -70 ? 'GOOD' : 'FAIR'}</span>
            </div>
          </div>
        </div>

        <div className="text-[9px] font-extrabold uppercase tracking-wider text-center w-full" style={{ color: S.label }}>
          HARDWARE HEALTH
        </div>
      </div>

      {/* 6. SPOTIFY DISCONNECT CARD */}
      {token && (
        <button
          onClick={handleLogout}
          className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
          style={{ animationDelay: '240ms' }}
        >
          <span className="text-[9px] font-extrabold tracking-widest uppercase" style={{ color: S.label }}>CONNECTIONS</span>

          <div className="my-auto flex justify-center py-2">
            <LogOut strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
              style={{ color: S.track }} />
          </div>

          <div className="text-[9px] font-bold uppercase tracking-wider text-center w-full" style={{ color: S.muted }}>
            DISCONNECT SPOTIFY
          </div>
        </button>
      )}

    </div>
  );
}
