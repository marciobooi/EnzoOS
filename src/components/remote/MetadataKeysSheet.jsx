import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, KeyRound, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Tk } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';
import { reportError } from '../../lib/errors';
import { useI18n } from '../../i18n';

export default function MetadataKeysSheet({ onClose }) {
  const { C, card } = useContext(Tk);
  const { t } = useI18n();

  const FIELDS = [
    {
      id: 'lastfm', label: t('meta.lastfmLabel'), hint: t('meta.lastfmHint'),
      link: 'https://www.last.fm/api/account/create', linkLabel: t('meta.lastfmLink'),
    },
    {
      id: 'theaudiodb', label: t('meta.audiodbLabel'), hint: t('meta.audiodbHint'),
      link: 'https://www.theaudiodb.com/api_guide.php', linkLabel: t('meta.audiodbLink'),
    },
    {
      id: 'discogs', label: t('meta.discogsLabel'), hint: t('meta.discogsHint'),
      link: 'https://www.discogs.com/settings/developers', linkLabel: t('meta.discogsLink'),
    },
  ];
  const [vals, setVals] = useState({ lastfm: '', theaudiodb: '', discogs: '' });
  const [show, setShow] = useState({ lastfm: false, theaudiodb: false, discogs: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getMetadataKeys()
      .then((k) => { if (alive) setVals({ lastfm: k.lastfm || '', theaudiodb: k.theaudiodb || '', discogs: k.discogs || '' }); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.setMetadataKeys(vals);
      toast.success(t('meta.saved'));
      onClose();
    } catch {
      reportError(t('meta.saveError'));
    } finally { setSaving(false); }
  };

  const inputStyle = { ...card, color: C.text1 };

  return createPortal(
    <div className="remote-root remote-sheet-in fixed inset-0 z-[9999] flex flex-col"
      style={{
        '--rc-outline': C.outline, '--rc-champagne': C.champagne,
        '--rc-container': C.container, '--rc-bg-white': C.bgWhite,
        background: C.bg, fontFamily: C.font, paddingTop: 'env(safe-area-inset-top)',
      }}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-4 shrink-0"
        style={{ background: C.bg, borderBottom: `0.5px solid ${C.outline}` }}>
        <button onClick={onClose} aria-label="Back"
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          <ChevronLeft className="h-5 w-5" style={{ color: C.text3 }} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('meta.albumInfo')}</p>
          <p className="text-[20px] font-medium truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('meta.keysTitle')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          <KeyRound className="h-5 w-5 shrink-0 mt-0.5" style={{ color: C.champagne }} />
          <p className="text-[13px] leading-relaxed" style={{ color: C.text4 }}>
            {t('meta.intro')}
          </p>
        </div>

        {FIELDS.map((f) => (
          <div key={f.id}>
            <label className="text-[14px] font-medium" style={{ color: C.text1 }}>{f.label}</label>
            <p className="text-[12px] mt-0.5 mb-2" style={{ color: C.text3 }}>{f.hint}</p>
            <div className="relative">
              <input
                type={show[f.id] ? 'text' : 'password'} value={vals[f.id]} disabled={loading}
                onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))}
                placeholder={loading ? t('meta.loading') : t('meta.pasteKey')}
                autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
                className="w-full rounded-xl pl-4 pr-12 py-3 text-[15px] focus:outline-none" style={inputStyle} />
              <button type="button" onClick={() => setShow((s) => ({ ...s, [f.id]: !s[f.id] }))}
                aria-label={show[f.id] ? t('meta.hideKey') : t('meta.showKey')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer">
                {show[f.id]
                  ? <EyeOff className="h-4 w-4" style={{ color: C.text3 }} />
                  : <Eye className="h-4 w-4" style={{ color: C.text3 }} />}
              </button>
            </div>
            <a href={f.link} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] mt-2 active:opacity-60"
              style={{ color: C.champagne }}>
              {f.linkLabel} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ))}

        <button onClick={save} disabled={saving || loading}
          className="w-full py-3.5 rounded-full text-[15px] font-semibold active:scale-95 transition-all cursor-pointer mt-1"
          style={{ background: C.champagne, color: '#1a1c1c', opacity: saving || loading ? 0.6 : 1, fontFamily: C.font }}>
          {saving ? t('meta.saving') : t('meta.saveKeys')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
