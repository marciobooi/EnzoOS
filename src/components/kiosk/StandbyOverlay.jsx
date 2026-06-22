import { useContext, useEffect, useRef } from 'react';
import { Power } from 'lucide-react';
import { Kk } from './KioskContext';
import ResonanceLogo from '../ResonanceLogo';

// How long the welcome intro plays before handing off to the player. The logo
// loop is ~4.6s; we cut just after the "resonance" wordmark is fully shown.
const WELCOME_MS = 4200;

export default function StandbyOverlay() {
  const {
    standby,
    transitionScreen,
    handleToggleStandby,
    onWelcomeDone,
  } = useContext(Kk);

  // Keep the latest callback without re-arming the timer on every kiosk re-render.
  const doneRef = useRef(onWelcomeDone);
  useEffect(() => { doneRef.current = onWelcomeDone; });

  // The logo animation loops, so (unlike the old video's onEnded) we dismiss the
  // welcome screen on a timer once the intro has played through.
  useEffect(() => {
    if (transitionScreen !== 'welcome') return;
    const t = setTimeout(() => doneRef.current?.(), WELCOME_MS);
    return () => clearTimeout(t);
  }, [transitionScreen]);

  if (!standby && transitionScreen !== 'welcome' && transitionScreen !== 'goodbye') return null;

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

      {/* ── Welcome — pure CSS/HTML origami logo intro ─────────────────── */}
      {transitionScreen === 'welcome' && (
        <div className="fixed inset-0 z-[9998] bg-black flex items-center justify-center pointer-events-none select-none animate-kiosk-welcome">
          <ResonanceLogo />
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
