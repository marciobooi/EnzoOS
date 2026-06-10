import { HardDrive, MonitorSpeaker, Radio, Airplay } from 'lucide-react';

const SOURCES = [
  { id: 'mpd', name: 'MPD', Icon: HardDrive },
  { id: 'spotify', name: 'Spotify', Icon: MonitorSpeaker },
  { id: 'airplay', name: 'AirPlay', Icon: Airplay },
  { id: 'tidal', name: 'TIDAL', Icon: Radio },
];

export default function SourceSelect({ currentSource, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      {SOURCES.map(source => {
        const isActive = currentSource === source.id;
        return (
          <button
            key={source.id}
            onClick={() => onChange(source.id)}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl transition-all duration-300 ${
              isActive
                ? 'bg-[#ffb800]/10 border border-[#ffb800]/30 text-[#ffb800] shadow-[inset_0_0_20px_rgba(255,184,0,0.1)]'
                : 'bg-black/20 border border-white/5 text-white/50 hover:bg-white/5 hover:text-white'
            }`}
          >
            <source.Icon size={24} className={isActive ? 'opacity-100' : 'opacity-70'} />
            <span className="text-[10px] uppercase tracking-widest font-bold">{source.name}</span>
          </button>
        );
      })}
    </div>
  );
}
