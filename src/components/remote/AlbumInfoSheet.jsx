import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, Disc3, Users, Calendar, Star, Building2, Globe,
  MapPin, BarChart3, ExternalLink, Music2, ListMusic, Layers,
} from 'lucide-react';

const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
import { Tk } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';
import { useI18n } from '../../i18n';
import { primaryArtist } from '../../lib/format';

// <img> that falls through a list of candidate sources, hiding itself if all fail.
function SmartImg({ srcs = [], alt = '', className, style }) {
  const list = srcs.filter(Boolean);
  const [i, setI] = useState(0);
  if (!list.length || i >= list.length) return null;
  return <img src={list[i]} alt={alt} className={className} style={style}
    onError={() => setI((n) => n + 1)} draggable={false} />;
}

// One compact fact cell (label over value), rendered only when there's a value.
function Fact({ C, icon, label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
      <span style={{ color: C.champagne }}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>{label}</span>
        <span className="block text-[13px] font-medium truncate" style={{ color: C.text1 }}>{value}</span>
      </span>
    </div>
  );
}

function Chip({ C, children, accent }) {
  return (
    <span className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
      style={accent
        ? { background: `${C.champagne}18`, color: C.champagne, border: `0.5px solid ${C.champagne}35`, fontFamily: C.fontLabel }
        : { background: C.containerLow, color: C.text2, border: `0.5px solid ${C.outline}` }}>{children}</span>
  );
}

// `inline`: the tablet shell wants this to replace the main content pane in
// place (sidebar/rail stay visible/interactive around it) instead of
// covering the whole screen as a modal — see TabletPlayerHero, the only
// caller that passes it. Phone always omits it, so it always gets the
// original portaled full-screen sheet.
// `sampleFile`: a representative local track path for this album (library
// browsing passes one, now-playing callers omit it) — when present, its own
// embedded cover art (server/mpd-art.js) is tried FIRST, ahead of the
// external aggregator's art, since it's guaranteed to be the exact release
// actually in this library rather than whatever edition MusicBrainz/Last.fm
// happens to have art for.
export default function AlbumInfoSheet({ artist, album, albumImage, sampleFile, onClose, inline = false }) {
  const { C, cardWhite, darkMode } = useContext(Tk);
  const { lang, t } = useI18n();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    // Look up by the lead artist only — "Seether, Amy Lee" (Spotify's joined
    // feat.-artist credit) matches nothing in MusicBrainz/Last.fm/TheAudioDB,
    // even though "Seether" alone is well documented.
    api.getAlbumMetadata(primaryArtist(artist), album, lang)
      .then((d) => {
        if (!alive) return;
        setState({ loading: false, error: null, data: d });
        if (!d.lastfmConfigured && !d.biography && !d.review) {
          toast.success(t('meta.addKeyTip'), { duration: 5000 });
        }
      })
      .catch(() => { if (alive) setState({ loading: false, error: t('meta.couldNotLoad'), data: null }); });
    return () => { alive = false; };
  }, [artist, album, lang]);

  const d = state.data;
  const fmtNum = (n) => (n ? Number(n).toLocaleString() : null);
  const heroBg = d?.artistFanart || d?.artistBanner;

  const content = (
    <div className={inline ? 'remote-root relative h-full flex flex-col' : 'remote-root remote-sheet-in fixed inset-0 z-[9999] flex flex-col'}
      style={inline ? { background: C.bg, fontFamily: C.font } : {
        '--rc-outline': C.outline, '--rc-champagne': C.champagne,
        '--rc-container': C.container, '--rc-bg-white': C.bgWhite,
        background: C.bg, fontFamily: C.font, paddingTop: 'env(safe-area-inset-top)',
      }}>
      {/* floating back button (overlays the hero) */}
      <button onClick={onClose} aria-label={t('common.back')}
        className="absolute left-4 z-10 w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
        style={{ top: inline ? '16px' : 'calc(env(safe-area-inset-top) + 14px)', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
        <ChevronLeft className="h-5 w-5" style={{ color: '#fff' }} />
      </button>

      <div className="flex-1 overflow-y-auto">
        {/* ── hero ── */}
        <div className="relative" style={{ minHeight: 220 }}>
          {heroBg && (
            <SmartImg srcs={[heroBg]} className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: darkMode ? 0.5 : 0.6 }} />
          )}
          <div className="absolute inset-0" style={{
            background: `linear-gradient(180deg, ${heroBg ? 'rgba(0,0,0,0.25)' : 'transparent'} 0%, ${C.bg} 96%)`,
          }} />
          <div className="relative flex items-end gap-4 px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 72px)', paddingBottom: 16 }}>
            <div className="w-28 h-28 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center" style={cardWhite}>
              <SmartImg
                srcs={[sampleFile ? `/api/player/library/art?file=${encodeURIComponent(sampleFile)}` : null, d?.coverArt, d?.albumImage, albumImage]}
                alt="" className="w-full h-full object-cover" />
              {!sampleFile && !d?.coverArt && !d?.albumImage && !albumImage && <Disc3 className="h-9 w-9" style={{ color: C.text4 }} />}
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="text-[22px] font-semibold leading-tight truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{d?.title || album}</h2>
              <p className="text-[15px] truncate" style={{ color: C.text2 }}>{artist}</p>
              {(d?.releaseDate || d?.rating || d?.albumType) && (
                <div className="flex items-center flex-wrap gap-2 mt-1.5">
                  {d?.releaseDate && <Chip C={C} accent>{String(d.releaseDate).slice(0, 4)}</Chip>}
                  {d?.albumType && <Chip C={C}>{d.albumType}</Chip>}
                  {d?.rating > 0 && (
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: C.champagne }}>
                      <Star className="h-3.5 w-3.5 fill-current" /> {d.rating}/10
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 pb-8 flex flex-col gap-5">
          {state.loading && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Disc3 className="h-8 w-8 animate-spin" style={{ color: C.champagne, animationDuration: '2.4s' }} />
              <p className="text-[13px]" style={{ color: C.text3 }}>{t('meta.gatheringRemote')}</p>
            </div>
          )}
          {state.error && !state.loading && (
            <p className="text-[14px] text-center py-8" style={{ color: C.text4 }}>{state.error}</p>
          )}

          {d && !state.loading && (
            <>
              {/* genres */}
              {d.genres?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.genres.map((g) => <Chip key={g} C={C} accent>{g}</Chip>)}
                </div>
              )}

              {/* facts grid */}
              <div className="grid grid-cols-2 gap-2">
                <Fact C={C} icon={<Calendar className="h-4 w-4" />} label={t('meta.released')} value={d.releaseDate} />
                <Fact C={C} icon={<Disc3 className="h-4 w-4" />} label={t('meta.format')} value={d.format} />
                <Fact C={C} icon={<Layers className="h-4 w-4" />} label={t('meta.type')} value={d.albumType} />
                <Fact C={C} icon={<Building2 className="h-4 w-4" />} label={t('meta.label')} value={d.label} />
                <Fact C={C} icon={<Globe className="h-4 w-4" />} label={t('meta.country')} value={d.country} />
                <Fact C={C} icon={<Music2 className="h-4 w-4" />} label={t('library.tracks')} value={d.trackCount} />
                <Fact C={C} icon={<BarChart3 className="h-4 w-4" />} label={t('meta.listeners')} value={fmtNum(d.listeners)} />
                <Fact C={C} icon={<Calendar className="h-4 w-4" />} label={t('meta.originally')}
                  value={d.originalDate && d.originalDate !== d.releaseDate ? d.originalDate : null} />
              </div>

              {/* tracklist */}
              {d.tracks?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                    <ListMusic className="h-3.5 w-3.5" /> {t('meta.tracklist')} · {d.tracks.length}
                  </p>
                  <div className="rounded-2xl overflow-hidden" style={cardWhite}>
                    {d.tracks.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5"
                        style={{ borderTop: i > 0 ? `0.5px solid ${C.outline}` : 'none' }}>
                        <span className="text-[12px] w-5 text-right tabular-nums shrink-0" style={{ color: C.text3 }}>{i + 1}</span>
                        <span className="flex-1 text-[14px] truncate" style={{ color: C.text1 }}>{t.name}</span>
                        {t.duration ? <span className="text-[12px] tabular-nums shrink-0" style={{ color: C.text3, fontFamily: C.fontLabel }}>{fmtDur(t.duration)}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* band */}
              {(d.biography || d.artistImage || d.formedYear || d.origin || d.members) && (
                <div className="rounded-2xl p-4" style={cardWhite}>
                  <div className="flex items-center gap-3 mb-3">
                    {d.artistImage && (
                      <div className="w-14 h-14 rounded-full overflow-hidden shrink-0">
                        <SmartImg srcs={[d.artistImage]} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('meta.artist')}</p>
                      <p className="text-[17px] font-semibold truncate" style={{ color: C.text1 }}>{artist}</p>
                    </div>
                    {d.onTour && (
                      <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: `${C.champagne}18`, color: C.champagne, fontFamily: C.fontLabel }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.champagne }} /> {t('meta.onTour')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-2">
                    {/* Solo artists get "Born {year}" — formedYear used to be
                        polluted by the birth year server-side (fixed there);
                        show whichever fact actually applies. */}
                    {(d.isSolo && d.bornYear)
                      ? <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: C.text2 }}><Calendar className="h-3.5 w-3.5" style={{ color: C.text4 }} /> {t('meta.born', { year: d.bornYear })}</span>
                      : d.formedYear
                        ? <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: C.text2 }}><Calendar className="h-3.5 w-3.5" style={{ color: C.text4 }} /> {t('meta.formed', { year: d.formedYear })}</span>
                        : null}
                    {d.origin && <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: C.text2 }}><MapPin className="h-3.5 w-3.5" style={{ color: C.text4 }} /> {d.origin}</span>}
                    {d.members > 1 && <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: C.text2 }}><Users className="h-3.5 w-3.5" style={{ color: C.text4 }} /> {t('meta.members', { count: d.members })}</span>}
                  </div>
                  {/* Discography summary (MusicBrainz release-groups) */}
                  {d.discography && (d.discography.totalAlbums || d.discography.totalSinglesEPs) > 0 && (
                    <p className="text-[13px] mb-2" style={{ color: C.text3 }}>
                      {[
                        d.discography.totalAlbums ? t('meta.albums', { count: d.discography.totalAlbums }) : null,
                        d.discography.totalSinglesEPs ? t('meta.singlesEps', { count: d.discography.totalSinglesEPs }) : null,
                        d.discography.latestRelease ? t('meta.latest', { title: d.discography.latestRelease.title, year: String(d.discography.latestRelease.date || '').slice(0, 4) }) : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {d.biography && <p className="text-[14px] leading-relaxed" style={{ color: C.text2 }}>{d.biography}</p>}
                  {/* Listen / follow links — MusicBrainz URL-relations */}
                  {(d.website || d.streamingLinks || d.socials) && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {d.website && (
                        <a href={d.website.startsWith('http') ? d.website : `https://${d.website}`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-full active:opacity-60"
                          style={{ background: `${C.champagne}18`, color: C.champagne, border: `0.5px solid ${C.champagne}35` }}>
                          {t('meta.officialSite')} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {Object.entries({ ...(d.streamingLinks || {}), ...(d.socials || {}) }).map(([name, url]) => (
                        <a key={name} href={url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-full capitalize active:opacity-60"
                          style={{ background: C.containerLow, color: C.text2, border: `0.5px solid ${C.outline}` }}>
                          {name === 'appleMusic' ? 'Apple Music' : name} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                  {/* On tour → ticket search deep-links (no API key required) */}
                  {d.onTour && d.tour && (
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {[['Bandsintown', d.tour.bandsintownSearchUrl], ['Ticketmaster', d.tour.ticketmasterSearchUrl]].map(([name, url]) => url && (
                        <a key={name} href={url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-full active:opacity-60"
                          style={{ background: `${C.champagne}18`, color: C.champagne, border: `0.5px solid ${C.champagne}35` }}>
                          {t('meta.findTickets')} · {name} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* album review */}
              {d.review && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('meta.aboutAlbum')}</p>
                  <p className="text-[14px] leading-relaxed" style={{ color: C.text2 }}>{d.review}</p>
                </div>
              )}

              {/* similar artists — deep-linked to their Last.fm pages when available */}
              {(d.similarArtists?.length > 0 || d.similar?.length > 0) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                    <Users className="h-3.5 w-3.5" /> {t('meta.fansAlsoLike')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {d.similarArtists?.length > 0
                      ? d.similarArtists.map((s) => s.url
                          ? <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="active:opacity-60"><Chip C={C}>{s.name}</Chip></a>
                          : <Chip key={s.name} C={C}>{s.name}</Chip>)
                      : d.similar.map((s) => <Chip key={s} C={C}>{s}</Chip>)}
                  </div>
                </div>
              )}

              {!d.biography && !d.review && !d.label && !d.genres?.length && (
                <p className="text-[14px] text-center py-6" style={{ color: C.text4 }}>{t('meta.noInfo')}</p>
              )}

              {d.sources?.length > 0 && (
                <p className="text-[11px] text-center pt-2" style={{ color: C.text3 }}>{t('meta.poweredBy', { sources: d.sources.join(' · ') })}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return inline ? content : createPortal(content, document.body);
}
