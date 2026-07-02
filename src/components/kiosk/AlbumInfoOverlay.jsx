import { useContext, useEffect, useState } from 'react';
import { X, Disc3, Building2, Globe, Tag, BarChart3, Users } from 'lucide-react';
import { Kk } from './KioskContext';
import { S } from '../../styles/stone';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { primaryArtist } from '../../lib/format';

// <img> that falls through a list of candidate sources on load failure — Cover
// Art Archive URLs are guessed from an MBID and 404 for releases with no cover
// uploaded, even when a working thumbnail exists from another provider.
function SmartImg({ srcs = [], alt = '', className, style, ...rest }) {
  const list = srcs.filter(Boolean);
  const [i, setI] = useState(0);
  if (!list.length || i >= list.length) return null;
  return <img src={list[i]} alt={alt} className={className} style={style}
    onError={() => setI((n) => n + 1)} {...rest} />;
}

function Credit({ icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderBottom: `0.5px solid ${S.border}` }}>
      {icon}
      <span className="text-[11px] font-light uppercase tracking-[0.18em] w-20 shrink-0" style={{ color: S.label }}>{label}</span>
      <span className="text-[13px] font-medium flex-1 text-right truncate" style={{ color: S.strong }}>{value}</span>
    </div>
  );
}

export default function AlbumInfoOverlay() {
  const {
    isAlbumInfoOpen, setIsAlbumInfoOpen,
    albumInfoArtist: artist, albumInfoAlbum: album, albumInfoImage,
  } = useContext(Kk);
  const { lang, t } = useI18n();

  // Keyed result so we never call setState synchronously inside the effect.
  const [res, setRes] = useState({ album: null, data: null, error: false });

  useEffect(() => {
    if (!isAlbumInfoOpen || !album) return;
    let alive = true;
    // Look up by the lead artist only — "Seether, Amy Lee" (Spotify's joined
    // feat.-artist credit) matches nothing in MusicBrainz/Last.fm/TheAudioDB,
    // even though "Seether" alone is well documented.
    api.getAlbumMetadata(primaryArtist(artist), album, lang)
      .then((d) => { if (alive) setRes({ album, data: d, error: false }); })
      .catch(() => { if (alive) setRes({ album, data: null, error: true }); });
    return () => { alive = false; };
  }, [isAlbumInfoOpen, album, artist, lang]);

  const ready = res.album === album;
  const loading = isAlbumInfoOpen && !ready;
  const d = ready ? res.data : null;
  const error = ready ? res.error : false;
  const cover = d?.coverArt || d?.albumImage || albumInfoImage;
  // Wide artist fanart/banner reads far better as a hero background than a
  // blurred-up square cover — matches the remote's AlbumInfoSheet hero.
  const heroBg = d?.artistFanart || d?.artistBanner || cover;
  const fmtNum = (n) => n ? Number(n).toLocaleString() : null;
  const fmtDur = (s) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';

  return (
    <div
      className={`absolute inset-0 rounded-3xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
        isAlbumInfoOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}
    >
      {/* header */}
      <div className="flex items-center justify-between pb-3 mb-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
        <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
          {t('meta.albumCredits')}
        </span>
        <button onClick={() => setIsAlbumInfoOpen(false)}
          className="cursor-pointer w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
          style={{ background: S.accent, color: S.accentFg }} aria-label={t('common.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* body: left identity, right editorial */}
      <div className="flex-grow flex flex-row gap-5 min-h-0">
        {/* left — album cover as a blurred hero background, dark scrim for text contrast */}
        <div className="relative w-[34%] flex flex-row gap-4 shrink-0 rounded-2xl p-4 overflow-hidden"
          style={{ border: `1px solid ${S.border}` }}>
          {heroBg && (
            // Plain opacity only — no CSS `filter` here. The kiosk's Chromium runs
            // software-rendered (QEMU, no GPU passthrough); `filter` on a full-bleed
            // absolutely-positioned image reliably renders as a blank layer on that
            // stack, same as the remote's AlbumInfoSheet hero (opacity-only, no filter).
            <SmartImg srcs={[d?.artistFanart, d?.artistBanner, cover]} alt="" aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.6 }} />
          )}
          <div className="absolute inset-0"
            style={{ background: heroBg ? 'rgba(20,18,16,0.30)' : S.surface }} />

          <div className="relative z-10 w-[120px] h-[120px] rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
            style={{ background: S.surfaceLo, border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
            {cover
              ? <SmartImg srcs={[d?.coverArt, d?.albumImage, albumInfoImage]} alt="" className="w-full h-full object-cover" />
              : <Disc3 className="w-8 h-8" style={{ color: S.label }} />}
          </div>
          <div className="relative z-10 min-w-0 flex flex-col">
            <h3 className="text-base font-bold leading-tight truncate" style={{ color: '#f5f3ef', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{d?.title || album}</h3>
            <p className="text-sm font-light truncate" style={{ color: 'rgba(245,243,239,0.8)', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{artist}</p>
            {d?.releaseDate && <p className="text-xs mt-0.5" style={{ color: 'rgba(245,243,239,0.6)' }}>{String(d.releaseDate).slice(0, 4)}</p>}
            {d?.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 overflow-hidden">
                {d.genres.slice(0, 4).map((g) => (
                  <span key={g} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(245,243,239,0.85)', border: '1px solid rgba(255,255,255,0.2)' }}>{g}</span>
                ))}
              </div>
            )}
            {(d?.style || d?.mood) && (
              <p className="text-[11px] mt-auto pt-2" style={{ color: 'rgba(245,243,239,0.55)' }}>
                {[d.style, d.mood].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* right */}
        <div className="flex-grow rounded-2xl p-4 overflow-y-auto stone-scrollbar" style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          {loading && (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <Disc3 className="w-7 h-7 animate-spin" style={{ color: S.accent, animationDuration: '2.4s' }} />
              <p className="text-sm font-light" style={{ color: S.muted }}>{t('meta.gatheringKiosk')}</p>
            </div>
          )}
          {error && !loading && (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm font-light" style={{ color: S.muted }}>{t('meta.couldNotLoad')}</p>
            </div>
          )}
          {d && !loading && (
            <div className="flex flex-row gap-5">
              {/* editorial */}
              <div className="flex-grow min-w-0 space-y-3">
                {d.biography && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: S.strong }}>{t('meta.artist')}</p>
                    <p className="text-[13px] font-light leading-relaxed" style={{ color: S.text }}>{d.biography}</p>
                  </div>
                )}
                {d.review && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: S.strong }}>{t('meta.aboutAlbum')}</p>
                    <p className="text-[13px] font-light leading-relaxed" style={{ color: S.text }}>{d.review}</p>
                  </div>
                )}
                {d.similar?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5" style={{ color: S.strong }}>
                      <Users className="w-3 h-3" /> {t('meta.similarArtists')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.similar.map((s) => (
                        <span key={s} className="text-[12px] px-2.5 py-1 rounded-full" style={{ background: S.surfaceLo, color: S.muted, border: `1px solid ${S.border}` }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {d.tracks?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: S.strong }}>
                      {t('meta.tracklist')} · {d.tracks.length}
                    </p>
                    <div className="space-y-0">
                      {d.tracks.map((tr, i) => (
                        <div key={i} className="flex items-center gap-2 py-1" style={{ borderBottom: `0.5px solid ${S.border}` }}>
                          <span className="text-[10px] w-4 text-right tabular-nums shrink-0" style={{ color: S.label }}>{i + 1}</span>
                          <span className="flex-1 text-[12px] truncate" style={{ color: S.text }}>{tr.name}</span>
                          {tr.duration ? <span className="text-[10px] tabular-nums shrink-0" style={{ color: S.label }}>{fmtDur(tr.duration)}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!d.biography && !d.review && !d.tracks?.length && (
                  <p className="text-sm font-bold" style={{ color: S.muted }}>{t('meta.noEditorial')}</p>
                )}
                {d.sources?.length > 0 && (
                  <p className="text-[11px] font-bold pt-1" style={{ color: S.strong }}>{t('meta.poweredBy', { sources: d.sources.join(' · ') })}</p>
                )}
              </div>

              {/* credits column */}
              <div className="w-[230px] shrink-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: S.strong }}>{t('meta.release')}</p>
                <Credit icon={<Tag className="w-3.5 h-3.5" style={{ color: S.label }} />} label={t('meta.type')} value={d.albumType} />
                <Credit icon={<Disc3 className="w-3.5 h-3.5" style={{ color: S.label }} />} label={t('meta.format')} value={d.format} />
                <Credit icon={<Building2 className="w-3.5 h-3.5" style={{ color: S.label }} />} label={t('meta.label')} value={d.label} />
                <Credit icon={<Globe className="w-3.5 h-3.5" style={{ color: S.label }} />} label={t('meta.country')} value={d.country} />
                <Credit icon={<Disc3 className="w-3.5 h-3.5" style={{ color: S.label }} />} label={t('library.tracks')} value={d.trackCount} />
                <Credit icon={<BarChart3 className="w-3.5 h-3.5" style={{ color: S.label }} />} label={t('meta.listeners')} value={fmtNum(d.listeners)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
