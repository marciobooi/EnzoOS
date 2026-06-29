import React, { useContext } from 'react';
import { Search, Radio, Heart } from 'lucide-react';
import { Tk } from './shared';
import { api } from '../../api';
import { reportError } from '../../lib/errors';
import { useI18n } from '../../i18n';

const QUICK_GENRES = ['Jazz', 'Classical', 'Lo-Fi', 'Ambient', 'Electronic', 'Rock', 'News', 'Chill'];

export default function RadioTab() {
  const { t } = useI18n();
  const {
    C, card, cardWhite, fontLabel,
    radioSearch, setRadioSearch, stationsList, isSearching,
    handleRadioSearch, handleToggleFavRadio, favoriteStations,
    wakeKiosk, setSource, setActiveTab,
  } = useContext(Tk);

  const handlePlayStation = async station => {
    try {
      wakeKiosk();
      await api.localPlayRadio(station.url, station.name, station.favicon);
      setSource('radio');
      setActiveTab('player');
    } catch (e) { reportError(e.message); }
  };

  const isSearchMode = radioSearch.trim().length > 0;

  return (
    <div className="flex flex-col pt-5 pb-2">

      {/* header */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('radio.title')}</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('source.search')}</h2>
      </div>

      {/* search bar */}
      <div className="px-4 flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
            style={{ color: C.text3 }} />
          <input
            type="text"
            placeholder={t('radio.placeholder')}
            value={radioSearch}
            onChange={e => setRadioSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRadioSearch()}
            className="w-full rounded-xl pl-10 pr-4 py-3 text-[15px] focus:outline-none"
            style={{ ...card, color: C.text1 }}
          />
        </div>
        <button
          onClick={handleRadioSearch}
          disabled={isSearching}
          className="px-5 py-3 rounded-xl text-[14px] font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }}
        >
          {isSearching ? '…' : t('radio.go')}
        </button>
      </div>

      <p className="px-6 mb-2 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: C.text3, fontFamily: C.fontLabel }}>
        {isSearchMode ? t('radio.results', { n: stationsList.length }) : t('radio.favorites', { n: favoriteStations.length })}
      </p>

      {/* station list */}
      <div className="mx-4 rounded-xl overflow-hidden" style={cardWhite}>
        {stationsList.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Radio className="h-8 w-8 mx-auto mb-3" style={{ color: C.outline }} />
            <p className="text-[15px] font-medium mb-1" style={{ color: C.text1 }}>{t('radio.noFavorites')}</p>
            <p className="text-[13px] mb-4" style={{ color: C.text4 }}>{t('radio.tryGenre')}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_GENRES.map(g => (
                <button key={g}
                  onClick={() => { setRadioSearch(g); handleRadioSearch(); }}
                  className="px-3 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition-all cursor-pointer"
                  style={{ background: C.containerLow, color: C.champagne, border: `0.5px solid ${C.champagne}40`, fontFamily: C.fontLabel }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        ) : stationsList.map((station, idx) => {
          const isFav = favoriteStations.some(s => s.url === station.url);
          return (
            <React.Fragment key={`${station.url}-${idx}`}>
              {idx > 0 && (
                <div className="ml-16"
                  style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
              )}
              <div className="flex items-center gap-3 px-4 py-3 list-item-rise"
                style={{ animationDelay: `${Math.min(idx * 0.035, 0.35)}s` }}>
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
                <button
                  onClick={() => handleToggleFavRadio(station)}
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
