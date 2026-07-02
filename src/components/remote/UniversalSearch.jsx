import React, { useContext, useState, useEffect, useRef } from 'react';
import { Search, X, Disc3, Music2, Radio, Waves, Heart, ListMusic } from 'lucide-react';
import { Tk } from './shared';
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
  return (
    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
      style={{ borderTop: divider ? `0.5px solid ${C.outline}` : 'none' }}>
      {station.favicon
        ? <img src={station.favicon} alt="" className="w-10 h-10 rounded-lg shrink-0 object-cover" onError={e => { e.target.style.display = 'none'; }} />
        : <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center" style={{ background: C.container }}>
            <Radio className="h-4 w-4" style={{ color: C.text4 }} />
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
  const { title, subtitle, image, color, label, onPlay } = item;
  return (
    <button onClick={onPlay}
      className="shrink-0 flex flex-col rounded-2xl overflow-hidden active:opacity-60 transition-opacity text-left"
      style={{ width: 112, background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
      <div className="relative shrink-0" style={{ height: 76 }}>
        {image
          ? <img src={image} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
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
    handlePlayTrack, handlePlayContext, handleLibraryPlayTrack, handleToggleSource, setActiveTab,
    favoriteStations, handleToggleFavRadio, wakeKiosk,
  } = useContext(Tk);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] });
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState({ spotify: [], local: [] });
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
      api.tidalSearch(q),
      api.qobuzSearch(q),
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

  // Combined "your playlists" row — same set the kiosk shows: Spotify library
  // playlists, saved local MPD playlists, favorited radio stations.
  const myPlaylists = [
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

            {/* Explore by genre — shortcuts that just type into the search box above */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                style={{ color: C.text3, fontFamily: C.fontLabel }}>{t('library.exploreAll')}</p>
              <div className="grid grid-cols-2 gap-2.5">
                {GENRES.map(g => (
                  <button key={g.id}
                    onClick={() => setQuery(g.label)}
                    className="relative rounded-2xl overflow-hidden h-[68px] flex items-end p-3 active:scale-95 transition-all cursor-pointer text-left"
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
    </div>
  );
}
