import { Laptop, Smartphone, Speaker, RefreshCw, Sliders, Terminal } from 'lucide-react';

export default function OutputPatchBay({
  deviceId,
  isLocalDeviceActive,
  devices,
  isFetchingDevices,
  fetchDevices,
  transferPlayback
}) {
  return (
    <div className="p-6 rounded-2xl bg-gradient-to-b from-[#22252c] to-[#0f1013] border border-[#303643] shadow-xl flex flex-col h-full font-mono relative">
      
      {/* Header of Cast bay */}
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-zinc-900/60">
        <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
          <Sliders className="h-4 w-4 text-[#ff8e00]" />
          Output Patch Bay
        </h3>
        <button 
          onClick={fetchDevices}
          disabled={isFetchingDevices}
          className="text-zinc-500 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          title="Scan Cast Channels"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetchingDevices ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Device Lists (Channels) */}
      <div className="space-y-3 overflow-y-auto flex-grow max-h-[290px] custom-scrollbar pr-1">
        
        {/* Local Connect channel */}
        {deviceId && (
          <div 
            onClick={() => transferPlayback(deviceId)}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
              isLocalDeviceActive 
                ? 'bg-[#ff8e00]/5 border-[#ff8e00]/40' 
                : 'bg-zinc-950/60 border-zinc-900 hover:border-zinc-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Laptop className={`h-4 w-4 shrink-0 ${isLocalDeviceActive ? 'text-[#ff8e00]' : 'text-zinc-500'}`} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate uppercase">LOCAL_RX_CORES</p>
                <p className="text-[9px] text-zinc-500">Resonance Connect Browser</p>
              </div>
            </div>
            <span className={`text-[8px] tracking-wider font-extrabold px-2 py-0.5 rounded border ${
              isLocalDeviceActive 
                ? 'bg-[#ff8e00]/15 text-[#ff8e00] border-[#ff8e00]/10 shadow-[0_0_4px_rgba(255,142,0,0.25)]' 
                : 'bg-zinc-950 text-zinc-600 border-zinc-900'
            }`}>
              {isLocalDeviceActive ? 'PATCHED' : 'STANDBY'}
            </span>
          </div>
        )}

        {/* Remote channels */}
        {devices
          .filter(d => d.id !== deviceId)
          .map((d, index) => {
            const isActive = d.is_active;
            return (
              <div 
                key={d.id}
                onClick={() => transferPlayback(d.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isActive 
                    ? 'bg-[#ff8e00]/5 border-[#ff8e00]/40' 
                    : 'bg-zinc-950/60 border-zinc-900 hover:border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {d.type.toLowerCase() === 'smartphone' ? (
                    <Smartphone className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#ff8e00]' : 'text-zinc-500'}`} />
                  ) : d.type.toLowerCase() === 'speaker' ? (
                    <Speaker className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#ff8e00]' : 'text-zinc-500'}`} />
                  ) : (
                    <Laptop className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#ff8e00]' : 'text-zinc-500'}`} />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate uppercase">OUT_{String.fromCharCode(65 + index)}_{d.name?.toUpperCase().replace(/\s+/g, '_') || ''}</p>
                    <p className="text-[9px] text-zinc-500 truncate">{d.name} ({d.type})</p>
                  </div>
                </div>
                <span className={`text-[8px] tracking-wider font-extrabold px-2 py-0.5 rounded border ${
                  isActive 
                    ? 'bg-[#ff8e00]/15 text-[#ff8e00] border-[#ff8e00]/10 shadow-[0_0_4px_rgba(255,142,0,0.25)]' 
                    : 'bg-zinc-950 text-zinc-650 border-zinc-900'
                }`}>
                  {isActive ? 'PATCHED' : 'STANDBY'}
                </span>
              </div>
            );
          })}

        {devices.length === 0 && !deviceId && (
          <div className="text-center py-6 text-zinc-500 text-[10px] flex flex-col items-center justify-center border border-dashed border-zinc-900 rounded-xl">
            <Terminal className="h-5 w-5 text-zinc-600 mb-2 animate-pulse" />
            <span>NO DYNAMIC OUTPUT NODES FOUND.</span>
            <span>OPEN SPOTIFY APP TO INITIATE.</span>
          </div>
        )}

      </div>

      <div className="mt-4 pt-3.5 border-t border-zinc-900/60 text-[9px] text-zinc-500 leading-relaxed bg-zinc-950/40 rounded-lg p-3 select-none">
        <p className="font-bold text-zinc-400 mb-1">PATCH BAY STATUS:</p>
        <p>Channels auto-detected. Click any active STANDBY block to route audio buffers to that device.</p>
      </div>
    </div>
  );
}
