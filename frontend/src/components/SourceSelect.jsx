import { HardDrive, MonitorSpeaker, Radio, Airplay } from 'lucide-react';

const SOURCES = [
  { id: 'mpd', name: 'Local / MPD', Icon: HardDrive },
  { id: 'spotify', name: 'Spotify', Icon: MonitorSpeaker },
  { id: 'airplay', name: 'AirPlay', Icon: Airplay },
  { id: 'tidal', name: 'TIDAL', Icon: Radio },
];

export default function SourceSelect({ currentSource, onChange }) {
  return (
    <div className="flex flex-col space-y-2 pt-4">
      <h3 className="text-gray-400 text-sm font-semibold mb-2 uppercase tracking-wide">Input Source</h3>
      {SOURCES.map(source => (
        <button
          key={source.id}
          onClick={() => onChange(source.id)}
          className={`px-4 py-3 flex items-center space-x-3 rounded-xl border transition-all font-medium ${
            currentSource === source.id
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_0_15px_var(--accent)]'
              : 'border-white/10 bg-black/30 text-[var(--text-muted)] hover:border-white/30 hover:text-[var(--text-main)]'
          }`}
        >
          <source.Icon size={18} />
          <span>{source.name}</span>
        </button>
      ))}
    </div>
  );
}
