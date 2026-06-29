import React, { useContext, useState, useEffect, useRef } from 'react';
import { Search, X, Disc3, Music2, Radio, Waves, Heart } from 'lucide-react';
import { Tk } from './shared';
import { api } from '../../api';
import { reportError } from '../../lib/errors';
import { useI18n } from '../../i18n';

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

export default function UniversalSearch() {
  const { t } = useI18n();
  const {
    C, token, spotify,
    handlePlayTrack, handleLibraryPlayTrack, handleToggleSource, setActiveTab,
    favoriteStations, handleToggleFavRadio, wakeKiosk,
  } = useContext(Tk);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ spotify: [], local: [], tidal: [], qobuz: [], radio: [] });
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const doSearch = async (q) => {
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
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
              <Search className="h-7 w-7" style={{ color: C.text3 }} />
            </div>
            <div>
              <p className="text-[16px] font-semibold mb-1" style={{ color: C.text1 }}>{t('search.universal')}</p>
              <p className="text-[13px] leading-relaxed" style={{ color: C.text3 }}>
                {t('search.universalDesc')}
              </p>
            </div>
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
