import { useContext, useState, useRef, useEffect } from 'react';
import { HardDrive, Download, Upload, RotateCcw, RefreshCw, Power } from 'lucide-react';
import { Kk } from './KioskContext';
import { toast } from '../../lib/toast';
import { reportError } from '../../lib/errors';
import { api } from '../../api';
import { S, cardShadow } from '../../styles/stone';
import { useI18n } from '../../i18n';

// Double-tap confirm button — first tap arms it (shows the confirm label for
// 3s), second tap within that window fires the action. Mirrors the remote's
// withConfirm() pattern so both surfaces behave identically.
function ConfirmRow({ icon, label, confirmLabel, armed, onArm, destructive, disabled }) {
  return (
    <button
      onClick={onArm}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all active:scale-[0.99] cursor-pointer disabled:opacity-40"
      style={{
        background: armed ? (destructive ? `${S.errorHot}18` : `${S.accent}18`) : S.surfaceLo,
        border: `1px solid ${armed ? (destructive ? S.errorHot : S.accent) : S.border}`,
        boxShadow: cardShadow,
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-sm font-semibold" style={{ color: armed ? (destructive ? S.errorHot : S.accent) : S.strong }}>
        {armed ? confirmLabel : label}
      </span>
    </button>
  );
}

export default function SystemAdminOverlay() {
  const { isSystemAdminOpen, setIsSystemAdminOpen } = useContext(Kk);
  const { t } = useI18n();

  const [storage, setStorage]   = useState(null);
  const [loaded, setLoaded]     = useState(false);
  const [armed, setArmed]       = useState(null);
  const [restoring, setRestoring] = useState(false);
  const armTimer = useRef(null);
  const fileInputRef = useRef(null);

  const loadStorage = async () => {
    try { setStorage(await api.getStorage()); setLoaded(true); }
    catch (e) { reportError(e.message); }
  };

  // Fetch once per open, from an effect rather than the render body — this
  // component stays mounted (only opacity/scale toggle), so it re-renders
  // whenever Kiosk's large kioskCtx memo changes. Calling loadStorage()
  // directly in render let it re-fire and overlap before the first response
  // landed, and it's a React render-purity violation regardless.
  useEffect(() => {
    if (isSystemAdminOpen && !loaded) loadStorage();
  }, [isSystemAdminOpen, loaded]);

  const withConfirm = (key, action) => () => {
    if (armed === key) {
      clearTimeout(armTimer.current);
      setArmed(null);
      action();
    } else {
      setArmed(key);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), 3000);
    }
  };

  const handleReboot = async () => {
    try { await api.rebootSystem(); toast.success(t('settings.rebooting')); }
    catch (e) { reportError(e.message); }
  };
  const handleShutdown = async () => {
    try { await api.shutdownSystem(); toast.success(t('settings.shuttingDown')); }
    catch (e) { reportError(e.message); }
  };
  const handleFactoryReset = async () => {
    try { await api.factoryReset(); toast.success(t('settings.settingsReset')); }
    catch (e) { reportError(e.message); }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm(t('settings.restoreConfirm'))) return;
    setRestoring(true);
    try {
      const buf = await file.arrayBuffer();
      const r = await fetch('/api/system/restore', { method: 'POST', body: buf });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || t('settings.restoreFailed'));
      toast.success(d.message || t('settings.restoreSuccess'));
    } catch (err) {
      reportError(err.message || t('settings.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-[60] transform overlay-pop flex flex-col p-5 font-sans ${
        isSystemAdminOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 shrink-0"
        style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${S.border}` }}>
            <HardDrive className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
          </div>
          <span className="text-sm font-light tracking-[0.25em] uppercase underline underline-offset-8 decoration-[#2a2826] decoration-1" style={{ color: S.label }}>
            {t('settings.systemAdmin')}
          </span>
        </div>
        <button
          onClick={() => { setIsSystemAdminOpen(false); setArmed(null); }}
          className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
          style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
          {t('theme.close')}
        </button>
      </div>

      {/* Body — 2 col */}
      <div className="flex-grow grid grid-cols-2 gap-4 min-h-0 overflow-hidden">

        {/* Left — storage + backup/restore */}
        <div className="flex flex-col gap-3 rounded-2xl p-4 overflow-y-auto stone-scrollbar min-h-0"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <span className="text-sm font-light tracking-[0.2em] uppercase shrink-0" style={{ color: S.label }}>
            {t('settings.storage')}
          </span>

          {storage && (
            <div className="rounded-xl p-4 shrink-0" style={{ background: S.bg, border: `1px solid ${S.track}` }}>
              <div className="flex justify-between text-sm mb-1.5" style={{ color: S.muted }}>
                <span>{t('net.diskUsed')}</span>
                <span>{storage.rootMb?.used} / {storage.rootMb?.size} MB</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: S.track }}>
                <div className="h-full rounded-full" style={{ width: `${storage.rootMb?.pct}%`, background: S.accent }} />
              </div>
              <p className="text-sm mt-3" style={{ color: S.muted }}>
                {t('net.musicLibrary')}: {storage.musicFiles} {t('library.tracks').toLowerCase()} · {storage.musicSizeMb} MB
              </p>
            </div>
          )}

          <button
            onClick={() => window.open('/api/system/backup', '_blank')}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all active:scale-[0.99] cursor-pointer shrink-0"
            style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, boxShadow: cardShadow }}
          >
            <Download className="h-4 w-4 shrink-0" style={{ color: S.muted }} />
            <span className="text-sm font-semibold" style={{ color: S.strong }}>{t('settings.backup')}</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all active:scale-[0.99] cursor-pointer shrink-0 disabled:opacity-40"
            style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, boxShadow: cardShadow }}
          >
            <Upload className="h-4 w-4 shrink-0" style={{ color: S.muted }} />
            <span className="text-sm font-semibold" style={{ color: S.strong }}>
              {restoring ? t('common.connecting') : t('settings.restore')}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept=".db" className="hidden" onChange={handleRestoreFile} />
          <p className="text-sm font-light" style={{ color: S.label }}>{t('settings.restoreFilePrompt')}</p>
        </div>

        {/* Right — power controls */}
        <div className="flex flex-col gap-3 rounded-2xl p-4 min-h-0"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <span className="text-sm font-light tracking-[0.2em] uppercase shrink-0" style={{ color: S.label }}>
            {t('settings.systemControl')}
          </span>

          <ConfirmRow
            icon={<RotateCcw className="h-4 w-4" style={{ color: S.errorHot }} />}
            label={t('settings.factoryReset')}
            confirmLabel={t('settings.confirmFactoryReset')}
            armed={armed === 'factory-reset'}
            onArm={withConfirm('factory-reset', handleFactoryReset)}
            destructive
          />
          <ConfirmRow
            icon={<RefreshCw className="h-4 w-4" style={{ color: armed === 'reboot' ? '#f59e0b' : S.muted }} />}
            label={t('settings.reboot')}
            confirmLabel={t('settings.confirmReboot')}
            armed={armed === 'reboot'}
            onArm={withConfirm('reboot', handleReboot)}
          />
          <ConfirmRow
            icon={<Power className="h-4 w-4" style={{ color: S.errorHot }} />}
            label={t('settings.shutdown')}
            confirmLabel={t('settings.confirmShutdown')}
            armed={armed === 'shutdown'}
            onArm={withConfirm('shutdown', handleShutdown)}
            destructive
          />
        </div>
      </div>
    </div>
  );
}
