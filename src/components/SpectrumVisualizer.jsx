import React from 'react';

export default function SpectrumVisualizer({ isPlaying }) {
  return (
    <div className="w-full flex items-end justify-center gap-1.5 h-12 bg-black/40 border border-slate-900 rounded-xl p-3 mb-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-radial-gradient(var(--color-amber-matrix-dim) 15%, transparent 15%) bg-[size:4px_4px] pointer-events-none" />
      {[...Array(24)].map((_, i) => (
        <div 
          key={i} 
          className="w-1.5 rounded bg-gradient-to-t from-amber-600 via-[#ff8e00] to-[#ffa733] transition-all duration-300 shadow-[0_0_4px_var(--color-amber-matrix-glow)]"
          style={{ 
            height: isPlaying ? `${Math.floor(Math.random() * 100)}%` : '10%',
            animation: isPlaying ? `crt-flicker ${Math.floor(Math.random() * 200) + 100}ms infinite` : 'none'
          }}
        />
      ))}
    </div>
  );
}
