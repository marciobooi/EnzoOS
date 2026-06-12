import React, { useState, useEffect, useRef } from 'react';
import { Sliders, RefreshCw, Speaker, Smartphone, Laptop, Check, AlertCircle, Music, Download, Heart } from 'lucide-react';
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

  return (
    <div className="flex flex-row gap-5 font-mono text-zinc-300 h-full pb-2 pr-4 items-stretch select-none">
      
      {/* 1. SPOTIFY CARD */}
      <button
        onClick={() => {
          if (!spotify) onToggleSource();
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          spotify 
            ? 'theme-border-glow theme-bg-glow border-[var(--theme-color)]' 
            : 'border-zinc-800 bg-gradient-to-b from-[#16181d] to-[#0f1114] hover:border-zinc-700'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-500 uppercase">SPOTIFY</span>
        
        <div className="my-auto flex justify-center py-2">
          <svg 
            viewBox="0 0 24 24" 
            className={`h-16 w-16 transition-all duration-300 ${
              spotify ? 'fill-[#1ed760] drop-shadow-[0_0_15px_rgba(30,215,96,0.4)]' : 'fill-zinc-600 group-hover:fill-zinc-400'
            }`}
          >
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/>
          </svg>
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-550 w-full">
          {token ? (
            <span className="text-[#1ed760] font-extrabold">LINKED</span>
          ) : (
            <a href="/auth/spotify/login" className="text-zinc-500 hover:text-white underline">CONNECT</a>
          )}
          {spotify && <span className="theme-text">ACTIVE</span>}
        </div>
      </button>

      {/* 2. LOCAL MUSIC CARD */}
      <button
        onClick={() => {
          if (spotify) onToggleSource();
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          !spotify 
            ? 'theme-border-glow theme-bg-glow border-[var(--theme-color)]' 
            : 'border-zinc-800 bg-gradient-to-b from-[#16181d] to-[#0f1114] hover:border-zinc-700'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">LOCAL</span>
        
        <div className="my-auto flex justify-center py-2">
          <Music 
            className={`h-16 w-16 transition-all duration-300 ${
              !spotify ? 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'text-zinc-650 group-hover:text-zinc-400'
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-500 w-full">
          <span>STORAGE</span>
          {!spotify && <span className="theme-text">ACTIVE</span>}
        </div>
      </button>

      {/* 3. UPDATE CARD */}
      <button
        onClick={() => {
          if (updateStatus === 'available') {
            triggerOtaUpdate();
          } else if (updateStatus !== 'updating' && updateStatus !== 'checking') {
            checkUpdates();
          }
        }}
        disabled={updateStatus === 'updating' || updateStatus === 'checking'}
        className={`w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer border-zinc-800 bg-gradient-to-b from-[#16181d] to-[#0f1114] hover:border-zinc-700`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">UPDATE</span>
        
        <div className="my-auto flex justify-center py-2 w-full">
          {updateStatus === 'updating' ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[12px] font-extrabold theme-text">{otaPercent}%</span>
              <div className="w-16 h-1 bg-zinc-900 rounded-full overflow-hidden">
                <div className="h-full theme-bg transition-all" style={{ width: `${otaPercent}%` }} />
              </div>
            </div>
          ) : (
            <Download 
              className={`h-16 w-16 transition-all duration-300 ${
                updateStatus === 'available' 
                  ? 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-bounce' 
                  : 'text-zinc-650 group-hover:text-zinc-400'
              }`}
            />
          )}
        </div>

        <div className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 text-center w-full">
          {updateStatus === 'checking' && 'CHECKING...'}
          {updateStatus === 'updating' && 'UPDATING'}
          {updateStatus === 'available' && 'DEPLOY OTA'}
          {updateStatus === 'no-update' && 'UP TO DATE'}
          {updateStatus === null && 'CHECK UPDATE'}
          {updateStatus === 'error' && 'FAILED'}
        </div>
      </button>

      {/* 4. THEME SELECTION CARD */}
      <section className="w-[200px] shrink-0 p-5 rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#16181d] to-[#0f1114] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">THEMES</span>
        
        <div className="grid grid-cols-5 gap-1 my-auto py-2">
          {[
            { id: 'amber', colorClass: 'bg-[#ff8e00]', label: 'AMB' },
            { id: 'emerald', colorClass: 'bg-[#00ff66]', label: 'EME' },
            { id: 'cyan', colorClass: 'bg-[#00ffff]', label: 'CYA' },
            { id: 'amethyst', colorClass: 'bg-[#a855f7]', label: 'AME' },
            { id: 'ruby', colorClass: 'bg-[#ff3366]', label: 'RUB' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={`p-1 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center gap-1 active:scale-95 ${
                theme === t.id
                  ? 'bg-zinc-900 border-zinc-700 text-white font-bold'
                  : 'bg-zinc-950/40 border-transparent text-zinc-500 hover:border-zinc-900'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full ${t.colorClass} border border-black/20 shrink-0`} />
              <span className="text-[6px] font-bold uppercase tracking-wider">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-550 text-center w-full">
          THEME: {theme?.toUpperCase()}
        </div>
      </section>

      {/* 5. SEARCH CATALOG PANEL (Medium-Large Width) */}
      <section className="w-[380px] shrink-0 p-5 rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#16181d] to-[#0f1114] flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 relative group overflow-hidden">
        <div className="flex flex-col h-full justify-between">
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-zinc-900 shrink-0">
            <span className="text-[9px] font-extrabold tracking-widest text-zinc-550 uppercase">
              [04] SOURCE SEARCH CATALOG
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
