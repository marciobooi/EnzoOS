import { useContext, useState, useRef } from 'react';
import {
  RefreshCw, HardDrive, RotateCcw, Download, Sparkles, Power, Music, Sliders, Webhook, ShieldCheck,
} from 'lucide-react';
import { toast } from '../../../lib/toast';
import { reportError } from '../../../lib/errors';
import { Tk, Row, Section, SpotifyIcon } from '../shared';
import { api } from '../../../api';
import { useI18n } from '../../../i18n';

export default function SystemSettings() {
  const { t } = useI18n();
  const [confirmPending, setConfirmPending] = useState(null);
  const confirmRef = useRef(null);

  const [storage, setStorage]     = useState(null);
  const [showStorage, setShowStorage] = useState(false);

  // Secure remote (HTTPS/PWA) instructions
  const [showSecure, setShowSecure]     = useState(false);

  // Outbound webhook (automations) — one URL, POSTed on player transitions
  const [showWebhook, setShowWebhook]   = useState(false);
  const [webhookUrl, setWebhookUrl]     = useState('');
  const [webhookDraft, setWebhookDraft] = useState('');
  const [webhookBusy, setWebhookBusy]   = useState(false);

  const handleOpenWebhook = async () => {
    if (showWebhook) { setShowWebhook(false); return; }
    try {
      const r = await fetch('/api/system/webhook');
      const d = await r.json();
      setWebhookUrl(d.url || '');
      setWebhookDraft(d.url || '');
    } catch { /* field just opens empty */ }
    setShowWebhook(true);
  };

  const handleSaveWebhook = async (override) => {
    const url = (override !== undefined ? override : webhookDraft).trim();
    setWebhookBusy(true);
    try {
      const r = await fetch('/api/system/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      });
      if (!r.ok) throw new Error((await r.json())?.error || 'Save failed');
      setWebhookUrl(url);
      toast.success(url ? t('settings.webhookSaved') : t('settings.webhookDisabled'));
      if (!url) setShowWebhook(false);
    } catch (e) { reportError(e.message); }
    finally { setWebhookBusy(false); }
  };

  const {
    C, cardWhite, darkMode,
    services, serviceLoading, systemHealth, updateStatus, otaProgress, otaPercent,
    handleRestartService, handleReboot, handleShutdown,
    triggerOtaUpdate, checkUpdates,
  } = useContext(Tk);

  const withConfirm = (key, action) => () => {
    if (confirmPending === key) {
      clearTimeout(confirmRef.current);
      setConfirmPending(null);
      action();
    } else {
      setConfirmPending(key);
      clearTimeout(confirmRef.current);
      confirmRef.current = setTimeout(() => setConfirmPending(null), 3000);
    }
  };

  const handleLoadStorage = async () => {
    try { setStorage(await api.getStorage()); setShowStorage(true); }
    catch (e) { reportError(e.message); }
  };

  return (
    <div className="pt-1">
      {systemHealth && (
        <div className="mx-4 mb-4 rounded-xl p-4 flex justify-around" style={cardWhite}>
          {[
            { label: 'CPU',   value: `${systemHealth.cpuTemp}°C`    },
            { label: 'RAM',   value: `${systemHealth.ramLoad}%`      },
            { label: 'Wi-Fi', value: `${systemHealth.wifiSignal}dBm` },
          ].map(m => (
            <div key={m.label} className="flex flex-col items-center gap-1">
              <span className="text-[19px] font-medium" style={{ color: C.text1 }}>{m.value}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: C.text3, fontFamily: C.fontLabel }}>{m.label}</span>
            </div>
          ))}
        </div>
      )}

      <Section title={t('settings.services')}>
        {[
          { id: 'mpd',        label: 'MPD',        icon: <Music    className="h-4 w-4" style={{ color: C.text4 }} /> },
          { id: 'camilladsp', label: 'CamillaDSP', icon: <Sliders  className="h-4 w-4" style={{ color: C.text4 }} /> },
          { id: 'raspotify',  label: 'Raspotify',  icon: <SpotifyIcon className="h-4 w-4" style={{ fill: C.text4 }} /> },
        ].map(svc => {
          const status   = services?.[svc.id];
          const isActive = status === 'active';
          return (
            <Row key={svc.id} label={svc.label}
              icon={(
                <span className="relative">
                  {svc.icon}
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full border"
                    style={{
                      background: services ? (isActive ? '#22c55e' : C.error) : C.outline,
                      borderColor: darkMode ? '#111827' : '#ffffff',
                    }} />
                </span>
              )}
              value={serviceLoading[svc.id] ? 'restarting…' : (status || '…')}
              chevron={false}
              onPress={() => handleRestartService(svc.id)} />
          );
        })}
      </Section>

      <Section title={t('settings.system')}>
        <Row
          label={updateStatus === 'updating' ? `${t('net.updating')} · ${otaPercent}%` : t('net.checkUpdates')}
          icon={<RefreshCw className={`h-4 w-4 ${updateStatus === 'checking' || updateStatus === 'updating' ? 'animate-spin' : ''}`} style={{ color: '#22c55e' }} />}
          value={updateStatus === 'no-update' ? t('net.upToDate') : updateStatus === 'available' ? t('net.available') : ''}
          onPress={updateStatus === 'available' ? triggerOtaUpdate : checkUpdates}
          chevron={updateStatus === 'available'} />
        {updateStatus === 'updating' && (
          <div className="px-4 pb-4">
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: C.container }}>
              <div className="h-full rounded-full"
                style={{ width: `${otaPercent}%`, background: '#22c55e', transition: 'width 0.3s' }} />
            </div>
            <div className="mt-2 max-h-16 overflow-y-auto">
              {otaProgress.map((l, i) => (
                <p key={i} className="text-[11px] font-mono" style={{ color: C.text3 }}>{l}</p>
              ))}
            </div>
          </div>
        )}
        <Row label={t('settings.storage')} sub="Library and disk usage"
          icon={<HardDrive className="h-4 w-4" style={{ color: C.text4 }} />}
          onPress={handleLoadStorage} />
        {showStorage && storage && (
          <div className="mx-4 mb-3 rounded-xl p-4 flex flex-col gap-3" style={cardWhite}>
            <div>
              <div className="flex justify-between text-[12px] mb-1" style={{ color: C.text3 }}>
                <span>{t('net.diskUsed')}</span>
                <span>{storage.rootMb?.used} / {storage.rootMb?.size} MB</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.container }}>
                <div className="h-full rounded-full" style={{ width: `${storage.rootMb?.pct}%`, background: C.champagne }} />
              </div>
            </div>
            <p className="text-[12px]" style={{ color: C.text3 }}>
              {t('net.musicLibrary')}: {storage.musicFiles} files · {storage.musicSizeMb} MB
            </p>
          </div>
        )}
        <Row label={t('settings.secureRemote')} sub={window.isSecureContext ? t('settings.secureRemoteOn') : t('settings.secureRemoteOff')}
          icon={<ShieldCheck className="h-4 w-4" style={{ color: window.isSecureContext ? '#22c55e' : C.text4 }} />}
          onPress={() => setShowSecure(s => !s)} />
        {showSecure && (
          <div className="mx-4 mb-3 rounded-xl p-4 flex flex-col gap-2.5" style={cardWhite}>
            {[1, 2, 3, 4].map(n => (
              <p key={n} className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>
                <span className="font-bold" style={{ color: C.champagne }}>{n}. </span>
                {t(`settings.secureStep${n}`, { host: window.location.hostname })}
              </p>
            ))}
            <a href="/ca.crt" download
              className="mt-1 py-2.5 rounded-xl text-[13px] font-semibold text-center active:scale-95 transition-all"
              style={{ background: C.champagne, color: '#1a1c1c' }}>
              {t('settings.downloadCa')}
            </a>
          </div>
        )}
        <Row label={t('settings.webhook')} sub={webhookUrl ? webhookUrl : t('settings.webhookOff')}
          icon={<Webhook className="h-4 w-4" style={{ color: webhookUrl ? C.champagne : C.text4 }} />}
          onPress={handleOpenWebhook} />
        {showWebhook && (
          <div className="mx-4 mb-3 rounded-xl p-3 flex flex-col gap-2" style={cardWhite}>
            <p className="text-[12px]" style={{ color: C.text3 }}>{t('settings.webhookHint')}</p>
            <input type="url" value={webhookDraft} onChange={e => setWebhookDraft(e.target.value)}
              placeholder="https://homeassistant.local:8123/api/webhook/resonance"
              autoCapitalize="none" autoComplete="off" spellCheck={false}
              className="rounded-xl px-3 py-2.5 text-[14px] focus:outline-none"
              style={{ background: C.containerLow, color: C.text1, border: `0.5px solid ${C.outline}` }} />
            <div className="flex gap-2">
              <button onClick={handleSaveWebhook} disabled={webhookBusy}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all disabled:opacity-40"
                style={{ background: C.champagne, color: '#1a1c1c' }}>
                {webhookBusy ? '…' : t('settings.webhookSave')}
              </button>
              {webhookUrl && (
                <button onClick={() => { setWebhookDraft(''); handleSaveWebhook(''); }} disabled={webhookBusy}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all disabled:opacity-40"
                  style={{ background: C.containerLow, color: C.error, border: `0.5px solid ${C.outline}` }}>
                  {t('settings.webhookDisable')}
                </button>
              )}
            </div>
          </div>
        )}
        <Row label={t('settings.runWizard')}
          icon={<Sparkles className="h-4 w-4" style={{ color: C.champagne }} />}
          onPress={() => window.dispatchEvent(new Event('resonance:show-welcome'))} />
        <Row label={t('settings.backup')}
          icon={<Download className="h-4 w-4" style={{ color: C.text4 }} />}
          onPress={() => { window.open('/api/system/backup', '_blank'); }} />
        <Row label={confirmPending === 'factory-reset' ? t('settings.confirmFactoryReset') : t('settings.factoryReset')} destructive
          icon={<RotateCcw className="h-4 w-4" style={{ color: C.error }} />}
          onPress={withConfirm('factory-reset', async () => {
            try { await api.factoryReset(); toast.success(t('settings.settingsReset')); }
            catch (e) { reportError(e.message); }
          })} />
        <Row label={confirmPending === 'reboot' ? t('settings.confirmReboot') : t('settings.reboot')}
          icon={<RefreshCw className="h-4 w-4" style={{ color: confirmPending === 'reboot' ? '#f59e0b' : C.text4 }} />}
          onPress={withConfirm('reboot', handleReboot)} />
        <Row label={confirmPending === 'shutdown' ? t('settings.confirmShutdown') : t('settings.shutdown')} destructive
          icon={<Power className="h-4 w-4" style={{ color: C.error }} />}
          onPress={withConfirm('shutdown', handleShutdown)} />
      </Section>
    </div>
  );
}
