import { useState, useEffect, useContext, useMemo } from 'react';
import { Waves, ChevronLeft, Check, X, Cpu, AudioLines } from 'lucide-react';
import { api } from '../../api';
import { Tk } from './shared';
import { getQuestions } from '../DspWizard';
import { useI18n } from '../../i18n';

// ─── shared header: title + close, on the remote palette ─────────────────────
function Header({ subtitle, onClose }) {
  const { C } = useContext(Tk);
  const { t } = useI18n();
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
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('dsp.calibration')}</p>
          <p className="text-[17px] font-medium truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>
            {subtitle || t('dsp.acousticWizard')}
          </p>
        </div>
      </div>
      <button onClick={onClose} aria-label="Close"
        className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
        style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
        <X className="h-4 w-4" style={{ color: C.text3 }} />
      </button>
    </div>
  );
}

// ─── success / result screen primitive ───────────────────────────────────────
// `inline`: tablet's TabletSettingsTab already wraps this whole wizard in its
// own BackHeader ("Room Calibration") whose back button calls the exact same
// onClose — rendering this Header too doubled up as two close/back controls
// stacked on the same screen. Phone has no such wrapper, so it keeps Header.
function Result({ icon, accent, kicker, title, children, footer, onClose, inline = false }) {
  const { C } = useContext(Tk);
  return (
    <div className="flex flex-col h-full" style={{ fontFamily: C.font, background: C.bg }}>
      {!inline && <Header subtitle={kicker} onClose={onClose} />}
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

export default function RemoteDspWizard({ onClose, onCalibrationComplete, pureDirect = false, onPureDirectChange, inline = false }) {
  const { C, card, cardWhite, btnInset } = useContext(Tk);
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
    <Result inline={inline} onClose={onClose} accent="#0e9ab8" kicker={t('dsp.subtitlePureDirect')}
      icon={<AudioLines className="h-7 w-7" style={{ color: '#0e9ab8' }} />}
      title={t('dsp.pureDirectActive')}
      footer={<>
        {ghostBtn(t('dsp.switchToEqDsp'), () => setCurrentStep(0))}
        {primaryBtn(t('dsp.returnToPlayer'), onClose)}
      </>}>
      <p className="text-[14px] leading-relaxed text-center" style={{ color: C.text4 }}>
        {t('dsp.flatSignalPath')}
      </p>
      <div className="rounded-xl p-4 flex flex-col gap-2 text-[13px]" style={cardWhite}>
        {[
          [t('dsp.manualEqLabel'), t('dsp.manualEqDisabledNote')],
          [t('dsp.roomCorrectionLabel'), t('dsp.roomCorrectionDisabledNote')],
          [t('dsp.presetsBandsLabel'), t('dsp.presetsPreservedNote')],
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
    <Result inline={inline} onClose={onClose} accent={C.champagne} kicker={t('dsp.subtitleEqMode')}
      icon={<Check className="h-7 w-7" style={{ color: C.champagne }} />}
      title={t('dsp.manualEqActive')}
      footer={<>
        {ghostBtn(t('dsp.switchToEqDsp'), () => setCurrentStep(0))}
        {primaryBtn(t('dsp.returnToPlayer'), onClose)}
      </>}>
      <p className="text-[14px] leading-relaxed text-center" style={{ color: C.text4 }}>
        {t('dsp.eqBypassInfo')}
      </p>
    </Result>
  );

  // ── DSP calibration complete ───────────────────────────────────────────────
  if (currentStep === QUESTIONS.length) {
    const dspMap = [
      [t('dsp.mapChannelLayout'), answers[1] === 'subwoofer' ? t('dsp.valCrossover21') : t('dsp.valStereoPassThrough')],
      [t('dsp.mapRoomReflection'), answers[2] === 'echoey' ? t('dsp.valHfShelfCut') : t('dsp.valFlatHfResponse')],
      [t('dsp.mapSpeakerDelay'), answers[3] === 'left' ? t('dsp.valDelayLeft') : answers[3] === 'right' ? t('dsp.valDelayRight') : t('dsp.valTimeAligned')],
      [t('dsp.mapVoicingTarget'), answers[4] ? (QUESTIONS[4].options.find(o => o.value === answers[4])?.label ?? t('dsp.valBalanced')) : t('dsp.valBalanced')],
      [t('dsp.mapHpfCutoff'), answers[5] === 'small' ? t('dsp.valHpfSmall') : answers[5] === 'medium' ? t('dsp.valHpfMedium') : t('dsp.valFullRange')],
      [t('dsp.mapLoudnessMode'), answers[6] === 'quiet' ? t('dsp.valLoudnessActive') : t('dsp.valLoudnessOff')],
      [t('dsp.mapBoundaryEq'), answers[7] === 'wall' ? t('dsp.valBoundaryWall') : answers[7] === 'corner' ? t('dsp.valBoundaryCorner') : t('dsp.valBoundaryNone')],
    ];
    return (
      <Result inline={inline} onClose={onClose} accent={C.champagne} kicker={t('dsp.subtitleComplete')}
        icon={<Check className="h-7 w-7" style={{ color: C.champagne }} />}
        title={t('dsp.profileGenerated')}
        footer={<>
          {ghostBtn(t('dsp.switchToEq'), () => setCurrentStep(0))}
          {primaryBtn(t('dsp.returnToPlayer'), onClose)}
        </>}>
        <p className="text-[14px] leading-relaxed text-center" style={{ color: C.text4 }}>
          {t('dsp.profileBody')}
        </p>
        <div className="rounded-xl p-4" style={cardWhite}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('dsp.appliedMap')}</p>
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
      {!inline && <Header onClose={onClose} />}

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
            <ChevronLeft className="h-4 w-4" /> {t('common.back')}
          </button>
        </div>
      )}
    </div>
  );
}
