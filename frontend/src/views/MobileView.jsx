import NowPlaying from '../components/NowPlaying';
import Controls from '../components/Controls';
import SourceSelect from '../components/SourceSelect';
import { Settings, SlidersHorizontal, Radio as RadioIcon } from 'lucide-react';

// Dedicated layout for Portrait (Mobile / Remote Control)
export default function MobileView({ state, sendAction, onOpenWizard, onOpenSystem, onOpenRadio }) {
  return (
    <div className="w-full min-h-screen flex flex-col p-6 overflow-y-auto">

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-bold tracking-widest uppercase">Hi-Fi Remote</h1>
        <button onClick={onOpenSystem} className="p-2 glass-panel rounded-full hover:bg-white/10 transition-colors text-[var(--text-muted)] hover:text-white">
           <Settings size={24} />
        </button>
      </div>

      {/* Now Playing Area (Scaled down for portrait) */}
      <div className="flex-1 flex flex-col justify-center items-center py-8 scale-90">
        <NowPlaying track={state.track} status={state.status} />
      </div>

      {/* Playback Controls */}
      <div className="mb-8 w-full max-w-sm mx-auto">
        <Controls
          status={state.status}
          shuffle={state.shuffle}
          repeat={state.repeat}
          onPlay={() => sendAction('play')}
          onPause={() => sendAction('pause')}
          onNext={() => sendAction('next')}
          onPrevious={() => sendAction('previous')}
          onToggleShuffle={() => sendAction('shuffle', !state.shuffle)}
          onToggleRepeat={() => sendAction('repeat', !state.repeat)}
        />
      </div>

      {/* Volume Slider */}
      <div className="mb-10 px-4">
        <div className="flex justify-between text-xs text-[var(--text-muted)] mb-2 font-bold">
          <span>0%</span>
          <span>{state.volume}%</span>
          <span>100%</span>
        </div>
        <input
          type="range"
          min="0" max="100"
          value={state.volume}
          onChange={(e) => sendAction('volume', parseInt(e.target.value))}
          className="w-full accent-[var(--accent)] h-3 rounded-full appearance-none bg-black/50"
        />
      </div>

      {/* Source Selection & DSP */}
      <div className="space-y-4">
        <SourceSelect currentSource={state.source} onChange={(src) => sendAction('source', src)} />

        <div className="flex space-x-3 mt-4">
          <button
            onClick={onOpenWizard}
            className="flex-1 flex justify-center items-center space-x-2 py-4 glass-panel border border-[var(--accent)] text-[var(--text-main)] rounded-xl font-bold shadow-lg hover:bg-[var(--accent)] transition-colors"
          >
            <SlidersHorizontal size={20} /> <span>Audio DSP</span>
          </button>
          <button
            onClick={onOpenRadio}
            className="flex-1 flex justify-center items-center space-x-2 py-4 glass-panel border border-[var(--accent)] text-[var(--text-main)] rounded-xl font-bold shadow-lg hover:bg-[var(--accent)] transition-colors"
          >
            <RadioIcon size={20} /> <span>Web Radio</span>
          </button>
        </div>
      </div>

    </div>
  );
}
