import { useContext, useState, useEffect, useRef } from 'react';
import { X, Mic2, Loader } from 'lucide-react';
import { Tk } from './shared';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { primaryArtist } from '../../lib/format';

function parseSynced(lrc) {
  if (!lrc) return null;
  const lines = [];
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const line of lrc.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const ms = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000 + parseInt(m[3].padEnd(3, '0'), 10);
    lines.push({ ms, text: m[4].trim() });
  }
  return lines.length ? lines : null;
}

// `inline`: the tablet shell wants this to replace the main content pane in
// place instead of sliding up as a bottom-sheet modal over it — see
// TabletPlayerHero, the only caller that passes it. Phone always omits it.
export default function LyricsSheet({ title, artist, album, duration, position, onClose, inline = false }) {
  const { C, cardWhite } = useContext(Tk);
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [plain, setPlain]     = useState(null);
  const [synced, setSynced]   = useState(null);
  const [error, setError]     = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const lineRefs = useRef([]);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    // LRCLIB matches by exact artist name — "Seether, Amy Lee" (Spotify's
    // joined feat.-artist credit) fails to match its "Seether" entry.
    api.getLyrics(title, primaryArtist(artist), album, Math.round(duration / 1000))
      .then(d => {
        if (cancelled) return;
        const parsed = parseSynced(d.synced);
        setSynced(parsed);
        setPlain(d.plain || null);
        if (!d.plain && !d.synced) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // album/duration are part of the LRCLIB query — the same title on a
    // different album (or a different edit length) must refetch.
  }, [title, artist, album, duration]);

  useEffect(() => {
    if (!synced) return;
    let idx = 0;
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].ms <= position) idx = i;
    }
    setActiveIdx(idx);
    lineRefs.current[idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [position, synced]);

  const sheet = (
    <div className="rounded-t-3xl overflow-hidden"
      style={inline
        ? { background: C.bg, height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 0 }
        : { ...cardWhite, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      onClick={e => e.stopPropagation()}>

        {!inline && (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-9 h-1 rounded-full" style={{ background: C.outline }} />
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Mic2 className="h-5 w-5" style={{ color: C.champagne }} />
            <span className="text-[17px] font-semibold" style={{ color: C.text1 }}>{t('lyrics.title')}</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
            <X className="h-4 w-4" style={{ color: C.text3 }} />
          </button>
        </div>

        <div className="px-5 mb-3 shrink-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: C.text1 }}>{title}</p>
          <p className="text-[12px] truncate" style={{ color: C.text3 }}>{artist}</p>
        </div>

        <div ref={containerRef} className="overflow-y-auto px-5 pb-10 flex-1">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader className="h-6 w-6 animate-spin" style={{ color: C.champagne }} />
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Mic2 className="h-8 w-8" style={{ color: C.outline }} />
              <p className="text-[14px]" style={{ color: C.text3 }}>{t('lyrics.notFound')}</p>
            </div>
          )}
          {!loading && !error && synced && (
            <div className="flex flex-col gap-1 py-4">
              {synced.map((line, i) => (
                <p key={i} ref={el => lineRefs.current[i] = el}
                  className="text-[16px] leading-relaxed transition-all duration-300"
                  style={{
                    color: i === activeIdx ? C.text1 : C.text4,
                    fontWeight: i === activeIdx ? '600' : '400',
                    opacity: i === activeIdx ? 1 : 0.5,
                    transform: i === activeIdx ? 'scale(1.02)' : 'scale(1)',
                    transformOrigin: 'left center',
                  }}>
                  {line.text || '·'}
                </p>
              ))}
            </div>
          )}
          {!loading && !error && !synced && plain && (
            <div className="py-4">
              {plain.split('\n').map((line, i) => (
                <p key={i} className="text-[15px] leading-relaxed"
                  style={{ color: line.trim() ? C.text2 : 'transparent', minHeight: 24 }}>
                  {line || '·'}
                </p>
              ))}
            </div>
          )}
        </div>
    </div>
  );

  if (inline) return sheet;

  return (
    <div className="fixed inset-0 z-[9998]" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
      <div className="absolute bottom-0 left-0 right-0" onClick={e => e.stopPropagation()}>
        {sheet}
      </div>
    </div>
  );
}
