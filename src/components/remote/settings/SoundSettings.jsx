import { useContext, useState, useRef, useEffect } from 'react';
import { Sliders, Cpu, Timer, Scale, RefreshCw, FlipHorizontal, RotateCcw, Disc3, SlidersHorizontal, Merge, ChevronLeft } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { reportError } from '../../../lib/errors';
import { Tk, Row, Section, Sheet } from '../shared';
import RemoteEqualizer from '../RemoteEqualizer';
import { api } from '../../../api';
import { useI18n } from '../../../i18n';

// Fine-tuning knobs with no kiosk equivalent (ReplayGain, crossfade, balance,
// phase inversion, bit-perfect, DSD bypass, auto-headroom) — real CamillaDSP
// parameters, but demoted out of the primary Sound view into their own sheet
// so that view mirrors the kiosk's actual mental model: Equalizer, Room
// Calibration, Pure Direct.
function AdvancedAudioSettings() {
  const { t } = useI18n();
  const { C, card } = useContext(Tk);

  const [replayGain, setReplayGain]   = useState('off');
  const [crossfade, setCrossfade]     = useState(0);
  const [showCrossfade, setShowCrossfade] = useState(false);
  const [gapless, setGapless]         = useState(false);
  const [balance, setBalance]         = useState(0);
  const [showBalance, setShowBalance] = useState(false);
  const [phaseLeft, setPhaseLeft]     = useState(false);
  const [phaseRight, setPhaseRight]   = useState(false);
  const [bitPerfect, setBitPerfect]   = useState(true);
  const [dsdBypass, setDsdBypass]     = useState(true);
  const [autoHeadroom, setAutoHeadroom] = useState(true);
  const [headroomDb, setHeadroomDb]   = useState(0);
  const balanceDebounce = useRef(null);
  // Switching this setting rewrites /etc/asound.conf immediately, but the
  // PipeWire clock config it must agree with is only applied on the next
  // PipeWire session start (restarting PipeWire live would drop MPD's
  // connection) — so between the toggle and a reboot, the ALSA loopback
  // slaves and PipeWire's actual running clock can disagree on the sample
  // rate, which silences audio outright ("PCM Slave Active" goes off). A
  // toast alone was too easy to miss before that happened; this makes the
  // reboot requirement a persistent, one-tap action instead.
  const [needsReboot, setNeedsReboot] = useState(false);
  const [rebooting, setRebooting]     = useState(false);

  useEffect(() => {
    api.getReplayGain().then(d => setReplayGain(d.mode || 'off')).catch(() => {});
    api.getCrossfade().then(d => setCrossfade(d.seconds || 0)).catch(() => {});
    api.getGapless().then(d => setGapless(!!d.enabled)).catch(() => {});
    api.getBalance().then(d => setBalance(d.balance || 0)).catch(() => {});
    api.getPhase().then(d => { setPhaseLeft(!!d.left); setPhaseRight(!!d.right); }).catch(() => {});
    api.getBitPerfect().then(d => setBitPerfect(d.enabled !== false)).catch(() => {});
    api.getDsdBypass().then(d => setDsdBypass(d.enabled !== false)).catch(() => {});
    api.getAutoHeadroom().then(d => { setAutoHeadroom(d.enabled !== false); setHeadroomDb(d.headroomDb || 0); }).catch(() => {});
  }, []);

  const handleReplayGainChange = async (mode) => {
    setReplayGain(mode);
    try { await api.setReplayGain(mode); toast.success(`ReplayGain: ${mode}`); }
    catch (e) { reportError(e.message); }
  };

  const handleCrossfadeChange = async (secs) => {
    setCrossfade(secs);
    try {
      await api.setCrossfade(secs);
      // A nonzero crossfade contradicts Gapless (which owns crossfade=0
      // while active) — picking one turns the other off to keep both
      // settings honest about what's actually happening in MPD.
      if (secs > 0 && gapless) { setGapless(false); await api.setGapless(false); }
    } catch (e) { reportError(e.message); }
  };

  const handleGaplessToggle = async () => {
    const next = !gapless;
    setGapless(next);
    try {
      await api.setGapless(next);
      // Enabling gapless forces crossfade to 0 server-side — reflect that.
      if (next) setCrossfade(0);
      toast.success(next ? 'Gapless playback on' : 'Gapless playback off');
    } catch (e) { setGapless(!next); reportError(e.message); }
  };

  const handleBalanceChange = (v) => {
    setBalance(v);
    clearTimeout(balanceDebounce.current);
    balanceDebounce.current = setTimeout(async () => {
      try { await api.setBalance(v); }
      catch (e) { reportError(e.message); }
    }, 400);
  };

  const handleBitPerfectToggle = async () => {
    const next = !bitPerfect;
    setBitPerfect(next);
    try {
      await api.setBitPerfect(next);
      setNeedsReboot(true);
    } catch (e) { setBitPerfect(!next); reportError(e.message); }
  };

  const handleRebootNow = async () => {
    setRebooting(true);
    try { await api.rebootSystem(); toast.success(t('settings.rebooting')); }
    catch (e) { setRebooting(false); reportError(e.message); }
  };

  const handleAutoHeadroomToggle = async () => {
    const next = !autoHeadroom;
    setAutoHeadroom(next);
    try {
      const r = await api.setAutoHeadroom(next);
      setHeadroomDb(r.headroomDb || 0);
      toast.success(next ? 'Auto-headroom on' : 'Static preset headroom');
    } catch (e) { setAutoHeadroom(!next); reportError(e.message); }
  };

  const handleDsdBypassToggle = async () => {
    const next = !dsdBypass;
    setDsdBypass(next);
    try {
      await api.setDsdBypass(next);
      toast.success(next ? 'DSD native bypass on' : 'DSD decoded to PCM');
    } catch (e) { setDsdBypass(!next); reportError(e.message); }
  };

  const handlePhaseChange = async (left, right) => {
    setPhaseLeft(left); setPhaseRight(right);
    try { await api.setPhase(left, right); toast.success(t('settings.phaseUpdated')); }
    catch (e) { reportError(e.message); }
  };

  return (
    <div className="pt-1">
      <Section>
        <Row label={t('settings.replayGain')}
          icon={<Scale className="h-4 w-4" style={{ color: C.text4 }} />}
          value={replayGain}
          chevron={false}
          onPress={() => {
            const modes = ['off', 'track', 'album', 'auto'];
            handleReplayGainChange(modes[(modes.indexOf(replayGain) + 1) % modes.length]);
          }} />
        <Row label={`Crossfade · ${crossfade}s`}
          icon={<RefreshCw className="h-4 w-4" style={{ color: C.text4 }} />}
          value={crossfade > 0 ? `${crossfade}s` : t('common.off')}
          chevron={false}
          onPress={() => setShowCrossfade(v => !v)} />
        {showCrossfade && (
          <div className="px-4 pb-4 flex gap-2 flex-wrap">
            {[0, 2, 4, 6, 8, 10].map(s => (
              <button key={s}
                onClick={() => { handleCrossfadeChange(s); setShowCrossfade(false); }}
                className="px-4 py-2 rounded-full text-[12px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={crossfade === s
                  ? { background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }
                  : { ...card, color: C.text4, fontFamily: C.fontLabel }}>
                {s === 0 ? t('common.off') : `${s}s`}
              </button>
            ))}
          </div>
        )}
        <Row label="Gapless Playback"
          icon={<Merge className="h-4 w-4" style={{ color: gapless ? C.champagne : C.text4 }} />}
          value={gapless ? t('common.on') : t('common.off')}
          chevron={false}
          onPress={handleGaplessToggle} />
        <Row label={`Balance · ${balance > 0 ? `R +${balance}` : balance < 0 ? `L +${Math.abs(balance)}` : t('settings.centre')}`}
          icon={<FlipHorizontal className="h-4 w-4" style={{ color: Math.abs(balance) > 0 ? C.champagne : C.text4 }} />}
          value={`${balance > 0 ? '+' : ''}${balance} dB`}
          chevron={false}
          onPress={() => setShowBalance(v => !v)} />
        {showBalance && (
          <div className="px-4 pb-4">
            <input type="range" min="-12" max="12" step="0.5" value={balance}
              onChange={e => handleBalanceChange(parseFloat(e.target.value))}
              className="w-full" />
            <div className="flex justify-between text-[11px] mt-1" style={{ color: C.text3, fontFamily: C.fontLabel }}>
              <span>L</span><span>{t('settings.centre')}</span><span>R</span>
            </div>
          </div>
        )}
        <Row label={t('settings.phaseInversion')}
          icon={<RotateCcw className="h-4 w-4" style={{ color: (phaseLeft || phaseRight) ? C.champagne : C.text4 }} />}
          value={phaseLeft && phaseRight ? 'L+R' : phaseLeft ? 'L' : phaseRight ? 'R' : t('common.off')}
          chevron={false}
          onPress={() => {
            if (!phaseLeft && !phaseRight) handlePhaseChange(true, false);
            else if (phaseLeft && !phaseRight) handlePhaseChange(false, true);
            else if (!phaseLeft && phaseRight) handlePhaseChange(true, true);
            else handlePhaseChange(false, false);
          }} />
        <Row label={t('settings.bitPerfect')}
          icon={<Disc3 className="h-4 w-4" style={{ color: bitPerfect ? C.champagne : C.text4 }} />}
          value={bitPerfect ? t('common.on') : 'Fixed 48k'}
          chevron={false}
          onPress={handleBitPerfectToggle} />
        {needsReboot && (
          <div className="mx-4 mb-3 rounded-xl p-3 flex items-center justify-between gap-3" style={card}>
            <p className="text-[12px] leading-snug" style={{ color: C.text2 }}>
              {bitPerfect
                ? 'Bit-perfect mode needs a reboot before it takes full effect — audio may cut out until then.'
                : 'Fixed 48 kHz needs a reboot before it takes full effect — audio may cut out until then.'}
            </p>
            <button onClick={handleRebootNow} disabled={rebooting}
              className="shrink-0 px-3 py-2 rounded-xl text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: C.champagne, color: '#1a1c1c' }}>
              <RefreshCw className={`h-3.5 w-3.5 ${rebooting ? 'animate-spin' : ''}`} />
              {rebooting ? t('settings.rebooting') : 'Reboot now'}
            </button>
          </div>
        )}
        <Row label={t('settings.dsdBypass')}
          icon={<Disc3 className="h-4 w-4" style={{ color: dsdBypass ? C.champagne : C.text4 }} />}
          value={dsdBypass ? 'Native' : 'PCM'}
          chevron={false}
          onPress={handleDsdBypassToggle} />
        <Row label={t('settings.autoHeadroom')}
          icon={<Scale className="h-4 w-4" style={{ color: autoHeadroom ? C.champagne : C.text4 }} />}
          value={autoHeadroom ? `−${headroomDb} dB` : 'Static'}
          chevron={false}
          onPress={handleAutoHeadroomToggle} />
      </Section>
    </div>
  );
}

// `inline`: TabletSettingsTab's master-detail pane wants "Advanced" to
// replace its own content instead of opening a Sheet on top of it. Phone
// always omits it, so Advanced still opens as a Sheet there.
export default function SoundSettings({ inline = false }) {
  const { t } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const {
    C,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, showEq, setShowEq,
    pureDirect, handleTogglePureDirect,
    sleepMinutes, sleepRemaining, showSleepRow, setShowSleepRow,
    handleEqPresetChange, handleBandChange,
    handleSaturationChange, handleNoiseFloorChange, handlePreAmpChange,
    handleDeactivateDsp, handleSetSleepTimer,
    setIsDspWizardOpen,
  } = useContext(Tk);

  if (inline && showAdvanced) {
    return (
      <div className="pt-1">
        <div className="flex items-center gap-3 px-1 mb-3">
          <button onClick={() => setShowAdvanced(false)} aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
            <ChevronLeft className="h-4 w-4" style={{ color: C.text3 }} />
          </button>
          <p className="text-[17px] font-medium" style={{ color: C.text1 }}>Advanced</p>
        </div>
        <AdvancedAudioSettings />
      </div>
    );
  }

  return (
    <div className="pt-1">
      {/* Mirrors the kiosk's Sound surface exactly: Equalizer, Room
          Calibration (DSP Wizard), Pure Direct, plus Sleep Timer (a
          remote-only convenience with no kiosk equivalent). Everything
          else lives one level down, under Advanced. */}
      <Section title={t('settings.sound')}>
        <Row label={`Equalizer · ${eqPreset}`}
          icon={<Sliders className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => setShowEq(v => !v)} chevron={false} value={showEq ? '▲' : '▼'} />
        {showEq && (
          <RemoteEqualizer
            currentPreset={eqPreset} onPresetChange={handleEqPresetChange}
            bands={eqBands} onBandChange={handleBandChange}
            saturation={eqSaturation} onSaturationChange={handleSaturationChange}
            noiseFloor={eqNoiseFloor} onNoiseFloorChange={handleNoiseFloorChange}
            preAmp={eqPreAmp} onPreAmpChange={handlePreAmpChange}
            dspActive={dspActive} onDeactivateDsp={handleDeactivateDsp}
            pureDirect={pureDirect} onDisablePureDirect={() => handleTogglePureDirect(false)}
          />
        )}
        <Row label={t('settings.roomCalibration')}
          icon={<Cpu className="h-4 w-4" style={{ color: '#f59e0b' }} />}
          value={dspActive ? t('common.on') : t('common.off')}
          onPress={() => setIsDspWizardOpen(true)} />
        <Row label="Pure Direct"
          icon={<Cpu className="h-4 w-4" style={{ color: pureDirect ? '#0e9ab8' : C.text4 }} />}
          value={pureDirect ? t('common.on') : t('common.off')}
          chevron={false}
          onPress={() => handleTogglePureDirect(!pureDirect)} />
        <Row
          label={sleepRemaining > 0
            ? `Sleep · ${Math.floor(sleepRemaining / 60)}:${(sleepRemaining % 60).toString().padStart(2, '0')}`
            : 'Sleep Timer'}
          icon={<Timer className="h-4 w-4" style={{ color: sleepRemaining > 0 ? C.champagne : C.text4 }} />}
          value={sleepMinutes ? (sleepMinutes < 60 ? `${sleepMinutes}m` : `${sleepMinutes / 60}h`) : 'Off'}
          chevron={false}
          onPress={() => setShowSleepRow(v => !v)} />
        {showSleepRow && (
          <div className="px-4 pb-4 flex gap-2 flex-wrap">
            {[0, 15, 30, 60, 120].map(m => (
              <button key={m}
                onClick={() => { handleSetSleepTimer(m); setShowSleepRow(false); }}
                className="px-4 py-2 rounded-full text-[12px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={sleepMinutes === m
                  ? { background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }
                  : { color: C.text4, fontFamily: C.fontLabel }}>
                {m === 0 ? 'Off' : m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        )}
        <Row label="Advanced"
          icon={<SlidersHorizontal className="h-4 w-4" style={{ color: C.text4 }} />}
          sub="ReplayGain, crossfade, balance, phase, bit-perfect…"
          onPress={() => setShowAdvanced(true)} />
      </Section>

      {!inline && showAdvanced && (
        <Sheet C={C} kicker={t('settings.sound')} title="Advanced" onBack={() => setShowAdvanced(false)} padded={false}>
          <AdvancedAudioSettings />
        </Sheet>
      )}
    </div>
  );
}
