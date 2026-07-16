import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Share, Plus, MoreVertical, Check, Download } from 'lucide-react';
import { Tk } from './shared';
import { installAvailable, isStandalone, onInstallChange, promptInstall } from '../../lib/pwaInstall';
import { useI18n } from '../../i18n';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const IS_IOS = /iphone|ipad|ipod/i.test(ua) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function Step({ C, n, icon, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold"
        style={{ background: C.containerLow, color: C.champagne, border: `0.5px solid ${C.outline}` }}>{n}</span>
      <p className="text-[14px] leading-relaxed pt-0.5 flex-1" style={{ color: C.text2 }}>{children}</p>
      {icon && <span className="shrink-0 pt-0.5" style={{ color: C.text3 }}>{icon}</span>}
    </div>
  );
}

// `inline`: tablet's Settings pane wants this to replace its own content
// instead of covering the whole screen — see TabletSettingsTab, the only
// caller that passes it. Phone always omits it.
export default function InstallGuide({ onClose, inline = false }) {
  const { C, cardWhite } = useContext(Tk);
  const { t } = useI18n();
  const [canPrompt, setCanPrompt] = useState(installAvailable());
  const installed = isStandalone();

  useEffect(() => onInstallChange(() => setCanPrompt(installAvailable())), []);

  // Each step's numbered badge + accompanying icon already carry the visual
  // emphasis the old inline-bold spans did, so the sentence itself can be
  // one plain translated string per step instead of English fragments
  // stitched around a hardcoded bold term.
  const steps = installed ? null : IS_IOS ? (
    <>
      <Step C={C} n="1" icon={<Share className="h-5 w-5" />}>{t('install.iosStep1')}</Step>
      <Step C={C} n="2" icon={<Plus className="h-5 w-5" />}>{t('install.iosStep2')}</Step>
      <Step C={C} n="3">{t('install.iosStep3')}</Step>
    </>
  ) : (
    <>
      <Step C={C} n="1" icon={<MoreVertical className="h-5 w-5" />}>{t('install.androidStep1')}</Step>
      <Step C={C} n="2" icon={<Download className="h-5 w-5" />}>{t('install.androidStep2')}</Step>
      <Step C={C} n="3">{t('install.androidStep3')}</Step>
    </>
  );

  const content = (
    <div className={inline ? 'remote-root h-full flex flex-col' : 'remote-root remote-sheet-in fixed inset-0 z-[9999] flex flex-col'}
      style={inline ? { background: C.bg, fontFamily: C.font } : {
        '--rc-outline': C.outline, '--rc-champagne': C.champagne,
        '--rc-container': C.container, '--rc-bg-white': C.bgWhite,
        background: C.bg, fontFamily: C.font, paddingTop: 'env(safe-area-inset-top)',
      }}>
      {/* Tablet's TabletSettingsTab already wraps this whole sheet in its own
          BackHeader (t('install.title'), same close handler) — rendering this
          header too meant the title and a working back button both
          appeared twice, stacked. Phone has no such wrapper. */}
      {!inline && (
        <div className="flex items-center gap-3 px-5 pt-4 pb-4 shrink-0"
          style={{ background: C.bg, borderBottom: `0.5px solid ${C.outline}` }}>
          <button onClick={onClose} aria-label="Back"
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
            <ChevronLeft className="h-5 w-5" style={{ color: C.text3 }} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: C.champagne, fontFamily: C.fontLabel }}>Resonance</p>
            <p className="text-[20px] font-medium truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('install.title')}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* app icon + pitch */}
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          <img src="/apple-touch-icon.png" alt="" width={84} height={84}
            className="rounded-[22px]" style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }} />
          <p className="text-[14px] leading-relaxed max-w-xs" style={{ color: C.text4 }}>
            {t('install.pitch')}
          </p>
        </div>

        {installed ? (
          <div className="rounded-2xl p-5 flex flex-col items-center text-center gap-2" style={cardWhite}>
            <span className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: `${C.champagne}1e`, border: `0.5px solid ${C.champagne}55` }}>
              <Check className="h-6 w-6" style={{ color: C.champagne }} />
            </span>
            <p className="text-[16px] font-medium" style={{ color: C.text1 }}>{t('install.alreadyInstalled')}</p>
            <p className="text-[13px]" style={{ color: C.text4 }}>{t('install.alreadyInstalledSub')}</p>
          </div>
        ) : (
          <>
            {canPrompt && (
              <button onClick={promptInstall}
                className="w-full py-4 rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.font, boxShadow: `0 6px 20px ${C.champagne}40` }}>
                <Download className="h-5 w-5" /> {t('install.installButton')}
              </button>
            )}
            <div className="rounded-2xl p-5 flex flex-col gap-4" style={cardWhite}>
              {canPrompt && (
                <p className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('install.orManually')}</p>
              )}
              {steps}
            </div>
            {IS_IOS && (
              <p className="text-[12px] text-center px-2" style={{ color: C.text3 }}>
                {t('install.iosOnly')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );

  return inline ? content : createPortal(content, document.body);
}
