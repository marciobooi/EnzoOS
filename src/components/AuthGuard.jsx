import React from 'react';
import { Radio, Terminal } from 'lucide-react';

export default function AuthGuard({
  manualTokenInput,
  setManualTokenInput,
  handleApplyManualToken
}) {
  return (
    <div className="w-full h-full flex items-center justify-between p-4 gap-8">
      
      {/* Screen Glare */}
      <div className="absolute top-0 left-0 w-full h-[30%] bg-gradient-to-b from-white/3 to-transparent pointer-events-none z-10" />

      {/* LEFT COMPONENT: Welcome, Logo & Description */}
      <div className="w-[500px] flex items-center gap-6 border-r border-zinc-900/60 pr-8 h-full relative z-20">
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-[#ff8e00] relative shrink-0">
          <div className="absolute inset-0 bg-[#ff8e00]/5 blur-md" />
          <Radio className="h-10 w-10 text-[#ff8e00]" />
        </div>

        <div className="flex flex-col justify-center min-w-0">
          <h2 className="text-xl font-bold tracking-widest text-white uppercase mb-2 font-mono">
            RESONANCE HIFI
          </h2>
          <span className="text-[9px] uppercase font-bold tracking-[0.25em] text-[#ff8e00] mb-2 font-mono">
            SYSTEM AUTHORIZATION REQUIRED
          </span>
          <p className="text-xs text-zinc-400 leading-relaxed font-mono">
            Establish a secure audio link to Spotify's client network to process stream buffers and load tracks.
          </p>
        </div>
      </div>

      {/* RIGHT COMPONENT: Action Panel (Manual Input Form) */}
      <div className="flex-grow flex items-center justify-center h-full relative z-20 pl-4">
        
        <form onSubmit={handleApplyManualToken} className="w-[360px] flex flex-col justify-center gap-2 font-mono">
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest font-mono">Developer Keyway</span>
          <input 
            type="text" 
            placeholder="INPUT ACCESS TOKEN KEY..." 
            value={manualTokenInput}
            onChange={e => setManualTokenInput(e.target.value)}
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-950 border border-zinc-900 text-[#ff8e00] placeholder-zinc-800 text-xs focus:outline-none focus:border-[#ff8e00]/40 transition-colors tracking-wide text-center"
          />
          <button 
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-xs text-zinc-300 hover:text-white font-bold uppercase tracking-wider border border-zinc-800 transition-all cursor-pointer"
          >
            Mount Custom Token
          </button>
          
          <div className="text-[8.5px] text-zinc-500 flex items-start gap-1 p-2 rounded bg-zinc-950/40 border border-zinc-950 mt-1">
            <Terminal className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
            <span>
              Need a key? Copy a temp token from Spotify's <a href="https://developer.spotify.com/documentation/web-api/reference/get-users-profile" target="_blank" rel="noreferrer" className="text-[#ff8e00] hover:underline">documentation portal</a>.
            </span>
          </div>
        </form>

      </div>

    </div>
  );
}
