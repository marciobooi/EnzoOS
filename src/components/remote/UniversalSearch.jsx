import { useContext, useState, useEffect, useRef } from 'react';
import { Search, X, Disc3, Music2, Radio, Waves, Heart, ListMusic, Pencil, Plus } from 'lucide-react';
import { Tk, Sheet, Row } from './shared';
import { api } from '../../api';
import { reportError } from '../../lib/errors';
import { useI18n } from '../../i18n';

const GENRES = [
  { id: 'jazz',        label: 'Jazz',               bg: '#0e1a24', accent: '#d4a843' },
  { id: 'classical',   label: 'Classical',           bg: '#1a0e2a', accent: '#c084fc' },
  { id: 'hi-res',      label: 'Hi-Res',              bg: '#0e2214', accent: '#4ade80' },
  { id: 'audiophile',  label: 'Audiophile',          bg: '#2a0e0e', accent: '#f87171' },
  { id: 'acoustic',    label: 'Acoustic',            bg: '#1e1a0a', accent: '#facc15' },
  { id: 'ambient',     label: 'Ambient',             bg: '#0a0e2a', accent: '#60a5fa' },
];

// Radio stations with no favicon (or a broken one — seen live from
// radio-browser.info/Bauer Radio data returning malformed image URLs) get
// their initials on a dark gradient instead of a generic icon/empty tile.
const STATION_GRADIENT = 'linear-gradient(135deg, #121317, #323B42)';
const stationInitials = (name) =>
  (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '??';

function Section({ C, label, icon, children }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 px-1 mb-0.5">
        <span style={{ color: C.champagne }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>{label}</span>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
        {children}
      </div>
    </div>
  );
}

function TrackRow({ C, title, artist, image, onPlay, divider }) {
  return (
    <button onClick={onPlay}
      className="w-full flex items-center gap-3 px-4 py-3 active:opacity-60 transition-opacity text-left cursor-pointer"
      style={{ borderTop: divider ? `0.5px solid ${C.outline}` : 'none' }}>
      {image
        ? <img src={image} alt="" className="w-10 h-10 rounded-lg shrink-0 object-cover" />
        : <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center" style={{ background: C.container }}>
            <Music2 className="h-4 w-4" style={{ color: C.text4 }} />
          </div>}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium truncate" style={{ color: C.text1 }}>{title || 'Unknown'}</p>
        {artist && <p className="text-[12px] truncate" style={{ color: C.text3 }}>{artist}</p>}
      </div>
    </button>
  );
}

function StationRow({ C, station, onPlay, isFav, onToggleFav, divider }) {
  const name = station.name?.length > 30 ? station.name.slice(0, 28) + '…' : station.name;
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
      style={{ borderTop: divider ? `0.5px solid ${C.outline}` : 'none' }}>
      {station.favicon && !imgFailed
        ? <img src={station.favicon} alt="" className="w-10 h-10 rounded-lg shrink-0 object-cover" onError={() => setImgFailed(true)} />
        : <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center" style={{ background: STATION_GRADIENT }}>
            <span className="font-extrabold tracking-tighter text-[11px]" style={{ color: '#fff' }}>
              {stationInitials(station.name)}
            </span>
          </div>}
      <button onClick={onPlay} className="flex-1 min-w-0 text-left active:opacity-60 transition-opacity">
        <p className="text-[14px] font-medium truncate" style={{ color: C.text1 }}>{name}</p>
        {station.country && <p className="text-[12px] truncate" style={{ color: C.text3 }}>{station.country}</p>}
      </button>
      <button onClick={onToggleFav} className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full active:scale-90 transition-all">
        <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} style={{ color: isFav ? C.champagne : C.text4 }} />
      </button>
    </div>
  );
}

function PlaylistCard({ C, item }) {
  const { title, subtitle, image, color, label, onPlay, heart } = item;
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button onClick={onPlay}
      className="shrink-0 flex flex-col rounded-2xl overflow-hidden active:opacity-60 transition-opacity text-left"
      style={{ width: 112, background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
      <div className="relative shrink-0" style={{ height: 76 }}>
        {heart
          ? <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #450af5, #c4efd9)' }}>
              <Heart className="h-6 w-6 fill-current" style={{ color: '#fff' }} />
            </div>
          : image && !imgFailed
          ? <img src={image} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
          : label === 'Radio'
          ? <div className="w-full h-full flex items-center justify-center" style={{ background: STATION_GRADIENT }}>
              <span className="font-extrabold tracking-tighter text-sm" style={{ color: '#fff' }}>
                {stationInitials(title)}
              </span>
            </div>
          : <div className="w-full h-full flex items-center justify-center" style={{ background: C.container }}>
              <ListMusic className="h-5 w-5" style={{ color: C.text4 }} />
            </div>}
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase"
          style={{ background: color + '33', color, backdropFilter: 'blur(4px)' }}>{label}</span>
      </div>
      <div className="px-2 py-1.5 min-w-0">
        <p className="text-[11px] font-medium truncate" style={{ color: C.text1 }}>{title}</p>
        {subtitle && <p className="text-[10px] truncate" style={{ color: C.text3 }}>{subtitle}</p>}
      </div>
    </button>
  );
}

export default function UniversalSearch() {
  const { t } = useI18n();
  const {
    C, token, spotify,
    handlePlayTrack, handlePlayContext, handleToggleSource, setActiveTab,
    favoriteStations, handleToggleFavRadio, wakeKiosk,
  } = useContext(Tk);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] });
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState({ spotify: [], local: [] });
  // Radio directory (empty state): trending stations + genre tag chips,
  // backed by /api/player/radio-browse + /radio-tags (server-cached 5 min).
  const [radioTags, setRadioTags] = useState([]);
  const [radioDir, setRadioDir] = useState({ tag: null, stations: [], loading: true });
  const radioDirIdRef = useRef(0);
  // Quick-access presets — hardware-style numbered slots (1–6)
  const [presets, setPresets] = useState(Array(6).fill(null));
  const [presetsEdit, setPresetsEdit] = useState(false);
  const [assignSlot, setAssignSlot] = useState(null); // 1-based slot being assigned
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  // Staleness guard: doSearch is async (Promise.allSettled across 5 sources),
  // so an older query's results can resolve after a newer one's. Only the
  // request that's still the latest when it resolves is allowed to setResults.
  const searchIdRef = useRef(0);

  // Playlists row is independent of the query — Spotify library playlists,
  // saved local MPD playlists, favorited radio stations — shown as soon as
  // Search opens, same set the kiosk's unified search already surfaces.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      spotify && token ? api.getUserPlaylists(token, 20) : Promise.resolve(null),
      api.getPlaylists(),
    ]).then(([spotifyR, localR]) => {
      if (!alive) return;
      setPlaylists({
        spotify: spotifyR.value?.items || [],
        local:   localR.value?.playlists || [],
      });
    });
    return () => { alive = false; };
  }, [token, spotify]);

  const loadRadioDir = async (tag) => {
    const id = ++radioDirIdRef.current;
    setRadioDir(d => ({ ...d, tag, loading: true }));
    try {
      const qs = tag ? `by=tag&tag=${encodeURIComponent(tag)}` : 'by=trending';
      const r = await fetch(`/api/player/radio-browse?${qs}&limit=8`);
      const stations = await r.json();
      if (id !== radioDirIdRef.current) return; // superseded by a faster tap
      setRadioDir({ tag, stations: Array.isArray(stations) ? stations : [], loading: false });
    } catch {
      if (id === radioDirIdRef.current) setRadioDir({ tag, stations: [], loading: false });
    }
  };

  useEffect(() => {
    let alive = true;
    fetch('/api/player/radio-tags?limit=12')
      .then(r => r.json())
      .then(d => { if (alive && Array.isArray(d)) setRadioTags(d); })
      .catch(() => {});
    fetch('/api/player/presets')
      .then(r => r.json())
      .then(d => { if (alive && Array.isArray(d?.presets)) setPresets(d.presets); })
      .catch(() => {});
    loadRadioDir(null);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePreset = async (slot, item) => {
    try {
      const r = await fetch(`/api/player/presets/${slot}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item),
      });
      const d = await r.json();
      if (Array.isArray(d?.presets)) setPresets(d.presets);
    } catch (e) { reportError(e.message); }
    setAssignSlot(null);
  };

  const clearPreset = async (slot) => {
    try {
      const r = await fetch(`/api/player/presets/${slot}`, { method: 'DELETE' });
      const d = await r.json();
      if (Array.isArray(d?.presets)) setPresets(d.presets);
    } catch (e) { reportError(e.message); }
  };

  const playPreset = (p) => {
    if (!p) return;
    if (p.type === 'radio') return playRadio(p.payload);
    if (p.type === 'spotify') return handlePlayContext(p.payload.uri);
    if (p.type === 'localPlaylist') return playLocalPlaylist(p.payload.name);
    if (p.type === 'smart') return playSmartPlaylist(p.payload.kind);
  };

  // Only query Tidal/Qobuz when they're actually connected — searching fired
  // both on every debounced keystroke regardless, so an unlinked account
  // produced a request (and, before the server-side guard, a 502) per search.
  // Ref, not state: it only gates fetches inside doSearch, no re-render needed.
  const streamingAvailRef = useRef({ tidal: false, qobuz: false });
  useEffect(() => {
    Promise.allSettled([
      fetch('/api/player/tidal/status').then(r => r.json()),
      fetch('/api/player/qobuz/status').then(r => r.json()),
    ]).then(([t, q]) => {
      streamingAvailRef.current = {
        tidal: !!t.value?.connected,
        qobuz: !!q.value?.connected,
      };
    });
  }, []);

  const doSearch = async (q) => {
    const id = ++searchIdRef.current;
    if (!q.trim()) {
      setResults({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const [spotifyR, localR, radioR, tidalR, qobuzR] = await Promise.allSettled([
      spotify && token ? api.searchAll(token, q, 'track', 8).then(d => d.tracks?.items || []) : Promise.resolve([]),
      api.searchLibrary(q, 8),
      fetch(`/api/player/radio-search?q=${encodeURIComponent(q)}&limit=6`).then(r => r.json()),
      streamingAvailRef.current.tidal ? api.tidalSearch(q) : Promise.resolve([]),
      streamingAvailRef.current.qobuz ? api.qobuzSearch(q) : Promise.resolve([]),
    ]);
    if (id !== searchIdRef.current) return; // a newer search already superseded this one
    setResults({
      spotify: (spotifyR.value || []).slice(0, 8),
      local:   (localR.value || []).slice(0, 8),
      radio:   (Array.isArray(radioR.value) ? radioR.value : []).slice(0, 6),
      tidal:   (tidalR.value || []).slice(0, 6),
      qobuz:   (qobuzR.value || []).slice(0, 6),
    });
    setLoading(false);
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 380);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const hasResults = Object.values(results).some(a => a.length > 0);

  const playLocal = async (file) => {
    try { wakeKiosk(); await api.clearQueue(); await api.addToQueue(file, true); handleToggleSource('local'); setActiveTab('player'); }
    catch (e) { reportError(e.message); }
  };

  const playLocalPlaylist = async (name) => {
    try { wakeKiosk(); await api.playPlaylist(name); handleToggleSource('local'); setActiveTab('player'); }
    catch (e) { reportError(e.message); }
  };

  const playLikedSongs = async () => {
    try {
      const data = await api.getSavedTracks(token, 50);
      const uris = (data?.items || []).map(i => i.track?.uri).filter(Boolean);
      if (!uris.length) { reportError('Your Liked Songs is empty.'); return; }
      wakeKiosk();
      await api.play(token, null, null, uris);
      setActiveTab('player');
    } catch (e) { reportError(e.message); }
  };

  const playSmartPlaylist = async (kind) => {
    try {
      const { tracks } = kind === 'most-played' ? await api.getMostPlayed(50) : await api.getRecentlyAdded(50);
      if (!tracks?.length) { reportError('Nothing here yet — keep listening and this will fill in.'); return; }
      wakeKiosk();
      await api.clearQueue();
      await api.addManyToQueue(tracks.map(t => t.file), true);
      handleToggleSource('local');
      setActiveTab('player');
    } catch (e) { reportError(e.message); }
  };

  const playRadio = async (station) => {
    const url = station.url_resolved || station.url;
    try { await api.localPlayRadio(url, station.name, station.favicon); handleToggleSource('radio'); setActiveTab('player'); }
    catch (e) { reportError(e.message); }
  };

  const playTidal = async (track) => {
    try { await api.tidalPlayTrack(track); setActiveTab('player'); } catch (e) { reportError(e.message); }
  };

  const playQobuz = async (track) => {
    try { await api.qobuzPlayTrack(track); setActiveTab('player'); } catch (e) { reportError(e.message); }
  };

  // Everything a preset slot can point at — same universe as "your playlists"
  // but with typed payloads so the slot survives restarts on its own.
  const assignables = [
    { type: 'smart', title: 'Most Played', image: null, payload: { kind: 'most-played' }, sub: 'Local · auto' },
    { type: 'smart', title: 'Recently Added', image: null, payload: { kind: 'recently-added' }, sub: 'Local · auto' },
    ...playlists.spotify.map(pl => ({
      type: 'spotify', title: pl.name, image: pl.images?.[0]?.url, payload: { uri: pl.uri }, sub: 'Spotify',
    })),
    ...playlists.local.map(name => ({
      type: 'localPlaylist', title: name, image: null, payload: { name }, sub: 'Local playlist',
    })),
    ...(favoriteStations || []).map(s => ({
      type: 'radio', title: s.name, image: s.favicon,
      payload: { url: s.url_resolved || s.url, name: s.name, favicon: s.favicon }, sub: 'Radio',
    })),
  ];

  // Combined "your playlists" row — same set the kiosk shows: Spotify library
  // playlists, saved local MPD playlists, favorited radio stations.
  const myPlaylists = [
    {
      key: 'smart-most-played', title: 'Most Played', color: '#f59e0b', label: 'Local',
      subtitle: 'Auto-generated', image: null, onPlay: () => playSmartPlaylist('most-played'),
    },
    {
      key: 'smart-recently-added', title: 'Recently Added', color: '#f59e0b', label: 'Local',
      subtitle: 'Auto-generated', image: null, onPlay: () => playSmartPlaylist('recently-added'),
    },
    // "Liked Songs" is a library collection, not a real playlist — Spotify's
    // /me/playlists endpoint never includes it, so it's fetched via a
    // separate call (getSavedTracks) and played as an explicit URI list
    // rather than a context_uri (it has no ordinary spotify:playlist: URI).
    ...(spotify && token ? [{
      key: 'liked-songs', title: 'Liked Songs', color: '#1ed760', label: 'Spotify',
      subtitle: null, heart: true, onPlay: playLikedSongs,
    }] : []),
    ...playlists.spotify.map(pl => ({
      key: `sp-${pl.id}`, title: pl.name, color: '#1ed760', label: 'Spotify',
      subtitle: pl.tracks?.total ? `${pl.tracks.total} tracks` : null,
      image: pl.images?.[0]?.url,
      onPlay: () => handlePlayContext(pl.uri),
    })),
    ...playlists.local.map(name => ({
      key: `local-${name}`, title: name, color: '#f59e0b', label: 'Local', subtitle: null, image: null,
      onPlay: () => playLocalPlaylist(name),
    })),
    ...(favoriteStations || []).map(s => ({
      key: `radio-${s.url_resolved || s.url}`, title: s.name, color: '#3b82f6', label: 'Radio', subtitle: 'Favorite',
      image: s.favicon,
      onPlay: () => playRadio(s),
    })),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: C.text3 }} />
          <input
            ref={inputRef}
            type="search" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('search.allSourcesPlaceholder')}
            autoComplete="off" autoCapitalize="none" spellCheck={false}
            className="w-full rounded-2xl pl-10 pr-10 py-3.5 text-[15px] focus:outline-none"
            style={{ background: C.containerLow, color: C.text1, border: `0.5px solid ${C.outline}`, fontFamily: C.font }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full active:scale-90"
              style={{ background: C.container }}>
              <X className="h-3.5 w-3.5" style={{ color: C.text3 }} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!query.trim() ? (
          <div className="flex flex-col gap-5">
            {/* Quick-access presets — hardware-style slots, one-tap recall */}
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                    {t('presets.title')}
                  </span>
                </div>
                <button onClick={() => setPresetsEdit(e => !e)} aria-label="Edit presets"
                  className="w-7 h-7 flex items-center justify-center rounded-full active:scale-90 transition-all cursor-pointer"
                  style={{ background: presetsEdit ? C.champagne : C.containerLow, border: `0.5px solid ${C.outline}` }}>
                  <Pencil className="h-3 w-3" style={{ color: presetsEdit ? '#1a1c1c' : C.text3 }} />
                </button>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {presets.map((p, i) => {
                  const slot = i + 1;
                  const onTap = () => {
                    if (presetsEdit) { if (p) clearPreset(slot); else setAssignSlot(slot); return; }
                    if (p) playPreset(p); else setAssignSlot(slot);
                  };
                  return (
                    <button key={slot} onClick={onTap}
                      className="relative aspect-square rounded-xl overflow-hidden flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer"
                      style={{ background: C.containerLow, border: `0.5px solid ${p ? C.champagne + '66' : C.outline}` }}>
                      {p?.image
                        ? <img src={p.image} alt="" className="absolute inset-0 w-full h-full object-cover"
                            style={{ opacity: presetsEdit ? 0.3 : 0.85 }} onError={e => { e.target.style.display = 'none'; }} />
                        : null}
                      {p && !presetsEdit && (
                        <span className="absolute inset-x-0 bottom-0 px-0.5 pb-0.5 text-[7px] font-semibold truncate text-center"
                          style={{ color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', textShadow: '0 1px 2px #000' }}>
                          {p.title}
                        </span>
                      )}
                      <span className="relative text-[15px] font-bold tabular-nums"
                        style={{ color: p ? C.champagne : C.text4, textShadow: p?.image ? '0 1px 4px rgba(0,0,0,0.8)' : 'none' }}>
                        {presetsEdit && p ? <X className="h-4 w-4" style={{ color: C.error }} /> : p ? slot : <Plus className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Your Playlists — Spotify, local, favorited radio, always visible */}
            <div>
              <div className="flex items-center gap-1.5 px-1 mb-2">
                <ListMusic className="h-3.5 w-3.5" style={{ color: C.champagne }} />
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                  {t('library.myMusic')}
                </span>
              </div>
              {myPlaylists.length ? (
                <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {myPlaylists.map(p => <PlaylistCard key={p.key} C={C} item={p} />)}
                </div>
              ) : (
                <p className="text-[13px] px-1" style={{ color: C.text4 }}>{t('library.noFavorites')}</p>
              )}
            </div>

            {/* Radio directory — trending stations + genre chips (radio-browser.info) */}
            <div>
              <div className="flex items-center gap-1.5 px-1 mb-2">
                <Radio className="h-3.5 w-3.5" style={{ color: C.champagne }} />
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                  {radioDir.tag ? `${t('search.radioStations')} · ${radioDir.tag}` : t('radioDir.trendingNow')}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                <button onClick={() => loadRadioDir(null)}
                  className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition-all cursor-pointer"
                  style={!radioDir.tag
                    ? { background: C.champagne, color: '#1a1c1c' }
                    : { background: C.containerLow, color: C.text3, border: `0.5px solid ${C.outline}` }}>
                  {t('radioDir.trending')}
                </button>
                {radioTags.map(tag => (
                  <button key={tag.name} onClick={() => loadRadioDir(tag.name)}
                    className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold capitalize active:scale-95 transition-all cursor-pointer"
                    style={radioDir.tag === tag.name
                      ? { background: C.champagne, color: '#1a1c1c' }
                      : { background: C.containerLow, color: C.text3, border: `0.5px solid ${C.outline}` }}>
                    {tag.name}
                  </button>
                ))}
              </div>
              {radioDir.loading ? (
                <div className="flex items-center justify-center py-6">
                  <Disc3 className="h-5 w-5 animate-spin" style={{ color: C.champagne, animationDuration: '2.4s' }} />
                </div>
              ) : radioDir.stations.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                  {radioDir.stations.map((s, i) => (
                    <StationRow key={s.stationuuid || i} C={C} divider={i > 0} station={s}
                      isFav={favoriteStations?.some(f => f.url === (s.url_resolved || s.url))}
                      onToggleFav={() => handleToggleFavRadio(s)}
                      onPlay={() => playRadio(s)} />
                  ))}
                </div>
              )}
            </div>

            {/* Explore by genre — shortcuts that just type into the search box above */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.exploreAll')}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3">
                {GENRES.map(g => (
                  <button key={g.id}
                    onClick={() => setQuery(g.label)}
                    className="relative rounded-2xl overflow-hidden h-[68px] md:h-24 flex items-end p-3 active:scale-95 transition-all cursor-pointer text-left"
                    style={{ background: g.bg, border: `0.5px solid ${g.accent}20` }}>
                    <div className="absolute inset-0"
                      style={{ background: `linear-gradient(135deg, ${g.bg} 30%, ${g.accent}25 100%)` }} />
                    <span className="relative text-[14px] font-semibold"
                      style={{ color: '#fff', fontFamily: C.font, textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                      {g.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[12px] text-center px-4" style={{ color: C.text4 }}>{t('search.universalDesc')}</p>
          </div>
        ) : loading && !hasResults ? (
          <div className="flex items-center justify-center py-12">
            <Disc3 className="h-7 w-7 animate-spin" style={{ color: C.champagne, animationDuration: '2.4s' }} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {results.spotify.length > 0 && (
              <Section C={C} label="Spotify" icon={<Waves className="h-3.5 w-3.5" />}>
                {results.spotify.map((t, i) => (
                  <TrackRow key={i} C={C} divider={i > 0}
                    title={t.name} artist={t.artists?.[0]?.name}
                    image={t.album?.images?.[2]?.url || t.album?.images?.[0]?.url}
                    onPlay={() => { handlePlayTrack(t.uri); setActiveTab('player'); }} />
                ))}
              </Section>
            )}

            {results.local.length > 0 && (
              <Section C={C} label={t('library.localLibrary')} icon={<Music2 className="h-3.5 w-3.5" />}>
                {results.local.map((t, i) => (
                  <TrackRow key={i} C={C} divider={i > 0}
                    title={t.title || t.file?.split('/').pop()} artist={t.artist}
                    onPlay={() => playLocal(t.file)} />
                ))}
              </Section>
            )}

            {results.tidal.length > 0 && (
              <Section C={C} label="Tidal" icon={<Music2 className="h-3.5 w-3.5" />}>
                {results.tidal.map((t, i) => (
                  <TrackRow key={i} C={C} divider={i > 0}
                    title={t.title} artist={t.artist} image={t.cover}
                    onPlay={() => playTidal(t)} />
                ))}
              </Section>
            )}

            {results.qobuz.length > 0 && (
              <Section C={C} label="Qobuz" icon={<Music2 className="h-3.5 w-3.5" />}>
                {results.qobuz.map((t, i) => (
                  <TrackRow key={i} C={C} divider={i > 0}
                    title={t.title} artist={t.artist} image={t.cover}
                    onPlay={() => playQobuz(t)} />
                ))}
              </Section>
            )}

            {results.radio.length > 0 && (
              <Section C={C} label={t('search.radioStations')} icon={<Radio className="h-3.5 w-3.5" />}>
                {results.radio.map((s, i) => (
                  <StationRow key={i} C={C} divider={i > 0} station={s}
                    isFav={favoriteStations?.some(f => f.url === (s.url_resolved || s.url))}
                    onToggleFav={() => handleToggleFavRadio(s)}
                    onPlay={() => playRadio(s)} />
                ))}
              </Section>
            )}

            {query.trim() && !hasResults && !loading && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-[15px] font-medium" style={{ color: C.text1 }}>{t('search.noResults')}</p>
                <p className="text-[13px]" style={{ color: C.text3 }}>{t('search.nothingFound', { q: query })}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preset assignment sheet */}
      {assignSlot && (
        <Sheet C={C} kicker={t('presets.title')} title={t('presets.assign', { n: assignSlot })}
          onBack={() => setAssignSlot(null)} padded={false}>
          {assignables.length === 0 ? (
            <p className="text-[14px] px-5 py-6 text-center" style={{ color: C.text3 }}>{t('presets.nothingToPin')}</p>
          ) : (
            assignables.map((a, i) => (
              <Row key={`${a.type}-${a.title}-${i}`} label={a.title} sub={a.sub} chevron={false}
                icon={a.image
                  ? <img src={a.image} alt="" className="w-8 h-8 rounded-xl object-cover" onError={e => { e.target.style.display = 'none'; }} />
                  : (a.type === 'radio' ? <Radio className="h-4 w-4" style={{ color: C.text3 }} /> : <ListMusic className="h-4 w-4" style={{ color: C.text3 }} />)}
                onPress={() => savePreset(assignSlot, { type: a.type, title: a.title, image: a.image, payload: a.payload })} />
            ))
          )}
        </Sheet>
      )}
    </div>
  );
}
