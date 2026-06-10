import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat } from 'lucide-react';

export default function Controls({ status, shuffle, repeat, onPlay, onPause, onNext, onPrevious, onToggleShuffle, onToggleRepeat }) {
  return (
    <div className="flex flex-col w-full gap-4">
      <div className="flex items-center justify-between px-2">

        <button
          onClick={onToggleShuffle}
          className={`p-2 rounded-full transition-all ${shuffle ? 'text-[#007aff] bg-[#007aff]/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
        >
          <Shuffle size={20} />
        </button>

        <div className="flex items-center gap-6">
          <button onClick={onPrevious} className="text-white/70 hover:text-white transition-colors active:scale-95">
            <SkipBack size={32} fill="currentColor" />
          </button>

          <button
            onClick={status === 'playing' ? onPause : onPlay}
            className="w-16 h-16 flex items-center justify-center bg-[#ffb800] text-black rounded-full hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,184,0,0.4)]"
          >
            {status === 'playing' ? (
               <Pause size={28} fill="currentColor" />
            ) : (
               <Play size={28} fill="currentColor" className="ml-1" />
            )}
          </button>

          <button onClick={onNext} className="text-white/70 hover:text-white transition-colors active:scale-95">
            <SkipForward size={32} fill="currentColor" />
          </button>
        </div>

        <button
          onClick={onToggleRepeat}
          className={`p-2 rounded-full transition-all ${repeat ? 'text-[#007aff] bg-[#007aff]/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
        >
          <Repeat size={20} />
        </button>

      </div>
    </div>
  );
}
