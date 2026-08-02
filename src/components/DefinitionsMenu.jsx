import { useState, useEffect } from 'react';
import { Sliders, Music, Download, LogOut, Radio, Waves, Smartphone, Airplay, Network, Bluetooth, Music2, Languages, Sparkles, Wifi, HardDrive, Mic2 } from 'lucide-react';
import { api } from '../api';
import { S } from '../styles/stone';
import { useI18n } from '../i18n';

export default function DefinitionsMenu({
  isMenuOpen,
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
  setErrorMessage,
  onOpenDspWizard,
  onOpenThemeSettings,
  remoteAccessEnabled = true,
  onToggleRemoteAccess,
  onOpenRemoteAccess,
  onOpenWifi,
  onOpenSystemAdmin
}) {
  const { t, lang, setLang, langs } = useI18n();
  // Local health metrics state
  const [healthData, setHealthData] = useState({ cpuTemp: 40, ramLoad: 30, wifiSignal: -60 });

  // Auto check updates on mount. Deliberately mount-only: the effect itself
  // drives updateStatus through checking → available/no-update, so listing
  // updateStatus as a dependency would re-trigger the check it just ran.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Poll system health metrics — only while this panel is actually visible.
  // DefinitionsMenu stays mounted at all times (SettingsMenuOverlay just
  // toggles opacity/scale for the fade transition), so without this gate the
  // health endpoint got hit every 5s for the kiosk's entire uptime even
  // though the numbers are only ever looked at while the panel is open.
  useEffect(() => {
    if (!isMenuOpen) return;

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
  }, [isMenuOpen]);

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
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'spotify' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '0ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.streamService')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <svg viewBox="0 0 24 24" className="h-16 w-16 transition-colors duration-300"
            style={{ fill: source === 'spotify' ? S.accent : S.track }}>
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/>
          </svg>
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'spotify' ? S.strong : S.muted }}>Spotify</span>
          {source === 'spotify' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 2. LOCAL MUSIC CARD */}
      <button
        onClick={() => onSetSource('local')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'local' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '30ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.localSystem')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Music strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'local' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'local' ? S.strong : S.muted }}>Local</span>
          {source === 'local' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 3. WEB RADIO CARD */}
      <button
        onClick={() => onSetSource('radio')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'radio' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '60ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.streamRadio')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Radio strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'radio' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'radio' ? S.strong : S.muted }}>Radio</span>
          {source === 'radio' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 3b. AI DJ CARD — a self-contained source that plays its own local-
          library playlist with a locally-generated (Ollama) + locally-
          synthesized (Piper TTS) voice announcer between tracks. See
          server/dj.js for the whole feature — this card and its
          onSetSource('dj') call are the only touches in this file. */}
      <button
        onClick={() => onSetSource('dj')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'dj' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '75ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.djMode')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Mic2 strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'dj' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'dj' ? S.strong : S.muted }}>DJ</span>
          {source === 'dj' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 4. AIRPLAY CARD */}
      <button
        onClick={() => onSetSource('airplay')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'airplay' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '90ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.appleAirplay')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Airplay strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'airplay' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'airplay' ? S.strong : S.muted }}>AirPlay</span>
          {source === 'airplay' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 5. UPNP / DLNA CARD */}
      <button
        onClick={() => onSetSource('upnp')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'upnp' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '120ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.upnpDlna')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Network strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'upnp' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'upnp' ? S.strong : S.muted }}>UPnP</span>
          {source === 'upnp' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 6. BLUETOOTH A2DP CARD */}
      <button
        onClick={() => onSetSource('bluetooth')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'bluetooth' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '150ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.bluetoothA2dp')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Bluetooth strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'bluetooth' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'bluetooth' ? S.strong : S.muted }}>Bluetooth</span>
          {source === 'bluetooth' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 7. TIDAL CARD */}
      <button
        onClick={() => onSetSource('tidal')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'tidal' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '180ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.hifiStreaming')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Music2 strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'tidal' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'tidal' ? S.strong : S.muted }}>Tidal</span>
          {source === 'tidal' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* 8. QOBUZ CARD */}
      <button
        onClick={() => onSetSource('qobuz')}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          source === 'qobuz' ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '210ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.losslessStreaming')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Music strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: source === 'qobuz' ? S.accent : S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: source === 'qobuz' ? S.strong : S.muted }}>Qobuz</span>
          {source === 'qobuz' && (
            <span className="text-sm font-normal tracking-wide" style={{ color: S.accent }}>{t('kiosk.active')}</span>
          )}
        </div>
      </button>

      {/* THEME SETTINGS CARD */}
      <button
        onClick={handleCycleTheme}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '240ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.appearance')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Sliders strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>{t('kiosk.theme')}</span>
          <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>{t('kiosk.settings')}</span>
        </div>
      </button>

      {/* 4b. ACOUSTIC PROFILE CARD */}
      <button
        onClick={onOpenDspWizard}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '120ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.acousticProfiler')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Waves strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>{t('kiosk.acoustic')}</span>
          <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>{t('kiosk.calibrate')}</span>
        </div>
      </button>

      {/* 4b2. RUN SETUP WIZARD CARD — re-opens the first-boot WelcomeWizard on demand */}
      <button
        onClick={() => window.dispatchEvent(new Event('resonance:show-welcome'))}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '135ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.setupWizard')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Sparkles strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>{t('kiosk.setup')}</span>
          <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>{t('kiosk.run')}</span>
        </div>
      </button>

      {/* 4c. REMOTE ACCESS CARD */}
      <button
        onClick={() => {
          if (onOpenRemoteAccess) onOpenRemoteAccess();
          else if (onToggleRemoteAccess) onToggleRemoteAccess(!remoteAccessEnabled);
        }}
        className={`w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card-enter ${
          remoteAccessEnabled ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
        style={{ animationDelay: '150ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.accessPanel')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Smartphone strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: remoteAccessEnabled ? S.accent : S.track,
                     opacity: remoteAccessEnabled ? 1 : 0.45 }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: remoteAccessEnabled ? S.strong : S.muted }}>{t('kiosk.remote')}</span>
          <span className="text-sm font-normal tracking-wide"
            style={{ color: remoteAccessEnabled ? S.accent : S.label }}>
            {remoteAccessEnabled ? t('kiosk.enabled') : t('kiosk.off')}
          </span>
        </div>
      </button>

      {/* 4d. WI-FI CARD */}
      <button
        onClick={onOpenWifi}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '165ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('net.wifi')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <Wifi strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>{t('net.wifi')}</span>
          <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>{t('net.connect')}</span>
        </div>
      </button>

      {/* 4e. SYSTEM ADMIN CARD */}
      <button
        onClick={onOpenSystemAdmin}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '172ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('settings.systemAdmin')}</span>
        <div className="my-auto flex justify-center py-2 icon-badge">
          <HardDrive strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
            style={{ color: S.track }} />
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>{t('settings.system')}</span>
          <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>{t('settings.systemControl')}</span>
        </div>
      </button>

      {/* 5. UPDATE SYSTEM CARD */}
      <button
        onClick={handleUpdateClick}
        disabled={updateStatus === 'updating' || updateStatus === 'checking'}
        className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
        style={{ animationDelay: '180ms' }}
      >
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.systemFirmware')}</span>
        <div className="my-auto flex justify-center py-2 w-full">
          {updateStatus === 'updating' ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[18px] font-black tracking-tight" style={{ color: S.strong }}>{otaPercent}%</span>
              <div className="w-16 h-0.5 rounded-full overflow-hidden" style={{ background: S.track }}>
                <div className="h-full transition-all" style={{ width: `${otaPercent}%`, background: S.accent }} />
              </div>
            </div>
          ) : (
            <Download className="h-16 w-16 transition-colors duration-300"
              style={{ color: updateStatus === 'available' ? S.accent : S.track }}
              strokeWidth={updateStatus === 'available' ? 1.5 : 1}
            />
          )}
        </div>
        <div className="flex items-baseline justify-between w-full">
          <span className="text-lg font-black tracking-tight leading-none"
            style={{ color: updateStatus === 'available' ? S.strong : S.muted }}>{t('kiosk.update')}</span>
          <span className="text-sm font-normal tracking-wide"
            style={{ color: updateStatus === 'available' ? S.accent : S.label }}>
            {updateStatus === 'checking'  && t('kiosk.checking')}
            {updateStatus === 'updating'  && (otaPercent === 100 ? t('kiosk.rebooting') : t('kiosk.installing'))}
            {updateStatus === 'available' && t('kiosk.deploy')}
            {updateStatus === 'no-update' && t('kiosk.upToDate')}
            {updateStatus === null        && t('kiosk.check')}
            {updateStatus === 'error'     && t('kiosk.failed')}
          </span>
        </div>
      </button>

      {/* 5b. SYSTEM HEALTH CARD */}
      <div className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden menu-card menu-card-enter"
        style={{ animationDelay: '210ms' }}>
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.systemMetrics')}</span>
        <div className="flex flex-col gap-3 my-auto w-full">
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-light tracking-[0.2em]" style={{ color: S.label }}>{t('kiosk.cpuTemp')}</span>
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
              <span className="text-xs font-light tracking-[0.2em]" style={{ color: S.label }}>{t('kiosk.ram')}</span>
              <span className="text-xs font-bold" style={{ color: S.strong }}>{healthData.ramLoad}%</span>
            </div>
            <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: S.track }}>
              <div className="h-full transition-all duration-500"
                style={{ width: `${healthData.ramLoad}%`, background: S.accent }} />
            </div>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-light tracking-[0.2em]" style={{ color: S.label }}>{t('kiosk.wifi')}</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: healthData.wifiSignal > -70 ? '#4a7c59' : S.muted }} />
              <span className="text-sm font-semibold" style={{ color: S.strong }}>
                {healthData.wifiSignal > -50 ? t('kiosk.excellent') : healthData.wifiSignal > -70 ? t('kiosk.good') : t('kiosk.fair')}
              </span>
            </div>
          </div>
        </div>
        <span className="text-xs font-light tracking-[0.25em]" style={{ color: S.label }}>{t('kiosk.hardwareHealth')}</span>
      </div>

      {/* 6. SPOTIFY DISCONNECT CARD */}
      {token && (
        <button
          onClick={handleLogout}
          className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative group overflow-hidden cursor-pointer menu-card menu-card-enter hover:scale-[1.01]"
          style={{ animationDelay: '240ms' }}
        >
          <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>{t('kiosk.connections')}</span>
          <div className="my-auto flex justify-center py-2 icon-badge">
            <LogOut strokeWidth={1} className="h-16 w-16 transition-colors duration-300"
              style={{ color: S.track }} />
          </div>
          <div className="flex items-baseline justify-between w-full">
            <span className="text-lg font-black tracking-tight leading-none" style={{ color: S.muted }}>Spotify</span>
            <span className="text-sm font-normal tracking-wide" style={{ color: S.label }}>{t('kiosk.signOut')}</span>
          </div>
        </button>
      )}

      {/* LANGUAGE CARD */}
      <div className="w-[180px] shrink-0 p-2 rounded-2xl text-left flex flex-col justify-between transition-transform duration-300 relative overflow-hidden menu-card menu-card-enter"
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
