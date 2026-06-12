import React, { useState } from 'react';
import { Sliders, Music, Download, LogOut, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';

const RADIO_STATIONS = [
  { name: 'SomaFM: Groove Salad', url: 'http://ice1.somafm.com/groovesalad-128-mp3' },
  { name: 'SomaFM: DEF CON Radio', url: 'http://ice1.somafm.com/defcon-128-mp3' },
  { name: 'Lofi Girl Ambient', url: 'http://play.stream.lofigirl.com/lofi' },
  { name: 'Chilltrax Ambient', url: 'https://chilltrax.dnshosting.net/chilltrax.mp3' },
  { name: 'Jazz Radio Classic', url: 'http://jazzradio.ice.infomaniak.ch/jazzradio-high.mp3' }
];

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
  setErrorMessage,
  onPlayRadio
}) {
  const [radioSearch, setRadioSearch] = useState('');
  const [stationsList, setStationsList] = useState(RADIO_STATIONS);
  const [isSearching, setIsSearching] = useState(false);

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
    <div className="flex flex-row gap-6 font-sans text-zinc-100 h-full pb-3 pr-4 items-stretch select-none">
      
      {/* 1. SPOTIFY CARD */}
      <button
        onClick={() => {
          if (!spotify) onToggleSource();
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          spotify ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">STREAM SERVICE</span>
        
        <div className="my-auto flex justify-center py-2">
          <svg 
            viewBox="0 0 24 24" 
            className={`h-16 w-16 transition-all duration-300 ${
              spotify ? 'fill-[var(--theme-color)] drop-shadow-[0_0_10px_var(--theme-color-glow)]' : 'fill-zinc-500 group-hover:fill-zinc-350'
            }`}
          >
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/>
          </svg>
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={spotify ? 'text-white font-extrabold' : 'text-zinc-400'}>SPOTIFY</span>
          {spotify && <span className="text-[var(--theme-color)] font-black">ACTIVE</span>}
        </div>
      </button>

      {/* 2. LOCAL MUSIC CARD */}
      <button
        onClick={() => {
          if (spotify) onToggleSource();
        }}
        className={`w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden cursor-pointer ${
          !spotify ? 'active-card scale-[1.02]' : 'menu-card hover:scale-[1.01]'
        }`}
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">LOCAL SYSTEM</span>
        
        <div className="my-auto flex justify-center py-2">
          <Music 
            className={`h-16 w-16 transition-all duration-300 ${
              !spotify ? 'text-[var(--theme-color)] drop-shadow-[0_0_10px_var(--theme-color-glow)]' : 'text-zinc-500 group-hover:text-zinc-350'
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider w-full">
          <span className={!spotify ? 'text-white font-extrabold' : 'text-zinc-400'}>LOCAL PLAYER</span>
          {!spotify && <span className="text-[var(--theme-color)] font-black">ACTIVE</span>}
        </div>
      </button>

      {/* 3. CYCLE THEME CARD */}
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
          <span className="text-zinc-400">THEME</span>
          <span className="text-white font-extrabold">{theme?.toUpperCase()}</span>
        </div>
      </button>

      {/* 4. UPDATE SYSTEM CARD */}
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

      {/* 5. WEB RADIO CARD */}
      <div
        className="w-[180px] shrink-0 p-5 rounded-2xl text-left flex flex-col justify-between transition-all duration-300 relative group overflow-hidden menu-card hover:scale-[1.01]"
      >
        <span className="text-[9px] font-extrabold tracking-widest text-zinc-400 uppercase">WEB RADIO</span>
        
        <div className="my-auto flex flex-col items-center py-2 w-full gap-2.5">
          <div className="flex items-center gap-1.5 w-full">
            <Radio 
              className={`h-4.5 w-4.5 text-zinc-500 group-hover:text-[var(--theme-color)] transition-colors ${isSearching ? 'animate-pulse' : ''}`}
            />
            <input
              type="text"
              placeholder="Search station..."
              value={radioSearch}
              onChange={(e) => setRadioSearch(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const query = radioSearch.trim();
                  if (!query) {
                    setStationsList(RADIO_STATIONS);
                    return;
                  }
                  try {
                    setIsSearching(true);
                    const res = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(query)}?limit=25&hidebroken=true`);
                    const data = await res.json();
                    const formatted = data.map(s => ({
                      name: s.name.length > 22 ? s.name.substring(0, 20) + '...' : s.name,
                      url: s.url_resolved || s.url
                    }));
                    if (formatted.length === 0) {
                      toast.error('No stations found.');
                      setStationsList(RADIO_STATIONS);
                    } else {
                      setStationsList(formatted);
                      toast.success(`Found ${formatted.length} stations!`);
                    }
                  } catch (err) {
                    toast.error('Failed to search stations.');
                  } finally {
                    setIsSearching(false);
                  }
                }
              }}
              className="w-full bg-zinc-950/40 hover:bg-zinc-950/75 border border-white/10 rounded-lg px-2.5 py-1 font-mono text-[9px] text-zinc-200 focus:outline-none focus:border-[var(--theme-color)]"
            />
          </div>

          <select
            onChange={async (e) => {
              const selected = stationsList.find(s => s.url === e.target.value);
              if (selected) {
                if (onPlayRadio) {
                  onPlayRadio(selected.url, selected.name);
                } else {
                  try {
                    await api.localPlayRadio(selected.url, selected.name);
                    if (spotify) onToggleSource();
                    toast.success(`Playing Radio: ${selected.name}`);
                  } catch (err) {
                    toast.error(`Failed to play radio: ${err.message}`);
                  }
                }
              }
            }}
            className="w-full bg-zinc-950/80 border border-white/10 rounded-lg px-2 py-1.5 font-mono text-[9px] text-zinc-300 focus:outline-none focus:border-[var(--theme-color)] cursor-pointer"
            defaultValue=""
          >
            <option value="" disabled className="bg-zinc-950 text-zinc-500">
              {isSearching ? 'SEARCHING...' : 'SELECT STATION'}
            </option>
            {stationsList.map((s, idx) => (
              <option key={`${s.url}-${idx}`} value={s.url} className="bg-zinc-950 text-zinc-100">
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 text-center w-full">
          GLOBAL TUNE SEARCH
        </div>
      </div>

    </div>
  );
}
