import NowPlaying from '../components/NowPlaying';
import Controls from '../components/Controls';
import SourceSelect from '../components/SourceSelect';

// Dedicated layout for Portrait (Mobile / Remote Control)
export default function MobileView({ state, sendAction, onOpenWizard, onOpenSystem, onOpenRadio }) {
  return (
    <div className="w-full min-h-screen flex flex-col p-6 overflow-y-auto">

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-bold tracking-widest uppercase">Hi-Fi Remote</h1>
        <button onClick={onOpenSystem} className="p-2 glass-panel rounded-full">
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </button>
      </div>

      {/* Now Playing Area (Scaled down for portrait) */}
      <div className="flex-1 flex flex-col justify-center items-center py-8">
        <NowPlaying track={state.track} status={state.status} />
      </div>

      {/* Playback Controls */}
      <div className="mb-8">
        <Controls status={state.status} onPlay={() => sendAction('play')} onPause={() => sendAction('pause')} />
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
            className="flex-1 py-4 glass-panel border border-[var(--accent)] text-[var(--text-main)] rounded-xl font-bold shadow-lg"
          >
            Audio DSP
          </button>
          <button
            onClick={onOpenRadio}
            className="flex-1 py-4 glass-panel border border-[var(--accent)] text-[var(--text-main)] rounded-xl font-bold shadow-lg"
          >
            Web Radio
          </button>
        </div>
      </div>

    </div>
  );
}
