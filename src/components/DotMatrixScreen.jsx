
export default function DotMatrixScreen({
  isLocalDeviceActive,
  trackName,
  trackArtist,
  trackPosition,
  trackDuration,
  volume,
  isMuted
}) {
  // Format milliseconds into MM:SS
  const formatTime = (ms) => {
    if (isNaN(ms) || ms < 0) return '00:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Generate a progress bar string in dot-matrix notation (e.g. "■■■■■■■■■■□□□□□□□□□□")
  const getDotBar = () => {
    const totalDots = 28;
    if (trackDuration === 0) return '•'.repeat(totalDots);
    const filledDots = Math.round((trackPosition / trackDuration) * totalDots);
    return '█'.repeat(filledDots) + '•'.repeat(Math.max(0, totalDots - filledDots));
  };

  // Generate a mini volume indicator for the dot-matrix top bar
  const getVolumeIndicator = () => {
    const totalBars = 8;
    const activeBars = Math.round((isMuted ? 0 : volume / 100) * totalBars);
    return '|'.repeat(activeBars) + '.'.repeat(Math.max(0, totalBars - activeBars));
  };

  return (
    <div className="w-full dot-matrix-screen rounded-xl p-5 md:p-6 overflow-hidden relative border border-black min-h-[200px] flex flex-col justify-between crt-flicker">
      {/* Retro screen hardware filter layers */}
      <div className="dot-matrix-grid" />
      <div className="crt-scanlines" />
      
      {/* Top Status row */}
      <div className="relative z-10 flex items-center justify-between text-[11px] font-doto tracking-widest font-black uppercase text-amber-500 opacity-90">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_#ff8e00] ${!isMuted && trackDuration > 0 ? 'animate-ping' : ''}`} />
          <span className="glow-text-amber">
            {isLocalDeviceActive ? 'DEV: LOCAL' : 'DEV: REMOTE'}
          </span>
        </div>
        <span className="glow-text-amber tracking-widest">
          VOL [{getVolumeIndicator()}]
        </span>
      </div>

      {/* Middle: Big Track Window */}
      <div className="relative z-10 my-4 text-center overflow-hidden w-full flex flex-col items-center py-2">
        <div className="w-full overflow-hidden text-center h-10 flex items-center justify-center">
          <div className="text-[26px] md:text-[34px] font-doto font-extrabold uppercase glow-text-amber select-none tracking-widest truncate max-w-full">
            {trackName}
          </div>
        </div>
        <div className="text-[12px] md:text-[14px] font-doto font-bold uppercase glow-text-amber select-none tracking-widest truncate max-w-full mt-1.5 opacity-80">
          BY: {trackArtist}
        </div>
      </div>

      {/* Bottom Row: Dot progress track & Clocks */}
      <div className="relative z-10 flex flex-col gap-2.5 mt-2 w-full font-doto text-[11px] font-black uppercase">
        <div className="flex items-center justify-between text-amber-500 opacity-90">
          <span className="glow-text-amber">
            TIME: {formatTime(trackPosition)}
          </span>
          <span className="glow-text-amber">
            TOTAL: {formatTime(trackDuration)}
          </span>
        </div>

        <div className="w-full text-center text-amber-500 overflow-hidden select-none tracking-wide text-xs glow-text-amber h-4 flex items-center justify-center font-bold">
          {getDotBar()}
        </div>
      </div>
    </div>
  );
}
