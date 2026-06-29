import { useEffect, useRef, useState } from 'react';
import {
  Waves, Music2, Smartphone, Check, ChevronRight, ChevronLeft, Sparkles,
  Disc3, Loader2, ExternalLink, Sliders, SlidersHorizontal, Zap,
} from 'lucide-react';
import { S, cardShadow } from '../styles/stone';
import { api } from '../api';

// First-boot welcome / setup wizard. Fully self-contained: it manages its own
// step state and persists completion to the DB (onboarding_complete) before
// calling onClose(). Rendered at the App level so it is decoupled from the kiosk
// and remote controllers. Responsive: compact enough for the 1480x320 kiosk and
// usable on a phone.
//
// The "Connect your music" step performs the real account flows used elsewhere
// in the app: Spotify (OAuth, popup + status poll), Tidal (OAuth2 device flow)
// and Qobuz (username/password). All three are optional — the user can skip and
// connect later from Source.
export default function WelcomeWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [lanUrl, setLanUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const closedRef = useRef(false);

  // ── Streaming-account connection state ──────────────────────────────────────
  const [connected, setConnected] = useState({ spotify: false, tidal: false, qobuz: false });
  const [busy, setBusy] = useState({ spotify: false, tidal: false, qobuz: false });
  // Qobuz inline credential form
  const [qobuzOpen, setQobuzOpen] = useState(false);
  const [qUser, setQUser] = useState('');
  const [qPass, setQPass] = useState('');
  const [qErr, setQErr] = useState('');
  // Tidal device-flow prompt: { userCode, verificationUri }
  const [tidalAuth, setTidalAuth] = useState(null);

  // ── DSP / EQ mode state ─────────────────────────────────────────────────────
  // 'eq' = Manual Equalizer · 'dsp' = Acoustic Room Correction · 'pure' = Pure Direct
  const [dspMode, setDspMode] = useState('eq');
  const [dspBusy, setDspBusy] = useState(null); // id being applied

  const spotifyPoll = useRef(null);
  const tidalPoll = useRef(null);

  // Initial LAN URL + current connection status (so already-linked accounts show
  // as connected if the wizard is re-run later).
  useEffect(() => {
    fetch('/api/system/lan-url').then(r => r.json()).then(d => setLanUrl(d?.url || '')).catch(() => {});
    (async () => {
      try {
        const [sp, t, q] = await Promise.all([
          fetch('/auth/spotify/status').then(r => r.json()).catch(() => ({})),
          api.getTidalStatus().catch(() => ({})),
          api.getQobuzStatus().catch(() => ({})),
        ]);
        setConnected({ spotify: !!sp?.isConnected, tidal: !!t?.connected, qobuz: !!q?.connected });
      } catch { /* best-effort */ }
    })();
    // Pre-select the current DSP mode so re-running the wizard reflects reality.
    (async () => {
      try {
        const [cal, status] = await Promise.all([
          api.getDspCalibration().catch(() => ({})),
          fetch('/api/status').then(r => r.json()).catch(() => ({})),
        ]);
        if (status?.pureDirect) setDspMode('pure');
        else if (cal && (cal['0'] === 'dsp' || cal[0] === 'dsp')) setDspMode('dsp');
        else setDspMode('eq');
      } catch { /* default 'eq' */ }
    })();
    return () => { clearInterval(spotifyPoll.current); clearInterval(tidalPoll.current); };
  }, []);

  // ── Apply a DSP mode immediately (Pure Direct toggle + calibration mode) ─────
  const applyDspMode = async (id) => {
    setDspBusy(id);
    try {
      if (id === 'pure') {
        await api.setPureDirect(true);
      } else {
        await api.setPureDirect(false);
        const cal = (await api.getDspCalibration().catch(() => ({}))) || {};
        await api.saveDspCalibration({ ...cal, 0: id }); // 'eq' | 'dsp'
      }
      setDspMode(id);
    } catch { /* leave previous selection on failure */ }
    finally { setDspBusy(null); }
  };

  // ── Spotify: open the OAuth login in a popup, poll status until authorised ───
  const connectSpotify = () => {
    setBusy(b => ({ ...b, spotify: true }));
    const win = window.open('/auth/spotify/login?from=remote', 'spotify_login', 'width=480,height=720');
    if (!win) { window.location.href = '/auth/spotify/login'; return; } // popup blocked → full redirect
    clearInterval(spotifyPoll.current);
    spotifyPoll.current = setInterval(async () => {
      try {
        const d = await fetch('/auth/spotify/status').then(r => r.json());
        if (d?.isConnected) {
          clearInterval(spotifyPoll.current);
          setConnected(c => ({ ...c, spotify: true }));
          setBusy(b => ({ ...b, spotify: false }));
          try { win.close(); } catch { /* cross-origin close guard */ }
        }
      } catch { /* keep polling */ }
      if (win.closed) { clearInterval(spotifyPoll.current); setBusy(b => ({ ...b, spotify: false })); }
    }, 2000);
  };

  // ── Tidal: OAuth2 device flow — show the code, poll until linked ─────────────
  const connectTidal = async () => {
    setBusy(b => ({ ...b, tidal: true }));
    try {
      const info = await api.tidalDeviceAuth();
      setTidalAuth({ userCode: info.userCode, verificationUri: info.verificationUri });
      clearInterval(tidalPoll.current);
      const deadline = Date.now() + (info.expiresIn || 300) * 1000;
      tidalPoll.current = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(tidalPoll.current); setTidalAuth(null); setBusy(b => ({ ...b, tidal: false }));
          return;
        }
        try {
          const r = await api.tidalPoll(info.deviceCode);
          if (r.connected) {
            clearInterval(tidalPoll.current);
            setConnected(c => ({ ...c, tidal: true }));
            setTidalAuth(null);
            setBusy(b => ({ ...b, tidal: false }));
          }
        } catch { /* keep polling until deadline */ }
      }, (info.interval || 2) * 1000);
    } catch {
      setBusy(b => ({ ...b, tidal: false }));
    }
  };

  const cancelTidal = () => { clearInterval(tidalPoll.current); setTidalAuth(null); setBusy(b => ({ ...b, tidal: false })); };

  // ── Qobuz: username / password ──────────────────────────────────────────────
  const submitQobuz = async (e) => {
    e?.preventDefault();
    if (!qUser.trim() || !qPass) { setQErr('Enter your email and password'); return; }
    setBusy(b => ({ ...b, qobuz: true })); setQErr('');
    try {
      await api.qobuzAuth(qUser.trim(), qPass);
      setConnected(c => ({ ...c, qobuz: true }));
      setQobuzOpen(false); setQUser(''); setQPass('');
    } catch (err) {
      setQErr(err.message || 'Connection failed');
    } finally {
      setBusy(b => ({ ...b, qobuz: false }));
    }
  };

  const services = [
    { id: 'spotify', label: 'Spotify', icon: <Disc3 className="h-5 w-5" />, action: connectSpotify, hint: 'Spotify Connect + Web playback' },
    { id: 'tidal',   label: 'Tidal',   icon: <Music2 className="h-5 w-5" />, action: connectTidal,   hint: 'Hi-Res FLAC · device login' },
    { id: 'qobuz',   label: 'Qobuz',   icon: <Music2 className="h-5 w-5" />, action: () => { setQErr(''); setQobuzOpen(o => !o); }, hint: 'Hi-Res FLAC · email & password' },
  ];

  const steps = [
    {
      icon: <Waves className="h-8 w-8" />,
      title: 'Welcome to Resonance HiFi',
      body: 'Your Raspberry Pi is now a high-fidelity network streamer with real-time DSP. Let’s connect your music and get you listening — it only takes a moment.',
    },
    {
      icon: <Music2 className="h-8 w-8" />,
      title: 'Connect your music',
      body: 'Link your streaming accounts now, or skip and do it later from Source. AirPlay, Bluetooth, UPnP/DLNA, web radio and your local library need no setup.',
      connect: true,
    },
    {
      icon: <SlidersHorizontal className="h-8 w-8" />,
      title: 'Shape your sound',
      body: 'Pick how audio is processed. You can change this any time and fine-tune everything in Settings → Acoustic.',
      dsp: true,
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

          {/* Connect-your-music step */}
          {s.connect && (
            <div className="mt-4 flex flex-col gap-2">
              {services.map((svc) => {
                const on = connected[svc.id];
                const loading = busy[svc.id];
                return (
                  <div key={svc.id}>
                    <button
                      onClick={svc.action}
                      disabled={on || loading}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.99]"
                      style={{
                        background: S.surface, border: `1px solid ${on ? '#1ed76055' : S.surfaceLo}`,
                        opacity: on ? 0.85 : 1, cursor: on ? 'default' : 'pointer',
                      }}>
                      <span className="shrink-0" style={{ color: on ? '#1ed760' : S.accent }}>{svc.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold" style={{ color: S.accent }}>{svc.label}</span>
                        <span className="block text-[12px]" style={{ color: S.accent, opacity: 0.6 }}>{svc.hint}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold flex items-center gap-1"
                        style={{ color: on ? '#1ed760' : S.champagne }}>
                        {on ? <><Check className="h-4 w-4" /> Connected</>
                          : loading ? <Loader2 className="h-4 w-4 animate-spin" />
                          : 'Connect'}
                      </span>
                    </button>

                    {/* Qobuz inline credential form */}
                    {svc.id === 'qobuz' && qobuzOpen && !on && (
                      <form onSubmit={submitQobuz} className="mt-2 mb-1 flex flex-col gap-2 px-1">
                        <input type="text" value={qUser} onChange={e => setQUser(e.target.value)}
                          placeholder="Email / username" autoCapitalize="none" autoComplete="username"
                          className="w-full rounded-xl px-3.5 py-2.5 text-[14px] focus:outline-none"
                          style={{ background: S.bg, color: S.accent, border: `1px solid ${S.surfaceLo}` }} />
                        <input type="password" value={qPass} onChange={e => setQPass(e.target.value)}
                          placeholder="Password" autoComplete="current-password"
                          className="w-full rounded-xl px-3.5 py-2.5 text-[14px] focus:outline-none"
                          style={{ background: S.bg, color: S.accent, border: `1px solid ${S.surfaceLo}` }} />
                        {qErr && <p className="text-[12px]" style={{ color: '#e0726b' }}>{qErr}</p>}
                        <button type="submit" disabled={busy.qobuz}
                          className="self-start px-4 py-2 rounded-full text-[13px] font-semibold active:scale-95 transition-all cursor-pointer"
                          style={{ background: S.accent, color: S.accentFg, opacity: busy.qobuz ? 0.6 : 1 }}>
                          {busy.qobuz ? 'Connecting…' : 'Sign in'}
                        </button>
                      </form>
                    )}

                    {/* Tidal device-flow prompt */}
                    {svc.id === 'tidal' && tidalAuth && !on && (
                      <div className="mt-2 mb-1 px-4 py-3 rounded-2xl flex flex-col items-center text-center gap-2"
                        style={{ background: S.bg, border: `1px solid ${S.surfaceLo}` }}>
                        <p className="text-[12px]" style={{ color: S.accent, opacity: 0.7 }}>
                          Open <span style={{ color: S.champagne }}>{tidalAuth.verificationUri}</span> and enter:
                        </p>
                        <span className="text-[26px] font-bold tracking-[0.25em]" style={{ color: S.accent }}>
                          {tidalAuth.userCode}
                        </span>
                        <a href={`https://${tidalAuth.verificationUri}`} target="_blank" rel="noreferrer"
                          className="text-[12px] flex items-center gap-1" style={{ color: S.champagne }}>
                          <ExternalLink className="h-3.5 w-3.5" /> Open link
                        </a>
                        <button onClick={cancelTidal}
                          className="text-[12px] mt-1 cursor-pointer" style={{ color: S.accent, opacity: 0.55 }}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Shape-your-sound (DSP / EQ) step */}
          {s.dsp && (
            <div className="mt-4 flex flex-col gap-2">
              {[
                { id: 'eq',   label: 'Manual Equalizer', rec: true,  icon: <Sliders className="h-5 w-5" />,           hint: 'Presets + parametric tone control' },
                { id: 'dsp',  label: 'Room Correction',  rec: false, icon: <SlidersHorizontal className="h-5 w-5" />, hint: 'Harman curve + room calibration' },
                { id: 'pure', label: 'Pure Direct',      rec: false, icon: <Zap className="h-5 w-5" />,                hint: 'Flat, bit-perfect — no processing' },
              ].map((m) => {
                const on = dspMode === m.id;
                const loading = dspBusy === m.id;
                return (
                  <button key={m.id} onClick={() => applyDspMode(m.id)} disabled={loading}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.99]"
                    style={{
                      background: on ? S.accent : S.surface,
                      border: `1px solid ${on ? S.accent : S.surfaceLo}`,
                      cursor: loading ? 'default' : 'pointer',
                    }}>
                    <span className="shrink-0" style={{ color: on ? S.accentFg : S.accent }}>{m.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: on ? S.accentFg : S.accent }}>
                        {m.label}
                        {m.rec && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: on ? S.accentFg : S.champagne, color: on ? S.accent : S.accentFg, opacity: on ? 0.9 : 1 }}>
                            Recommended
                          </span>
                        )}
                      </span>
                      <span className="block text-[12px]" style={{ color: on ? S.accentFg : S.accent, opacity: on ? 0.8 : 0.6 }}>{m.hint}</span>
                    </span>
                    <span className="shrink-0" style={{ color: on ? S.accentFg : S.champagne }}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? <Check className="h-5 w-5" /> : null}
                    </span>
                  </button>
                );
              })}
              {dspMode === 'dsp' && (
                <p className="text-[12px] mt-1 px-1" style={{ color: S.accent, opacity: 0.6 }}>
                  Tip: fine-tune room correction with the guided 8-question wizard in Settings → Acoustic.
                </p>
              )}
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
