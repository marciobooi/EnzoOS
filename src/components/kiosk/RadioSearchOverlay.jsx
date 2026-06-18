import { useContext } from 'react';
import { Kk } from './KioskContext';
import RadioPanel from '../RadioPanel';
import { S } from '../../styles/stone';

export default function RadioSearchOverlay() {
  const {
    isRadioSearchOpen,
    setIsRadioSearchOpen,
    source,
    handleToggleSource,
    radioCountry,
    setRadioCountry,
    stationsList,
    isSearching,
    handleRadioByCountry,
    handlePlayRadio,
    favoriteStations,
    handleToggleFavoriteRadio,
  } = useContext(Kk);

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
        isRadioSearchOpen
          ? 'opacity-100 scale-100 pointer-events-auto'
          : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}
    >
      <RadioPanel
        onToggleSource={() => handleToggleSource('radio')}
        onClose={() => setIsRadioSearchOpen(false)}
        radioCountry={radioCountry}
        setRadioCountry={setRadioCountry}
        stationsList={stationsList}
        isSearching={isSearching}
        handleRadioByCountry={handleRadioByCountry}
        onPlayRadio={(url, name, favicon) => {
          handlePlayRadio(url, name, favicon);
          setIsRadioSearchOpen(false);
        }}
        favoriteStations={favoriteStations}
        onToggleFavoriteRadio={handleToggleFavoriteRadio}
      />
    </div>
  );
}
