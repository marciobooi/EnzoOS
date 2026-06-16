import React, { useContext } from 'react';
import { Search, Radio, Music, Heart } from 'lucide-react';
import { Tk, SpotifyIcon } from './shared';
import { api } from '../../api';
import { toast } from 'sonner';

export default function SourceTab() {
  const {
    C, card, cardWhite, btn, btnInset,
    source, radioSearch, setRadioSearch, stationsList, isSearching,
    handleToggleSource, handleRadioSearch, handleToggleFavRadio,
    favoriteStations, wakeKiosk, sendUpdate, setSource, setActiveTab,
  } = useContext(Tk);

  const handlePlayStation = async station => {
    try {
      wakeKiosk();
      await api.localPlayRadio(station.url, station.name, station.favicon);
      setSource('radio');
      sendUpdate('SET_SOURCE', { spotify: false, source: 'radio' });
      setActiveTab('player');
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="flex flex-col pt-5 pb-2">

      {/* header */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>Signal Chain</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Source</h2>
      </div>

      {/* source grid */}
      <div className="px-4 grid grid-cols-3 gap-3 mb-6">
        {[
          { id: 'spotify', label: 'Spotify', Icon: () => <SpotifyIcon className="h-6 w-6" style={{ fill: source === 'spotify' ? '#1ed760' : C.text4 }} /> },
          { id: 'local',   label: 'Local',   Icon: () => <Music  className="h-6 w-6" style={{ color: source === 'local'   ? C.champagne : C.text4 }} /> },
          { id: 'radio',   label: 'Radio',   Icon: () => <Radio  className="h-6 w-6" style={{ color: source === 'radio'   ? C.champagne : C.text4 }} /> },
        ].map(({ id, label, Icon }) => (
          <button key={id} onClick={() => handleToggleSource(id)}
            className="flex flex-col items-center justify-center gap-3 py-5 rounded-xl active:scale-95 transition-all cursor-pointer"
            style={source === id ? { ...btnInset, border: `0.5px solid ${C.champagne}40` } : { ...card }}>
            <Icon />
            <span className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: source === id ? C.champagne : C.text4, fontFamily: C.fontLabel }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* radio search label */}
      <div className="px-5 mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>Web Radio</p>
      </div>

      {/* search bar */}
      <div className="px-4 flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: C.text3 }} />
          <input type="text" placeholder="Station or genre…" value={radioSearch}
            onChange={e => setRadioSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRadioSearch()}
            className="w-full rounded-xl pl-10 pr-4 py-3 text-[15px] focus:outline-none"
            style={{ ...card, color: C.text1, fontFamily: C.font }} />
        </div>
        <button onClick={handleRadioSearch} disabled={isSearching}
          className="px-5 py-3 rounded-xl text-[14px] font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }}>
          {isSearching ? '…' : 'Go'}
        </button>
      </div>

      <p className="px-6 mb-2 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: C.text3, fontFamily: C.fontLabel }}>
        {radioSearch.trim() ? `${stationsList.length} results` : `${favoriteStations.length} favorites`}
      </p>

      {/* station list */}
      <div className="mx-4 rounded-xl overflow-hidden" style={cardWhite}>
        {stationsList.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Radio className="h-8 w-8 mx-auto mb-3" style={{ color: C.outline }} />
            <p className="text-[15px] font-medium" style={{ color: C.text1 }}>No favorites yet</p>
            <p className="text-[13px] mt-1" style={{ color: C.text4 }}>Search for stations above</p>
          </div>
        )}
        {stationsList.map((station, idx) => {
          const isFav = favoriteStations.some(s => s.url === station.url);
          return (
            <React.Fragment key={`${station.url}-${idx}`}>
              {idx > 0 && (
                <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
              )}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                  style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                  {station.favicon
                    ? <img src={station.favicon} alt="" className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none'; }} />
                    : <Radio className="h-4 w-4" style={{ color: C.text3 }} />}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePlayStation(station)}>
                  <p className="text-[15px] font-medium truncate" style={{ color: C.text1 }}>{station.name}</p>
                  <p className="text-[12px] truncate" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                    {station.country || 'Global'}{station.tags ? ` · ${station.tags.split(',')[0]}` : ''}
                  </p>
                </div>
                <button onClick={() => handleToggleFavRadio(station)}
                  className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
                  style={{ color: isFav ? C.error : C.outline }}>
                  <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
                </button>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
