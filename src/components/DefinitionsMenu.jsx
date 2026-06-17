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

  return (
    <div className="flex flex-row gap-6 font-sans text-zinc-100 h-full pb-3 pr-4 items-stretch select-none">
      
      {/* 1. SPOTIFY CARD */}
      <button
        onClick={() => {
          onSetSource('spotify');
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          source === 'spotify' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">STREAM SERVICE</span>
        
        <div className="my-auto flex justify-center py-2">
          <svg 
            viewBox="0 0 24 24" 
            className={`h-16 w-16 transition-all duration-300 ${
              source === 'spotify' ? 'fill-[var(--theme-color)] drop-shadow-[0_0_10px_var(--theme-color-glow)]' : 'fill-zinc-500 group-hover:fill-zinc-350'
            }`}
          >
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/>
          </svg>
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={source === 'spotify' ? 'text-white font-extrabold' : 'text-zinc-400'}>SPOTIFY</span>
          {source === 'spotify' && <span className="text-[var(--theme-color)] font-black">ACTIVE</span>}
        </div>
      </button>

      {/* 2. LOCAL MUSIC CARD */}
      <button
        onClick={() => {
          onSetSource('local');
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          source === 'local' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">LOCAL SYSTEM</span>
        
        <div className="my-auto flex justify-center py-2">
          <Music 
            className={`h-16 w-16 transition-all duration-300 ${
              source === 'local' ? 'text-[var(--theme-color)] drop-shadow-[0_0_10px_var(--theme-color-glow)]' : 'text-zinc-500 group-hover:text-zinc-350'
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={source === 'local' ? 'text-white font-extrabold' : 'text-zinc-400'}>LOCAL PLAYER</span>
          {source === 'local' && <span className="text-[var(--theme-color)] font-black">ACTIVE</span>}
        </div>
      </button>

      {/* 3. WEB RADIO CARD */}
      <button
        onClick={() => {
          onSetSource('radio');
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          source === 'radio' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">STREAM RADIO</span>
        
        <div className="my-auto flex justify-center py-2">
          <Radio 
            className={`h-16 w-16 transition-all duration-300 ${
              source === 'radio' ? 'text-[var(--theme-color)] drop-shadow-[0_0_10px_var(--theme-color-glow)]' : 'text-zinc-500 group-hover:text-zinc-350'
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={source === 'radio' ? 'text-white font-extrabold' : 'text-zinc-400'}>WEB RADIO</span>
          {source === 'radio' && <span className="text-[var(--theme-color)] font-black">ACTIVE</span>}
        </div>
      </button>

      {/* 4. CYCLE THEME CARD */}
      <button
        onClick={handleCycleTheme}
        className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card hover:scale-[1.01]"
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">APPEARANCE</span>
        
        <div className="my-auto flex justify-center py-2">
          <Sliders 
            className="h-16 w-16 text-zinc-500 group-hover:text-zinc-350 transition-colors"
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className="text-zinc-400">THEME SETTINGS</span>
          <span className="text-white font-extrabold">EDIT</span>
        </div>
      </button>

      {/* 4b. ACOUSTIC PROFILE CARD */}
      <button
        onClick={onOpenDspWizard}
        className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card hover:scale-[1.01]"
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">Acoustic Profiler</span>
        
        <div className="my-auto flex justify-center py-2">
          <Waves 
            className="h-16 w-16 text-zinc-500 group-hover:text-[var(--theme-color)] group-hover:drop-shadow-[0_0_10px_var(--theme-color-glow)] transition-all duration-300"
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className="text-zinc-400">DSP TUNING</span>
          <span className="text-white font-extrabold">WIZARD</span>
        </div>
      </button>

      {/* 4c. REMOTE ACCESS CONTROL CARD */}
      <button
        onClick={() => {
          if (onOpenRemoteAccess) onOpenRemoteAccess();
          else if (onToggleRemoteAccess) onToggleRemoteAccess(!remoteAccessEnabled);
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          remoteAccessEnabled ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">ACCESS PANEL</span>
        
        <div className="my-auto flex justify-center py-2">
          {remoteAccessEnabled ? (
            <Smartphone 
              className="h-16 w-16 text-[var(--theme-color)] drop-shadow-[0_0_10px_var(--theme-color-glow)] transition-all duration-300"
            />
          ) : (
            <Smartphone 
              className="h-16 w-16 text-zinc-500 opacity-40 group-hover:text-zinc-350 transition-colors"
            />
          )}
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={remoteAccessEnabled ? 'text-white font-extrabold' : 'text-zinc-400'}>REMOTE VIEW</span>
          <span className={remoteAccessEnabled ? 'text-[var(--theme-color)] font-black' : 'text-zinc-400'}>
            {remoteAccessEnabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>
      </button>

      {/* 5. UPDATE SYSTEM CARD */}
      <button
        onClick={handleUpdateClick}
        disabled={updateStatus === 'updating' || updateStatus === 'checking'}
        className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card hover:scale-[1.01]"
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">SYSTEM FIRMWARE</span>
        
        <div className="my-auto flex justify-center py-2 w-full">
          {updateStatus === 'updating' ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[12px] font-extrabold text-white">{otaPercent}%</span>
              <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-[var(--theme-color)] transition-all" style={{ width: `${otaPercent}%` }} />
              </div>
            </div>
          ) : (
            <Download 
              className={`h-16 w-16 transition-all duration-300 ${
                updateStatus === 'available' 
                  ? 'text-[var(--theme-color)] animate-bounce' 
                  : 'text-zinc-500 group-hover:text-zinc-350'
              }`}
            />
          )}
        </div>

        <div className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 text-center w-full">
          {updateStatus === 'checking' && 'CHECKING...'}
          {updateStatus === 'updating' && (otaPercent === 100 ? 'REBOOTING...' : 'UPDATING')}
          {updateStatus === 'available' && 'DEPLOY UPDATE'}
          {updateStatus === 'no-update' && 'UP TO DATE'}
          {updateStatus === null && 'CHECK UPDATE'}
          {updateStatus === 'error' && 'FAILED'}
        </div>
      </button>

      {/* 5b. SYSTEM HEALTH METRICS CARD */}
      <div className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden menu-card">
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">SYSTEM METRICS</span>
        
        <div className="flex flex-col gap-2.5 my-auto w-full">
          {/* CPU Temp */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-[9px] font-bold text-zinc-350">
              <span>CPU TEMP</span>
              <span className={healthData.cpuTemp > 65 ? 'text-red-400 font-extrabold' : 'text-zinc-200'}>
                {healthData.cpuTemp}°C
              </span>
            </div>
            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  healthData.cpuTemp > 65 ? 'bg-red-500' : 'bg-[var(--theme-color)]'
                }`}
                style={{ width: `${Math.min(100, (healthData.cpuTemp / 85) * 100)}%` }} 
              />
            </div>
          </div>

          {/* RAM Usage */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-[9px] font-bold text-zinc-350">
              <span>RAM USAGE</span>
              <span className="text-zinc-200">{healthData.ramLoad}%</span>
            </div>
            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--theme-color)] transition-all duration-500" 
                style={{ width: `${healthData.ramLoad}%` }} 
              />
            </div>
          </div>

          {/* Wi-Fi Signal */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-[9px] font-bold text-zinc-350">
              <span>WI-FI STRENGTH</span>
              <span className="text-zinc-200">{healthData.wifiSignal} dBm</span>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] font-bold tracking-wider text-zinc-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {healthData.wifiSignal > -50 ? 'EXCELLENT' : healthData.wifiSignal > -70 ? 'GOOD' : 'FAIR'}
              </span>
            </div>
          </div>
        </div>

        <div className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 text-center w-full">
          HARDWARE HEALTH
        </div>
      </div>

      {/* 6. SPOTIFY LOGOUT/LINK DISCONNECT */}
      {token && (
        <button
          onClick={handleLogout}
          className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card hover:scale-[1.01] hover:border-rose-500/50"
        >
          <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">CONNECTIONS</span>
          
          <div className="my-auto flex justify-center py-2">
            <LogOut 
              className="h-16 w-16 text-zinc-500 group-hover:text-rose-500 transition-colors"
            />
          </div>

          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 text-center w-full">
            DISCONNECT SPOTIFY
          </div>
        </button>
      )}

    </div>
  );
}
