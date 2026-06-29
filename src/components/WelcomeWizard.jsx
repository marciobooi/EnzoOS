import { useEffect, useRef, useState } from 'react';
import {
  Waves, Music2, Radio, Bluetooth, Cast, Disc3, Smartphone, Check, ChevronRight, ChevronLeft, Sparkles,
} from 'lucide-react';
import { S, cardShadow } from '../styles/stone';
import { api } from '../api';

// First-boot welcome / setup wizard. Fully self-contained: it manages its own
// step state and persists completion to the DB (onboarding_complete) before
// calling onClose(). Rendered at the App level so it is decoupled from the kiosk
// and remote controllers. Responsive: compact enough for the 1480x320 kiosk and
// usable on a phone.
export default function WelcomeWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [lanUrl, setLanUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    fetch('/api/system/lan-url')
      .then(r => r.json())
      .then(d => setLanUrl(d?.url || ''))
      .catch(() => {});
  }, []);

  const steps = [
    {
      icon: <Waves className="h-8 w-8" />,
      title: 'Welcome to Resonance HiFi',
      body: 'Your Raspberry Pi is now a high-fidelity network streamer with real-time DSP. Let’s take a quick tour — it only takes a moment.',
    },
    {
      icon: <Music2 className="h-8 w-8" />,
      title: 'One system, every source',
      body: 'Stream from Spotify, AirPlay, UPnP/DLNA, Bluetooth, web radio, your local library, Tidal and Qobuz — all through the same bit-perfect pipeline.',
      chips: [
        { icon: <Disc3 className="h-4 w-4" />, label: 'Spotify' },
        { icon: <Cast className="h-4 w-4" />, label: 'AirPlay' },
        { icon: <Bluetooth className="h-4 w-4" />, label: 'Bluetooth' },
        { icon: <Radio className="h-4 w-4" />, label: 'Radio' },
        { icon: <Music2 className="h-4 w-4" />, label: 'Local' },
      ],
    },
    {
      icon: <Smartphone className="h-8 w-8" />,
      title: 'Control from your phone',
      body: lanUrl
        ? 'Open this address on any phone or tablet on your network, or scan the QR code from the kiosk’s Remote card:'
        : 'From the kiosk, tap the Remote card to show a QR code and control playback from any phone or tablet on your network.',
      mono: lanUrl || null,
    },
    {
      icon: <Sparkles className="h-8 w-8" />,
      title: 'You’re all set',
      body: 'Tune the sound any time in Settings — EQ, room correction, balance, bit-perfect and more. Enjoy the music.',
    },
  ];

  const isLast = step === steps.length - 1;
  const s = steps[step];

  const finish = async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setSaving(true);
    try { await api.setOnboarding(true); } catch { /* still close — better UX than trapping the user */ }
    onClose?.();
  };

  const next = () => { isLast ? finish() : setStep(step + 1); };
  const back = () => setStep(Math.max(0, step - 1));

  const btnBase = 'flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[14px] font-semibold transition-all active:scale-95 cursor-pointer select-none';

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      style={{ background: 'rgba(20,19,18,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-[640px] max-h-full overflow-hidden rounded-3xl flex flex-col"
        style={{ background: S.bg, boxShadow: cardShadow, border: `1px solid ${S.surfaceLo}` }}>

        {/* content (scrolls if it must, e.g. the short kiosk) */}
        <div className="flex-1 overflow-y-auto px-7 pt-7 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-2xl p-3 shrink-0"
              style={{ background: S.accent, color: S.accentFg }}>
              {s.icon}
            </div>
            <h1 className="text-[22px] font-bold leading-tight" style={{ color: S.accent }}>
              {s.title}
            </h1>
          </div>

          <p className="text-[14px] leading-relaxed" style={{ color: S.accent, opacity: 0.78 }}>
            {s.body}
          </p>

          {s.mono && (
            <div className="mt-3 px-4 py-2.5 rounded-xl text-[14px] font-mono break-all"
              style={{ background: S.surface, color: S.accent, border: `1px solid ${S.surfaceLo}` }}>
              {s.mono}
            </div>
          )}

          {s.chips && (
            <div className="mt-4 flex flex-wrap gap-2">
              {s.chips.map((c) => (
                <span key={c.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold"
                  style={{ background: S.surface, color: S.accent, border: `1px solid ${S.surfaceLo}` }}>
                  {c.icon}{c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* footer: step dots + nav */}
        <div className="flex items-center justify-between px-7 py-4"
          style={{ borderTop: `1px solid ${S.surfaceLo}` }}>
          <div className="flex items-center gap-2">
            {steps.map((_, i) => (
              <span key={i} className="rounded-full transition-all"
                style={{
                  width: i === step ? 22 : 8, height: 8,
                  background: i === step ? S.accent : S.surfaceLo,
                }} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={back} className={btnBase}
                style={{ background: 'transparent', color: S.accent }}>
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
            {!isLast && (
              <button onClick={finish} className={`${btnBase} hidden sm:flex`}
                style={{ background: 'transparent', color: S.accent, opacity: 0.6 }}>
                Skip
              </button>
            )}
            <button onClick={next} disabled={saving} className={btnBase}
              style={{ background: S.accent, color: S.accentFg, opacity: saving ? 0.6 : 1 }}>
              {isLast ? <><Check className="h-4 w-4" /> Get Started</> : <>Next <ChevronRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
