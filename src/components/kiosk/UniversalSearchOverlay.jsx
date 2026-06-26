import React, { useContext, useState, useEffect, useRef } from 'react';
import { Search, X, Disc3, Music2, Radio, Heart } from 'lucide-react';
import { Kk } from './KioskContext';
import { S } from '../../styles/stone';
import { api } from '../../api';
import { toast } from '../../lib/toast';

const SOURCE_COLORS = {
  spotify: '#1ed760',
  local:   '#f59e0b',
  radio:   '#3b82f6',
  tidal:   '#0078ff',
  qobuz:   '#a855f7',
};
const SOURCE_LABELS = {
  spotify: 'Spotify',
  local:   'Local',
  radio:   'Radio',
  tidal:   'Tidal',
  qobuz:   'Qobuz',
};
const PILLS = ['all', 'spotify', 'local', 'tidal', 'qobuz', 'radio'];

function ResultCard({ result }) {
  const { title, artist, image, source, onPlay, isRadio, isFav, onToggleFav } = result;
  const color = SOURCE_COLORS[source];

  return (
    <div className="shrink-0 flex flex-col rounded-xl overflow-hidden"
      style={{ width: 128, background: S.surface, border: `1px solid ${S.border}` }}>
      <button onClick={onPlay} className="relative active:opacity-70 transition-opacity shrink-0"
        style={{ height: 88, overflow: 'hidden' }}>
        {image
          ? <img src={image} alt="" className="w-full h-full object-cover"
              onError={e => { e.target.style.display = 'none'; }} />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: S.border }}>
              {isRadio
                ? <Radio className="h-6 w-6" style={{ color: S.muted }} />
                : <Music2 className="h-6 w-6" style={{ color: S.muted }} />}
            </div>}
        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
          style={{ background: color + '33', color, backdropFilter: 'blur(4px)' }}>
          {SOURCE_LABELS[source]}
        </span>
      </button>
      <div className="flex items-center px-2 py-1.5 flex-1 min-h-0">
        <button onClick={onPlay} className="flex-1 min-w-0 text-left active:opacity-70">
          <p className="text-[11px] font-medium truncate" style={{ color: S.text }}>{title || 'Unknown'}</p>
          {artist && <p className="text-[10px] truncate" style={{ color: S.muted }}>{artist}</p>}
        </button>
        {isRadio && (
          <button onClick={e => { e.stopPropagation(); onToggleFav(); }}
            className="w-5 h-5 flex items-center justify-center shrink-0 ml-1 active:scale-90 transition-transform">
            <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-current' : ''}`}
              style={{ color: isFav ? '#f59e0b' : S.muted }} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function UniversalSearchOverlay() {
  const {
    token,
    handlePlayTrack,
    handleToggleSource,
    setIsSearchOpen,
    favoriteStations,
    handleToggleFavoriteRadio,
  } = useContext(Kk);

  const [query, setQuery]           = useState('');
  const [activeFilter, setFilter]   = useState('all');
  const [results, setResults]       = useState({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] });
  const [loading, setLoading]       = useState(false);
  const debounceRef                 = useRef(null);
  const inputRef                    = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = async (q) => {
    if (!q.trim()) { setResults({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] }); setLoading(false); return; }
    setLoading(true);
    const [spotifyR, localR, radioR, tidalR, qobuzR] = await Promise.allSettled([
      token ? api.searchAll(token, q, 'track', 8).then(d => d.tracks?.items || []) : Promise.resolve([]),
      api.searchLibrary(q, 8),
      fetch(`/api/player/radio-search?q=${encodeURIComponent(q)}&limit=6`).then(r => r.json()),
      api.tidalSearch(q),
      api.qobuzSearch(q),
    ]);
    setResults({
      spotify: (spotifyR.value || []).slice(0, 8),
      local:   (localR.value  || []).slice(0, 8),
      radio:   (Array.isArray(radioR.value) ? radioR.value : []).slice(0, 6),
      tidal:   (tidalR.value  || []).slice(0, 6),
      qobuz:   (qobuzR.value  || []).slice(0, 6),
    });
    setLoading(false);
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 380);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const playLocal = async (file) => {
    try { await api.clearQueue(); await api.addToQueue(file, true); handleToggleSource('local'); setIsSearchOpen(false); }
    catch (e) { toast.error(e.message); }
  };

  const playRadio = async (station) => {
    try { await api.localPlayRadio(station.url_resolved || station.url, station.name, station.favicon); handleToggleSource('radio'); setIsSearchOpen(false); }
    catch (e) { toast.error(e.message); }
  };

  const playTidal = async (track) => {
    try { await api.tidalPlayTrack(track); setIsSearchOpen(false); } catch (e) { toast.error(e.message); }
  };

  const playQobuz = async (track) => {
    try { await api.qobuzPlayTrack(track); setIsSearchOpen(false); } catch (e) { toast.error(e.message); }
  };

  const flatResults = [
    ...results.spotify.map(t => ({
      source: 'spotify', title: t.name, artist: t.artists?.[0]?.name,
      image: t.album?.images?.[2]?.url || t.album?.images?.[0]?.url,
      onPlay: () => { handlePlayTrack(t.uri); setIsSearchOpen(false); },
    })),
    ...results.local.map(t => ({
      source: 'local', title: t.title || t.file?.split('/').pop(), artist: t.artist,
      image: null, onPlay: () => playLocal(t.file),
    })),
    ...results.tidal.map(t => ({
      source: 'tidal', title: t.title, artist: t.artist, image: t.cover,
      onPlay: () => playTidal(t),
    })),
    ...results.qobuz.map(t => ({
      source: 'qobuz', title: t.title, artist: t.artist, image: t.cover,
      onPlay: () => playQobuz(t),
    })),
    ...results.radio.map(s => ({
      source: 'radio', title: s.name, artist: s.country, image: s.favicon,
      isRadio: true, station: s,
      isFav: favoriteStations?.some(f => f.url === (s.url_resolved || s.url)),
      onPlay: () => playRadio(s),
      onToggleFav: () => handleToggleFavoriteRadio(s),
    })),
  ].filter(r => activeFilter === 'all' || r.source === activeFilter);

  // Sources that actually returned results
  const activeSources = Object.entries(results).filter(([, v]) => v.length > 0).map(([k]) => k);

  // If the selected filter has no results, fall back to 'all'
  useEffect(() => {
    if (activeFilter !== 'all' && !activeSources.includes(activeFilter)) setFilter('all');
  }, [results]);

  return (
    <div className="absolute inset-0 rounded-3xl z-50 flex flex-col overflow-hidden"
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}>

      {/* Search bar + close */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1.5 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: S.muted }} />
          <input
            ref={inputRef}
            type="search" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tracks, artists, albums and radio…"
            autoComplete="off" autoCapitalize="none" spellCheck={false}
            className="w-full rounded-xl pl-8 pr-8 py-1.5 text-[13px] focus:outline-none"
            style={{ background: S.surface, color: S.text, border: `1px solid ${S.border}`, fontFamily: 'inherit' }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full"
              style={{ background: S.border }}>
              <X className="h-3 w-3" style={{ color: S.muted }} />
            </button>
          )}
        </div>
        <button onClick={() => setIsSearchOpen(false)}
          className="px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest cursor-pointer active:scale-95 transition-all shrink-0"
          style={{ background: S.accent, color: S.accentFg }}>
          Close
        </button>
      </div>

      {/* Source filter pills — only show sources with results */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 shrink-0">
        {activeSources.length > 0 && (
          <button key="all" onClick={() => setFilter('all')}
            className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider cursor-pointer active:scale-95 transition-all shrink-0"
            style={activeFilter === 'all'
              ? { background: S.accent, color: S.accentFg }
              : { background: S.surface, color: S.muted, border: `1px solid ${S.border}` }}>
            All
          </button>
        )}
        {PILLS.filter(p => p !== 'all' && activeSources.includes(p)).map(p => (
          <button key={p} onClick={() => setFilter(p)}
            className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider cursor-pointer active:scale-95 transition-all shrink-0"
            style={activeFilter === p
              ? { background: S.accent, color: S.accentFg }
              : { background: S.surface, color: S.muted, border: `1px solid ${S.border}` }}>
            {SOURCE_LABELS[p]}
          </button>
        ))}
        {loading && (
          <Disc3 className="h-3.5 w-3.5 animate-spin ml-1 shrink-0" style={{ color: S.accent, animationDuration: '1.6s' }} />
        )}
      </div>

      {/* Results — horizontal scroll */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!query.trim() ? (
          <div className="flex items-center justify-center h-full gap-2">
            <Search className="h-5 w-5" style={{ color: S.label }} />
            <span className="text-[12px]" style={{ color: S.muted }}>
              Search across Spotify, local library, Tidal, Qobuz and radio — all at once
            </span>
          </div>
        ) : !flatResults.length && !loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px]" style={{ color: S.muted }}>No results for "{query}"</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 h-full px-3 pb-3 overflow-x-auto overflow-y-hidden"
            style={{ scrollbarWidth: 'none' }}>
            {flatResults.map((r, i) => (
              <ResultCard key={`${r.source}-${i}`} result={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
