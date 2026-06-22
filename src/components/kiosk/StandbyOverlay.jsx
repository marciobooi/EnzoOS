import { useContext, useEffect, useRef } from 'react';
import { Power } from 'lucide-react';
import { Kk } from './KioskContext';
import ResonanceLogo, { ResonanceWordmark } from '../ResonanceLogo';

// How long the welcome intro plays before handing off to the player. The logo
// loop is ~4.6s; we cut just after the "resonance" wordmark is fully shown.
const WELCOME_MS = 4200;

// The origami theme's page background (warm Paperwhite paper + corner vignettes),
// copied from origami.css so the welcome sits on the same surface as the skin.
const ORIGAMI_BG =
  'radial-gradient(ellipse 55% 55% at 100% 0%, rgba(160,148,128,0.42) 0%, transparent 50%),' +
  'radial-gradient(ellipse 50% 50% at 0% 100%, rgba(172,158,136,0.35) 0%, transparent 50%),' +
  'radial-gradient(ellipse 45% 45% at 95% 95%, rgba(150,138,118,0.30) 0%, transparent 44%),' +
  'radial-gradient(ellipse 40% 40% at 5% 5%, rgba(164,150,130,0.26) 0%, transparent 42%),' +
  'linear-gradient(162deg, #F6F2EA 0%, #F0ECE4 45%, #E8E0D2 100%)';

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

      {/* ── Welcome — pure CSS/HTML origami logo intro on the origami paper ─ */}
      {transitionScreen === 'welcome' && (
        <div className="fixed inset-0 z-[9998] pointer-events-none select-none animate-kiosk-welcome"
          style={{ background: ORIGAMI_BG }}>
          <ResonanceLogo bare />
        </div>
      )}

      {/* ── Goodbye — on the same origami paper background ──────────────── */}
      {transitionScreen === 'goodbye' && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none select-none animate-kiosk-goodbye"
          style={{ background: ORIGAMI_BG }}>
          <div className="flex flex-col items-center gap-4 text-center">
            <ResonanceWordmark />
            <div className="w-10 h-px" style={{ background: 'rgba(13,12,9,0.18)' }} />
            <div className="text-[11px] font-mono uppercase tracking-[0.5em]" style={{ color: '#8A8479' }}>
              See you soon
            </div>
          </div>
        </div>
      )}
    </>
  );
}
