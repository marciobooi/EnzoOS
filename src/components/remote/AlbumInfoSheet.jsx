import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Disc3, Users, Tag, Building2, Globe, BarChart3 } from 'lucide-react';
import { Tk } from './shared';
import { api } from '../../api';

// Small labelled credit row.
function Credit({ C, icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-widest w-20 shrink-0"
        style={{ color: C.text3, fontFamily: C.fontLabel }}>{label}</span>
      <span className="text-[14px] flex-1 text-right truncate" style={{ color: C.text1 }}>{value}</span>
    </div>
  );
}

export default function AlbumInfoSheet({ artist, album, albumImage, onClose }) {
  const { C, card, cardWhite } = useContext(Tk);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    api.getAlbumMetadata(artist, album)
      .then((d) => { if (alive) setState({ loading: false, error: null, data: d }); })
      .catch(() => { if (alive) setState({ loading: false, error: 'Could not load album info.', data: null }); });
    return () => { alive = false; };
  }, [artist, album]);

  const d = state.data;
  const cover = d?.albumImage || albumImage;
  const fmtNum = (n) => n ? Number(n).toLocaleString() : null;

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
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>Album Info</p>
          <p className="text-[20px] font-medium truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{album}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* hero */}
        <div className="flex gap-4 items-center">
          <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center" style={cardWhite}>
            {cover
              ? <img src={cover} alt="" className="w-full h-full object-cover" />
              : <Disc3 className="h-8 w-8" style={{ color: C.text4 }} />}
          </div>
          <div className="min-w-0">
            <p className="text-[18px] font-semibold truncate" style={{ color: C.text1 }}>{artist}</p>
            <p className="text-[14px] truncate" style={{ color: C.text4 }}>{d?.title || album}</p>
            {d?.releaseDate && (
              <p className="text-[12px] mt-1" style={{ color: C.text3 }}>{String(d.releaseDate).slice(0, 4)}</p>
            )}
          </div>
        </div>

        {state.loading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Disc3 className="h-8 w-8 animate-spin" style={{ color: C.champagne, animationDuration: '2.4s' }} />
            <p className="text-[13px]" style={{ color: C.text3 }}>Gathering credits & biography…</p>
          </div>
        )}

        {state.error && !state.loading && (
          <p className="text-[14px] text-center py-8" style={{ color: C.text4 }}>{state.error}</p>
        )}

        {d && !state.loading && (
          <>
            {/* genres / tags */}
            {d.genres?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {d.genres.map((g) => (
                  <span key={g} className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                    style={{ background: `${C.champagne}18`, color: C.champagne, border: `0.5px solid ${C.champagne}35`, fontFamily: C.fontLabel }}>{g}</span>
                ))}
              </div>
            )}

            {/* biography */}
            {d.biography && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>Artist</p>
                <p className="text-[14px] leading-relaxed" style={{ color: C.text2 }}>{d.biography}</p>
              </div>
            )}

            {/* album review */}
            {d.review && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>About this album</p>
                <p className="text-[14px] leading-relaxed" style={{ color: C.text2 }}>{d.review}</p>
              </div>
            )}

            {/* credits */}
            {(d.label || d.country || d.catalog || d.trackCount || d.listeners) && (
              <div className="rounded-xl px-4 py-1" style={cardWhite}>
                <Credit C={C} icon={<Building2 className="h-4 w-4" style={{ color: C.text4 }} />} label="Label" value={d.label} />
                <Credit C={C} icon={<Tag className="h-4 w-4" style={{ color: C.text4 }} />} label="Catalog" value={d.catalog} />
                <Credit C={C} icon={<Globe className="h-4 w-4" style={{ color: C.text4 }} />} label="Country" value={d.country} />
                <Credit C={C} icon={<Disc3 className="h-4 w-4" style={{ color: C.text4 }} />} label="Tracks" value={d.trackCount} />
                <Credit C={C} icon={<BarChart3 className="h-4 w-4" style={{ color: C.text4 }} />} label="Listeners" value={fmtNum(d.listeners)} />
              </div>
            )}

            {/* similar artists */}
            {d.similar?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>
                  <Users className="h-3.5 w-3.5" /> Similar Artists
                </p>
                <div className="flex flex-wrap gap-2">
                  {d.similar.map((s) => (
                    <span key={s} className="text-[12px] px-3 py-1.5 rounded-full" style={{ ...card, color: C.text2 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {!d.biography && !d.review && !d.label && !d.genres?.length && (
              <p className="text-[14px] text-center py-6" style={{ color: C.text4 }}>
                No extended info found for this album.
              </p>
            )}

            {/* attribution */}
            {d.sources?.length > 0 && (
              <p className="text-[11px] text-center pt-2 pb-1" style={{ color: C.text3 }}>
                Powered by {d.sources.join(' · ')}
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
