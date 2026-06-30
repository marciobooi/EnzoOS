import React, { useState, useEffect, useMemo } from 'react';
import { Waves, ChevronLeft, Check, X, Cpu, AudioLines } from 'lucide-react';
import { api } from '../api';
import { S, cardShadow } from '../styles/stone';
import { useI18n } from '../i18n';

// Builds the translated questionnaire. `id`/`value` fields stay stable
// (used as DB keys and answer matching) — only display text is translated.
// Exported as a function (not a static array) because RemoteDspWizard.jsx
// shares this same data and needs its own `t` from its own useI18n() call.
export function getQuestions(t) {
  return [
    {
      id: "0",
      question: t('dsp.q0.question'),
      description: t('dsp.q0.description'),
      options: [
        { label: t('dsp.q0.opt0Label'), sublabel: t('dsp.q0.opt0Sub'), value: "eq" },
        { label: t('dsp.q0.opt1Label'), sublabel: t('dsp.q0.opt1Sub'), value: "dsp" },
        { label: t('dsp.q0.opt2Label'), sublabel: t('dsp.q0.opt2Sub'), value: "pure-direct" },
      ],
      action: t('dsp.q0.action'),
    },
    {
      id: "1",
      question: t('dsp.q1.question'),
      description: t('dsp.q1.description'),
      options: [
        { label: t('dsp.q1.opt0Label'), sublabel: t('dsp.q1.opt0Sub'), value: "stereo" },
        { label: t('dsp.q1.opt1Label'), sublabel: t('dsp.q1.opt1Sub'), value: "subwoofer" },
      ],
      action: t('dsp.q1.action'),
    },
    {
      id: "2",
      question: t('dsp.q2.question'),
      description: t('dsp.q2.description'),
      options: [
        { label: t('dsp.q2.opt0Label'), sublabel: t('dsp.q2.opt0Sub'), value: "echoey" },
        { label: t('dsp.q2.opt1Label'), sublabel: t('dsp.q2.opt1Sub'), value: "normal" },
        { label: t('dsp.q2.opt2Label'), sublabel: t('dsp.q2.opt2Sub'), value: "quiet" },
      ],
      action: t('dsp.q2.action'),
    },
    {
      id: "3",
      question: t('dsp.q3.question'),
      description: t('dsp.q3.description'),
      options: [
        { label: t('dsp.q3.opt0Label'), sublabel: t('dsp.q3.opt0Sub'), value: "center" },
        { label: t('dsp.q3.opt1Label'), sublabel: t('dsp.q3.opt1Sub'), value: "left" },
        { label: t('dsp.q3.opt2Label'), sublabel: t('dsp.q3.opt2Sub'), value: "right" },
      ],
      action: t('dsp.q3.action'),
    },
    {
      id: "4",
      question: t('dsp.q4.question'),
      description: t('dsp.q4.description'),
      options: [
        { label: t('dsp.q4.opt0Label'), sublabel: t('dsp.q4.opt0Sub'), value: "balanced" },
        { label: t('dsp.q4.opt1Label'), sublabel: t('dsp.q4.opt1Sub'), value: "warm" },
        { label: t('dsp.q4.opt2Label'), sublabel: t('dsp.q4.opt2Sub'), value: "clear" },
      ],
      action: t('dsp.q4.action'),
    },
    {
      id: "5",
      question: t('dsp.q5.question'),
      description: t('dsp.q5.description'),
      options: [
        { label: t('dsp.q5.opt0Label'), sublabel: t('dsp.q5.opt0Sub'), value: "small" },
        { label: t('dsp.q5.opt1Label'), sublabel: t('dsp.q5.opt1Sub'), value: "medium" },
        { label: t('dsp.q5.opt2Label'), sublabel: t('dsp.q5.opt2Sub'), value: "large" },
      ],
      action: t('dsp.q5.action'),
    },
    {
      id: "6",
      question: t('dsp.q6.question'),
      description: t('dsp.q6.description'),
      options: [
        { label: t('dsp.q6.opt0Label'), sublabel: t('dsp.q6.opt0Sub'), value: "quiet" },
        { label: t('dsp.q6.opt1Label'), sublabel: t('dsp.q6.opt1Sub'), value: "normal" },
        { label: t('dsp.q6.opt2Label'), sublabel: t('dsp.q6.opt2Sub'), value: "loud" },
      ],
      action: t('dsp.q6.action'),
    },
    {
      id: "7",
      question: t('dsp.q7.question'),
      description: t('dsp.q7.description'),
      options: [
        { label: t('dsp.q7.opt0Label'), sublabel: t('dsp.q7.opt0Sub'), value: "open" },
        { label: t('dsp.q7.opt1Label'), sublabel: t('dsp.q7.opt1Sub'), value: "wall" },
        { label: t('dsp.q7.opt2Label'), sublabel: t('dsp.q7.opt2Sub'), value: "corner" },
      ],
      action: t('dsp.q7.action'),
    },
  ];
}

// Backwards-compat default (English) for any stray static import — prefer
// getQuestions(t) in new code so the questionnaire is translated.
export const QUESTIONS = getQuestions((k) => k);

// ── Shared header bar ────────────────────────────────────────────────────────
function WizardHeader({ title, subtitle, onClose }) {
  const { t } = useI18n();
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
        {t('dsp.close')}
      </button>
    </div>
  );
}

export default function DspWizard({ onClose, onCalibrationComplete, pureDirect = false, onPureDirectChange }) {
  const { t } = useI18n();
  const QUESTIONS = useMemo(() => getQuestions(t), [t]);

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
      <WizardHeader title={t('dsp.title')} subtitle={t('dsp.subtitlePureDirect')} onClose={onClose} />

      <div className="flex-grow flex flex-row gap-5 min-h-0">
        <div className="w-[38%] flex flex-col justify-center items-center gap-4 text-center shrink-0 rounded-2xl p-6"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ border: '1.5px solid #0e9ab8', background: S.bg }}>
            <AudioLines className="h-7 w-7" strokeWidth={1.5} style={{ color: '#0e9ab8' }} />
          </div>
          <div>
            <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>{t('dsp.activated')}</p>
            <h2 className="text-xl font-bold" style={{ color: S.strong }}>{t('dsp.pureDirectActive')}</h2>
          </div>
          <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
            {t('dsp.pureDirectBody')}
          </p>
        </div>

        <div className="flex-grow flex flex-col justify-between min-h-0">
          <div className="space-y-3">
            <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
              {t('dsp.flatSignalPath')}
            </p>
            <div className="rounded-xl p-4 text-sm font-light space-y-1.5"
              style={{ background: S.surface, border: `1px solid ${S.border}`, color: S.muted }}>
              <p><span className="font-semibold" style={{ color: S.text }}>{t('dsp.manualEqLabel')}</span> — {t('dsp.manualEqDisabledNote')}</p>
              <p><span className="font-semibold" style={{ color: S.text }}>{t('dsp.roomCorrectionLabel')}</span> — {t('dsp.roomCorrectionDisabledNote')}</p>
              <p><span className="font-semibold" style={{ color: S.text }}>{t('dsp.presetsBandsLabel')}</span> — {t('dsp.presetsPreservedNote')}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4 shrink-0">
            <button onClick={() => setCurrentStep(0)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, color: S.muted, boxShadow: cardShadow }}>
              {t('dsp.switchToEqDsp')}
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              {t('dsp.returnToPlayer')}
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
      <WizardHeader title={t('dsp.title')} subtitle={t('dsp.subtitleEqMode')} onClose={onClose} />

      <div className="flex-grow flex flex-row gap-5 min-h-0">
        {/* Left — status */}
        <div className="w-[38%] flex flex-col justify-center items-center gap-4 text-center shrink-0 rounded-2xl p-6"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ border: `1.5px solid ${S.accent}`, background: S.bg }}>
            <Check className="h-7 w-7" strokeWidth={1.5} style={{ color: S.accent }} />
          </div>
          <div>
            <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>{t('dsp.activated')}</p>
            <h2 className="text-xl font-bold" style={{ color: S.strong }}>{t('dsp.manualEqActive')}</h2>
          </div>
        </div>

        {/* Right — info + buttons */}
        <div className="flex-grow flex flex-col justify-between min-h-0">
          <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
            {t('dsp.eqBypassInfo')}
          </p>
          <div className="flex gap-3 mt-4 shrink-0">
            <button onClick={() => setCurrentStep(0)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, color: S.muted, boxShadow: cardShadow }}>
              {t('dsp.switchToEqDsp')}
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              {t('dsp.returnToPlayer')}
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
      <WizardHeader title={t('dsp.title')} subtitle={t('dsp.subtitleComplete')} onClose={onClose} />

      <div className="flex-grow flex flex-row gap-5 min-h-0">
        {/* Left — status */}
        <div className="w-[35%] flex flex-col justify-center items-center gap-4 text-center shrink-0 rounded-2xl p-6"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ border: `1.5px solid ${S.accent}`, background: S.bg }}>
            <Check className="h-7 w-7" strokeWidth={1.5} style={{ color: S.accent }} />
          </div>
          <div>
            <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>{t('dsp.completeLabel')}</p>
            <h2 className="text-xl font-bold" style={{ color: S.strong }}>{t('dsp.profileGenerated')}</h2>
          </div>
          <p className="text-sm font-light leading-relaxed" style={{ color: S.muted }}>
            {t('dsp.profileBody')}
          </p>
        </div>

        {/* Right — DSP map + buttons */}
        <div className="flex-grow flex flex-col gap-4 min-h-0">
          <div className="flex-grow rounded-xl p-4 text-sm font-light overflow-y-auto stone-scrollbar"
            style={{ background: S.surface, border: `1px solid ${S.border}` }}>
            <p className="text-sm font-semibold mb-3 tracking-[0.15em] uppercase" style={{ color: S.label }}>{t('dsp.appliedMap')}</p>
            <div className="space-y-2">
              {[
                [t('dsp.mapChannelLayout'), answers[1] === 'subwoofer' ? t('dsp.valCrossover21') : t('dsp.valStereoPassThrough')],
                [t('dsp.mapRoomReflection'), answers[2] === 'echoey' ? t('dsp.valHfShelfCut') : t('dsp.valFlatHfResponse')],
                [t('dsp.mapSpeakerDelay'), answers[3] === 'left' ? t('dsp.valDelayLeft') : answers[3] === 'right' ? t('dsp.valDelayRight') : t('dsp.valTimeAligned')],
                [t('dsp.mapVoicingTarget'), answers[4] ? (QUESTIONS[4].options.find(o => o.value === answers[4])?.label ?? t('dsp.valBalanced')) : t('dsp.valBalanced')],
                [t('dsp.mapHpfCutoff'), answers[5] === 'small' ? t('dsp.valHpfSmall') : answers[5] === 'medium' ? t('dsp.valHpfMedium') : t('dsp.valFullRange')],
                [t('dsp.mapLoudnessMode'), answers[6] === 'quiet' ? t('dsp.valLoudnessActive') : t('dsp.valLoudnessOff')],
                [t('dsp.mapBoundaryEq'), answers[7] === 'wall' ? t('dsp.valBoundaryWall') : answers[7] === 'corner' ? t('dsp.valBoundaryCorner') : t('dsp.valBoundaryNone')],
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
              {t('dsp.switchToEq')}
            </button>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              {t('dsp.returnToPlayer')}
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

      <WizardHeader title={t('dsp.title')} onClose={onClose} />



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
          {t('dsp.previous')}
        </button>

      </div>}
    </div>
  );
}
