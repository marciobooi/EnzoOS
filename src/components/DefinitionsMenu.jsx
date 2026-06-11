import React from 'react';
import { Sliders, Terminal, LogOut, RefreshCw, Speaker, Smartphone, Laptop, Check, AlertCircle } from 'lucide-react';
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
  onPlayTrack
}) {
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
        <Sliders className="h-5 w-5 text-[#ff8e00] animate-pulse" />
        <div>
          <h3 className="text-xs font-bold text-white tracking-widest uppercase">System Definitions</h3>
          <p className="text-[9px] text-zinc-500 uppercase mt-0.5">Control center and resource configuration</p>
        </div>
      </div>

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
              Mount a developer access token to authorize API requests for search and playback synchronization.
            </p>
            <form onSubmit={handleApplyManualToken} className="flex flex-col gap-2">
              <input 
                type="text" 
                placeholder="INPUT ACCESS TOKEN KEY..." 
                value={manualTokenInput}
                onChange={e => setManualTokenInput(e.target.value)}
                className="w-full py-2 px-3 rounded-lg bg-zinc-950 border border-zinc-900 text-[#ff8e00] placeholder-zinc-800 text-xs focus:outline-none focus:border-[#ff8e00]/40 transition-colors tracking-wide text-center"
              />
              <button 
                type="submit"
                className="w-full py-2 px-3 rounded-lg bg-[#ff8e00] hover:bg-[#ff8e00]/80 active:scale-95 text-xs text-black font-extrabold uppercase tracking-wider transition-all cursor-pointer"
              >
                Mount Custom Token
              </button>
            </form>
            <div className="text-[9px] text-zinc-600 flex items-start gap-1.5 p-2 rounded bg-zinc-950/40 border border-zinc-950 mt-1 leading-normal">
              <Terminal className="h-3.5 w-3.5 text-zinc-600 shrink-0 mt-0.5" />
              <span>
                Need a key? Copy a temp token from Spotify's{' '}
                <a 
                  href="https://developer.spotify.com/documentation/web-api/reference/get-users-profile" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[#ff8e00]/70 hover:text-[#ff8e00] hover:underline font-bold"
                >
                  portal
                </a>.
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 mt-1">
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-900 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Active Client Token</p>
                <p className="text-[10px] text-zinc-300 truncate w-[160px] font-mono">
                  {token.substring(0, 10)}...{token.substring(token.length - 10)}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="px-2.5 py-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 text-[9px] uppercase font-bold transition-all border border-rose-900/50 flex items-center gap-1 active:scale-95 cursor-pointer shrink-0"
              >
                <LogOut className="h-3 w-3" />
                Deauthorize
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
              className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-[#ff8e00] transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Devices"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetchingDevices ? 'animate-spin text-[#ff8e00]' : ''}`} />
            </button>
          )}
        </div>

        {!token ? (
          <div className="text-center py-4 text-zinc-600 text-[10px] border border-dashed border-zinc-900 rounded-lg select-none flex flex-col items-center gap-1">
            <AlertCircle className="h-4 w-4 text-zinc-700" />
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
                        ? 'bg-[#ff8e00]/5 border-[#ff8e00]/30 text-white font-bold cursor-default'
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200 cursor-pointer active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={device.is_active ? 'text-[#ff8e00]' : 'text-zinc-600'}>
                        {getDeviceIcon(device.type)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-mono tracking-wide">
                          {device.name}
                          {isResonance && (
                            <span className="ml-1.5 text-[8px] px-1 rounded bg-[#ff8e00]/10 border border-[#ff8e00]/20 text-[#ff8e00]">
                              DAEMON
                            </span>
                          )}
                        </div>
                        <p className="text-[8px] text-zinc-600 uppercase font-mono mt-0.5">
                          Type: {device.type || 'Speaker'} // Vol: {device.volume_percent}%
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center shrink-0">
                      {device.is_active ? (
                        <span className="flex items-center gap-1 text-[8.5px] font-bold text-[#ff8e00] tracking-widest">
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
              <div className="text-center py-4 text-zinc-500 text-[10px] border border-dashed border-zinc-900 rounded-lg select-none">
                NO DEVICES DETECTED ON CLIENT SUBNET.
                <p className="text-[8.5px] text-zinc-600 mt-1 uppercase">
                  Verify Librespot is running or launch Spotify on another device.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. SOURCE SEARCH & LOAD */}
      <section className="flex-grow flex flex-col">
        {!token ? (
          <div className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/20 text-center py-6 text-zinc-650 text-[10px] border-dashed select-none flex flex-col items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-zinc-700" />
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
