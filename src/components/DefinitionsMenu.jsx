import React, { useState, useEffect, useRef } from 'react';
import { Sliders, Terminal, LogOut, RefreshCw, Speaker, Smartphone, Laptop, Check, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../api';
import TrackSearch from './TrackSearch';

export default function DefinitionsMenu({
  token,
  handleLogout,
  devices,
  isFetchingDevices,
  onTransferPlayback,
  onRefreshDevices,
  onPlayTrack,
  theme,
  onThemeChange,
  otaProgress,
  setOtaProgress,
  otaPercent,
  setOtaPercent,
  spotify,
  onToggleSource,
  updateStatus,
  setUpdateStatus,
  errorMessage,
  setErrorMessage
}) {
  // Local Commit states
  const [localCommit, setLocalCommit] = useState('');
  const [remoteCommit, setRemoteCommit] = useState('');

  // Spotify Daemon credentials states
  const [daemonUsername, setDaemonUsername] = useState('');
  const [daemonPassword, setDaemonPassword] = useState('');
  const [isSavingDaemonCreds, setIsSavingDaemonCreds] = useState(false);

  const handleSaveDaemonCredentials = async (e) => {
    e.preventDefault();
    if (!daemonUsername.trim() || !daemonPassword.trim()) {
      alert('Username and password are required.');
      return;
    }
    try {
      setIsSavingDaemonCreds(true);
      await api.setSpotifyCredentials(daemonUsername.trim(), daemonPassword.trim());
      alert('Spotify Daemon configuration updated successfully! The daemon is restarting.');
      setDaemonUsername('');
      setDaemonPassword('');
    } catch (err) {
      console.error('Failed to update Spotify Daemon configuration:', err);
      alert(`Configuration update failed: ${err.message}`);
    } finally {
      setIsSavingDaemonCreds(false);
    }
  };

  // OTA logic
  const checkUpdates = async () => {
    try {
      setUpdateStatus('checking');
      const data = await api.getUpdateStatus();
      if (data.updateAvailable) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('no-update');
      }
      setLocalCommit(data.localCommit || '');
      setRemoteCommit(data.remoteCommit || '');
    } catch (err) {
      console.error('[OTA] Failed to check for system updates:', err);
      setUpdateStatus('error');
      setErrorMessage(err.message || 'Failed to check updates.');
    }
  };

  const consoleRef = useRef(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [otaProgress]);

  const triggerOtaUpdate = async () => {
    try {
      if (setOtaProgress) setOtaProgress([]);
      if (setOtaPercent) setOtaPercent(0);
      setUpdateStatus('updating');
      await api.triggerUpdate();
    } catch (err) {
      console.error('[OTA] Failed to trigger update installation:', err);
      setUpdateStatus('error');
      setErrorMessage(err.message || 'Failed to start update.');
    }
  };

  // Render device icon helper
  const getDeviceIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'computer':
        return <Laptop className="h-4 w-4 shrink-0" />;
      case 'smartphone':
      case 'phone':
        return <Smartphone className="h-4 w-4 shrink-0" />;
      default:
        return <Speaker className="h-4 w-4 shrink-0" />;
    }
  };

  return (
    <div className="flex flex-row gap-5 font-mono text-zinc-300 h-full pb-2 pr-4 items-stretch select-none">
      
      {/* 1. MEDIA PLUGIN SOURCE CARD (Big Square) */}
      <section className="w-[230px] shrink-0 p-5 rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-[#1c1e24] to-[#121418] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        {/* Glow effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#1ed760]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">[01] SELECT SOURCE</span>
            <Sparkles className="h-3.5 w-3.5 text-zinc-650" />
          </div>
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider mt-1">
            Media Engine
          </h3>
          <p className="text-[9.5px] text-zinc-500 leading-normal uppercase">
            Choose the active audio plugin source.
          </p>
        </div>

        <button
          onClick={onToggleSource}
          className={`w-full py-3 rounded-xl text-[10px] font-extrabold uppercase border tracking-wider transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 ${
            spotify 
              ? 'bg-[#1ed760]/10 border-[#1ed760]/30 text-[#1ed760] hover:bg-[#1ed760]/20' 
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
          }`}
        >
          {spotify ? 'Plugin: Spotify' : 'Plugin: Local'}
        </button>
      </section>

      {/* 2. SPOTIFY AUTHENTICATION CARD (Big Square) */}
      <section className="w-[230px] shrink-0 p-5 rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-[#1c1e24] to-[#121418] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-[#1ed760]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">[02] ACCOUNT AUTH</span>
            {token ? (
              <span className="text-[7.5px] bg-emerald-950/60 border border-emerald-900/50 text-[#1ed760] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                OK
              </span>
            ) : (
              <span className="text-[7.5px] bg-rose-950/60 border border-rose-900/50 text-rose-450 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">
                ERR
              </span>
            )}
          </div>
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider mt-1">
            Spotify Keyway
          </h3>
          <p className="text-[9.5px] text-zinc-500 leading-normal uppercase">
            {token ? 'Spotify account linked and authorized.' : 'Authorize connection to stream catalog.'}
          </p>
        </div>

        {!token ? (
          <a
            href="/auth/spotify/login"
            className="w-full py-3 rounded-xl bg-[#1ed760] hover:bg-[#1fdf64] active:scale-95 text-[10px] text-black font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 no-underline"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
            Link Account
          </a>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] uppercase font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        )}
      </section>

      {/* 3. AUDIO OUTPUT PATCHBAY CARD (Big Square / Medium Width) */}
      <section className="w-[300px] shrink-0 p-5 rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-[#1c1e24] to-[#121418] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        <div className="flex flex-col gap-2.5 h-full">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">[03] AUDIO CHANNELS</span>
            {token && (
              <button
                onClick={onRefreshDevices}
                disabled={isFetchingDevices}
                className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh Devices"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetchingDevices ? 'animate-spin theme-text' : ''}`} />
              </button>
            )}
          </div>
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider mt-0.5">
            Output Patchbay
          </h3>

          {!token ? (
            <div className="flex-grow flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-800 rounded-xl p-4 text-center mt-1">
              <AlertCircle className="h-4 w-4 text-zinc-650" />
              <span className="text-[8.5px] text-zinc-500 leading-normal uppercase">Authorize account to discover audio routes</span>
            </div>
          ) : (
            <div className="flex-grow overflow-y-auto max-h-[120px] pr-1 mt-1 custom-scrollbar flex flex-col gap-1.5">
              {devices.length > 0 ? (
                devices.map((device) => {
                  const isResonance = device.name === 'Resonance Connect';
                  return (
                    <button
                      key={device.id}
                      onClick={() => !device.is_active && onTransferPlayback(device.id)}
                      disabled={device.is_active}
                      className={`w-full p-2 rounded-xl border text-left transition-all flex items-center justify-between gap-2 text-[10px] ${
                        device.is_active
                          ? 'theme-bg-glow theme-border-glow text-white font-bold cursor-default'
                          : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200 cursor-pointer active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={device.is_active ? 'theme-text' : 'text-zinc-600'}>
                          {getDeviceIcon(device.type)}
                        </span>
                        <span className="truncate tracking-wide font-mono">
                          {device.name}
                        </span>
                      </div>
                      {device.is_active && <span className="text-[7.5px] theme-text uppercase font-bold shrink-0">ACTIVE</span>}
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-4 text-zinc-500 text-[8.5px] border border-dashed border-zinc-850 rounded-xl">
                  NO CHANNELS DETECTED.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 4. SYSTEM OTA CARD (Big Square) */}
      <section className="w-[280px] shrink-0 p-5 rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-[#1c1e24] to-[#121418] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        <div className="flex flex-col gap-2.5 h-full justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">[04] SYSTEM UPDATE</span>
              <span className="text-[7.5px] bg-zinc-900 border border-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-bold uppercase">OTA</span>
            </div>
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider mt-0.5">
              Firmware OTA
            </h3>
          </div>

          <div className="flex-grow flex flex-col justify-center my-1.5">
            {updateStatus === null && (
              <button
                onClick={checkUpdates}
                className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 text-[10px] text-zinc-300 border border-zinc-800 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 uppercase font-bold tracking-wider"
              >
                Check for Updates
              </button>
            )}

            {updateStatus === 'checking' && (
              <div className="text-center py-2 text-zinc-500 text-[8.5px] flex items-center justify-center gap-1.5 font-bold uppercase tracking-wider">
                <RefreshCw className="h-3 w-3 animate-spin theme-text" />
                <span>Checking Git Commits...</span>
              </div>
            )}

            {updateStatus === 'no-update' && (
              <div className="p-2 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-[8.5px] font-mono leading-relaxed">
                <p className="font-bold text-emerald-400">✓ SYSTEM UP TO DATE</p>
                <p className="text-zinc-500 truncate mt-0.5">COMMIT: {localCommit.slice(0, 7) || 'HEAD'}</p>
              </div>
            )}

            {updateStatus === 'available' && (
              <button
                onClick={triggerOtaUpdate}
                className="w-full py-2.5 rounded-xl theme-bg hover:opacity-90 active:scale-95 text-[10px] text-black font-extrabold uppercase tracking-wider transition-all cursor-pointer"
              >
                Deploy OTA Update
              </button>
            )}

            {updateStatus === 'updating' && (
              <div className="w-full flex flex-col gap-1.5 text-center font-mono">
                <div className="flex justify-between items-center text-[8.5px] text-zinc-400">
                  <span>DEPLOYING</span>
                  <span className="theme-text font-bold">{otaPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden p-[1px]">
                  <div className="h-full theme-bg transition-all duration-300" style={{ width: `${otaPercent}%` }} />
                </div>
              </div>
            )}

            {updateStatus === 'error' && (
              <div className="p-2 rounded-xl bg-rose-950/20 border border-rose-900/40 text-[8.5px] text-rose-450">
                <p className="font-bold">❌ OTA ERROR</p>
                <button onClick={checkUpdates} className="mt-1 text-[8px] underline uppercase tracking-wider">Retry</button>
              </div>
            )}
          </div>

          {updateStatus !== 'updating' && updateStatus !== null && (
            <button
              onClick={checkUpdates}
              className="w-full py-1.5 text-[8.5px] text-zinc-500 hover:text-zinc-300 uppercase tracking-widest font-extrabold border border-dashed border-zinc-850 rounded-lg transition-colors cursor-pointer"
            >
              Re-check Commits
            </button>
          )}
        </div>
      </section>

      {/* 5. SYSTEM THEMES CARD (Big Square) */}
      <section className="w-[230px] shrink-0 p-5 rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-[#1c1e24] to-[#121418] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        <div className="flex flex-col gap-2.5 w-full">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">[05] PALETTE THEME</span>
            <span className="text-[7.5px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-bold uppercase">{theme || 'amber'}</span>
          </div>
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider mt-0.5">
            System Theme
          </h3>
        </div>

        <div className="grid grid-cols-5 gap-1.5 mt-2">
          {[
            { id: 'amber', name: 'AMB', colorClass: 'bg-[#ff8e00]' },
            { id: 'emerald', name: 'EME', colorClass: 'bg-[#00ff66]' },
            { id: 'cyan', name: 'CYA', colorClass: 'bg-[#00ffff]' },
            { id: 'amethyst', name: 'AME', colorClass: 'bg-[#a855f7]' },
            { id: 'ruby', name: 'RUB', colorClass: 'bg-[#ff3366]' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={`py-2 px-0.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1 active:scale-95 ${
                theme === t.id
                  ? 'bg-zinc-900 border-zinc-700 text-white font-bold'
                  : 'bg-zinc-950/40 border-zinc-950 text-zinc-500 hover:border-zinc-900 hover:text-zinc-350'
              }`}
              title={t.name}
            >
              <span className={`w-3.5 h-3.5 rounded-full ${t.colorClass} border border-black/20 shrink-0`} />
              <span className="text-[7px] font-bold uppercase tracking-wider truncate w-full">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 6. SEARCH CATALOG PANEL (Medium-Large Width) */}
      <section className="w-[380px] shrink-0 p-5 rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-[#1c1e24] to-[#121418] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        <div className="flex flex-col h-full justify-between">
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-zinc-900 shrink-0">
            <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">
              [06] SOURCE SEARCH CATALOG
            </span>
          </div>
          
          <div className="flex-grow min-h-0">
            {!token ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-850 rounded-xl p-4 text-center">
                <AlertCircle className="h-4 w-4 text-zinc-650 animate-pulse" />
                <span className="text-[8.5px] text-zinc-500 leading-normal uppercase">Authorize Account to Search Tracks</span>
              </div>
            ) : (
              <TrackSearch
                token={token}
                onPlayTrack={onPlayTrack}
                isDrawer={true}
              />
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
