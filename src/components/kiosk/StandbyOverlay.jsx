import { useContext, useEffect, useRef } from 'react';
import { Power } from 'lucide-react';
import { Kk } from './KioskContext';

const VIDEO_SRC = '/media/1.mp4';
const VIDEO_FIT = 'cover'; // 'cover' | 'contain'

export default function StandbyOverlay() {
  const {
    standby,
    transitionScreen,
    handleToggleStandby,
    getGreeting,
    scale = 1,
    onWelcomeDone,
  } = useContext(Kk);

  const videoRef = useRef(null);

  // Play from start whenever welcome screen mounts
  useEffect(() => {
    if (transitionScreen !== 'welcome' || !videoRef.current) return;
    const v = videoRef.current;
    v.currentTime = 0;
    v.play().catch(() => {
      // Autoplay blocked (e.g. no user gesture yet) — dismiss anyway via fallback
    });
  }, [transitionScreen]);

  if (!standby && transitionScreen !== 'welcome' && transitionScreen !== 'goodbye') return null;

  // Player canvas dimensions (always 1400 × 320 before scale is applied)
  const W = 1400 * scale;
  const H = 320  * scale;

  return (
    <>
      {/* ── Full-screen standby ─────────────────────────────────────────── */}
      {standby && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center flex-col animate-fade-in">
          <button
            onClick={() => handleToggleStandby(false)}
            className="group flex flex-col items-center justify-center gap-4 cursor-pointer focus:outline-none transition-all active:scale-95 screensaver-float"
            type="button"
            aria-label="Power on system"
          >
            <div className="w-24 h-24 rounded-full border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/35 flex items-center justify-center transition-all duration-500 shadow-inner group-hover:scale-105">
              <Power className="h-10 w-10 text-white/40 group-hover:text-white/70 transition-colors duration-500" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/30 group-hover:text-white/55 transition-colors duration-500 font-sans font-extrabold mt-1">
              Tap to Wake
            </span>
          </button>
        </div>
      )}

      {/* ── Welcome (video) — fills the full viewport ─────────────────── */}
      {transitionScreen === 'welcome' && (
        <div className="fixed inset-0 z-[9998] bg-black pointer-events-none select-none animate-kiosk-welcome">
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            muted
            playsInline
            preload="auto"
            onEnded={onWelcomeDone}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: VIDEO_FIT, objectPosition: 'center -30%' }}
          />
          <div className="absolute inset-0 bg-black/25" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
            <div className="text-[9px] font-mono uppercase tracking-[0.55em] text-white/40">
              Resonance HiFi
            </div>
            <div className="text-[3.8rem] font-black text-white tracking-tight leading-none">
              {getGreeting()}
            </div>
            <div className="w-10 h-px bg-white/20" />
            <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-white/35">
              Enjoy the music
            </div>
          </div>
        </div>
      )}

      {/* ── Goodbye — fills the full viewport ──────────────────────────── */}
      {transitionScreen === 'goodbye' && (
        <div className="fixed inset-0 z-[9998] bg-black flex items-center justify-center pointer-events-none select-none animate-kiosk-goodbye">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="text-[3.8rem] font-black text-white tracking-tight leading-none">
              See you soon
            </div>
            <div className="w-10 h-px bg-white/12" />
            <div className="text-[9px] font-mono uppercase tracking-[0.55em] text-white/20">
              Resonance HiFi
            </div>
          </div>
        </div>
      )}
    </>
  );
}
