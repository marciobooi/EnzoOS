import { useContext, useEffect, useRef } from 'react';
import { Power } from 'lucide-react';
import { Kk } from './KioskContext';

const VIDEO_SRC = '/media/1.mp4';

// Time settings
const VIDEO_START_TIME = 0;      // start video at 0 seconds
const VIDEO_PLAY_DURATION = 6;   // play for 6 seconds

// Aspect ratio / fit setting
const VIDEO_FIT = 'cover';
// use 'cover' to fill screen
// use 'contain' to keep full video visible

export default function StandbyOverlay() {
  const { standby, transitionScreen, handleToggleStandby, getGreeting } = useContext(Kk);
  const welcomeVideoRef = useRef(null);

  useEffect(() => {
    let timer;

    if (transitionScreen === 'welcome' && welcomeVideoRef.current) {
      const video = welcomeVideoRef.current;

      video.currentTime = VIDEO_START_TIME;

      const playPromise = video.play();

      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Browser may block autoplay if video is not muted.
        });
      }

      timer = setTimeout(() => {
        video.pause();
      }, VIDEO_PLAY_DURATION * 100000);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [transitionScreen]);

  if (!standby && transitionScreen !== 'welcome' && transitionScreen !== 'goodbye') return null;

  return (
    <>
      {standby && (
        <div className="absolute inset-0 bg-black z-[9999] flex items-center justify-center flex-col animate-fade-in">
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

      {transitionScreen === 'welcome' && (
        <div className="absolute inset-0 bg-black z-[9998] flex items-center justify-center pointer-events-none select-none animate-kiosk-welcome overflow-hidden">
          <video
            ref={welcomeVideoRef}
            className={`absolute inset-0 w-full h-full ${
              VIDEO_FIT === 'contain' ? 'object-contain' : 'object-cover'
            }`}
            src={VIDEO_SRC}
            autoPlay
            muted
            playsInline
            preload="auto"
          />

          <div className="absolute inset-0 bg-black/35" />

          <div className="relative z-10 flex flex-col items-center gap-5 text-center">
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

      {transitionScreen === 'goodbye' && (
        <div className="absolute inset-0 bg-black z-[9998] flex items-center justify-center pointer-events-none select-none animate-kiosk-goodbye">
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