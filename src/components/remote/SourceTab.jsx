import React, { useContext } from 'react';
import { Music, Radio, Airplay, Network, Bluetooth, Music2 } from 'lucide-react';
import { Tk, SpotifyIcon } from './shared';

export default function SourceTab() {
  const {
    C, card, btnInset,
    source, handleToggleSource, setActiveTab,
  } = useContext(Tk);

  const handleSelect = id => {
    handleToggleSource(id);
    if (id === 'radio') setActiveTab('radio');
  };

  const sources = [
    { id: 'spotify',   label: 'Spotify',   Icon: () => <SpotifyIcon className="h-6 w-6" style={{ fill: source === 'spotify'   ? '#1ed760'    : C.text4 }} /> },
    { id: 'local',     label: 'Local',     Icon: () => <Music      className="h-6 w-6" style={{ color: source === 'local'     ? C.champagne : C.text4 }} /> },
    { id: 'radio',     label: 'Radio',     Icon: () => <Radio      className="h-6 w-6" style={{ color: source === 'radio'     ? C.champagne : C.text4 }} /> },
    { id: 'airplay',   label: 'AirPlay',   Icon: () => <Airplay    className="h-6 w-6" style={{ color: source === 'airplay'   ? C.champagne : C.text4 }} /> },
    { id: 'upnp',      label: 'UPnP',      Icon: () => <Network    className="h-6 w-6" style={{ color: source === 'upnp'      ? C.champagne : C.text4 }} /> },
    { id: 'bluetooth', label: 'Bluetooth', Icon: () => <Bluetooth  className="h-6 w-6" style={{ color: source === 'bluetooth' ? C.champagne : C.text4 }} /> },
    { id: 'tidal',     label: 'Tidal',     Icon: () => <Music2     className="h-6 w-6" style={{ color: source === 'tidal'     ? C.champagne : C.text4 }} /> },
    { id: 'qobuz',     label: 'Qobuz',     Icon: () => <Music      className="h-6 w-6" style={{ color: source === 'qobuz'     ? C.champagne : C.text4 }} /> },
  ];

  return (
    <div className="flex flex-col pt-5 pb-2">

      {/* header */}
      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>Signal Chain</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Source</h2>
      </div>

      {/* source grid — 4 columns to fit all 8 sources */}
      <div className="px-4 grid grid-cols-4 gap-3">
        {sources.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => handleSelect(id)}
            className="flex flex-col items-center justify-center gap-3 py-5 rounded-xl active:scale-95 transition-all cursor-pointer input-btn"
            style={source === id ? { ...btnInset, border: `0.5px solid ${C.champagne}40` } : { ...card }}>
            <Icon />
            <span className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: source === id ? C.champagne : C.text4, fontFamily: C.fontLabel }}>
              {label}
            </span>
          </button>
        ))}
      </div>

    </div>
  );
}
