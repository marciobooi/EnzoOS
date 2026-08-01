import { useContext, useState, useRef, useEffect } from 'react';
import {
  RefreshCw, HardDrive, RotateCcw, Download, Sparkles, Power, Music, Sliders, Webhook, ShieldCheck,
  Usb, Bluetooth, BluetoothConnected, Server, FolderPlus, Trash2, Search,
} from 'lucide-react';
import { toast } from '../../../lib/toast';
import { reportError } from '../../../lib/errors';
import { Tk, Row as SharedRow, Section as SharedSection, SpotifyIcon } from '../shared';
import { TabletRow, TabletSection } from '../tablet/TabletSection';
import { api } from '../../../api';
import { useI18n } from '../../../i18n';

// `inline`: see DisplaySettings.jsx — swaps in the tablet floating-card
// Row/Section, same prop signature, JSX below unchanged either way.
export default function SystemSettings({ inline = false }) {
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

  // ── USB drive ────────────────────────────────────────────────────────────────
  const [showUsb, setShowUsb] = useState(false);
  const [usbStatus, setUsbStatus] = useState(null);
  const handleOpenUsb = async () => {
    if (showUsb) { setShowUsb(false); return; }
    try { setUsbStatus(await api.getUsbStatus()); } catch { setUsbStatus({ mounted: false }); }
    setShowUsb(true);
  };
  const handleEjectUsb = async () => {
    try { await api.ejectUsb(); setUsbStatus({ mounted: false }); toast.success(t('settings.usbEjected')); }
    catch (e) { reportError(e.message); }
  };

  // ── Bluetooth output (headphones/speakers) ──────────────────────────────────
  const [showBtOut, setShowBtOut]     = useState(false);
  const [btOutStatus, setBtOutStatus] = useState(null);
  const [btDevices, setBtDevices]     = useState([]);
  const [btScanning, setBtScanning]   = useState(false);
  const [btBusyMac, setBtBusyMac]     = useState(null);
  // AUDIT-2026-08-02: btOutStatus used to start at null and ONLY get fetched
  // when the user tapped this row — so the Row's own subtitle (rendered from
  // btOutStatus, further down) showed the default "OFF — using the DAC" on
  // every fresh page load/remount regardless of the REAL state, correcting
  // itself only once tapped. Reported live as "I go to Settings and it's not
  // connected, then I open it and it says connected, I didn't do anything" —
  // not flapping state, just never having fetched yet. Fetch once on mount
  // so the subtitle is right from the moment the page renders.
  useEffect(() => {
    api.bluetoothOutStatus().then(setBtOutStatus).catch(() => {});
  }, []);
  // Previously-used speakers are listed immediately on open, so reconnecting
  // to a known one is one tap instead of sitting through a 15s scan every
  // time — scanning is only needed to add something new.
  const handleOpenBtOut = async () => {
    if (showBtOut) { setShowBtOut(false); return; }
    // A failed fetch here used to force-set {enabled: false} — actively
    // asserting "definitely off" when the truth is just "request failed,
    // status unknown". Leave the last-known status in place instead of
    // lying about it.
    try { setBtOutStatus(await api.bluetoothOutStatus()); } catch { /* keep last-known status */ }
    setShowBtOut(true);
    try { const d = await api.bluetoothOutPaired(); setBtDevices(d.devices || []); } catch { /* scan still available */ }
  };
  const handleScanBt = async () => {
    setBtScanning(true);
    try {
      const d = await api.bluetoothOutScan();
      // Merge rather than replace: a known speaker that happens to be off (so
      // the scan can't see it) must not vanish from the list mid-session.
      setBtDevices(prev => {
        const seen = new Set((d.devices || []).map(x => x.mac));
        return [...(d.devices || []), ...prev.filter(x => !seen.has(x.mac))];
      });
    }
    catch (e) { reportError(e.message); }
    finally { setBtScanning(false); }
  };
  const handlePairBt = async (device) => {
    setBtBusyMac(device.mac);
    try {
      await api.bluetoothOutPair(device.mac);
      await api.bluetoothOutSelect(device.mac, device.name, true);
      setBtOutStatus(await api.bluetoothOutStatus());
      toast.success(t('settings.btOutConnected', { name: device.name }));
    } catch (e) { reportError(e.message); }
    finally { setBtBusyMac(null); }
  };
  const handleUseDac = async () => {
    try {
      if (btOutStatus?.mac) await api.bluetoothOutDisconnect(btOutStatus.mac);
      else await api.bluetoothOutSelect(null, null, false);
      toast.success(t('settings.btOutUsingDac'));
    } catch (e) {
      reportError(e.message);
    } finally {
      // Always re-sync, success or failure — the toggle looking permanently
      // "stuck" after a transient error (e.g. a BlueZ-level hiccup with no
      // adapter present) is worse than a status read that might briefly lag.
      try { setBtOutStatus(await api.bluetoothOutStatus()); } catch {}
    }
  };

  // ── NAS shares (SMB/NFS) ───────────────────────────────────────────────────────
  const [showNas, setShowNas]         = useState(false);
  const [nasShares, setNasShares]     = useState([]);
  const [showAddNas, setShowAddNas]   = useState(false);
  const [nasBusy, setNasBusy]         = useState(false);
  const [nasForm, setNasForm] = useState({ name: '', type: 'smb', host: '', share: '', username: '', password: '' });
  const handleOpenNas = async () => {
    if (showNas) { setShowNas(false); return; }
    try { const d = await api.getNasShares(); setNasShares(d.shares || []); } catch { setNasShares([]); }
    setShowNas(true);
  };
  const handleAddNas = async () => {
    if (!nasForm.name || !nasForm.host || !nasForm.share) return;
    setNasBusy(true);
    try {
      await api.addNasShare(nasForm);
      const d = await api.getNasShares();
      setNasShares(d.shares || []);
      setShowAddNas(false);
      setNasForm({ name: '', type: 'smb', host: '', share: '', username: '', password: '' });
      toast.success(t('settings.nasAdded'));
    } catch (e) { reportError(e.message); }
    finally { setNasBusy(false); }
  };
  const handleRemoveNas = async (id) => {
    try {
      await api.removeNasShare(id);
      setNasShares(prev => prev.filter(s => s.id !== id));
    } catch (e) { reportError(e.message); }
  };

  const {
    C, cardWhite, darkMode,
    services, serviceLoading, systemHealth, updateStatus, otaProgress, otaPercent,
    handleRestartService, handleReboot, handleShutdown,
    triggerOtaUpdate, checkUpdates,
  } = useContext(Tk);
  const Row = inline ? TabletRow : SharedRow;
  const Section = inline ? TabletSection : SharedSection;

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

        <Row label={t('settings.usb')} sub={usbStatus?.mounted ? usbStatus.label : t('settings.usbNone')}
          icon={<Usb className="h-4 w-4" style={{ color: usbStatus?.mounted ? C.champagne : C.text4 }} />}
          onPress={handleOpenUsb} />
        {showUsb && (
          <div className="mx-4 mb-3 rounded-xl p-4 flex flex-col gap-2" style={cardWhite}>
            {usbStatus?.mounted ? (
              <>
                <p className="text-[12px]" style={{ color: C.text3 }}>
                  {usbStatus.freeMb} / {usbStatus.totalMb} MB {t('settings.usbFree')}
                </p>
                <button onClick={handleEjectUsb}
                  className="py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
                  style={{ background: C.containerLow, color: C.error, border: `0.5px solid ${C.outline}` }}>
                  {t('settings.usbEject')}
                </button>
              </>
            ) : (
              <p className="text-[12px]" style={{ color: C.text3 }}>{t('settings.usbHint')}</p>
            )}
          </div>
        )}

        <Row label={t('settings.nas')} sub={nasShares.length ? t('settings.nasCount', { n: nasShares.length }) : t('settings.nasNone')}
          icon={<Server className="h-4 w-4" style={{ color: nasShares.length ? C.champagne : C.text4 }} />}
          onPress={handleOpenNas} />
        {showNas && (
          <div className="mx-4 mb-3 rounded-xl p-4 flex flex-col gap-2" style={cardWhite}>
            {nasShares.map(s => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-xl"
                style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: C.text1 }}>{s.name}</p>
                  <p className="text-[11px] truncate" style={{ color: C.text3 }}>{s.type.toUpperCase()} · //{s.host}/{s.share}</p>
                </div>
                <button onClick={() => handleRemoveNas(s.id)} className="shrink-0 p-2 -m-2">
                  <Trash2 className="h-4 w-4" style={{ color: C.error }} />
                </button>
              </div>
            ))}
            {!showAddNas ? (
              <button onClick={() => setShowAddNas(true)}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
                style={{ background: C.champagne, color: '#1a1c1c' }}>
                <FolderPlus className="h-4 w-4" /> {t('settings.nasAdd')}
              </button>
            ) : (
              <div className="flex flex-col gap-2 mt-1">
                <input type="text" placeholder={t('settings.nasNameField')} value={nasForm.name}
                  onChange={e => setNasForm(f => ({ ...f, name: e.target.value }))}
                  className="px-3 py-2 rounded-xl text-[13px] focus:outline-none"
                  style={{ background: C.container, color: C.text1, border: `0.5px solid ${C.outline}` }} />
                <div className="flex gap-2">
                  {['smb', 'nfs'].map(ty => (
                    <button key={ty} onClick={() => setNasForm(f => ({ ...f, type: ty }))}
                      className="flex-1 py-2 rounded-xl text-[12px] font-semibold uppercase tracking-wide"
                      style={nasForm.type === ty
                        ? { background: C.champagne, color: '#1a1c1c' }
                        : { background: C.container, color: C.text3, border: `0.5px solid ${C.outline}` }}>
                      {ty}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder={t('settings.nasHost')} value={nasForm.host}
                  autoCapitalize="none" autoComplete="off"
                  onChange={e => setNasForm(f => ({ ...f, host: e.target.value }))}
                  className="px-3 py-2 rounded-xl text-[13px] focus:outline-none"
                  style={{ background: C.container, color: C.text1, border: `0.5px solid ${C.outline}` }} />
                <input type="text" placeholder={t('settings.nasShareField')} value={nasForm.share}
                  autoCapitalize="none" autoComplete="off"
                  onChange={e => setNasForm(f => ({ ...f, share: e.target.value }))}
                  className="px-3 py-2 rounded-xl text-[13px] focus:outline-none"
                  style={{ background: C.container, color: C.text1, border: `0.5px solid ${C.outline}` }} />
                {nasForm.type === 'smb' && (
                  <>
                    <input type="text" placeholder={t('settings.nasUser')} value={nasForm.username}
                      autoCapitalize="none" autoComplete="off"
                      onChange={e => setNasForm(f => ({ ...f, username: e.target.value }))}
                      className="px-3 py-2 rounded-xl text-[13px] focus:outline-none"
                      style={{ background: C.container, color: C.text1, border: `0.5px solid ${C.outline}` }} />
                    <input type="password" placeholder={t('settings.nasPassword')} value={nasForm.password}
                      onChange={e => setNasForm(f => ({ ...f, password: e.target.value }))}
                      className="px-3 py-2 rounded-xl text-[13px] focus:outline-none"
                      style={{ background: C.container, color: C.text1, border: `0.5px solid ${C.outline}` }} />
                  </>
                )}
                <div className="flex gap-2 mt-1">
                  <button onClick={handleAddNas} disabled={nasBusy || !nasForm.name || !nasForm.host || !nasForm.share}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all disabled:opacity-40"
                    style={{ background: C.champagne, color: '#1a1c1c' }}>
                    {nasBusy ? '…' : t('settings.nasConnect')}
                  </button>
                  <button onClick={() => setShowAddNas(false)}
                    className="px-4 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
                    style={{ background: C.containerLow, color: C.text3, border: `0.5px solid ${C.outline}` }}>
                    {t('settings.nasCancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <Row label={t('settings.btOut')}
          sub={btOutStatus?.enabled ? (btOutStatus.connected ? btOutStatus.name : t('settings.btOutDisconnected', { name: btOutStatus.name })) : t('settings.btOutOff')}
          icon={btOutStatus?.enabled && btOutStatus?.connected
            ? <BluetoothConnected className="h-4 w-4" style={{ color: C.champagne }} />
            : <Bluetooth className="h-4 w-4" style={{ color: C.text4 }} />}
          onPress={handleOpenBtOut} />
        {showBtOut && (
          <div className="mx-4 mb-3 rounded-xl p-4 flex flex-col gap-2" style={cardWhite}>
            {btOutStatus?.enabled && (
              <button onClick={handleUseDac}
                className="py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
                style={{ background: C.containerLow, color: C.error, border: `0.5px solid ${C.outline}` }}>
                {t('settings.btOutUseDacBtn')}
              </button>
            )}
            <button onClick={handleScanBt} disabled={btScanning}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all disabled:opacity-40"
              style={{ background: C.champagne, color: '#1a1c1c' }}>
              <Search className="h-4 w-4" /> {btScanning ? t('settings.btOutScanning') : t('settings.btOutScan')}
            </button>
            {btDevices.map(d => (
              <button key={d.mac} onClick={() => handlePairBt(d)} disabled={btBusyMac === d.mac}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left disabled:opacity-50"
                style={btOutStatus?.mac === d.mac
                  ? { background: C.champagne, color: '#1a1c1c' }
                  : { background: C.containerLow, color: C.text2, border: `0.5px solid ${C.outline}` }}>
                <span className="text-[13px] font-medium truncate">{d.name}</span>
                {/* Was hardcoded to "Connect" for every row regardless of
                    which device is actually connected — the row's background
                    already highlighted the active device correctly, but the
                    label next to it never reflected that (AUDIT-2026-08-02). */}
                <span className="text-[11px] opacity-70">
                  {btBusyMac === d.mac
                    ? '…'
                    : (btOutStatus?.enabled && btOutStatus?.connected && btOutStatus?.mac === d.mac)
                      ? t('settings.btOutConnectedBtn')
                      : t('settings.btOutConnectBtn')}
                </span>
              </button>
            ))}
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
