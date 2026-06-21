import React, { useState, useEffect, useContext } from 'react';
import { Waves, ChevronLeft, Check, X, Cpu, AudioLines } from 'lucide-react';
import { api } from '../../api';
import { Tk } from './shared';
import { QUESTIONS } from '../DspWizard';

// ─── shared header: title + close, on the remote palette ─────────────────────
function Header({ subtitle, onClose }) {
  const { C } = useContext(Tk);
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-4 shrink-0 sticky top-0 z-10"
      style={{ background: C.bg, borderBottom: `0.5px solid ${C.outline}` }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          <Waves className="h-4 w-4" style={{ color: C.champagne }} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>Room Calibration</p>
          <p className="text-[17px] font-medium truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>
            {subtitle || 'Acoustic Wizard'}
          </p>
        </div>
      </div>
      <button onClick={onClose}
        className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
        style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
        <X className="h-4 w-4" style={{ color: C.text3 }} />
      </button>
    </div>
  );
}

// ─── success / result screen primitive ───────────────────────────────────────
function Result({ icon, accent, kicker, title, children, footer, onClose }) {
  const { C } = useContext(Tk);
  return (
    <div className="flex flex-col h-full" style={{ fontFamily: C.font, background: C.bg }}>
      <Header subtitle={kicker} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-3">
          <span className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: C.bgWhite, border: `1.5px solid ${accent}` }}>
            {icon}
          </span>
          <h2 className="text-[22px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{title}</h2>
        </div>
        {children}
      </div>
      <div className="px-5 pb-6 pt-3 flex flex-col gap-2 shrink-0"
        style={{ borderTop: `0.5px solid ${C.outline}` }}>
        {footer}
      </div>
    </div>
  );
}

export default function RemoteDspWizard({ onClose, onCalibrationComplete, pureDirect = false, onPureDirectChange }) {
  const { C, card, cardWhite, btnInset } = useContext(Tk);
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
            await api.saveDspCalibration({ ...nextAnswers, 0: 'eq' });
            onCalibrationComplete?.(false);
            await onPureDirectChange?.(true);
            setCurrentStep(98);
          } else {
            if (pureDirect) await onPureDirectChange?.(false);
            await api.saveDspCalibration(nextAnswers);
            if (value === 'eq') { onCalibrationComplete?.(false); setCurrentStep(99); }
            else setCurrentStep(1);
          }
        } catch { /* best-effort save */ }
        finally { setIsSaving(false); }
      } else if (currentStep < QUESTIONS.length - 1) {
        setCurrentStep(p => p + 1);
      } else {
        setIsSaving(true);
        try {
          await api.saveDspCalibration(nextAnswers);
          onCalibrationComplete?.(true);
          setCurrentStep(QUESTIONS.length);
        } catch { /* best-effort save */ }
        finally { setIsSaving(false); }
      }
    }, 180);
  };

  // result footer buttons
  const ghostBtn = (label, onPress) => (
    <button onClick={onPress}
      className="w-full py-3.5 rounded-full text-[14px] font-semibold active:scale-95 transition-all cursor-pointer"
      style={{ ...card, color: C.text2, fontFamily: C.font }}>{label}</button>
  );
  const primaryBtn = (label, onPress) => (
    <button onClick={onPress}
      className="w-full py-3.5 rounded-full text-[14px] font-semibold active:scale-95 transition-all cursor-pointer"
      style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.font }}>{label}</button>
  );

  // ── Pure Direct success ────────────────────────────────────────────────────
  if (currentStep === 98) return (
    <Result onClose={onClose} accent="#0e9ab8" kicker="Pure Direct"
      icon={<AudioLines className="h-7 w-7" style={{ color: '#0e9ab8' }} />}
      title="Pure Direct Active"
      footer={<>
        {ghostBtn('Switch to Manual EQ or DSP', () => setCurrentStep(0))}
        {primaryBtn('Return to Player', onClose)}
      </>}>
      <p className="text-[14px] leading-relaxed text-center" style={{ color: C.text4 }}>
        All EQ and DSP filters are bypassed — source audio passes straight through the
        CamillaDSP mixer to the DAC. Volume control stays active.
      </p>
      <div className="rounded-xl p-4 flex flex-col gap-2 text-[13px]" style={cardWhite}>
        {[
          ['Manual EQ', 'disabled while Pure Direct is active'],
          ['Room Correction', 'disabled while Pure Direct is active'],
          ['Presets & bands', 'preserved, resume when you switch back'],
        ].map(([k, v]) => (
          <p key={k} style={{ color: C.text4 }}>
            <span className="font-semibold" style={{ color: C.text2 }}>{k}</span> — {v}
          </p>
        ))}
      </div>
    </Result>
  );

  // ── Manual EQ success ──────────────────────────────────────────────────────
  if (currentStep === 99) return (
    <Result onClose={onClose} accent={C.champagne} kicker="Equalizer Mode"
      icon={<Check className="h-7 w-7" style={{ color: C.champagne }} />}
      title="Manual Equalizer Active"
      footer={<>
        {ghostBtn('Configure Acoustic DSP instead', () => setCurrentStep(0))}
        {primaryBtn('Return to Player', onClose)}
      </>}>
      <p className="text-[14px] leading-relaxed text-center" style={{ color: C.text4 }}>
        Acoustic room correction filters are now bypassed. Adjust presets and frequency
        bands from the Equalizer in Settings.
      </p>
    </Result>
  );

  // ── DSP calibration complete ───────────────────────────────────────────────
  if (currentStep === QUESTIONS.length) {
    const dspMap = [
      ['Channel Layout', answers[1] === 'subwoofer' ? '2.1 Crossover · 80Hz LR' : '2.0 Stereo'],
      ['Room Reflection', answers[2] === 'echoey' ? 'HF Shelf −3dB @ 8kHz' : 'Flat HF'],
      ['Speaker Delay', answers[3] === 'left' ? 'Left +1.2ms' : answers[3] === 'right' ? 'Right +1.2ms' : '0.0ms aligned'],
      ['Voicing Target', answers[4] ? answers[4].charAt(0).toUpperCase() + answers[4].slice(1) : 'Balanced'],
      ['HPF Cutoff', answers[5] === 'small' ? '80Hz cut' : answers[5] === 'medium' ? '45Hz cut' : 'Full range 20Hz'],
      ['Loudness Mode', answers[6] === 'quiet' ? 'Fletcher-Munson' : 'Off · flat'],
      ['Boundary EQ', answers[7] === 'wall' ? 'Wall −2dB @ 180Hz' : answers[7] === 'corner' ? 'Corner −4dB @ 180Hz' : 'Free space'],
    ];
    return (
      <Result onClose={onClose} accent={C.champagne} kicker="Calibration Complete"
        icon={<Check className="h-7 w-7" style={{ color: C.champagne }} />}
        title="Acoustic Profile Generated"
        footer={<>
          {ghostBtn('Switch to Manual Equalizer', () => setCurrentStep(0))}
          {primaryBtn('Return to Player', onClose)}
        </>}>
        <p className="text-[14px] leading-relaxed text-center" style={{ color: C.text4 }}>
          DSP filters and biquad curves recalculated and hot-reloaded on the Resonance backend.
        </p>
        <div className="rounded-xl p-4" style={cardWhite}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: C.text3, fontFamily: C.fontLabel }}>Applied DSP Map</p>
          {dspMap.map(([k, v], i) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-2"
              style={{ borderBottom: i < dspMap.length - 1 ? `0.5px solid ${C.outline}` : 'none' }}>
              <span className="text-[13px] shrink-0" style={{ color: C.text3 }}>{k}</span>
              <span className="text-[13px] font-medium text-right" style={{ color: C.text1 }}>{v}</span>
            </div>
          ))}
        </div>
      </Result>
    );
  }

  // ── Main questionnaire ─────────────────────────────────────────────────────
  const q = QUESTIONS[currentStep];
  const selectedValue = currentStep === 0 && pureDirect ? 'pure-direct' : answers[q.id];

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: C.font, background: C.bg }}>
      <Header onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        {/* question */}
        <div>
          <h3 className="text-[20px] font-medium leading-snug" style={{ color: C.text1, letterSpacing: '-0.01em' }}>
            {q.question}
          </h3>
          <p className="text-[14px] mt-1.5 leading-relaxed" style={{ color: C.text4 }}>{q.description}</p>
        </div>

        {/* options */}
        <div className="flex flex-col gap-2.5">
          {q.options.map(opt => {
            const isSelected = selectedValue === opt.value;
            const isDimmed = currentStep === 0 && pureDirect && opt.value !== 'pure-direct' && !isSelected;
            const accent = opt.value === 'pure-direct' ? '#0e9ab8' : C.champagne;
            return (
              <button key={opt.value} onClick={() => handleSelectOption(opt.value)}
                disabled={isSaving}
                className="w-full p-4 rounded-xl text-left flex items-center justify-between gap-3 active:scale-[0.99] transition-all cursor-pointer"
                style={{
                  ...(isSelected ? { ...btnInset, border: `1px solid ${accent}55` } : { ...card }),
                  opacity: isDimmed ? 0.45 : 1,
                }}>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-tight"
                    style={{ color: isSelected ? C.text1 : C.text2 }}>{opt.label}</p>
                  {opt.sublabel && (
                    <p className="text-[12px] mt-0.5" style={{ color: C.text3 }}>{opt.sublabel}</p>
                  )}
                </div>
                {isSelected
                  ? <Check className="h-5 w-5 shrink-0" style={{ color: accent }} />
                  : <span className="w-5 h-5 rounded-full shrink-0" style={{ border: `1px solid ${C.outline}` }} />}
              </button>
            );
          })}
        </div>

        {/* technical note */}
        <div className="rounded-xl p-4 flex items-start gap-2.5" style={cardWhite}>
          <Cpu className="h-4 w-4 shrink-0 mt-0.5" style={{ color: C.text3 }} />
          <p className="text-[12px] leading-relaxed" style={{ color: C.text4 }}>{q.action}</p>
        </div>
      </div>

      {/* footer — progress + back, once inside the questionnaire */}
      {currentStep >= 1 && (
        <div className="px-5 py-4 flex items-center gap-4 shrink-0"
          style={{ borderTop: `0.5px solid ${C.outline}` }}>
          <span className="text-[12px] font-semibold tabular-nums shrink-0"
            style={{ color: C.text3, fontFamily: C.fontLabel }}>
            {String(currentStep + 1).padStart(2, '0')} / {String(QUESTIONS.length).padStart(2, '0')}
          </span>
          <div className="flex-grow h-1 rounded-full overflow-hidden flex gap-0.5" style={{ background: C.container }}>
            {QUESTIONS.map((_, idx) => (
              <div key={idx} className="h-full flex-grow transition-all duration-300"
                style={{ background: idx <= currentStep ? C.champagne : 'transparent' }} />
            ))}
          </div>
          <button onClick={() => currentStep > 0 && setCurrentStep(p => p - 1)} disabled={currentStep === 0}
            className="flex items-center gap-1 text-[13px] font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-25 shrink-0"
            style={{ color: C.text2 }}>
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        </div>
      )}
    </div>
  );
}
