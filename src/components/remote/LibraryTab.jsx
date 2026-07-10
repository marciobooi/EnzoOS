import React, { useState, useEffect, useContext } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw,
  User, Disc2, Music, Library, Play, Clock, Heart,
} from 'lucide-react';
import { Tk } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';
import SkeletonList from '../ui/SkeletonList';
import { useI18n } from '../../i18n';

const SOURCE_COLORS = { spotify: '#1ed760', local: '#f59e0b', radio: '#3b82f6', tidal: '#0078ff', qobuz: '#a855f7' };

// `inline`: tablet passes this so its own larger page header (rendered by
// TabletShell, with a matching refresh action wired to the same context
// call) replaces this component's compact kicker+title row. Phone always
// omits it and keeps the row.
export default function LibraryTab({ inline = false }) {
  const { t } = useI18n();
  const {
    C, cardWhite, btn,
    libraryView, selectedArtist, selectedAlbum, libraryItems, libraryLoading,
    handleLibraryBack, handleLibraryPlayTrack,
    fetchLibraryArtists, fetchLibraryAlbums, fetchLibraryTracks,
    setSelectedArtist, setLibraryView, setSelectedAlbum,
    favorites, handleToggleFavorite,
  } = useContext(Tk);

  const [libTab, setLibTab] = useState('library'); // 'library' | 'history' | 'favorites'
  const isDeep               = libraryView !== 'artists';

  const [history, setHistory]         = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (libTab === 'history') {
      setHistoryLoading(true);
      api.getHistory(50).then(setHistory).catch(() => {}).finally(() => setHistoryLoading(false));
    }
  }, [libTab]);

  const separator = i => i > 0 && (
    <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
  );

  /* ── deep drill-down (albums / tracks) ─────────────────────── */
  if (isDeep) return (
    <div className="flex flex-col pt-5 pb-2">
      <div className="flex items-center gap-3 px-5 mb-4">
        <button onClick={handleLibraryBack}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
          style={btn}>
          <ChevronLeft className="h-5 w-5" style={{ color: C.text4 }} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5"
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>
            {libraryView === 'albums' ? 'Albums by' : 'Tracks on'}
          </p>
          <h2 className="text-[24px] font-medium truncate"
            style={{ color: C.text1, letterSpacing: '-0.01em' }}>
            {libraryView === 'albums' ? selectedArtist : selectedAlbum || 'Tracks'}
          </h2>
        </div>
      </div>
      <div className="px-4">
        {libraryLoading
          ? <SkeletonList count={6} />
          : (
            <div className="rounded-xl overflow-hidden" style={cardWhite}>
              {libraryItems.map((item, idx) => {
                const isTrack    = libraryView === 'tracks';
                const displayName = isTrack ? item.split('/').pop().replace(/\.[^.]+$/, '') : item;
                const IconEl     = libraryView === 'albums' ? Disc2 : Music;
                return (
                  <React.Fragment key={`${item}-${idx}`}>
                    {separator(idx)}
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-60 transition-opacity cursor-pointer text-left"
                      onClick={() => {
                        if (libraryView === 'albums') { setSelectedAlbum(item); setLibraryView('tracks'); fetchLibraryTracks(item, selectedArtist); }
                        else { handleLibraryPlayTrack(item); }
                      }}>
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                        <IconEl className="h-4 w-4" style={{ color: isTrack ? C.text4 : C.champagne }} />
                      </span>
                      <span className="flex-1 text-[15px] font-medium truncate" style={{ color: C.text1 }}>{displayName}</span>
                      {isTrack
                        ? <Play className="h-3.5 w-3.5 shrink-0" style={{ color: C.outline }} />
                        : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.outline }} />}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )
        }
      </div>
    </div>
  );

  /* ── top-level view ─────────────────────────────────────────── */
  return (
    <div className="flex flex-col pt-5 pb-2">

      {/* header — tablet renders its own larger version (TabletShell) with
          the same refresh action, so this compact row is phone-only. */}
      {!inline && (
        <div className="flex items-center gap-3 px-5 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5"
              style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('library.myMusic')}</p>
            <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('nav.library')}</h2>
          </div>
          <button onClick={fetchLibraryArtists}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
            style={btn}>
            <RefreshCw className={`h-4 w-4 ${libraryLoading ? 'animate-spin' : ''}`} style={{ color: C.champagne }} />
          </button>
        </div>
      )}

      {/* tab pills */}
      <div className="flex gap-2 px-5 mb-4">
        {[
          { id: 'library', label: t('nav.library'), Icon: Library },
          { id: 'history', label: t('library.history'), Icon: Clock },
          { id: 'favorites', label: t('library.favorites'), Icon: Heart },
        ].map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setLibTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold active:scale-95 transition-all cursor-pointer"
            style={libTab === id
              ? { background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }
              : { background: C.containerLow, color: C.text3, border: `0.5px solid ${C.outline}`, fontFamily: C.fontLabel }}>
            <Icon className="h-3 w-3" />{label}
          </button>
        ))}
      </div>

      {/* ── History view ── */}
      {libTab === 'history' && (
        <div className="px-4">
          {historyLoading
            ? <SkeletonList count={6} />
            : history.length === 0
              ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <Clock className="h-10 w-10" style={{ color: C.outline }} />
                  <p className="text-[15px]" style={{ color: C.text4 }}>{t('library.noHistory')}</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-2">
                    <button onClick={async () => { await api.clearHistory(); setHistory([]); toast.success(t('library.historyCleared')); }}
                      className="text-[11px] font-semibold active:opacity-60 cursor-pointer"
                      style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.clearAll')}</button>
                  </div>
                  <div className="rounded-xl overflow-hidden" style={cardWhite}>
                    {history.map((h, idx) => {
                      const color = SOURCE_COLORS[h.source] || C.text4;
                      return (
                        <React.Fragment key={h.id}>
                          {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />}
                          <div className="flex items-center gap-3 px-4 py-3">
                            {h.cover
                              ? <img src={h.cover} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                              : (
                                <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                  style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                                  <Music className="h-4 w-4" style={{ color: C.text4 }} />
                                </span>
                              )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium truncate" style={{ color: C.text1 }}>{h.title || 'Unknown'}</p>
                              <p className="text-[11px] truncate" style={{ color: C.text3 }}>{h.artist || h.source}</p>
                            </div>
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                              style={{ background: color + '22', color }}>{h.source}</span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </>
              )
          }
        </div>
      )}

      {/* ── Favorites view ── */}
      {libTab === 'favorites' && (
        <div className="px-4">
          {!favorites || favorites.length === 0
            ? (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <Heart className="h-10 w-10" style={{ color: C.outline }} />
                <p className="text-[15px]" style={{ color: C.text4 }}>{t('library.noFavorites')}</p>
                <p className="text-[13px]" style={{ color: C.text3 }}>{t('library.tapHeart')}</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={cardWhite}>
                {favorites.map((f, idx) => {
                  const color = SOURCE_COLORS[f.source] || C.text4;
                  return (
                    <React.Fragment key={f.id}>
                      {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {f.cover
                          ? <img src={f.cover} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          : (
                            <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                              <Music className="h-4 w-4" style={{ color: C.text4 }} />
                            </span>
                          )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: C.text1 }}>{f.title || 'Unknown'}</p>
                          <p className="text-[11px] truncate" style={{ color: C.text3 }}>{f.artist}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mr-1 shrink-0"
                          style={{ background: color + '22', color }}>{f.source}</span>
                        <button onClick={() => handleToggleFavorite({ source: f.source, uri: f.uri, title: f.title, artist: f.artist, cover: f.cover })}
                          className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 shrink-0"
                          style={{ color: '#f59e0b' }}>
                          <Heart className="h-4 w-4 fill-current" />
                        </button>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )
          }
        </div>
      )}

      {/* ── Library tab content — pure browse, no embedded search (that's the Search tab's job) ── */}
      {libTab === 'library' && (
        <div className="px-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3 px-1"
            style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.localLibrary')}</p>
          {libraryLoading
            ? <SkeletonList count={6} />
            : libraryItems.length === 0
              ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <Library className="h-10 w-10" style={{ color: C.outline }} />
                  <div>
                    <p className="text-[17px] font-medium mb-1" style={{ color: C.text1 }}>{t('library.noMusic')}</p>
                    <p className="text-[13px]" style={{ color: C.text4 }}>{t('library.addMusic')}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={cardWhite}>
                  {libraryItems.map((item, idx) => (
                    <React.Fragment key={`${item}-${idx}`}>
                      {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />}
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-60 transition-opacity cursor-pointer text-left"
                        onClick={() => { setSelectedArtist(item); setLibraryView('albums'); fetchLibraryAlbums(item); }}>
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                          <User className="h-4 w-4" style={{ color: C.champagne }} />
                        </span>
                        <span className="flex-1 text-[15px] font-medium truncate" style={{ color: C.text1 }}>{item}</span>
                        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.outline }} />
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )
          }
        </div>
      )}
    </div>
  );
}
