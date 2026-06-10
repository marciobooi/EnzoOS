import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat } from 'lucide-react';

export default function Controls({ status, shuffle, repeat, onPlay, onPause, onNext, onPrevious, onToggleShuffle, onToggleRepeat }) {
  return (
    <div className="flex flex-col items-center justify-center pt-4">
      <div className="flex items-center space-x-6">

        <button
          onClick={onToggleShuffle}
          className={`transition-colors ${shuffle ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
        >
          <Shuffle size={24} />
        </button>

        <button onClick={onPrevious} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
          <SkipBack size={36} fill="currentColor" />
        </button>

        {status === 'playing' ? (
          <button
            onClick={onPause}
            className="w-16 h-16 flex items-center justify-center bg-[var(--accent)] text-white rounded-full hover:brightness-110 transition-colors shadow-[0_0_15px_var(--accent)]"
          >
            <Pause size={32} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onPlay}
            className="w-16 h-16 flex items-center justify-center bg-[var(--accent)] text-white rounded-full hover:brightness-110 transition-colors shadow-[0_0_15px_var(--accent)]"
          >
            <Play size={32} fill="currentColor" className="ml-1" />
          </button>
        )}

        <button onClick={onNext} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
          <SkipForward size={36} fill="currentColor" />
        </button>

        <button
          onClick={onToggleRepeat}
          className={`transition-colors ${repeat ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
        >
          <Repeat size={24} />
        </button>

      </div>
    </div>
  );
}
