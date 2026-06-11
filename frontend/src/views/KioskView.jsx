import NowPlaying from '../components/NowPlaying';
import Controls from '../components/Controls';
import SourceSelect from '../components/SourceSelect';
import VUMeter from '../components/VUMeter';

import { Radio as RadioIcon } from 'lucide-react';

export default function KioskView({ state, sendAction, vuStyle, onOpenWizard, onOpenNetwork, onOpenSystem, onOpenRadio }) {
  return (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="w-full h-[320px] max-h-[320px] flex flex-row items-stretch bg-[#050505] relative shadow-2xl">

      {/* LEFT COLUMN: Source & Menus (300px fixed) */}
      <div className="w-[300px] h-full bg-[#0a0a0a]/80 backdrop-blur-xl border-r border-white/5 flex flex-col shrink-0">
        <div className="h-[48px] px-2 flex items-center justify-center border-b border-white/5">
           <span className="text-[10px] tracking-[0.3em] text-[#ffb800] opacity-80 uppercase font-bold">Input Source</span>
        </div>
        <div className="flex-1 p-2">
          <SourceSelect currentSource={state.source} onChange={(src) => sendAction('source', src)} />
        </div>
        <button
          onClick={onOpenRadio}
          className="mx-2 mb-2 py-2 flex items-center justify-center space-x-2 bg-black/40 border border-[#007aff]/30 text-[#007aff] hover:bg-[#007aff]/10 rounded-lg text-[10px] uppercase tracking-widest transition-all"
        >
          <RadioIcon size={14} /> <span>Web Radio</span>
        </button>
        <div className="h-[64px] flex border-t border-white/5">
           <button onClick={onOpenWizard} className="flex-1 flex items-center justify-center text-[10px] uppercase tracking-widest text-white/50 hover:text-[#ffb800] hover:bg-white/5 transition-all">
             DSP
           </button>
           <button onClick={onOpenNetwork} className="flex-1 flex items-center justify-center text-[10px] uppercase tracking-widest text-white/50 hover:text-[#ffb800] hover:bg-white/5 transition-all border-l border-r border-white/5">
             NET
           </button>
           <button onClick={onOpenSystem} className="flex-1 flex items-center justify-center text-[10px] uppercase tracking-widest text-white/50 hover:text-[#ffb800] hover:bg-white/5 transition-all">
             SYS
           </button>
        </div>
      </div>

      {/* CENTER COLUMN: Now Playing (Flexible) */}
      <div className="flex-1 h-full flex items-center px-12 gap-8 relative overflow-hidden">
        {/* We place the blur on a sibling, NOT an absolute overlay over the content */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 blur-[60px] pointer-events-none"
          style={{ backgroundImage: state.track.albumArtUrl ? `url(${state.track.albumArtUrl})` : 'none' }}
        ></div>

        <NowPlaying track={state.track} status={state.status} />
      </div>

      {/* RIGHT COLUMN: Controls & VU Meters (300px fixed) */}
      <div className="w-[300px] h-full bg-[#0a0a0a]/80 backdrop-blur-xl border-l border-white/5 flex flex-col shrink-0">
        <div className="flex-1 flex flex-col justify-center px-6">
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

        <div className="px-6 py-4">
          <div className="flex justify-between text-[10px] text-white/50 mb-2 font-mono uppercase tracking-widest">
             <span>Vol</span>
             <span>{state.volume}%</span>
          </div>
          <input
            type="range"
            min="0" max="100"
            value={state.volume}
            onChange={(e) => sendAction('volume', parseInt(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none accent-[#ffb800]"
          />
        </div>

        <div className="h-[80px] w-full px-6 pb-4 pt-2 flex items-end justify-center border-t border-white/5">
           <VUMeter left={state.vuMeters.left} right={state.vuMeters.right} styleType={vuStyle} />
        </div>
      </div>

      </div>
    </div>
  );
}
