import { useContext, useState, useEffect, useRef } from 'react';
import { Search, X, Disc3, Music2, Heart, ListMusic } from 'lucide-react';
import { Kk } from './KioskContext';
import { S } from '../../styles/stone';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

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

// Radio stations with no favicon (or a broken one — seen live from
// radio-browser.info/Bauer Radio data returning malformed image URLs) get
// their initials on a dark gradient instead of a generic icon/empty tile.
const STATION_GRADIENT = 'linear-gradient(135deg, #121317, #323B42)';
const stationInitials = (name) =>
  (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '??';

function ResultCard({ result }) {
  const { title, artist, image, source, onPlay, isRadio, isFav, onToggleFav } = result;
  const color = SOURCE_COLORS[source];
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="shrink-0 flex flex-col rounded-xl overflow-hidden"
      style={{ width: 128, background: S.surface, border: `1px solid ${S.border}` }}>
      <button onClick={onPlay} className="relative active:opacity-70 transition-opacity shrink-0"
        style={{ height: 88, overflow: 'hidden' }}>
        {image && !imgFailed
          ? <img src={image} alt="" className="w-full h-full object-cover"
              onError={() => setImgFailed(true)} />
          : isRadio
          ? <div className="w-full h-full flex items-center justify-center" style={{ background: STATION_GRADIENT }}>
              <span className="font-extrabold tracking-tighter text-lg" style={{ color: '#fff' }}>
                {stationInitials(title)}
              </span>
            </div>
          : <div className="w-full h-full flex items-center justify-center" style={{ background: S.border }}>
              <Music2 className="h-6 w-6" style={{ color: S.muted }} />
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

function PlaylistCard({ item }) {
  const { title, subtitle, image, source, onPlay, heart } = item;
  const color = SOURCE_COLORS[source];
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button onClick={onPlay}
      className="shrink-0 flex flex-col rounded-xl overflow-hidden active:opacity-70 transition-opacity text-left"
      style={{ width: 100, background: S.surface, border: `1px solid ${S.border}` }}>
      <div className="relative shrink-0" style={{ height: 68, overflow: 'hidden' }}>
        {heart
          ? <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #450af5, #c4efd9)' }}>
              <Heart className="h-6 w-6 fill-current" style={{ color: '#fff' }} />
            </div>
          : image && !imgFailed
          ? <img src={image} alt="" className="w-full h-full object-cover"
              onError={() => setImgFailed(true)} />
          : source === 'radio'
          ? <div className="w-full h-full flex items-center justify-center" style={{ background: STATION_GRADIENT }}>
              <span className="font-extrabold tracking-tighter text-base" style={{ color: '#fff' }}>
                {stationInitials(title)}
              </span>
            </div>
          : <div className="w-full h-full flex items-center justify-center" style={{ background: S.border }}>
              <ListMusic className="h-5 w-5" style={{ color: S.muted }} />
            </div>}
        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase"
          style={{ background: color + '33', color, backdropFilter: 'blur(4px)' }}>
          {SOURCE_LABELS[source]}
        </span>
      </div>
      <div className="px-1.5 py-1 min-w-0">
        <p className="text-[10px] font-medium truncate" style={{ color: S.text }}>{title}</p>
        {subtitle && <p className="text-[9px] truncate" style={{ color: S.muted }}>{subtitle}</p>}
      </div>
    </button>
  );
}

export default function UniversalSearchOverlay() {
  const {
    token,
    handlePlayTrack,
    handlePlayContext,
    handleToggleSource,
    setIsSearchOpen,
    favoriteStations,
    handleToggleFavoriteRadio,
  } = useContext(Kk);

  const [query, setQuery]           = useState('');
  const [activeFilter, setFilter]   = useState('all');
  const [results, setResults]       = useState({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] });
  const [loading, setLoading]       = useState(false);
  const [playlists, setPlaylists]         = useState({ spotify: [], local: [] });
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const debounceRef                 = useRef(null);
  const inputRef                    = useRef(null);
  // Staleness guard: doSearch is async (Promise.allSettled across 5 sources),
  // so an older query's results can resolve after a newer one's. Only the
  // request that's still the latest when it resolves is allowed to setResults.
  const searchIdRef                 = useRef(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Playlists row is independent of the search query — loaded once on open,
  // covering every source that has a notion of a "playlist" (Spotify library
  // playlists, saved local MPD playlists, favorited radio stations).
  useEffect(() => {
    let alive = true;
    setPlaylistsLoading(true);
    Promise.allSettled([
      token ? api.getUserPlaylists(token, 20) : Promise.resolve(null),
      api.getPlaylists(),
    ]).then(([spotifyR, localR]) => {
      if (!alive) return;
      setPlaylists({
        spotify: spotifyR.value?.items || [],
        local:   localR.value?.playlists || [],
      });
      setPlaylistsLoading(false);
    });
    return () => { alive = false; };
  }, [token]);

  const doSearch = async (q) => {
    const id = ++searchIdRef.current;
    if (!q.trim()) { setResults({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] }); setLoading(false); return; }
    setLoading(true);
    const [spotifyR, localR, radioR, tidalR, qobuzR] = await Promise.allSettled([
      token ? api.searchAll(token, q, 'track', 8).then(d => d.tracks?.items || []) : Promise.resolve([]),
      api.searchLibrary(q, 8),
      fetch(`/api/player/radio-search?q=${encodeURIComponent(q)}&limit=6`).then(r => r.json()),
      api.tidalSearch(q),
      api.qobuzSearch(q),
    ]);
    if (id !== searchIdRef.current) return; // a newer search already superseded this one
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
    catch (e) { reportError(e.message); }
  };

  const playLocalPlaylist = async (name) => {
    try { await api.playPlaylist(name); handleToggleSource('local'); setIsSearchOpen(false); }
    catch (e) { reportError(e.message); }
  };

  const playSmartPlaylist = async (kind) => {
    try {
      const { tracks } = kind === 'most-played' ? await api.getMostPlayed(50) : await api.getRecentlyAdded(50);
      if (!tracks?.length) { reportError('Nothing here yet — keep listening and this will fill in.'); return; }
      await api.clearQueue();
      await api.addManyToQueue(tracks.map(t => t.file), true);
      handleToggleSource('local');
      setIsSearchOpen(false);
    } catch (e) { reportError(e.message); }
  };

  const playLikedSongs = async () => {
    try {
      const data = await api.getSavedTracks(token, 50);
      const uris = (data?.items || []).map(i => i.track?.uri).filter(Boolean);
      if (!uris.length) { reportError('Your Liked Songs is empty.'); return; }
      await api.play(token, null, null, uris);
      setIsSearchOpen(false);
    } catch (e) { reportError(e.message); }
  };

  const playRadio = async (station) => {
    try { await api.localPlayRadio(station.url_resolved || station.url, station.name, station.favicon); handleToggleSource('radio'); setIsSearchOpen(false); }
    catch (e) { reportError(e.message); }
  };

  const playTidal = async (track) => {
    try { await api.tidalPlayTrack(track); setIsSearchOpen(false); } catch (e) { reportError(e.message); }
  };

  const playQobuz = async (track) => {
    try { await api.qobuzPlayTrack(track); setIsSearchOpen(false); } catch (e) { reportError(e.message); }
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

  // Combined "your playlists" row — Spotify library playlists, saved local
  // MPD playlists, and favorited radio stations, shown regardless of query.
  const myPlaylists = [
    {
      key: 'smart-most-played', source: 'local', title: 'Most Played', subtitle: 'Auto-generated',
      image: null, onPlay: () => playSmartPlaylist('most-played'),
    },
    {
      key: 'smart-recently-added', source: 'local', title: 'Recently Added', subtitle: 'Auto-generated',
      image: null, onPlay: () => playSmartPlaylist('recently-added'),
    },
    // "Liked Songs" is a library collection, not a real playlist — Spotify's
    // /me/playlists endpoint never includes it, so it's fetched via a
    // separate call (getSavedTracks) and played as an explicit URI list
    // rather than a context_uri (it has no ordinary spotify:playlist: URI).
    ...(token ? [{
      key: 'liked-songs', source: 'spotify', title: 'Liked Songs', subtitle: null,
      heart: true, onPlay: playLikedSongs,
    }] : []),
    ...playlists.spotify.map(pl => ({
      key: `sp-${pl.id}`, source: 'spotify', title: pl.name,
      subtitle: pl.tracks?.total ? `${pl.tracks.total} tracks` : null,
      image: pl.images?.[0]?.url,
      onPlay: () => handlePlayContext(pl.uri),
    })),
    ...playlists.local.map(name => ({
      key: `local-${name}`, source: 'local', title: name, subtitle: null, image: null,
      onPlay: () => playLocalPlaylist(name),
    })),
    ...(favoriteStations || []).map(s => ({
      key: `radio-${s.url_resolved || s.url}`, source: 'radio', title: s.name, subtitle: 'Favorite',
      image: s.favicon,
      onPlay: () => playRadio(s),
    })),
  ];

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

      {/* Playlists — always visible, independent of the search query */}
      <div className="shrink-0 px-3 pb-2" style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <ListMusic className="h-3 w-3" style={{ color: S.label }} />
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: S.label }}>
            Your Playlists
          </span>
        </div>
        {myPlaylists.length ? (
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden pb-1"
            style={{ scrollbarWidth: 'none' }}>
            {myPlaylists.map(p => <PlaylistCard key={p.key} item={p} />)}
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: S.muted }}>
            {playlistsLoading ? 'Loading playlists…' : 'No playlists yet'}
          </span>
        )}
      </div>

      {/* Search results — horizontal scroll, its own row below the playlists */}
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
