import React, { useState, useEffect } from 'react';
import { Waves, ChevronRight, ChevronLeft, Check, X, ShieldAlert, Cpu } from 'lucide-react';
import { api } from '../api';

const QUESTIONS = [
  {
    id: 1,
    question: "What kind of speakers do you have?",
    description: "Configures CamillaDSP outputs for standard stereo or separates low frequencies to a subwoofer channel.",
    options: [
      { label: "2 Speakers (Stereo)", value: "stereo" },
      { label: "2 Speakers + 1 Subwoofer", value: "subwoofer" }
    ],
    action: "CamillaDSP Action: Configures audio pipeline route to either 2.0 (Stereo) output or 2.1 crossover routing, splitting low frequencies to a dedicated LFE sub channel."
  },
  {
    id: 2,
    question: "How does your room sound when you clap your hands?",
    description: "Echoey rooms need soft roll-offs to sound natural, while dry rooms benefit from crisp highs.",
    options: [
      { label: "Echoey (Bare floors, high ceilings, lots of glass)", value: "echoey" },
      { label: "Normal (Has rugs, curtains, or standard furniture)", value: "normal" },
      { label: "Quiet/Soft (Lots of carpets, heavy couches, or wall panels)", value: "quiet" }
    ],
    action: "CamillaDSP Action: For 'Echoey', applies a high-frequency roll-off shelf filter starting at 8kHz (-3dB). For 'Quiet', keeps high frequency response crisp (0dB shelf)."
  },
  {
    id: 3,
    question: "Where are you sitting compared to your speakers?",
    description: "Applies precise delays to align the sound waves from both speakers at your seat.",
    options: [
      { label: "Right in the Middle", value: "center" },
      { label: "Closer to the Left Speaker", value: "left" },
      { label: "Closer to the Right Speaker", value: "right" }
    ],
    action: "CamillaDSP Action: If off-center, calculates and injects a 1.2ms time-delay filter to the closer channel, aligning sound arrivals at your listening position."
  },
  {
    id: 4,
    question: "How do you like your music to sound?",
    description: "Predefined parametric EQ voicing presets to suit your listening taste.",
    options: [
      { label: "Balanced & Natural (Studio style, how the artist intended)", value: "balanced" },
      { label: "Warm & Bass Punchy (Deeper bass, smooth highs for easy listening)", value: "warm" },
      { label: "Clear & Detailed (Boosts vocals, instruments, and high notes)", value: "clear" }
    ],
    action: "CamillaDSP Action: Maps to biquad filter curves. 'Warm' boosts low-shelf at 120Hz (+3dB) and cuts 10kHz (-1dB). 'Clear' boosts vocals/treble presence at 3kHz (+2dB)."
  },
  {
    id: 5,
    question: "How big are your main speakers?",
    description: "Protects smaller woofers from over-excursion and distortion by filtering out deep sub-bass.",
    options: [
      { label: "Small / Desktop (Like computer speakers or small bookshelves)", value: "small" },
      { label: "Medium / Bookshelf (Standard size, fits on a stand or shelf)", value: "medium" },
      { label: "Large / Floor-standing (Big tower speakers that sit on the floor)", value: "large" }
    ],
    action: "CamillaDSP Action: For 'Small', applies a Butterworth high-pass filter at 80Hz (12dB/octave). 'Medium' high-passes at 45Hz. 'Large' allows full-range down to 20Hz."
  },
  {
    id: 6,
    question: "At what volume do you usually listen to music?",
    description: "Compensates for the human ear's reduced sensitivity to bass at lower levels (Equal Loudness).",
    options: [
      { label: "Quiet / Background (Late night listening, working, chatting)", value: "quiet" },
      { label: "Normal / Moderate (Comfortable, everyday listening)", value: "normal" },
      { label: "Loud / Party (Crank it up, filling the room)", value: "loud" }
    ],
    action: "CamillaDSP Action: For 'Quiet', activates a dynamic loudness contour filter (Fletcher-Munson compensation) boosting sub-bass (+4dB) and highs (+2dB)."
  },
  {
    id: 7,
    question: "Where are your speakers placed?",
    description: "Acoustic boundaries (walls and corners) amplify bass, creating boomy or muddy sound.",
    options: [
      { label: "Out in the open (Away from walls, on stands)", value: "open" },
      { label: "Pushed against a wall (On a console, desk, or near a back wall)", value: "wall" },
      { label: "Tucked in a corner / Shelf (Enclosed space or corner of the room)", value: "corner" }
    ],
    action: "CamillaDSP Action: For 'Wall', applies a low-shelf boundary filter at 180Hz (-2dB). For 'Corner', applies a low-shelf boundary filter at 180Hz (-4dB)."
  }
];

export default function DspWizard({ onClose }) {
  const [currentStep, setCurrentStep] = useState(0); // 0 to 6, or 7 (success screen)
  const [answers, setAnswers] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Load existing calibration on mount
  useEffect(() => {
    async function loadCalibration() {
      try {
        const saved = await api.getDspCalibration();
        if (saved) {
          setAnswers(saved);
        }
      } catch (err) {
        console.warn('Failed to load existing DSP calibration:', err);
      }
    }
    loadCalibration();
  }, []);

  const handleSelectOption = (value) => {
    const nextAnswers = {
      ...answers,
      [QUESTIONS[currentStep].id]: value
    };
    setAnswers(nextAnswers);

    // Auto-advance or apply calibration
    setTimeout(async () => {
      if (currentStep < QUESTIONS.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        setIsSaving(true);
        try {
          await api.saveDspCalibration(nextAnswers);
          setCurrentStep(QUESTIONS.length); // Navigate to success step
        } catch (err) {
          console.error('Failed to save calibration profile:', err);
        } finally {
          setIsSaving(false);
        }
      }
    }, 180);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const activeQuestion = QUESTIONS[currentStep];
  const selectedValue = activeQuestion ? answers[activeQuestion.id] : null;

  // Render Success Screen
  if (currentStep === QUESTIONS.length) {
    return (
      <div className="flex flex-col h-full text-zinc-150 p-6 select-none font-mono">
        <div className="flex justify-between items-center mb-3 shrink-0">
          <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-1.5">
            <Cpu className="h-4 w-4 animate-pulse" />
            Calibration Completed Successfully
          </h4>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer text-[10px] font-extrabold px-3 py-1 rounded-lg bg-white/5 border border-white/10 active:scale-95"
          >
            CLOSE [X]
          </button>
        </div>

        <div className="flex-grow flex flex-col justify-center items-center gap-3 text-center my-auto">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-pulse mb-1">
            <Check className="h-8 w-8 stroke-[2.5]" />
          </div>
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Acoustic Profile Generated</h2>
          <p className="text-[10px] text-zinc-400 max-w-md leading-relaxed font-sans">
            CamillaDSP active filters and biquad curves have been recalculated and hot-reloaded successfully on the Resonance backend server.
          </p>

          <div className="bg-black/35 border border-white/5 rounded-xl p-3 text-left w-full max-w-lg mt-1 font-mono text-[9px] text-zinc-500 space-y-1 max-h-[100px] overflow-y-auto custom-scrollbar">
            <p className="text-zinc-400 font-bold uppercase tracking-wider mb-1">Applied DSP Map:</p>
            <p>• Channel Layout: {answers[1] === 'subwoofer' ? '2.1 Crossover Active (80Hz Linkwitz-Riley)' : '2.0 Pass-Through'}</p>
            <p>• Room Reflection EQ: {answers[2] === 'echoey' ? 'Tamed HF Shelf (-3dB @ 8kHz)' : 'Flat HF Response'}</p>
            <p>• Speaker Delay: {answers[3] === 'left' ? 'Left channel delayed 1.2ms' : answers[3] === 'right' ? 'Right channel delayed 1.2ms' : '0.0ms Time Alignment'}</p>
            <p>• Voicing Target: {answers[4] ? answers[4].toUpperCase() : 'BALANCED'}</p>
            <p>• Low-Frequency HPF: {answers[5] === 'small' ? '80Hz Protective Cut' : answers[5] === 'medium' ? '45Hz Infrasonic Cut' : 'Full Range (20Hz)'}</p>
            <p>• Loudness Mode: {answers[6] === 'quiet' ? 'Fletcher-Munson Active' : 'Off (Reference Flat)'}</p>
            <p>• Boundary EQ: {answers[7] === 'wall' ? 'Wall boundary cut (-2dB)' : answers[7] === 'corner' ? 'Corner boundary cut (-4dB)' : 'None (Free space)'}</p>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="mt-3 w-full py-2.5 rounded-xl bg-emerald-500 text-black font-extrabold text-[10px] uppercase tracking-wider active:scale-95 transition-all cursor-pointer hover:bg-emerald-400"
        >
          Return to Player display
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-zinc-150 p-6 select-none font-mono">
      {/* Header */}
      <div className="flex justify-between items-center mb-3 shrink-0">
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] theme-text flex items-center gap-1.5">
          <Waves className="h-4 w-4 text-[var(--theme-color)]" />
          CamillaDSP Acoustic Calibration Wizard
        </h4>
        <button 
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-colors cursor-pointer text-[10px] font-extrabold px-3 py-1 rounded-lg bg-white/5 border border-white/10 active:scale-95 font-sans"
        >
          CLOSE [X]
        </button>
      </div>

      {/* Step Progress Bar */}
      <div className="w-full flex items-center gap-2 mb-3 shrink-0">
        <span className="text-[9px] text-zinc-550 shrink-0 font-bold">
          STEP {String(currentStep + 1).padStart(2, '0')} / {String(QUESTIONS.length).padStart(2, '0')}
        </span>
        <div className="flex-grow h-1 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
          {QUESTIONS.map((_, idx) => (
            <div 
              key={idx}
              className={`h-full flex-grow transition-all duration-350 ${
                idx <= currentStep ? 'bg-[var(--theme-color)]' : 'bg-white/5'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question Layout (Split horizontally for 1400x320 screen aspect) */}
      <div className="flex-grow flex flex-row gap-6 items-stretch min-h-0">
        
        {/* Left Side: Question Details */}
        <div className="w-[45%] flex flex-col justify-between p-4 bg-black/20 border border-white/5 rounded-2xl min-h-0">
          <div className="space-y-1">
            <span className="text-[8px] font-extrabold text-[var(--theme-color)] uppercase tracking-widest">QUESTION DATA CARD</span>
            <h3 className="text-[11px] font-bold text-white uppercase tracking-wide leading-normal">
              {activeQuestion.question}
            </h3>
            <p className="text-[9px] text-zinc-400 leading-relaxed font-sans">
              {activeQuestion.description}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/5 text-[8px] text-zinc-500 leading-normal flex items-start gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-zinc-650 shrink-0 mt-0.5" />
            <p className="font-mono">{activeQuestion.action}</p>
          </div>
        </div>

        {/* Right Side: Options Selector */}
        <div className="w-[55%] flex flex-col gap-2 overflow-y-auto pr-1.5 custom-scrollbar min-h-0">
          {activeQuestion.options.map((opt) => {
            const isSelected = selectedValue === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelectOption(opt.value)}
                className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all duration-200 cursor-pointer ${
                  isSelected 
                    ? 'bg-[var(--theme-color)]/5 border-[var(--theme-color)] text-white' 
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
                type="button"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider">{opt.label}</span>
                {isSelected ? (
                  <Check className="h-4 w-4 text-[var(--theme-color)] shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-white/10 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

      </div>

      {/* Navigation Footer */}
      <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-[10px] font-extrabold text-rose-500 hover:text-rose-400 transition-colors cursor-pointer font-sans"
        >
          <X className="h-4 w-4" />
          QUIT WIZARD
        </button>

        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="flex items-center gap-1.5 text-[10px] font-extrabold text-zinc-500 hover:text-white disabled:opacity-20 disabled:hover:text-zinc-500 transition-colors cursor-pointer font-sans"
        >
          <ChevronLeft className="h-4 w-4" />
          PREVIOUS QUESTION
        </button>
      </div>
    </div>
  );
}
