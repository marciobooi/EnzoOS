import React, { useContext, useState, useRef } from 'react';
import {
  Sliders, Cpu, Timer, Palette, Power, LogOut, Laptop,
  Music, RefreshCw, Smartphone, Disc3,
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { Tk, Row, Section, SpotifyIcon } from './shared';
import RemoteEqualizer from './RemoteEqualizer';
import InstallGuide from './InstallGuide';
import MetadataKeysSheet from './MetadataKeysSheet';

export default function SettingsTab() {
  const [confirmPending, setConfirmPending] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const confirmRef = useRef(null);

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
    C, card, cardWhite, btn, darkMode,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, showEq, setShowEq,
    setIsDspWizardOpen, setIsThemeSettingsOpen,
    sleepMinutes, sleepRemaining, showSleepRow, setShowSleepRow,
    standby, token, devices, services, serviceLoading,
    systemHealth, updateStatus, otaProgress, otaPercent,
    handleEqPresetChange, handleBandChange,
    handleSaturationChange, handleNoiseFloorChange, handlePreAmpChange,
    handleDeactivateDsp, handleSetSleepTimer,
    handleThemeColorChange, handleActiveThemeChange,
    handleBrightnessChange, handleVisualizerModeChange,
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
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>Configuration</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Settings</h2>
      </div>

      {/* signal monitor */}
      <div className="mx-4 mb-4 rounded-xl overflow-hidden relative" style={{ ...cardWhite, height: 68 }}>
        <span className="absolute top-3 left-4 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>Signal Monitor</span>
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
      <Section title="Sound">
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
        <Row label="Room Calibration"
          icon={<Cpu className="h-4 w-4" style={{ color: '#f59e0b' }} />}
          value={dspActive ? 'Active' : 'Off'}
          onPress={() => setIsDspWizardOpen(true)} />
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
      </Section>

      {/* display */}
      <Section title="Display">
        <Row label="Theme & Appearance"
          icon={<Palette className="h-4 w-4" style={{ color: '#8b5cf6' }} />}
          onPress={() => setIsThemeSettingsOpen(true)} />
        <Row label="Kiosk Standby"
          icon={<Power className="h-4 w-4" style={{ color: standby ? C.error : C.text4 }} />}
          value={standby ? 'On' : 'Off'} chevron={false}
          onPress={() => handleToggleStandby(!standby)} />
      </Section>

      {/* album info */}
      <Section title="Album Info">
        <Row label="Metadata Keys" sub="Last.fm · TheAudioDB · Discogs"
          icon={<Disc3 className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowKeys(true)} />
      </Section>

      {/* remote app */}
      <Section title="Remote App">
        <Row label="Add to Home Screen" sub="Install as a full-screen app"
          icon={<Smartphone className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowInstall(true)} />
      </Section>

      {showInstall && <InstallGuide onClose={() => setShowInstall(false)} />}
      {showKeys && <MetadataKeysSheet onClose={() => setShowKeys(false)} />}

      {/* spotify */}
      <Section title="Spotify">
        {!token ? (
          <div className="px-4 py-4">
            <a href="/auth/spotify/login?from=remote"
              className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
              style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.font }}>
              <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
              Connect with Spotify
            </a>
          </div>
        ) : (
          <>
            <Row label="Connected" value="✓" chevron={false}
              icon={<SpotifyIcon className="h-4 w-4" style={{ fill: '#1ed760' }} />}
              onPress={() => {}} />
            <Row label={confirmPending === 'spotify-disconnect' ? 'Tap again to confirm' : 'Disconnect'} destructive
              icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
              onPress={withConfirm('spotify-disconnect', async () => {
                try { await fetch('/auth/spotify/logout', { method: 'POST' }); toast.success('Disconnected'); }
                catch { toast.error('Failed'); }
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
      <Section title="Services">
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
      <Section title="System">
        <Row
          label={updateStatus === 'updating' ? `Updating · ${otaPercent}%` : 'Check for Updates'}
          icon={<RefreshCw className={`h-4 w-4 ${updateStatus === 'checking' || updateStatus === 'updating' ? 'animate-spin' : ''}`} style={{ color: '#22c55e' }} />}
          value={updateStatus === 'no-update' ? 'Up to date' : updateStatus === 'available' ? 'Available!' : ''}
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
