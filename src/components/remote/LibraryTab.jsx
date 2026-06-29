import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  Search, X, ChevronLeft, ChevronRight, RefreshCw,
  User, Disc2, Music, Library, Play, Loader, Clock, Heart, Trash2, Tag,
} from 'lucide-react';
import { Tk, SpotifyIcon } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';
import SkeletonList from '../ui/SkeletonList';
import { useI18n } from '../../i18n';

const GENRES = [
  { id: 'jazz',        label: 'Jazz',               bg: '#0e1a24', accent: '#d4a843' },
  { id: 'classical',   label: 'Classical',           bg: '#1a0e2a', accent: '#c084fc' },
  { id: 'hi-res',      label: 'Hi-Res',              bg: '#0e2214', accent: '#4ade80' },
  { id: 'audiophile',  label: 'Audiophile',          bg: '#2a0e0e', accent: '#f87171' },
  { id: 'acoustic',    label: 'Acoustic',            bg: '#1e1a0a', accent: '#facc15' },
  { id: 'ambient',     label: 'Ambient',             bg: '#0a0e2a', accent: '#60a5fa' },
];

const RECENT_KEY = 'resonance_recent_searches';
const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const saveRecent = arr => localStorage.setItem(RECENT_KEY, JSON.stringify(arr));

const SOURCE_COLORS = { spotify: '#1ed760', local: '#f59e0b', radio: '#3b82f6', tidal: '#0078ff', qobuz: '#a855f7' };

export default function LibraryTab() {
  const { t } = useI18n();
  const {
    C, card, cardWhite, btn,
    libraryView, selectedArtist, selectedAlbum, libraryItems, libraryLoading,
    spotify, token,
    handleLibraryBack, handleLibraryPlayTrack,
    fetchLibraryArtists, fetchLibraryAlbums, fetchLibraryTracks,
    setSelectedArtist, setLibraryView, setSelectedAlbum,
    handlePlayTrack, handlePlayContext,
    favorites, handleToggleFavorite,
  } = useContext(Tk);

  const [libTab, setLibTab]         = useState('library'); // 'library' | 'history' | 'favorites'
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState(null);
  const [searching, setSearching]   = useState(false);
  const [recent, setRecent]         = useState(loadRecent);
  const [pendingUri, setPendingUri] = useState(null);
  const debounceRef                 = useRef(null);
  const isDeep                      = libraryView !== 'artists';

  const [history, setHistory]         = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (libTab === 'history') {
      setHistoryLoading(true);
      api.getHistory(50).then(setHistory).catch(() => {}).finally(() => setHistoryLoading(false));
    }
  }, [libTab]);

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    if (!token) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.searchAll(token, query, 'track,artist,album', 12);
        setResults(r);
      } catch { setResults(null); }
      finally { setSearching(false); }
    }, 380);
    return () => clearTimeout(debounceRef.current);
  }, [query, token]);

  const addRecent = item => {
    setRecent(prev => {
      const next = [item, ...prev.filter(r => r.id !== item.id)].slice(0, 8);
      saveRecent(next);
      return next;
    });
  };

  const removeRecent = id => {
    setRecent(prev => { const next = prev.filter(r => r.id !== id); saveRecent(next); return next; });
  };

  const clearRecent = () => { setRecent([]); localStorage.removeItem(RECENT_KEY); };

  const playTrack = async (uri, name, image) => {
    addRecent({ id: uri, name, type: 'track', image });
    setPendingUri(uri);
    try { await handlePlayTrack(uri); } finally { setPendingUri(null); }
  };

  const playContext = async (uri, name, image) => {
    addRecent({ id: uri, name, type: 'context', image });
    setPendingUri(uri);
    try { await handlePlayContext(uri); } finally { setPendingUri(null); }
  };

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

      {/* header */}
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

      {/* ── Library tab content ── */}
      {libTab === 'library' && (<>

      {/* ── Spotify search bar ── */}
      {spotify && token && (
        <div className="px-4 mb-5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
              style={{ color: C.text3 }} />
            <input
              type="text"
              placeholder={t('library.searchPlaceholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full rounded-2xl pl-10 pr-10 py-3.5 text-[15px] focus:outline-none"
              style={{ ...cardWhite, color: C.text1, fontFamily: C.font }} />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 active:scale-90 transition-all cursor-pointer">
                <X className="h-4 w-4" style={{ color: C.text3 }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Search results ── */}
      {query.trim() && spotify && token && (
        <div className="px-4 mb-4">
          {searching
            ? <div className="flex justify-center py-8">
                <Loader className="h-6 w-6 animate-spin" style={{ color: C.champagne }} />
              </div>
            : results && (
              <>
                {/* tracks */}
                {(results.tracks?.items?.length > 0) && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                      style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.tracks')}</p>
                    <div className="rounded-xl overflow-hidden mb-4" style={cardWhite}>
                      {results.tracks.items.slice(0, 6).map((t, idx) => (
                        <React.Fragment key={t.uri}>
                          {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />}
                          <button
                            className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60 transition-opacity cursor-pointer text-left"
                            disabled={pendingUri === t.uri}
                            onClick={() => playTrack(t.uri, t.name, t.album?.images?.[0]?.url)}>
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                              {t.album?.images?.[0]?.url
                                ? <img src={t.album.images[0].url} alt="" className="w-full h-full object-cover" />
                                : <Music className="h-4 w-4" style={{ color: C.text3 }} />}
                              {pendingUri === t.uri && (
                                <div className="absolute inset-0 flex items-center justify-center"
                                  style={{ background: 'rgba(0,0,0,0.55)' }}>
                                  <div className="w-4 h-4 rounded-full border-2 animate-spin"
                                    style={{ borderColor: 'transparent', borderTopColor: C.champagne }} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium truncate" style={{ color: C.text1 }}>{t.name}</p>
                              <p className="text-[12px] truncate" style={{ color: C.text3 }}>{t.artists?.map(a => a.name).join(', ')}</p>
                            </div>
                            <Play className="h-3.5 w-3.5 shrink-0" style={{ color: C.outline }} />
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                )}
                {/* artists */}
                {(results.artists?.items?.length > 0) && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                      style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.artists')}</p>
                    <div className="flex gap-3 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
                      {results.artists.items.slice(0, 8).map(a => (
                        <button key={a.id}
                          className="flex flex-col items-center gap-2 shrink-0 active:scale-95 transition-all cursor-pointer"
                          style={{ width: 72 }}
                          onClick={() => playContext(a.uri, a.name, a.images?.[0]?.url)}>
                          <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                            style={{ background: C.container, border: `0.5px solid ${C.outline}` }}>
                            {a.images?.[0]?.url
                              ? <img src={a.images[0].url} alt="" className="w-full h-full object-cover" />
                              : <User className="h-6 w-6" style={{ color: C.text3 }} />}
                          </div>
                          <span className="text-[10px] font-medium text-center truncate w-full"
                            style={{ color: C.text2, fontFamily: C.fontLabel }}>{a.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {/* albums */}
                {(results.albums?.items?.length > 0) && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                      style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.albums')}</p>
                    <div className="rounded-xl overflow-hidden mb-4" style={cardWhite}>
                      {results.albums.items.slice(0, 4).map((al, idx) => (
                        <React.Fragment key={al.id}>
                          {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />}
                          <button
                            className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60 transition-opacity cursor-pointer text-left"
                            onClick={() => playContext(al.uri, al.name, al.images?.[0]?.url)}>
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                              {al.images?.[0]?.url
                                ? <img src={al.images[0].url} alt="" className="w-full h-full object-cover" />
                                : <Disc2 className="h-4 w-4" style={{ color: C.text3 }} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium truncate" style={{ color: C.text1 }}>{al.name}</p>
                              <p className="text-[12px] truncate" style={{ color: C.text3 }}>{al.artists?.map(a => a.name).join(', ')}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.outline }} />
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                )}
              </>
            )
          }
        </div>
      )}

      {/* ── Browse (no query) ── */}
      {!query.trim() && (
        <>
          {/* recent searches */}
          {recent.length > 0 && spotify && token && (
            <div className="mb-5">
              <div className="flex items-center justify-between px-5 mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.recent')}</p>
                <button onClick={clearRecent}
                  className="text-[11px] font-semibold active:opacity-60 transition-opacity cursor-pointer"
                  style={{ color: C.champagne, fontFamily: C.fontLabel }}>{t('library.clear')}</button>
              </div>
              <div className="flex gap-4 px-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {recent.map(r => (
                  <div key={r.id} className="flex flex-col items-center gap-2 shrink-0" style={{ width: 64 }}>
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                        style={{ background: C.container, border: `0.5px solid ${C.outline}` }}>
                        {r.image
                          ? <img src={r.image} alt={r.name} className="w-full h-full object-cover" />
                          : <Music className="h-6 w-6" style={{ color: C.text3 }} />}
                      </div>
                      <button onClick={() => removeRecent(r.id)}
                        className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: C.container, border: `0.5px solid ${C.outline}` }}>
                        <X className="h-2.5 w-2.5" style={{ color: C.text3 }} />
                      </button>
                    </div>
                    <span className="text-[10px] font-medium text-center truncate w-full"
                      style={{ color: C.text2, fontFamily: C.fontLabel }}>{r.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* genre browse grid */}
          {spotify && token && (
            <div className="px-4 mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-3 px-1"
                style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.exploreAll')}</p>
              <div className="grid grid-cols-2 gap-3">
                {GENRES.map(g => (
                  <button key={g.id}
                    onClick={() => setQuery(g.label)}
                    className="relative rounded-2xl overflow-hidden h-[76px] flex items-end p-3 active:scale-95 transition-all cursor-pointer text-left"
                    style={{ background: g.bg, border: `0.5px solid ${g.accent}20` }}>
                    <div className="absolute inset-0"
                      style={{ background: `linear-gradient(135deg, ${g.bg} 30%, ${g.accent}25 100%)` }} />
                    <span className="relative text-[15px] font-semibold"
                      style={{ color: '#fff', fontFamily: C.font, textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                      {g.label}
                    </span>
                    <div className="absolute top-3 right-3 w-7 h-7 rounded-xl flex items-center justify-center"
                      style={{ background: `${g.accent}18`, border: `0.5px solid ${g.accent}35` }}>
                      <span style={{ color: g.accent, fontSize: 13, lineHeight: 1 }}>♪</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* local library */}
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
        </>
      )}
      </>)}
    </div>
  );
}
