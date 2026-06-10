import NowPlaying from '../components/NowPlaying';
import Controls from '../components/Controls';
import SourceSelect from '../components/SourceSelect';
import VUMeter from '../components/VUMeter';

export default function KioskView({ state, sendAction, vuStyle, onOpenWizard, onOpenNetwork, onOpenSystem, onOpenRadio }) {
  return (
    <div className="w-full h-screen flex flex-row items-center p-4">

      {/* LEFT COLUMN: Source & Menus */}
      <div className="flex-1 flex flex-col justify-between h-full pr-6 border-r border-white/10">
        <div className="space-y-4">
          <SourceSelect currentSource={state.source} onChange={(src) => sendAction('source', src)} />
          <button
            onClick={onOpenRadio}
            className="w-full py-3 glass-panel border border-[var(--accent)] text-[var(--text-main)] rounded-xl font-bold shadow-lg"
          >
            📻 Explore Web Radio
          </button>
        </div>

        <div className="mt-4 flex flex-col space-y-3">
          <div className="flex space-x-2">
            <button onClick={onOpenWizard} className="flex-1 py-3 glass-panel hover:bg-white/10 rounded-xl text-sm font-semibold transition-all">DSP</button>
            <button onClick={onOpenNetwork} className="flex-1 py-3 glass-panel hover:bg-white/10 rounded-xl text-sm font-semibold transition-all">Network</button>
            <button onClick={onOpenSystem} className="flex-1 py-3 glass-panel hover:bg-white/10 rounded-xl text-sm font-semibold transition-all">OS</button>
          </div>

          <div>
            <label className="text-[var(--text-muted)] text-sm mb-2 block font-medium">Master Volume ({state.volume}%)</label>
            <input
              type="range"
              min="0" max="100"
              value={state.volume}
              onChange={(e) => sendAction('volume', parseInt(e.target.value))}
              className="w-full accent-[var(--accent)] h-2 rounded-lg appearance-none bg-black/50"
            />
          </div>
        </div>
      </div>

      {/* CENTER COLUMN: Now Playing */}
      <div className="flex-[2] px-8 flex items-center justify-center h-full">
        <NowPlaying track={state.track} status={state.status} />
      </div>

      {/* RIGHT COLUMN: Controls & VU Meters */}
      <div className="flex-1 flex flex-col justify-between h-full pl-6 border-l border-white/10">
        <Controls status={state.status} onPlay={() => sendAction('play')} onPause={() => sendAction('pause')} />

        <div className="mt-auto pt-4 flex justify-center items-end h-32">
           <VUMeter left={state.vuMeters.left} right={state.vuMeters.right} styleType={vuStyle} />
        </div>
      </div>

    </div>
  );
}
