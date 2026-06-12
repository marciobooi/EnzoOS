import React from 'react';
import { Sliders, Music, Download, LogOut } from 'lucide-react';
import { api } from '../api';

export default function DefinitionsMenu({
  token,
  handleLogout,
  theme,
  onThemeChange,
  spotify,
  onToggleSource,
  updateStatus,
  setUpdateStatus,
  otaPercent,
  setOtaPercent,
  setOtaProgress,
  errorMessage,
  setErrorMessage
}) {

  // Theme Cycler Logic
  const themesList = ['amber', 'emerald', 'cyan', 'amethyst', 'ruby'];
  const handleCycleTheme = () => {
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
        await api.triggerUpdate();
      } catch (err) {
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
        setUpdateStatus('error');
        setErrorMessage(err.message || 'Check failed.');
      }
    }
  };

  return (
    <div className="flex flex-row gap-6 font-sans text-zinc-800 h-full pb-3 pr-4 items-stretch select-none">
      
      {/* 1. SPOTIFY CARD */}
      <button
        onClick={() => {
          if (!spotify) onToggleSource();
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] ${
          spotify 
            ? 'border-2 border-zinc-650 bg-gradient-to-b from-white to-zinc-50 scale-[1.02]' 
            : 'border-zinc-200/80 bg-gradient-to-b from-[#ffffff] to-[#eef2f7] hover:border-zinc-300 hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">STREAM SERVICE</span>
        
        <div className="my-auto flex justify-center py-2">
          <svg 
            viewBox="0 0 24 24" 
            className={`h-16 w-16 transition-all duration-300 ${
              spotify ? 'fill-zinc-800 drop-shadow-[0_4px_10px_rgba(0,0,0,0.08)]' : 'fill-zinc-350 group-hover:fill-zinc-450'
            }`}
          >
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/>
          </svg>
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={spotify ? 'text-zinc-800 font-extrabold' : 'text-zinc-400'}>SPOTIFY</span>
          {spotify && <span className="text-zinc-800 font-black">ACTIVE</span>}
        </div>
      </button>

      {/* 2. LOCAL MUSIC CARD */}
      <button
        onClick={() => {
          if (spotify) onToggleSource();
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] ${
          !spotify 
            ? 'border-2 border-zinc-650 bg-gradient-to-b from-white to-zinc-50 scale-[1.02]' 
            : 'border-zinc-200/80 bg-gradient-to-b from-[#ffffff] to-[#eef2f7] hover:border-zinc-300 hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">LOCAL SYSTEM</span>
        
        <div className="my-auto flex justify-center py-2">
          <Music 
            className={`h-16 w-16 transition-all duration-300 ${
              !spotify ? 'text-zinc-800 drop-shadow-[0_4px_10px_rgba(0,0,0,0.08)]' : 'text-zinc-350 group-hover:text-zinc-455'
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={!spotify ? 'text-zinc-800 font-extrabold' : 'text-zinc-400'}>LOCAL PLAYER</span>
          {!spotify && <span className="text-zinc-800 font-black">ACTIVE</span>}
        </div>
      </button>

      {/* 3. CYCLE THEME CARD */}
      <button
        onClick={handleCycleTheme}
        className="w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] border-zinc-200/80 bg-gradient-to-b from-[#ffffff] to-[#eef2f7] hover:border-zinc-300 hover:scale-[1.01]"
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">APPEARANCE</span>
        
        <div className="my-auto flex justify-center py-2">
          <Sliders 
            className="h-16 w-16 text-zinc-350 group-hover:text-zinc-455 transition-colors"
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className="text-zinc-500">THEME</span>
          <span className="text-zinc-800 font-extrabold">{theme?.toUpperCase()}</span>
        </div>
      </button>

      {/* 4. UPDATE SYSTEM CARD */}
      <button
        onClick={handleUpdateClick}
        disabled={updateStatus === 'updating' || updateStatus === 'checking'}
        className="w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] border-zinc-200/80 bg-gradient-to-b from-[#ffffff] to-[#eef2f7] hover:border-zinc-300 hover:scale-[1.01]"
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">SYSTEM FIRMWARE</span>
        
        <div className="my-auto flex justify-center py-2 w-full">
          {updateStatus === 'updating' ? (
            <div className="flex flex-col items-center gap-1.5 w-full">
              <span className="text-[12px] font-extrabold text-zinc-800">{otaPercent}%</span>
              <div className="w-16 h-1 bg-zinc-200 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-800 transition-all" style={{ width: `${otaPercent}%` }} />
              </div>
            </div>
          ) : (
            <Download 
              className={`h-16 w-16 transition-all duration-300 ${
                updateStatus === 'available' 
                  ? 'text-zinc-800 animate-bounce' 
                  : 'text-zinc-350 group-hover:text-zinc-455'
              }`}
            />
          )}
        </div>

        <div className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 text-center w-full">
          {updateStatus === 'checking' && 'CHECKING...'}
          {updateStatus === 'updating' && 'UPDATING'}
          {updateStatus === 'available' && 'DEPLOY UPDATE'}
          {updateStatus === 'no-update' && 'UP TO DATE'}
          {updateStatus === null && 'CHECK UPDATE'}
          {updateStatus === 'error' && 'FAILED'}
        </div>
      </button>

      {/* 5. SPOTIFY LOGOUT/LINK DISCONNECT */}
      {token && (
        <button
          onClick={handleLogout}
          className="w-[180px] shrink-0 p-5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] border-zinc-200/80 bg-gradient-to-b from-[#ffffff] to-[#eef2f7] hover:border-rose-350 hover:scale-[1.01]"
        >
          <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">CONNECTIONS</span>
          
          <div className="my-auto flex justify-center py-2">
            <LogOut 
              className="h-16 w-16 text-zinc-350 group-hover:text-rose-500 transition-colors"
            />
          </div>

          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 text-center w-full">
            DISCONNECT SPOTIFY
          </div>
        </button>
      )}

    </div>
  );
}
