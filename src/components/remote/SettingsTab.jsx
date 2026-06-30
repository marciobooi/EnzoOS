import { useContext, useState, useRef, useEffect } from 'react';
import {
  Sliders, Cpu, Timer, Palette, Power, LogOut, Laptop,
  Music, RefreshCw, Smartphone, Disc3, Wifi, HardDrive,
  RotateCcw, Download, FlipHorizontal, Scale, Sparkles,
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { reportError } from '../../lib/errors';
import { Tk, Row, Section, SpotifyIcon } from './shared';
import RemoteEqualizer from './RemoteEqualizer';
import InstallGuide from './InstallGuide';
import MetadataKeysSheet from './MetadataKeysSheet';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import LanguageChips from '../../i18n/LanguageChips';

export default function SettingsTab() {
  const { t } = useI18n();
  const [confirmPending, setConfirmPending] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const confirmRef = useRef(null);

  // Sound DSP settings
  const [replayGain, setReplayGain]   = useState('off');
  const [crossfade, setCrossfade]     = useState(0);
  const [showCrossfade, setShowCrossfade] = useState(false);
  const [balance, setBalance]         = useState(0);
  const [showBalance, setShowBalance] = useState(false);
  const [phaseLeft, setPhaseLeft]     = useState(false);
  const [phaseRight, setPhaseRight]   = useState(false);
  const [bitPerfect, setBitPerfect]   = useState(true);
  const [dsdBypass, setDsdBypass]     = useState(true);
  const [autoHeadroom, setAutoHeadroom] = useState(true);
  const [headroomDb, setHeadroomDb]   = useState(0);

  // Wi-Fi
  const [showWifi, setShowWifi]         = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState([]);
  const [wifiSsid, setWifiSsid]         = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiScanning, setWifiScanning] = useState(false);
  const [wifiConnecting, setWifiConnecting] = useState(false);

  // Storage
  const [storage, setStorage]     = useState(null);
  const [showStorage, setShowStorage] = useState(false);

  useEffect(() => {
    api.getReplayGain().then(d => setReplayGain(d.mode || 'off')).catch(() => {});
    api.getCrossfade().then(d => setCrossfade(d.seconds || 0)).catch(() => {});
    api.getBalance().then(d => setBalance(d.balance || 0)).catch(() => {});
    api.getPhase().then(d => { setPhaseLeft(!!d.left); setPhaseRight(!!d.right); }).catch(() => {});
    api.getBitPerfect().then(d => setBitPerfect(d.enabled !== false)).catch(() => {});
    api.getDsdBypass().then(d => setDsdBypass(d.enabled !== false)).catch(() => {});
    api.getAutoHeadroom().then(d => { setAutoHeadroom(d.enabled !== false); setHeadroomDb(d.headroomDb || 0); }).catch(() => {});
  }, []);

  const handleReplayGainChange = async (mode) => {
    setReplayGain(mode);
    try { await api.setReplayGain(mode); toast.success(`ReplayGain: ${mode}`); }
    catch (e) { reportError(e.message); }
  };

  const handleCrossfadeChange = async (secs) => {
    setCrossfade(secs);
    try { await api.setCrossfade(secs); }
    catch (e) { reportError(e.message); }
  };

  const balanceDebounce = useRef(null);
  const handleBalanceChange = (v) => {
    setBalance(v);
    clearTimeout(balanceDebounce.current);
    balanceDebounce.current = setTimeout(async () => {
      try { await api.setBalance(v); }
      catch (e) { reportError(e.message); }
    }, 400);
  };

  const handleBitPerfectToggle = async () => {
    const next = !bitPerfect;
    setBitPerfect(next);
    try {
      await api.setBitPerfect(next);
      toast.success(next ? 'Bit-perfect on — reboot to apply' : 'Fixed 48 kHz mode — reboot to apply');
    } catch (e) { setBitPerfect(!next); reportError(e.message); }
  };

  const handleAutoHeadroomToggle = async () => {
    const next = !autoHeadroom;
    setAutoHeadroom(next);
    try {
      const r = await api.setAutoHeadroom(next);
      setHeadroomDb(r.headroomDb || 0);
      toast.success(next ? 'Auto-headroom on' : 'Static preset headroom');
    } catch (e) { setAutoHeadroom(!next); reportError(e.message); }
  };

  const handleDsdBypassToggle = async () => {
    const next = !dsdBypass;
    setDsdBypass(next);
    try {
      await api.setDsdBypass(next);
      toast.success(next ? 'DSD native bypass on' : 'DSD decoded to PCM');
    } catch (e) { setDsdBypass(!next); reportError(e.message); }
  };

  const handlePhaseChange = async (left, right) => {
    setPhaseLeft(left); setPhaseRight(right);
    try { await api.setPhase(left, right); toast.success(t('settings.phaseUpdated')); }
    catch (e) { reportError(e.message); }
  };

  const handleWifiScan = async () => {
    setWifiScanning(true);
    try { const d = await api.scanWifi(); setWifiNetworks(d.networks || []); }
    catch (e) { reportError(e.message); }
    finally { setWifiScanning(false); }
  };

  const handleWifiConnect = async () => {
    if (!wifiSsid) return;
    setWifiConnecting(true);
    try { await api.connectWifi(wifiSsid, wifiPassword); toast.success(`Connected to ${wifiSsid}`); setShowWifi(false); }
    catch (e) { reportError(e.message); }
    finally { setWifiConnecting(false); }
  };

  const handleLoadStorage = async () => {
    try { setStorage(await api.getStorage()); setShowStorage(true); }
    catch (e) { reportError(e.message); }
  };

  const withConfirm = (key, action) => () => {
    if (confirmPending === key) {
      clearTimeout(confirmRef.current);
      setConfirmPending(null);
      action();
    } else {
      setConfirmPending(key);
      clearTimeout(confirmRef.current);
      confirmRef.current = setTimeout(() => setConfirmPending(null), 3000);
    }
  };

  const {
    C, card, cardWhite, darkMode,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, showEq, setShowEq,
    setIsDspWizardOpen, setIsThemeSettingsOpen,
    sleepMinutes, sleepRemaining, showSleepRow, setShowSleepRow,
    standby, token, devices, services, serviceLoading,
    systemHealth, updateStatus, otaProgress, otaPercent,
    handleEqPresetChange, handleBandChange,
    handleSaturationChange, handleNoiseFloorChange, handlePreAmpChange,
    handleDeactivateDsp, handleSetSleepTimer,
    handleToggleStandby, handleRestartService, handleReboot, handleShutdown,
    triggerOtaUpdate, checkUpdates,
    handleTransferPlayback, setIsAuthenticated, setActiveTab,
    eraseCookie,
  } = useContext(Tk);

  return (
    <div className="flex flex-col pt-5 pb-4">

      {/* header */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('settings.configuration')}</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('nav.settings')}</h2>
      </div>

      {/* language */}
      <Section title={t('settings.language')}>
        <div className="px-4 py-3">
          <LanguageChips colors={{
            bg: C.containerLow, fg: C.text4, border: C.outline,
            activeBg: C.champagne, activeFg: '#1a1c1c',
          }} />
        </div>
      </Section>

      {/* signal monitor */}
      <div className="mx-4 mb-4 rounded-xl overflow-hidden relative" style={{ ...cardWhite, height: 68 }}>
        <span className="absolute top-3 left-4 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('settings.signalMonitor')}</span>
        <div className="absolute inset-x-4 bottom-3 flex items-end gap-px" style={{ height: 28 }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const h = 30 + Math.sin(i * 0.7) * 20 + Math.cos(i * 1.3) * 15;
            return (
              <div key={i} className="flex-1 rounded-sm"
                style={{ height: `${h}%`, background: C.champagne, opacity: 0.5 + (i % 3) * 0.1 }} />
            );
          })}
        </div>
      </div>

      {/* sound */}
      <Section title={t('settings.sound')}>
        <Row label={`Equalizer · ${eqPreset}`}
          icon={<Sliders className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowEq(v => !v)} chevron={false} value={showEq ? '▲' : '▼'} />
        {showEq && (
          <RemoteEqualizer
            currentPreset={eqPreset} onPresetChange={handleEqPresetChange}
            bands={eqBands} onBandChange={handleBandChange}
            saturation={eqSaturation} onSaturationChange={handleSaturationChange}
            noiseFloor={eqNoiseFloor} onNoiseFloorChange={handleNoiseFloorChange}
            preAmp={eqPreAmp} onPreAmpChange={handlePreAmpChange}
            dspActive={dspActive} onDeactivateDsp={handleDeactivateDsp}
          />
        )}
        <Row label={t('settings.roomCalibration')}
          icon={<Cpu className="h-4 w-4" style={{ color: '#f59e0b' }} />}
          value={dspActive ? t('common.on') : t('common.off')}
          chevron={false}
          onPress={() => toast.error(t('settings.roomCalibrationKioskOnly') || 'Run room calibration from the kiosk — it needs you in the listening position.')} />
        <Row
          label={sleepRemaining > 0
            ? `Sleep · ${Math.floor(sleepRemaining / 60)}:${(sleepRemaining % 60).toString().padStart(2, '0')}`
            : 'Sleep Timer'}
          icon={<Timer className="h-4 w-4" style={{ color: sleepRemaining > 0 ? C.champagne : C.text4 }} />}
          value={sleepMinutes ? (sleepMinutes < 60 ? `${sleepMinutes}m` : `${sleepMinutes / 60}h`) : 'Off'}
          chevron={false}
          onPress={() => setShowSleepRow(v => !v)} />
        {showSleepRow && (
          <div className="px-4 pb-4 flex gap-2 flex-wrap">
            {[0, 15, 30, 60, 120].map(m => (
              <button key={m}
                onClick={() => { handleSetSleepTimer(m); setShowSleepRow(false); }}
                className="px-4 py-2 rounded-full text-[12px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={sleepMinutes === m
                  ? { background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }
                  : { ...card, color: C.text4, fontFamily: C.fontLabel }}>
                {m === 0 ? 'Off' : m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        )}
        <Row label={t('settings.replayGain')}
          icon={<Scale className="h-4 w-4" style={{ color: C.text4 }} />}
          value={replayGain}
          chevron={false}
          onPress={() => {
            const modes = ['off', 'track', 'album', 'auto'];
            handleReplayGainChange(modes[(modes.indexOf(replayGain) + 1) % modes.length]);
          }} />
        <Row label={`Crossfade · ${crossfade}s`}
          icon={<RefreshCw className="h-4 w-4" style={{ color: C.text4 }} />}
          value={crossfade > 0 ? `${crossfade}s` : t('common.off')}
          chevron={false}
          onPress={() => setShowCrossfade(v => !v)} />
        {showCrossfade && (
          <div className="px-4 pb-4 flex gap-2 flex-wrap">
            {[0, 2, 4, 6, 8, 10].map(s => (
              <button key={s}
                onClick={() => { handleCrossfadeChange(s); setShowCrossfade(false); }}
                className="px-4 py-2 rounded-full text-[12px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={crossfade === s
                  ? { background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }
                  : { ...card, color: C.text4, fontFamily: C.fontLabel }}>
                {s === 0 ? t('common.off') : `${s}s`}
              </button>
            ))}
          </div>
        )}
        <Row label={`Balance · ${balance > 0 ? `R +${balance}` : balance < 0 ? `L +${Math.abs(balance)}` : t('settings.centre')}`}
          icon={<FlipHorizontal className="h-4 w-4" style={{ color: Math.abs(balance) > 0 ? C.champagne : C.text4 }} />}
          value={`${balance > 0 ? '+' : ''}${balance} dB`}
          chevron={false}
          onPress={() => setShowBalance(v => !v)} />
        {showBalance && (
          <div className="px-4 pb-4">
            <input type="range" min="-12" max="12" step="0.5" value={balance}
              onChange={e => handleBalanceChange(parseFloat(e.target.value))}
              className="w-full" />
            <div className="flex justify-between text-[11px] mt-1" style={{ color: C.text3, fontFamily: C.fontLabel }}>
              <span>L</span><span>{t('settings.centre')}</span><span>R</span>
            </div>
          </div>
        )}
        <Row label={t('settings.phaseInversion')}
          icon={<RotateCcw className="h-4 w-4" style={{ color: (phaseLeft || phaseRight) ? C.champagne : C.text4 }} />}
          value={phaseLeft && phaseRight ? 'L+R' : phaseLeft ? 'L' : phaseRight ? 'R' : t('common.off')}
          chevron={false}
          onPress={() => {
            if (!phaseLeft && !phaseRight) handlePhaseChange(true, false);
            else if (phaseLeft && !phaseRight) handlePhaseChange(false, true);
            else if (!phaseLeft && phaseRight) handlePhaseChange(true, true);
            else handlePhaseChange(false, false);
          }} />
        <Row label={t('settings.bitPerfect')}
          icon={<Disc3 className="h-4 w-4" style={{ color: bitPerfect ? C.champagne : C.text4 }} />}
          value={bitPerfect ? t('common.on') : 'Fixed 48k'}
          chevron={false}
          onPress={handleBitPerfectToggle} />
        <Row label={t('settings.dsdBypass')}
          icon={<Disc3 className="h-4 w-4" style={{ color: dsdBypass ? C.champagne : C.text4 }} />}
          value={dsdBypass ? 'Native' : 'PCM'}
          chevron={false}
          onPress={handleDsdBypassToggle} />
        <Row label={t('settings.autoHeadroom')}
          icon={<Scale className="h-4 w-4" style={{ color: autoHeadroom ? C.champagne : C.text4 }} />}
          value={autoHeadroom ? `−${headroomDb} dB` : 'Static'}
          chevron={false}
          onPress={handleAutoHeadroomToggle} />
      </Section>

      {/* display */}
      <Section title={t('settings.display')}>
        <Row label={t('settings.themeAppearance')}
          icon={<Palette className="h-4 w-4" style={{ color: '#8b5cf6' }} />}
          onPress={() => setIsThemeSettingsOpen(true)} />
        <Row label={t('settings.kioskStandby')}
          icon={<Power className="h-4 w-4" style={{ color: standby ? C.error : C.text4 }} />}
          value={standby ? t('common.on') : t('common.off')} chevron={false}
          onPress={() => handleToggleStandby(!standby)} />
      </Section>

      {/* album info */}
      <Section title={t('meta.albumInfo')}>
        <Row label={t('settings.metadataKeys')} sub="Last.fm · TheAudioDB · Discogs"
          icon={<Disc3 className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowKeys(true)} />
      </Section>

      {/* remote app */}
      <Section title={t('settings.remoteApp')}>
        <Row label={t('settings.addToHome')} sub={t('settings.addToHomeSub')}
          icon={<Smartphone className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowInstall(true)} />
      </Section>

      {showInstall && <InstallGuide onClose={() => setShowInstall(false)} />}
      {showKeys && <MetadataKeysSheet onClose={() => setShowKeys(false)} />}

      {/* spotify */}
      <Section title={t('settings.spotify')}>
        {!token ? (
          <div className="px-4 py-4">
            <a href="/auth/spotify/login?from=remote"
              className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
              style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.font }}>
              <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
              {t('settings.connectSpotify')}
            </a>
          </div>
        ) : (
          <>
            <Row label={t('common.connected')} value="✓" chevron={false}
              icon={<SpotifyIcon className="h-4 w-4" style={{ fill: '#1ed760' }} />}
              onPress={() => {}} />
            <Row label={confirmPending === 'spotify-disconnect' ? t('settings.confirm') : t('settings.disconnect')} destructive
              icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
              onPress={withConfirm('spotify-disconnect', async () => {
                try { await fetch('/auth/spotify/logout', { method: 'POST' }); toast.success(t('settings.disconnected')); }
                catch { reportError(t('settings.failed')); }
              })} />
          </>
        )}
      </Section>

      {/* cast devices */}
      {devices.length > 0 && (
        <Section title={`Cast · ${devices.length} device${devices.length !== 1 ? 's' : ''}`}>
          {devices.map(d => (
            <Row key={d.id} label={d.name} value={d.is_active ? 'Active' : ''}
              icon={<Laptop className="h-4 w-4" style={{ color: d.is_active ? C.champagne : C.text4 }} />}
              onPress={() => handleTransferPlayback(d.id)} />
          ))}
        </Section>
      )}

      {/* services */}
      <Section title={t('settings.services')}>
        {[
          { id: 'mpd',        label: 'MPD',        icon: <Music    className="h-4 w-4" style={{ color: C.text4 }} /> },
          { id: 'camilladsp', label: 'CamillaDSP', icon: <Sliders  className="h-4 w-4" style={{ color: C.text4 }} /> },
          { id: 'raspotify',  label: 'Raspotify',  icon: <SpotifyIcon className="h-4 w-4" style={{ fill: C.text4 }} /> },
        ].map(svc => {
          const status   = services?.[svc.id];
          const isActive = status === 'active';
          return (
            <Row key={svc.id} label={svc.label}
              icon={(
                <span className="relative">
                  {svc.icon}
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full border"
                    style={{
                      background: services ? (isActive ? '#22c55e' : C.error) : C.outline,
                      borderColor: darkMode ? '#111827' : '#ffffff',
                    }} />
                </span>
              )}
              value={serviceLoading[svc.id] ? 'restarting…' : (status || '…')}
              chevron={false}
              onPress={() => handleRestartService(svc.id)} />
          );
        })}
      </Section>

      {/* health */}
      {systemHealth && (
        <div className="mx-4 mb-4 rounded-xl p-4 flex justify-around" style={cardWhite}>
          {[
            { label: 'CPU',   value: `${systemHealth.cpuTemp}°C`    },
            { label: 'RAM',   value: `${systemHealth.ramLoad}%`      },
            { label: 'Wi-Fi', value: `${systemHealth.wifiSignal}dBm` },
          ].map(m => (
            <div key={m.label} className="flex flex-col items-center gap-1">
              <span className="text-[19px] font-medium" style={{ color: C.text1 }}>{m.value}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: C.text3, fontFamily: C.fontLabel }}>{m.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* system */}
      <Section title={t('settings.system')}>
        <Row
          label={updateStatus === 'updating' ? `${t('net.updating')} · ${otaPercent}%` : t('net.checkUpdates')}
          icon={<RefreshCw className={`h-4 w-4 ${updateStatus === 'checking' || updateStatus === 'updating' ? 'animate-spin' : ''}`} style={{ color: '#22c55e' }} />}
          value={updateStatus === 'no-update' ? t('net.upToDate') : updateStatus === 'available' ? t('net.available') : ''}
          onPress={updateStatus === 'available' ? triggerOtaUpdate : checkUpdates}
          chevron={updateStatus === 'available'} />
        {updateStatus === 'updating' && (
          <div className="px-4 pb-4">
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: C.container }}>
              <div className="h-full rounded-full"
                style={{ width: `${otaPercent}%`, background: '#22c55e', transition: 'width 0.3s' }} />
            </div>
            <div className="mt-2 max-h-16 overflow-y-auto">
              {otaProgress.map((l, i) => (
                <p key={i} className="text-[11px] font-mono" style={{ color: C.text3 }}>{l}</p>
              ))}
            </div>
          </div>
        )}
        <Row label={t('net.wifi')}
          icon={<Wifi className="h-4 w-4" style={{ color: C.text4 }} />}
          onPress={() => { setShowWifi(v => !v); if (!showWifi) handleWifiScan(); }} />
        {showWifi && (
          <div className="px-4 pb-4 flex flex-col gap-2">
            {wifiScanning && <p className="text-[12px]" style={{ color: C.text3 }}>{t('net.scanning')}</p>}
            {wifiNetworks.slice(0, 8).map(n => (
              <button key={n.ssid} onClick={() => setWifiSsid(n.ssid)}
                className="px-3 py-2 rounded-xl text-left text-[13px] transition-all"
                style={wifiSsid === n.ssid
                  ? { background: C.champagne, color: '#1a1c1c', fontWeight: 600 }
                  : { ...card, color: C.text2 }}>
                {n.ssid} <span className="text-[11px]" style={{ opacity: 0.7 }}>({n.signal}dBm)</span>
              </button>
            ))}
            <input type="text" placeholder={t('net.ssid')} value={wifiSsid} onChange={e => setWifiSsid(e.target.value)}
              className="px-3 py-2 rounded-xl text-[13px] focus:outline-none"
              style={{ background: C.containerLow, color: C.text1, border: `0.5px solid ${C.outline}` }} />
            <input type="password" placeholder={t('net.password')} value={wifiPassword} onChange={e => setWifiPassword(e.target.value)}
              className="px-3 py-2 rounded-xl text-[13px] focus:outline-none"
              style={{ background: C.containerLow, color: C.text1, border: `0.5px solid ${C.outline}` }} />
            <button onClick={handleWifiConnect} disabled={wifiConnecting || !wifiSsid}
              className="py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all disabled:opacity-40"
              style={{ background: C.champagne, color: '#1a1c1c' }}>
              {wifiConnecting ? t('net.connecting') : t('net.connect')}
            </button>
          </div>
        )}
        <Row label={t('settings.storage')} sub="Library and disk usage"
          icon={<HardDrive className="h-4 w-4" style={{ color: C.text4 }} />}
          onPress={handleLoadStorage} />
        {showStorage && storage && (
          <div className="mx-4 mb-3 rounded-xl p-4 flex flex-col gap-3" style={cardWhite}>
            <div>
              <div className="flex justify-between text-[12px] mb-1" style={{ color: C.text3 }}>
                <span>{t('net.diskUsed')}</span>
                <span>{storage.rootMb?.used} / {storage.rootMb?.size} MB</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.container }}>
                <div className="h-full rounded-full" style={{ width: `${storage.rootMb?.pct}%`, background: C.champagne }} />
              </div>
            </div>
            <p className="text-[12px]" style={{ color: C.text3 }}>
              {t('net.musicLibrary')}: {storage.musicFiles} files · {storage.musicSizeMb} MB
            </p>
          </div>
        )}
        <Row label={t('settings.runWizard')}
          icon={<Sparkles className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => window.dispatchEvent(new Event('resonance:show-welcome'))} />
        <Row label={t('settings.backup')}
          icon={<Download className="h-4 w-4" style={{ color: C.text4 }} />}
          onPress={() => { window.open('/api/system/backup', '_blank'); }} />
        <Row label={confirmPending === 'factory-reset' ? 'Tap again to reset everything' : t('settings.factoryReset')} destructive
          icon={<RotateCcw className="h-4 w-4" style={{ color: C.error }} />}
          onPress={withConfirm('factory-reset', async () => {
            try { await api.factoryReset(); toast.success(t('settings.settingsReset')); }
            catch (e) { reportError(e.message); }
          })} />
        <Row label={confirmPending === 'reboot' ? 'Tap again to reboot' : 'Reboot Kiosk'}
          icon={<RefreshCw className="h-4 w-4" style={{ color: confirmPending === 'reboot' ? '#f59e0b' : C.text4 }} />}
          onPress={withConfirm('reboot', handleReboot)} />
        <Row label={confirmPending === 'shutdown' ? 'Tap again to shut down' : 'Shut Down'} destructive
          icon={<Power className="h-4 w-4" style={{ color: C.error }} />}
          onPress={withConfirm('shutdown', handleShutdown)} />
      </Section>

      {/* session */}
      <Section>
        <Row label={confirmPending === 'signout' ? 'Tap again to disconnect' : 'Disconnect'} destructive chevron={false}
          icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
          onPress={withConfirm('signout', () => { eraseCookie('remote_token'); setIsAuthenticated(false); setActiveTab('player'); })} />
      </Section>
    </div>
  );
}
