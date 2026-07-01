import { useContext, useState, useRef, useEffect } from 'react';
import { Sliders, Cpu, Timer, Scale, RefreshCw, FlipHorizontal, RotateCcw, Disc3 } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { reportError } from '../../../lib/errors';
import { Tk, Row, Section } from '../shared';
import RemoteEqualizer from '../RemoteEqualizer';
import { api } from '../../../api';
import { useI18n } from '../../../i18n';

export default function SoundSettings() {
  const { t } = useI18n();
  const {
    C, card,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, showEq, setShowEq,
    sleepMinutes, sleepRemaining, showSleepRow, setShowSleepRow,
    handleEqPresetChange, handleBandChange,
    handleSaturationChange, handleNoiseFloorChange, handlePreAmpChange,
    handleDeactivateDsp, handleSetSleepTimer,
  } = useContext(Tk);

  const [replayGain, setReplayGain]   = useState('off');
  const [crossfade, setCrossfade]     = useState(0);
  const [showCrossfade, setShowCrossfade] = useState(false);
  const [balance, setBalance]         = useState(0);
  const [showBalance, setShowBalance] = useState(false);
  const [phaseLeft, setPhaseLeft]     = useState(false);
  const [phaseRight, setPhaseRight]   = useState(false);
  const [bitPerfect, setBitPerfect]   = useState(true);
  const [dsdBypass, setDsdBypass]     = useState(true);
  const [autoHeadroom, setAutoHeadroom] = useState(true);
  const [headroomDb, setHeadroomDb]   = useState(0);
  const balanceDebounce = useRef(null);

  useEffect(() => {
    api.getReplayGain().then(d => setReplayGain(d.mode || 'off')).catch(() => {});
    api.getCrossfade().then(d => setCrossfade(d.seconds || 0)).catch(() => {});
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
    try { await api.setCrossfade(secs); }
    catch (e) { reportError(e.message); }
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
      toast.success(next ? 'Bit-perfect on — reboot to apply' : 'Fixed 48 kHz mode — reboot to apply');
    } catch (e) { setBitPerfect(!next); reportError(e.message); }
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
          />
        )}
        <Row label={t('settings.roomCalibration')}
          icon={<Cpu className="h-4 w-4" style={{ color: '#f59e0b' }} />}
          value={dspActive ? t('common.on') : t('common.off')}
          chevron={false}
          onPress={() => toast.error(t('settings.roomCalibrationKioskOnly') || 'Run room calibration from the kiosk — it needs you in the listening position.')} />
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
                  : { ...card, color: C.text4, fontFamily: C.fontLabel }}>
                {m === 0 ? 'Off' : m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        )}
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
