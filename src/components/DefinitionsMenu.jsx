import React, { useState, useEffect } from 'react';
import { Sliders, Music, Download, LogOut, Radio, Waves, Smartphone, Airplay, Network, Bluetooth, Music2, Languages } from 'lucide-react';
import { api } from '../api';
import { S } from '../styles/stone';
import { useI18n } from '../i18n';

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
  const { t, lang, setLang, langs } = useI18n();
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
    <div className="flex flex-row gap-6 font-sans h-full py-3 pr-4 pl-1 items-stretch select-none"
      style={{ color: S.strong }}>

      {/* 1. SPOTIFY CARD */}
      <button
        onClick={() => onSetSource('spotify')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'spotify' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '0ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>stream service</span>
        <div className="my-auto flex justify-center py-2">
          <svg viewBox="0 0 24 24" className="h-16 w-16 transition-all duration-300"
            style={{ fill: source === 'spotify' ? S.accent : S.track }}>
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/>
          </svg>
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'spotify' ? S.strong : S.muted }}>Spotify</span>
          {source === 'spotify' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* 2. LOCAL MUSIC CARD */}
      <button
        onClick={() => onSetSource('local')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'local' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '30ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>local system</span>
        <div className="my-auto flex justify-center py-2">
          <Music strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'local' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'local' ? S.strong : S.muted }}>Local</span>
          {source === 'local' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* 3. WEB RADIO CARD */}
      <button
        onClick={() => onSetSource('radio')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'radio' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '60ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>stream radio</span>
        <div className="my-auto flex justify-center py-2">
          <Radio strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'radio' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'radio' ? S.strong : S.muted }}>Radio</span>
          {source === 'radio' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* 4. AIRPLAY CARD */}
      <button
        onClick={() => onSetSource('airplay')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'airplay' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '90ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>apple airplay</span>
        <div className="my-auto flex justify-center py-2">
          <Airplay strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'airplay' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'airplay' ? S.strong : S.muted }}>AirPlay</span>
          {source === 'airplay' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* 5. UPNP / DLNA CARD */}
      <button
        onClick={() => onSetSource('upnp')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'upnp' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '120ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>upnp / dlna</span>
        <div className="my-auto flex justify-center py-2">
          <Network strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'upnp' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'upnp' ? S.strong : S.muted }}>UPnP</span>
          {source === 'upnp' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* 6. BLUETOOTH A2DP CARD */}
      <button
        onClick={() => onSetSource('bluetooth')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'bluetooth' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '150ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>bluetooth a2dp</span>
        <div className="my-auto flex justify-center py-2">
          <Bluetooth strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'bluetooth' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'bluetooth' ? S.strong : S.muted }}>Bluetooth</span>
          {source === 'bluetooth' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* 7. TIDAL CARD */}
      <button
        onClick={() => onSetSource('tidal')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'tidal' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '180ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>hifi streaming</span>
        <div className="my-auto flex justify-center py-2">
          <Music2 strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'tidal' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'tidal' ? S.strong : S.muted }}>Tidal</span>
          {source === 'tidal' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* 8. QOBUZ CARD */}
      <button
        onClick={() => onSetSource('qobuz')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'qobuz' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '210ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>lossless streaming</span>
        <div className="my-auto flex justify-center py-2">
          <Music strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: source === 'qobuz' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'qobuz' ? S.strong : S.muted }}>Qobuz</span>
          {source === 'qobuz' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>active</span>
          )}
        </div>
      </button>

      {/* THEME SETTINGS CARD */}
      <button
        onClick={handleCycleTheme}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '240ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>appearance</span>
        <div className="my-auto flex justify-center py-2">
          <Sliders strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>Theme</span>
          <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>settings</span>
        </div>
      </button>

      {/* 4b. ACOUSTIC PROFILE CARD */}
      <button
        onClick={onOpenDspWizard}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '120ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>acoustic profiler</span>
        <div className="my-auto flex justify-center py-2">
          <Waves strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>Acoustic</span>
          <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>calibrate</span>
        </div>
      </button>

      {/* 4c. REMOTE ACCESS CARD */}
      <button
        onClick={() => {
          if (onOpenRemoteAccess) onOpenRemoteAccess();
          else if (onToggleRemoteAccess) onToggleRemoteAccess(!remoteAccessEnabled);
        }}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          remoteAccessEnabled ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '150ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>access panel</span>
        <div className="my-auto flex justify-center py-2">
          <Smartphone strokeWidth={1} className="h-16 w-16 transition-all duration-300"
            style={{ color: remoteAccessEnabled ? S.accent : S.track,
                     opacity: remoteAccessEnabled ? 1 : 0.45 }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: remoteAccessEnabled ? S.strong : S.muted }}>Remote</span>
          <span className="text-sm font-normal tracking-wide"
            style={{ color: remoteAccessEnabled ? S.accent : S.label }}>
            {remoteAccessEnabled ? 'enabled' : 'off'}
          </span>
        </div>
      </button>

      {/* 5. UPDATE SYSTEM CARD */}
      <button
        onClick={handleUpdateClick}
        disabled={updateStatus === 'updating' || updateStatus === 'checking'}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '180ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>system firmware</span>
        <div className="my-auto flex justify-center py-2 w-full">
          {updateStatus === 'updating' ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[18px] font-black tracking-tight" style={{ color: S.strong }}>{otaPercent}%</span>
              <div className="w-16 h-0.5 rounded-full overflow-hidden" style={{ background: S.track }}>
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
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: updateStatus === 'available' ? S.strong : S.muted }}>Update</span>
          <span className="text-sm font-normal tracking-wide"
            style={{ color: updateStatus === 'available' ? S.accent : S.label }}>
            {updateStatus === 'checking'  && 'checking'}
            {updateStatus === 'updating'  && (otaPercent === 100 ? 'rebooting' : 'installing')}
            {updateStatus === 'available' && 'deploy'}
            {updateStatus === 'no-update' && 'up to date'}
            {updateStatus === null        && 'check'}
            {updateStatus === 'error'     && 'failed'}
          </span>
        </div>
      </button>

      {/* 5b. SYSTEM HEALTH CARD */}
      <div className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden menu-card menu-card-enter"
        style={{ animationDelay: '210ms' }}>
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>system metrics</span>
        <div className="flex flex-col gap-3 my-auto w-full">
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-light tracking-[0.2em]" style={{ color: S.label }}>cpu temp</span>
              <span className="text-xs font-bold"
                style={{ color: healthData.cpuTemp > 65 ? S.errorHot : S.strong }}>
                {healthData.cpuTemp}°
              </span>
            </div>
            <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: S.track }}>
              <div className="h-full transition-all duration-500"
                style={{ width: `${Math.min(100, (healthData.cpuTemp / 85) * 100)}%`,
                         background: healthData.cpuTemp > 65 ? S.errorHot : S.accent }} />
            </div>
          </div>
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-light tracking-[0.2em]" style={{ color: S.label }}>ram</span>
              <span className="text-xs font-bold" style={{ color: S.strong }}>{healthData.ramLoad}%</span>
            </div>
            <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: S.track }}>
              <div className="h-full transition-all duration-500"
                style={{ width: `${healthData.ramLoad}%`, background: S.accent }} />
            </div>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-light tracking-[0.2em]" style={{ color: S.label }}>wi-fi</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: healthData.wifiSignal > -70 ? '#4a7c59' : S.muted }} />
              <span className="text-sm font-semibold" style={{ color: S.strong }}>
                {healthData.wifiSignal > -50 ? 'Excellent' : healthData.wifiSignal > -70 ? 'Good' : 'Fair'}
              </span>
            </div>
          </div>
        </div>
        <span className="text-xs font-light tracking-[0.25em]" style={{ color: S.label }}>hardware health</span>
      </div>

      {/* 6. SPOTIFY DISCONNECT CARD */}
      {token && (
        <button
          onClick={handleLogout}
          className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
          style={{ animationDelay: '240ms' }}
        >
          <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>connections</span>
          <div className="my-auto flex justify-center py-2">
            <LogOut strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
              style={{ color: S.track }} />
          </div>
          <div className="flex items-baseline justify-between w-full">
            <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>Spotify</span>
            <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>sign out</span>
          </div>
        </button>
      )}

      {/* LANGUAGE CARD */}
      <div className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative overflow-hidden menu-card menu-card-enter"
        style={{ animationDelay: '270ms' }}>
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('lang.title')}</span>
        <div className="my-auto flex flex-col gap-2 w-full">
          {langs.map((l) => {
            const active = l.code === lang;
            return (
              <button key={l.code} onClick={() => setLang(l.code)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all active:scale-95 cursor-pointer"
                style={{
                  background: active ? S.accent : S.track,
                  color: active ? '#f5f3ef' : S.muted,
                }}>
                <span aria-hidden="true" className="text-base">{l.flag}</span>
                <span className="text-sm font-bold tracking-tight">{l.native}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <Languages strokeWidth={1.5} className="h-4 w-4" style={{ color: S.label }} />
          <span className="text-xs font-light tracking-[0.25em]" style={{ color: S.label }}>{t('lang.subtitle')}</span>
        </div>
      </div>

    </div>
  );
}
