import React, { useState, useEffect, useRef } from 'react';
import { Sliders, Terminal, LogOut, RefreshCw, Speaker, Smartphone, Laptop, Check, AlertCircle } from 'lucide-react';
import { api } from '../api';
import TrackSearch from './TrackSearch';

export default function DefinitionsMenu({
  token,
  manualTokenInput,
  setManualTokenInput,
  handleApplyManualToken,
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
    <div className="flex flex-col gap-6 font-mono text-zinc-300">
      
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-900">
        <Sliders className="h-5 w-5 theme-text animate-pulse" />
        <div>
          <h3 className="text-xs font-bold text-white tracking-widest uppercase">System Definitions</h3>
          <p className="text-[9px] text-zinc-500 uppercase mt-0.5">Control center and resource configuration</p>
        </div>
      </div>

      {/* 0. PLUGIN SOURCE SELECTOR & DAEMON CONFIG */}
      <section className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
            [00] Media Source & Daemon Config
          </span>
          <button
            onClick={onToggleSource}
            className={`px-2.5 py-1 rounded text-[8px] font-extrabold uppercase border transition-all cursor-pointer ${
              spotify 
                ? 'bg-emerald-950/60 border-emerald-900 text-emerald-400' 
                : 'bg-amber-950/60 border-amber-900 text-amber-400'
            }`}
          >
            Plugin: {spotify ? 'Spotify' : 'Local'}
          </button>
        </div>

        {/* Credentials form for librespot daemon */}
        <form onSubmit={handleSaveDaemonCredentials} className="flex flex-col gap-2 border-t border-zinc-900 pt-3">
          <p className="text-[8.5px] text-zinc-500 uppercase font-bold tracking-wider">Configure Spotify Connect Daemon</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Spotify Username"
              value={daemonUsername}
              onChange={(e) => setDaemonUsername(e.target.value)}
              className="bg-zinc-950 border border-zinc-900 rounded p-1.5 text-[9px] text-white focus:outline-none focus:border-zinc-700"
            />
            <input
              type="password"
              placeholder="Spotify Password"
              value={daemonPassword}
              onChange={(e) => setDaemonPassword(e.target.value)}
              className="bg-zinc-950 border border-zinc-900 rounded p-1.5 text-[9px] text-white focus:outline-none focus:border-zinc-700"
            />
          </div>
          <button
            type="submit"
            disabled={isSavingDaemonCreds}
            className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-[9px] font-bold uppercase rounded text-white active:scale-95 transition-all cursor-pointer"
          >
            {isSavingDaemonCreds ? 'Configuring Daemon...' : 'Save & Restart Daemon'}
          </button>
        </form>
      </section>

      {/* 1. SPOTIFY AUTHENTICATION KEYWAY */}
      <section className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
            [01] Spotify Keyway
          </span>
          {token ? (
            <span className="text-[8px] bg-emerald-950/60 border border-emerald-900 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              AUTHORIZED
            </span>
          ) : (
            <span className="text-[8px] bg-rose-950/60 border border-rose-900 text-rose-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">
              REQUIRED
            </span>
          )}
        </div>

      {!token ? (
          <div className="flex flex-col gap-3 mt-1">
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Connect your Spotify account to enable track display, remote control and playback synchronization.
            </p>
            <a
              href="/auth/spotify/login"
              className="w-full py-2.5 px-3 rounded-lg bg-[#1ed760] hover:bg-[#1fdf64] active:scale-95 text-xs text-black font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 no-underline"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
              Login with Spotify
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 mt-1">
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-900 flex items-center justify-between gap-4">
              <div className="min-w-0 flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#1ed760] shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Spotify Connected</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-2.5 py-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 text-[9px] uppercase font-bold transition-all border border-rose-900/50 flex items-center gap-1 active:scale-95 cursor-pointer shrink-0"
              >
                <LogOut className="h-3 w-3" />
                Disconnect
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2. AUDIO PATCHBAY / OUTPUT CHANNELS */}
      <section className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
            [02] Audio Output Patchbay
          </span>
          {token && (
            <button
              onClick={onRefreshDevices}
              disabled={isFetchingDevices}
              className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-[var(--theme-color)] transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Devices"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetchingDevices ? 'animate-spin theme-text' : ''}`} />
            </button>
          )}
        </div>

        {!token ? (
          <div className="text-center py-4 text-zinc-650 text-[10px] border border-dashed border-zinc-900 rounded-lg select-none flex flex-col items-center gap-1">
            <AlertCircle className="h-4 w-4 text-zinc-750" />
            <span>AUTHORIZE KEYWAY TO LOCATE AUDIBLE CHANNELS</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {devices.length > 0 ? (
              devices.map((device) => {
                const isResonance = device.name === 'Resonance Connect';
                return (
                  <button
                    key={device.id}
                    onClick={() => !device.is_active && onTransferPlayback(device.id)}
                    disabled={device.is_active}
                    className={`w-full p-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-3 text-xs ${
                      device.is_active
                        ? 'theme-bg-glow theme-border-glow text-white font-bold cursor-default'
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200 cursor-pointer active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={device.is_active ? 'theme-text' : 'text-zinc-650'}>
                        {getDeviceIcon(device.type)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-mono tracking-wide">
                          {device.name}
                          {isResonance && (
                            <span className="ml-1.5 text-[8px] px-1 rounded theme-bg-glow theme-border-glow theme-text">
                              DAEMON
                            </span>
                          )}
                        </div>
                        <p className="text-[8px] text-zinc-650 uppercase font-mono mt-0.5">
                          Type: {device.type || 'Speaker'} // Vol: {device.volume_percent}%
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center shrink-0">
                      {device.is_active ? (
                        <span className="flex items-center gap-1 text-[8.5px] font-bold theme-text tracking-widest">
                          <Check className="h-3 w-3" /> ACTIVE
                        </span>
                      ) : (
                        <span className="text-[8.5px] text-zinc-650 hover:text-zinc-400 font-bold uppercase tracking-wider">
                          CONNECT
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-center py-4 text-zinc-650 text-[10px] border border-dashed border-zinc-900 rounded-lg select-none">
                NO DEVICES DETECTED ON CLIENT SUBNET.
                <p className="text-[8.5px] text-zinc-700 mt-1 uppercase">
                  Verify Librespot is running or launch Spotify on another device.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. SYSTEM OTA UPDATES */}
      <section className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
            [03] System OTA Updates
          </span>
          <span className="text-[8px] bg-zinc-900 border border-zinc-800 text-zinc-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
            GIT BRANCH
          </span>
        </div>

        <div className="flex flex-col gap-2.5 mt-1">
          {updateStatus === null && (
            <button
              onClick={checkUpdates}
              className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-xs text-zinc-350 border border-zinc-800 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-95 uppercase font-bold tracking-wider"
            >
              Check for Updates
            </button>
          )}

          {updateStatus === 'checking' && (
            <div className="text-center py-2 text-zinc-650 text-[10px] flex items-center justify-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin theme-text" />
              <span>FETCHING LATEST GIT COMMITS...</span>
            </div>
          )}

          {updateStatus === 'no-update' && (
            <div className="flex flex-col gap-2">
              <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-450 text-[10px] font-mono leading-relaxed">
                <p className="font-bold text-emerald-400">✓ SYSTEM IS UP TO DATE</p>
                <p className="text-[8.5px] text-zinc-550 mt-0.5">CURRENT COMMIT: {localCommit}</p>
              </div>
              <button
                onClick={checkUpdates}
                className="w-full py-2 px-3 rounded-lg bg-zinc-950 hover:bg-zinc-900 text-[10px] text-zinc-450 border border-zinc-900 hover:text-zinc-350 transition-colors cursor-pointer active:scale-95 uppercase font-bold tracking-wider"
              >
                Re-check commits
              </button>
            </div>
          )}

          {updateStatus === 'available' && (
            <div className="flex flex-col gap-2.5">
              <div className="p-2.5 rounded bg-amber-950/20 border border-amber-900/40 text-amber-450 text-[10px] font-mono leading-normal">
                <p className="font-bold text-amber-400">⚠️ UPDATE DETECTED ON ORIGIN</p>
                <p className="text-[8.5px] text-zinc-550 mt-1">LOCAL: {localCommit} // REMOTE: {remoteCommit}</p>
              </div>
              <button
                onClick={triggerOtaUpdate}
                className="w-full py-2 px-3 rounded-lg theme-bg hover:opacity-90 active:scale-95 text-xs text-black font-extrabold uppercase tracking-wider transition-all cursor-pointer"
              >
                Deploy OTA Update
              </button>
            </div>
          )}

          {updateStatus === 'updating' && (
            <div className="p-3 rounded bg-zinc-950 border border-zinc-900 text-center flex flex-col items-stretch gap-2.5 font-mono">
              <div className="flex items-center justify-between text-[10px] select-none">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin theme-text" />
                  <span className="font-bold text-white uppercase tracking-wider">Installing OTA Update</span>
                </div>
                <span className="theme-text font-extrabold font-mono text-[9px] bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">{otaPercent}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-2 rounded bg-zinc-900 border border-zinc-850 overflow-hidden relative p-[1px]">
                <div 
                  className="h-full theme-bg transition-all duration-300 ease-out rounded shadow-[0_0_8px_var(--theme-color-glow)]"
                  style={{ width: `${otaPercent}%` }}
                />
              </div>

              <div 
                ref={consoleRef}
                className="bg-black/85 rounded border border-zinc-900 p-2 text-left h-36 overflow-y-auto text-[8px] text-white select-text custom-scrollbar flex flex-col gap-0.5 leading-normal"
              >
                {otaProgress && otaProgress.length > 0 ? (
                  otaProgress.map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap break-all text-white font-medium">
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-white/60 animate-pulse uppercase font-medium">Initiating secure socket pipeline...</div>
                )}
              </div>
              <p className="text-[7.5px] text-zinc-400 leading-normal uppercase">
                The connection will drop and reconnect automatically once compile finishes.
              </p>
            </div>
          )}

          {updateStatus === 'error' && (
            <div className="flex flex-col gap-2">
              <div className="p-2.5 rounded bg-rose-950/20 border border-rose-900/40 text-rose-450 text-[10px] font-mono leading-normal">
                <p className="font-bold text-rose-400">❌ UPDATE ATTEMPT FAILED</p>
                <p className="text-[8.5px] text-zinc-550 mt-1">{errorMessage}</p>
              </div>
              <button
                onClick={checkUpdates}
                className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-xs text-zinc-350 border border-zinc-800 hover:text-white transition-colors cursor-pointer active:scale-95"
              >
                Retry update check
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 5. SYSTEM THEMES */}
      <section className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
            [05] System Themes
          </span>
          <span className="text-[8px] bg-zinc-900 border border-zinc-800 text-zinc-550 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
            {theme?.toUpperCase() || 'AMBER'}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5 mt-1">
          {[
            { id: 'amber', name: 'Amber', colorClass: 'bg-[#ff8e00]' },
            { id: 'emerald', name: 'Emerald', colorClass: 'bg-[#00ff66]' },
            { id: 'cyan', name: 'Cyan', colorClass: 'bg-[#00ffff]' },
            { id: 'amethyst', name: 'Amethyst', colorClass: 'bg-[#a855f7]' },
            { id: 'ruby', name: 'Ruby', colorClass: 'bg-[#ff3366]' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1 active:scale-95 ${
                theme === t.id
                  ? 'bg-zinc-900 border-zinc-700 text-white font-bold'
                  : 'bg-zinc-950/40 border-zinc-950 text-zinc-500 hover:border-zinc-900 hover:text-zinc-350'
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${t.colorClass} border border-black/20 shrink-0`} />
              <span className="text-[7.5px] uppercase tracking-wider truncate w-full">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 4. SOURCE SEARCH & LOAD */}
      <section className="flex-grow flex flex-col">
        <div className="flex items-center gap-2 pb-2 mb-3 border-b border-zinc-900">
          <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
            [04] Source Catalog Search
          </span>
        </div>
        
        {!token ? (
          <div className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/20 text-center py-6 text-zinc-650 text-[10px] border-dashed select-none flex flex-col items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-zinc-750" />
            <span>AUTHORIZE KEYWAY TO ACTIVATE SERVICE SEARCH</span>
          </div>
        ) : (
          <TrackSearch
            token={token}
            onPlayTrack={onPlayTrack}
            isDrawer={true}
          />
        )}
      </section>

    </div>
  );
}
