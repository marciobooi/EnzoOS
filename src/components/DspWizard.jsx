import React, { useState, useEffect } from 'react';
import { Waves, ChevronLeft, Check, X, Cpu, AudioLines } from 'lucide-react';
import { api } from '../api';
import { S, cardShadow } from '../styles/stone';

export const QUESTIONS = [
  {
    id: "0",
    question: "Choose your Audio Processing Mode",
    description: "Decide whether to use the manual parametric equalizer or let the Acoustic DSP profiler calibrate your audio output automatically.",
    options: [
      { label: "Manual Equalizer", sublabel: "Parametric EQ, presets, tone control", value: "eq" },
      { label: "Acoustic Room Correction", sublabel: "Harman curve + room calibration filters", value: "dsp" },
      { label: "Pure Direct", sublabel: "Flat signal — no EQ or DSP processing", value: "pure-direct" },
    ],
    action: "Manual EQ and Room Correction apply CamillaDSP filter chains. Pure Direct bypasses all filters — signal goes through the mixer only with volume control preserved.",
  },
  {
    id: "1",
    question: "What kind of speakers do you have?",
    description: "Configures Acoustic DSP outputs for standard stereo or separates low frequencies to a subwoofer channel.",
    options: [
      { label: "2 Speakers", sublabel: "Stereo", value: "stereo" },
      { label: "2 Speakers + 1 Subwoofer", sublabel: "2.1 crossover", value: "subwoofer" },
    ],
    action: "Configures audio pipeline to either 2.0 stereo output or 2.1 crossover routing, splitting low frequencies to a dedicated LFE sub channel.",
  },
  {
    id: "2",
    question: "How does your room sound when you clap?",
    description: "Echoey rooms need soft roll-offs to sound natural, while dry rooms benefit from crisp highs.",
    options: [
      { label: "Echoey", sublabel: "Bare floors, high ceilings, lots of glass", value: "echoey" },
      { label: "Normal", sublabel: "Rugs, curtains, or standard furniture", value: "normal" },
      { label: "Quiet / Soft", sublabel: "Carpets, heavy couches, or wall panels", value: "quiet" },
    ],
    action: "For 'Echoey', applies a high-frequency roll-off shelf filter starting at 8kHz (−3dB). For 'Quiet', keeps high frequency response crisp (0dB shelf).",
  },
  {
    id: "3",
    question: "Where are you sitting relative to your speakers?",
    description: "Applies precise delays to align the sound waves from both speakers at your seat.",
    options: [
      { label: "Right in the Middle", sublabel: "Equidistant from both speakers", value: "center" },
      { label: "Closer to the Left", sublabel: "Off-centre left", value: "left" },
      { label: "Closer to the Right", sublabel: "Off-centre right", value: "right" },
    ],
    action: "If off-centre, calculates and injects a 1.2ms time-delay filter to the closer channel, aligning sound arrivals at your listening position.",
  },
  {
    id: "4",
    question: "How do you like your music to sound?",
    description: "Predefined parametric EQ voicing presets to suit your listening taste.",
    options: [
      { label: "Balanced & Natural", sublabel: "Studio style, as the artist intended", value: "balanced" },
      { label: "Warm & Punchy", sublabel: "Deeper bass, smooth highs for easy listening", value: "warm" },
      { label: "Clear & Detailed", sublabel: "Boosts vocals, instruments, and high notes", value: "clear" },
    ],
    action: "'Warm' boosts low-shelf at 120Hz (+3dB) and cuts 10kHz (−1dB). 'Clear' boosts vocals and treble presence at 3kHz (+2dB).",
  },
  {
    id: "5",
    question: "How big are your main speakers?",
    description: "Protects smaller woofers from over-excursion by filtering out deep sub-bass.",
    options: [
      { label: "Small / Desktop", sublabel: "Computer speakers or small bookshelves", value: "small" },
      { label: "Medium / Bookshelf", sublabel: "Standard size, fits on a stand or shelf", value: "medium" },
      { label: "Large / Floor-standing", sublabel: "Big tower speakers on the floor", value: "large" },
    ],
    action: "'Small' applies a Butterworth high-pass at 80Hz (12dB/oct). 'Medium' high-passes at 45Hz. 'Large' allows full-range down to 20Hz.",
  },
  {
    id: "6",
    question: "At what volume do you usually listen?",
    description: "Compensates for the human ear's reduced sensitivity to bass at lower levels (Equal Loudness).",
    options: [
      { label: "Quiet / Background", sublabel: "Late night, working, chatting", value: "quiet" },
      { label: "Normal / Moderate", sublabel: "Comfortable everyday listening", value: "normal" },
      { label: "Loud / Party", sublabel: "Filling the room", value: "loud" },
    ],
    action: "'Quiet' activates a dynamic loudness contour (Fletcher-Munson compensation) boosting sub-bass (+4dB) and highs (+2dB).",
  },
  {
    id: "7",
    question: "Where are your speakers placed?",
    description: "Acoustic boundaries amplify bass, creating boomy or muddy sound.",
    options: [
      { label: "Out in the open", sublabel: "Away from walls, on stands", value: "open" },
      { label: "Against a wall", sublabel: "On a console, desk, or near a back wall", value: "wall" },
      { label: "In a corner / shelf", sublabel: "Enclosed space or corner of the room", value: "corner" },
    ],
    action: "'Wall' applies a low-shelf boundary filter at 180Hz (−2dB). 'Corner' applies the same at (−4dB).",
  },
];

// ── Shared header bar ────────────────────────────────────────────────────────
function WizardHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-center justify-between pb-3 mb-3 shrink-0"
      style={{ borderBottom: `1px solid ${S.border}` }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ border: `1px solid ${S.border}` }}>
          <Waves className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
        </div>
        <div>
          <span className="text-sm font-light tracking-[0.25em] uppercase underline underline-offset-8 decoration-[#2a2826] decoration-1" style={{ color: S.label }}>
            {title}
          </span>
          {subtitle && (
            <span className="text-sm font-light ml-3" style={{ color: S.muted }}>{subtitle}</span>
          )}
        </div>
      </div>
      <button onClick={onClose}
        className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
        style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
        CLOSE
      </button>
    </div>
  );
}

export default function DspWizard({ onClose, onCalibrationComplete, pureDirect = false, onPureDirectChange }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api.getDspCalibration().then(saved => { if (saved) setAnswers(saved); }).catch(() => {});
  }, []);

  const handleSelectOption = (value) => {
    const nextAnswers = { ...answers, [QUESTIONS[currentStep].id]: value };
    setAnswers(nextAnswers);

    setTimeout(async () => {
      if (currentStep === 0) {
        setIsSaving(true);
        try {
          if (value === 'pure-direct') {
            // Pure Direct: disable all EQ/DSP, enable flat pipeline
            await api.saveDspCalibration({ ...nextAnswers, 0: 'eq' }); // treated as eq (dspActive=false)
            onCalibrationComplete?.(false);
            await onPureDirectChange?.(true);
            setCurrentStep(98);
          } else {
            // Manual EQ or Room Correction: ensure Pure Direct is off first
            if (pureDirect) await onPureDirectChange?.(false);
            await api.saveDspCalibration(nextAnswers);
            if (value === 'eq') {
              onCalibrationComplete?.(false);
              setCurrentStep(99);
            } else {
              setCurrentStep(1);
            }
          }
        } catch {}
        finally { setIsSaving(false); }
      } else if (currentStep < QUESTIONS.length - 1) {
        setCurrentStep(p => p + 1);
      } else {
        setIsSaving(true);
        try {
          await api.saveDspCalibration(nextAnswers);
          onCalibrationComplete?.(true);
          setCurrentStep(QUESTIONS.length);
        } catch {}
        finally { setIsSaving(false); }
      }
    }, 180);
  };

  // ── Pure Direct success ──────────────────────────────────────────────────────
  if (currentStep === 98) return (
    <div className="flex flex-col h-full font-sans p-6 select-none"
      style={{ background: S.bg, color: S.strong }}>
      <WizardHeader title="acoustic calibration wizard" subtitle="pure direct" onClose={onClose} />

      <div className="flex-grow flex flex-row gap-5 min-h-0">
        <div className="w-[38%] flex flex-col justify-center items-center gap-4 text-center shrink-0 rounded-2xl p-6"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ border: '1.5px solid #0e9ab8', background: S.bg }}>
            <AudioLines className="h-7 w-7" strokeWidth={1.5} style={{ color: '#0e9ab8' }} />
          </div>
          <div>
            <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>activated</p>
            <h2 className="text-xl font-bold" style={{ color: S.strong }}>Pure Direct Active</h2>
          </div>
          <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
            All EQ and DSP filters are bypassed. Volume control via CamillaDSP remains active.
          </p>
        </div>

        <div className="flex-grow flex flex-col justify-between min-h-0">
          <div className="space-y-3">
            <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
              The signal path is flat — source audio passes through the CamillaDSP mixer directly to the DAC with no filtering or frequency adjustment.
            </p>
            <div className="rounded-xl p-4 text-sm font-light space-y-1.5"
              style={{ background: S.surface, border: `1px solid ${S.border}`, color: S.muted }}>
              <p><span className="font-semibold" style={{ color: S.text }}>Manual EQ</span> — disabled while Pure Direct is active</p>
              <p><span className="font-semibold" style={{ color: S.text }}>Room Correction</span> — disabled while Pure Direct is active</p>
              <p><span className="font-semibold" style={{ color: S.text }}>Presets & bands</span> — preserved, resume when you switch back</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4 shrink-0">
            <button onClick={() => setCurrentStep(0)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, color: S.muted, boxShadow: cardShadow }}>
              Switch to Manual EQ or DSP
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              Return to Player
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── EQ success — 2-col: status left, info right ─────────────────────────────
  if (currentStep === 99) return (
    <div className="flex flex-col h-full font-sans p-6 select-none"
      style={{ background: S.bg, color: S.strong }}>
      <WizardHeader title="acoustic calibration wizard" subtitle="equalizer mode" onClose={onClose} />

      <div className="flex-grow flex flex-row gap-5 min-h-0">
        {/* Left — status */}
        <div className="w-[38%] flex flex-col justify-center items-center gap-4 text-center shrink-0 rounded-2xl p-6"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ border: `1.5px solid ${S.accent}`, background: S.bg }}>
            <Check className="h-7 w-7" strokeWidth={1.5} style={{ color: S.accent }} />
          </div>
          <div>
            <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>activated</p>
            <h2 className="text-xl font-bold" style={{ color: S.strong }}>Manual Equalizer Active</h2>
          </div>
        </div>

        {/* Right — info + buttons */}
        <div className="flex-grow flex flex-col justify-between min-h-0">
          <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
            Acoustic room correction filters are now bypassed. Adjust presets and frequency bands by tapping the VU dial on the main display.
          </p>
          <div className="flex gap-3 mt-4 shrink-0">
            <button onClick={() => setCurrentStep(0)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, color: S.muted, boxShadow: cardShadow }}>
              Configure Acoustic DSP instead
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              Return to Player
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── DSP success — 2-col: status left, DSP map right ─────────────────────────
  if (currentStep === QUESTIONS.length) return (
    <div className="flex flex-col h-full font-sans p-6 select-none"
      style={{ background: S.bg, color: S.strong }}>
      <WizardHeader title="acoustic calibration wizard" subtitle="calibration complete" onClose={onClose} />

      <div className="flex-grow flex flex-row gap-5 min-h-0">
        {/* Left — status */}
        <div className="w-[35%] flex flex-col justify-center items-center gap-4 text-center shrink-0 rounded-2xl p-6"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ border: `1.5px solid ${S.accent}`, background: S.bg }}>
            <Check className="h-7 w-7" strokeWidth={1.5} style={{ color: S.accent }} />
          </div>
          <div>
            <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>complete</p>
            <h2 className="text-xl font-bold" style={{ color: S.strong }}>Acoustic Profile Generated</h2>
          </div>
          <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
            DSP filters and biquad curves recalculated and hot-reloaded on the Resonance backend.
          </p>
        </div>

        {/* Right — DSP map + buttons */}
        <div className="flex-grow flex flex-col gap-4 min-h-0">
          <div className="flex-grow rounded-xl p-4 text-sm font-light overflow-y-auto stone-scrollbar"
            style={{ background: S.surface, border: `1px solid ${S.border}` }}>
            <p className="text-sm font-semibold mb-3 tracking-[0.15em] uppercase" style={{ color: S.label }}>Applied DSP Map</p>
            <div className="space-y-2">
              {[
                ['Channel Layout',    answers[1] === 'subwoofer' ? '2.1 Crossover — 80Hz Linkwitz-Riley' : '2.0 Stereo Pass-Through'],
                ['Room Reflection',   answers[2] === 'echoey' ? 'HF Shelf −3dB @ 8kHz' : 'Flat HF Response'],
                ['Speaker Delay',     answers[3] === 'left' ? 'Left +1.2ms' : answers[3] === 'right' ? 'Right +1.2ms' : '0.0ms — time-aligned'],
                ['Voicing Target',    answers[4] ? answers[4].charAt(0).toUpperCase() + answers[4].slice(1) : 'Balanced'],
                ['HPF Cutoff',        answers[5] === 'small' ? '80Hz protective cut' : answers[5] === 'medium' ? '45Hz infrasonic cut' : 'Full range — 20Hz'],
                ['Loudness Mode',     answers[6] === 'quiet' ? 'Fletcher-Munson active' : 'Off — reference flat'],
                ['Boundary EQ',       answers[7] === 'wall' ? 'Wall −2dB @ 180Hz' : answers[7] === 'corner' ? 'Corner −4dB @ 180Hz' : 'None — free space'],
              ].map(([key, val]) => (
                <div key={key} className="flex items-baseline justify-between gap-4 py-1.5"
                  style={{ borderBottom: `0.5px solid ${S.border}` }}>
                  <span className="text-sm font-light shrink-0" style={{ color: S.label }}>{key}</span>
                  <span className="text-sm font-medium text-right" style={{ color: S.strong }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 shrink-0">
            <button onClick={() => setCurrentStep(0)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, color: S.muted, boxShadow: cardShadow }}>
              Switch to Manual Equalizer
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              Return to Player
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Main wizard ─────────────────────────────────────────────────────────────
  const activeQuestion = QUESTIONS[currentStep];
  // For step 0: Pure Direct takes priority over the saved DSP calibration answer
  const selectedValue = activeQuestion
    ? (currentStep === 0 && pureDirect ? 'pure-direct' : answers[activeQuestion.id])
    : null;

  return (
    <div className="flex flex-col h-full font-sans p-6 select-none"
      style={{ background: S.bg, color: S.strong }}>

      <WizardHeader title="acoustic calibration wizard" onClose={onClose} />



      {/* Question layout */}
      <div className="flex-grow flex flex-col lg:flex-row gap-4 items-stretch min-h-0">

        {/* Left — question details */}
        <div className="w-full lg:w-[65%] flex flex-col justify-between rounded-2xl p-4 min-h-0"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="space-y-2">
            <h3 className="text-lg font-bold leading-snug" style={{ color: S.strong }}>
              {activeQuestion.question}
            </h3>
            <p className="text-[.9rem] font-light leading-relaxed " style={{ color: 'rgb(75 73 71)' }}>
              {activeQuestion.description}
            </p>
          </div>

          <div className="mt-3 pt-3 flex items-start gap-2"
            style={{ borderTop: `1px solid ${S.border}` }}>
            <Cpu className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1} style={{ color: S.label }} />
            <p className="text-sm font-light leading-relaxed" style={{ color: S.label }}>
              {activeQuestion.action}
            </p>
          </div>
        </div>

        {/* Right — options */}
        <div className="w-full lg:w-[35%] flex flex-col gap-2 overflow-y-auto stone-scrollbar min-h-0 pb-4">
          {activeQuestion.options.map(opt => {
            const isSelected = selectedValue === opt.value;
            // When Pure Direct is active on step 0, dim the EQ/DSP options to signal they're inactive
            const isDimmed = currentStep === 0 && pureDirect && opt.value !== 'pure-direct' && !isSelected;
            const isPureDirectOpt = opt.value === 'pure-direct';
            const accentColor = isPureDirectOpt ? '#0e9ab8' : S.accent;
            return (
              <button key={opt.value}
                onClick={() => handleSelectOption(opt.value)}
                className="w-full p-4 rounded-xl text-left flex items-center justify-between transition-all duration-200 cursor-pointer active:scale-[0.99]"
                style={{
                  background: isSelected ? S.surface : S.surfaceLo,
                  border: `1px solid ${isSelected ? accentColor : S.border}`,
                  boxShadow: cardShadow,
                  opacity: isDimmed ? 0.45 : 1,
                }}>
                <div>
                  <p className="text-base font-bold leading-tight"
                    style={{ color: isSelected ? S.strong : S.muted }}>
                    {opt.label}
                  </p>
                  {opt.sublabel && (
                    <p className="text-sm font-light mt-0.5" style={{ color: S.label }}>
                      {opt.sublabel}
                    </p>
                  )}
                </div>
                {isSelected
                  ? <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: accentColor }} />
                  : <div className="w-4 h-4 rounded-full shrink-0" style={{ border: `1px solid ${S.border}` }} />
                }
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer — only shown after user enters the DSP questionnaire (step 1+) */}
      {currentStep >= 1 && <div className="flex items-center gap-4 pt-1 shrink-0"
        style={{ borderTop: `1px solid ${S.border}` }}>

        {/* Step counter + bar */}
        <div className="flex items-center gap-3 flex-grow min-w-0">
          <span className="text-sm font-light shrink-0 tabular-nums" style={{ color: S.label }}>
            {String(currentStep + 1).padStart(2, '0')} / {String(QUESTIONS.length).padStart(2, '0')}
          </span>
          <div className="flex-grow h-1 rounded-full overflow-hidden flex gap-0.5"
            style={{ background: S.track }}>
            {QUESTIONS.map((_, idx) => (
              <div key={idx} className="h-full flex-grow transition-all duration-300"
                style={{ background: idx <= currentStep ? S.accent : S.track }} />
            ))}
          </div>
        </div>

        {/* Previous */}
        <button onClick={() => currentStep > 0 && setCurrentStep(p => p - 1)}
          disabled={currentStep === 0}
          className="flex items-center gap-1.5 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-25 shrink-0"
          style={{ color: S.muted }}>
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          Previous
        </button>

      </div>}
    </div>
  );
}
