import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Play, Loader, ChevronLeft, Clock, TrendingUp, ListMusic, Disc3, X } from 'lucide-react';
import { api } from '../api';
import { S, cardShadow } from '../styles/stone';

export default function TrackSearch({ token, onPlayTrack, onPlayContext, isDrawer = false }) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState(null);
  const [isLoading, setIsLoading]   = useState(false);

  const [view, setView]                   = useState('browse');
  const [playlists, setPlaylists]         = useState([]);
  const [recentTracks, setRecentTracks]   = useState([]);
  const [topTracks, setTopTracks]         = useState([]);
  const [drilldownTracks, setDrilldownTracks] = useState([]);
  const [drilldownTitle, setDrilldownTitle]   = useState('');
  const [drilldownImage, setDrilldownImage]   = useState('');
  const [drilldownUri, setDrilldownUri]       = useState('');
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    loadBrowseData();
  }, [token]);

  const loadBrowseData = async () => {
    if (!token) return;
    setIsBrowseLoading(true);
    try {
      const [playlistData, recentData, topData] = await Promise.allSettled([
        api.getUserPlaylists(token, 20),
        api.getRecentlyPlayed(token, 15),
        api.getUserTopTracks(token, 15, 'short_term'),
      ]);
      if (playlistData.status === 'fulfilled' && playlistData.value?.items)
        setPlaylists(playlistData.value.items);
      if (recentData.status === 'fulfilled' && recentData.value?.items) {
        const seen = new Set();
        setRecentTracks(
          recentData.value.items
            .filter(i => { if (seen.has(i.track?.uri)) return false; seen.add(i.track?.uri); return true; })
            .map(i => i.track)
        );
      }
      if (topData.status === 'fulfilled' && topData.value?.items)
        setTopTracks(topData.value.items);
    } catch (err) {
      console.error('[TrackSearch] browse load error:', err);
    } finally {
      setIsBrowseLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault?.();
    if (!query.trim()) { setView('browse'); setResults(null); return; }
    setIsLoading(true);
    setView('search');
    try {
      const data = await api.searchAll(token, query, 'track,album,playlist', 8);
      setResults(data);
    } catch (err) {
      console.error('[TrackSearch] search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrilldownPlaylist = async (pl) => {
    setIsLoading(true);
    try {
      const data = await api.getPlaylistTracks(token, pl.id, 50);
      setDrilldownTracks((data?.items || []).map(i => i.track).filter(Boolean));
      setDrilldownTitle(pl.name);
      setDrilldownImage(pl.images?.[0]?.url || '');
      setDrilldownUri(pl.uri);
      setView('playlist');
    } finally { setIsLoading(false); }
  };

  const handleDrilldownAlbum = async (album) => {
    setIsLoading(true);
    try {
      const data = await api.getAlbumTracks(token, album.id, 50);
      setDrilldownTracks((data?.items || []).map(t => ({ ...t, album: { name: album.name, images: album.images } })));
      setDrilldownTitle(album.name);
      setDrilldownImage(album.images?.[0]?.url || '');
      setDrilldownUri(album.uri);
      setView('album');
    } finally { setIsLoading(false); }
  };

  const handleBack = () => {
    if (view === 'playlist' || view === 'album') { setView(results ? 'search' : 'browse'); }
    else { setView('browse'); setQuery(''); setResults(null); }
  };

  const handleClear = () => {
    setQuery(''); setResults(null); setView('browse');
    inputRef.current?.focus();
  };

  // ─── DRAWER (remote control) — unchanged compact layout ─────────────────────
  if (isDrawer) {
    const DrawerTrackRow = ({ track }) => {
      const art = track?.album?.images?.[2]?.url || track?.album?.images?.[0]?.url;
      if (!track) return null;
      return (
        <div className="p-2.5 rounded-xl flex items-center gap-3 border border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-sm transition-all">
          {art ? <img src={art} alt={track.name} className="w-9 h-9 rounded shrink-0 object-cover" /> : <div className="w-9 h-9 rounded shrink-0 bg-zinc-100 flex items-center justify-center"><Music className="h-4 w-4 text-zinc-400" /></div>}
          <div className="min-w-0 flex-grow">
            <p className="text-xs font-bold truncate text-zinc-800">{track.name}</p>
            <p className="text-[9px] truncate text-zinc-500">{track.artists?.map(a => a.name).join(', ')}</p>
          </div>
          <button onClick={() => onPlayTrack(track.uri)} className="p-2 rounded-lg bg-zinc-900 text-white shrink-0 active:scale-95 cursor-pointer"><Play className="h-3.5 w-3.5 fill-current" /></button>
        </div>
      );
    };
    const DrawerContextCard = ({ item, type, onClick }) => {
      const image = item.images?.[0]?.url;
      return (
        <button onClick={() => onClick(item)} className="flex items-center gap-3 p-2.5 rounded-xl border border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-sm transition-all w-full text-left cursor-pointer">
          {image ? <img src={image} className="w-11 h-11 rounded-lg shrink-0 object-cover" alt={item.name} /> : <div className="w-11 h-11 rounded-lg shrink-0 bg-zinc-100 flex items-center justify-center">{type === 'playlist' ? <ListMusic className="h-5 w-5 text-zinc-400" /> : <Disc3 className="h-5 w-5 text-zinc-400" />}</div>}
          <div className="min-w-0 flex-grow">
            <p className="text-xs font-bold truncate text-zinc-800">{item.name}</p>
            <p className="text-[9px] truncate text-zinc-500">{type === 'playlist' ? `${item.tracks?.total || 0} tracks` : item.artists?.map(a => a.name).join(', ')}</p>
          </div>
        </button>
      );
    };
    return (
      <div className="flex flex-col h-full font-mono relative">
        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-zinc-200">
          {view !== 'browse' ? <button onClick={handleBack} className="flex items-center gap-1 text-[10px] font-bold uppercase text-zinc-500 hover:text-zinc-800 cursor-pointer"><ChevronLeft className="h-3.5 w-3.5" />Back</button> : <h3 className="text-xs font-bold tracking-widest uppercase flex items-center gap-2 text-zinc-800"><Search className="h-4 w-4" />Spotify</h3>}
          {query && <button onClick={handleClear} className="text-[9px] font-bold uppercase text-zinc-400 hover:text-zinc-700 cursor-pointer">Clear</button>}
        </div>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input ref={inputRef} type="text" placeholder="Search songs, albums, playlists..." value={query} onChange={e => { setQuery(e.target.value); if (!e.target.value.trim()) { setView('browse'); setResults(null); } }} onKeyDown={e => e.key === 'Enter' && handleSearch(e)} className="flex-grow py-2.5 px-3 rounded-xl text-xs focus:outline-none bg-zinc-50 border border-zinc-200 text-zinc-800 placeholder-zinc-400" />
          <button type="submit" disabled={isLoading} className="py-2.5 px-4 rounded-xl text-xs border bg-zinc-900 text-white border-zinc-900 cursor-pointer active:scale-95">{isLoading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}</button>
        </form>
        <div className="flex-grow overflow-y-auto max-h-[80vh]">
          {view === 'browse' && (isBrowseLoading ? <div className="flex items-center justify-center py-12"><Loader className="h-5 w-5 animate-spin text-zinc-400" /></div> : <div className="space-y-2">{recentTracks.slice(0,6).map((t,i) => <DrawerTrackRow key={`r${i}`} track={t} />)}{playlists.map(pl => <DrawerContextCard key={pl.id} item={pl} type="playlist" onClick={handleDrilldownPlaylist} />)}</div>)}
          {view === 'search' && results && <div className="space-y-2">{results.tracks?.items?.map(t => <DrawerTrackRow key={t.id} track={t} />)}{results.albums?.items?.map(a => <DrawerContextCard key={a.id} item={a} type="album" onClick={handleDrilldownAlbum} />)}{results.playlists?.items?.filter(Boolean).map(pl => <DrawerContextCard key={pl.id} item={pl} type="playlist" onClick={handleDrilldownPlaylist} />)}</div>}
          {(view === 'playlist' || view === 'album') && <div className="space-y-2">{drilldownTracks.map((t,i) => <DrawerTrackRow key={i} track={t} />)}</div>}
        </div>
      </div>
    );
  }

  // ─── KIOSK — stone theme, horizontal scroll rails ───────────────────────────
  const railCls = "flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]";

  // Large square card for albums/playlists/tracks in horizontal rail
  const ArtCard = ({ image, title, subtitle, onPlay, onDrill, playIcon = false }) => (
    <div className="shrink-0 w-[84px] select-none" style={{ scrollSnapAlign: 'start' }}>
      <button
        onClick={onDrill || onPlay}
        className="block w-full relative rounded-xl overflow-hidden active:scale-95 transition-transform"
        style={{ width: 84, height: 84, boxShadow: cardShadow }}
      >
        {image
          ? <img src={image} alt={title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: S.surfaceLo }}>
              <Music className="h-7 w-7" style={{ color: S.muted }} />
            </div>
        }
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/35 transition-colors">
          <div className="opacity-0 hover:opacity-100 transition-opacity p-2 rounded-full bg-white/90">
            <Play className="h-4 w-4 fill-current" style={{ color: S.accent }} />
          </div>
        </div>
      </button>
      <p className="text-[9px] font-bold mt-1.5 leading-tight line-clamp-2" style={{ color: S.strong }}>{title}</p>
      {subtitle && <p className="text-[8px] truncate mt-0.5" style={{ color: S.muted }}>{subtitle}</p>}
    </div>
  );

  // Compact horizontal track row (for search results / drill-down)
  const TrackRow = ({ track }) => {
    if (!track) return null;
    const art = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
    return (
      <div
        className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl active:opacity-70 transition-opacity"
        style={{ borderBottom: `1px solid ${S.border}` }}
      >
        {art
          ? <img src={art} alt={track.name} className="w-8 h-8 rounded-lg shrink-0 object-cover" />
          : <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ background: S.surfaceLo }}><Music className="h-3.5 w-3.5" style={{ color: S.muted }} /></div>
        }
        <div className="min-w-0 flex-grow">
          <p className="text-[10px] font-bold truncate" style={{ color: S.strong }}>{track.name}</p>
          <p className="text-[9px] truncate" style={{ color: S.muted }}>{track.artists?.map(a => a.name).join(', ')}</p>
        </div>
        <button
          onClick={() => onPlayTrack(track.uri)}
          className="shrink-0 p-1.5 rounded-lg active:scale-90 transition-transform cursor-pointer"
          style={{ background: S.accent }}
        >
          <Play className="h-3 w-3 fill-current" style={{ color: S.accentFg }} />
        </button>
      </div>
    );
  };

  // Section label
  const Rail = ({ icon: Icon, label, children, count }) => (
    <div className="shrink-0">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3 w-3" style={{ color: S.muted }} />
        <span className="text-[9px] font-extrabold uppercase tracking-[0.15em]" style={{ color: S.muted }}>{label}</span>
        {count > 0 && <span className="text-[8px] ml-auto" style={{ color: S.label }}>{count}</span>}
      </div>
      {children}
    </div>
  );

  const loading = (
    <div className="flex-grow flex items-center justify-center">
      <Loader className="h-5 w-5 animate-spin" style={{ color: S.muted }} />
    </div>
  );

  return (
    <div className="flex flex-col h-full font-mono" style={{ color: S.text }}>

      {/* ── Top bar ─── */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        {view !== 'browse' ? (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wide cursor-pointer active:scale-95 transition-all shrink-0"
            style={{ background: S.surfaceLo, color: S.muted, border: `1px solid ${S.border}` }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0 px-1">
            <Search className="h-3.5 w-3.5" style={{ color: S.muted }} />
            <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: S.muted }}>Spotify</span>
          </div>
        )}

        {/* Search input */}
        <form onSubmit={handleSearch} className="flex gap-2 flex-grow">
          <div className="relative flex-grow">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search songs, albums, playlists…"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) { setView('browse'); setResults(null); }
              }}
              onKeyDown={e => e.key === 'Enter' && handleSearch(e)}
              className="w-full py-2 pl-3 pr-8 rounded-xl text-[11px] font-semibold focus:outline-none tracking-wide transition-colors"
              style={{
                background: S.surfaceLo,
                border: `1px solid ${S.border}`,
                color: S.strong,
              }}
            />
            {query && (
              <button type="button" onClick={handleClear} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer">
                <X className="h-3 w-3" style={{ color: S.muted }} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="py-2 px-3.5 rounded-xl text-[11px] font-bold cursor-pointer active:scale-95 transition-all shrink-0 flex items-center"
            style={{ background: S.accent, color: S.accentFg }}
          >
            {isLoading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>

      {/* ── Content area ─────────────────────────────────── */}
      <div className="flex-grow min-h-0 overflow-y-auto space-y-4 pr-0.5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:rounded-full" style={{ '--scrollbar-color': S.border }}>

        {/* ══ BROWSE ══ */}
        {view === 'browse' && (
          isBrowseLoading ? loading : (
            <>
              {recentTracks.length > 0 && (
                <Rail icon={Clock} label="Recently Played" count={recentTracks.length}>
                  <div className={railCls} style={{ scrollSnapType: 'x mandatory' }}>
                    {recentTracks.map((track, i) => (
                      <ArtCard
                        key={`recent-${track.uri}-${i}`}
                        image={track.album?.images?.[0]?.url}
                        title={track.name}
                        subtitle={track.artists?.map(a => a.name).join(', ')}
                        onPlay={() => onPlayTrack(track.uri)}
                      />
                    ))}
                  </div>
                </Rail>
              )}

              {topTracks.length > 0 && (
                <Rail icon={TrendingUp} label="Top Tracks" count={topTracks.length}>
                  <div className={railCls} style={{ scrollSnapType: 'x mandatory' }}>
                    {topTracks.map((track, i) => (
                      <ArtCard
                        key={`top-${track.uri}-${i}`}
                        image={track.album?.images?.[0]?.url}
                        title={track.name}
                        subtitle={track.artists?.map(a => a.name).join(', ')}
                        onPlay={() => onPlayTrack(track.uri)}
                      />
                    ))}
                  </div>
                </Rail>
              )}

              {playlists.length > 0 && (
                <Rail icon={ListMusic} label="Your Playlists" count={playlists.length}>
                  <div className={railCls} style={{ scrollSnapType: 'x mandatory' }}>
                    {playlists.map(pl => (
                      <ArtCard
                        key={pl.id}
                        image={pl.images?.[0]?.url}
                        title={pl.name}
                        subtitle={`${pl.tracks?.total ?? 0} tracks`}
                        onDrill={() => handleDrilldownPlaylist(pl)}
                      />
                    ))}
                  </div>
                </Rail>
              )}

              {!isBrowseLoading && recentTracks.length === 0 && topTracks.length === 0 && playlists.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl" style={{ border: `1px dashed ${S.border}` }}>
                  <Music className="h-6 w-6" style={{ color: S.label }} />
                  <span className="text-[10px]" style={{ color: S.muted }}>No library data. Search above.</span>
                </div>
              )}
            </>
          )
        )}

        {/* ══ SEARCH RESULTS ══ */}
        {view === 'search' && isLoading && loading}

        {view === 'search' && results && !isLoading && (
          <>
            {results.tracks?.items?.length > 0 && (
              <Rail icon={Music} label="Tracks" count={results.tracks.items.length}>
                <div className="space-y-0">
                  {results.tracks.items.map(track => (
                    <TrackRow key={track.id} track={track} />
                  ))}
                </div>
              </Rail>
            )}

            {results.albums?.items?.length > 0 && (
              <Rail icon={Disc3} label="Albums" count={results.albums.items.length}>
                <div className={railCls} style={{ scrollSnapType: 'x mandatory' }}>
                  {results.albums.items.map(album => (
                    <ArtCard
                      key={album.id}
                      image={album.images?.[0]?.url}
                      title={album.name}
                      subtitle={album.artists?.map(a => a.name).join(', ')}
                      onDrill={() => handleDrilldownAlbum(album)}
                    />
                  ))}
                </div>
              </Rail>
            )}

            {results.playlists?.items?.filter(Boolean).length > 0 && (
              <Rail icon={ListMusic} label="Playlists" count={results.playlists.items.filter(Boolean).length}>
                <div className={railCls} style={{ scrollSnapType: 'x mandatory' }}>
                  {results.playlists.items.filter(Boolean).map(pl => (
                    <ArtCard
                      key={pl.id}
                      image={pl.images?.[0]?.url}
                      title={pl.name}
                      subtitle={`${pl.tracks?.total ?? 0} tracks`}
                      onDrill={() => handleDrilldownPlaylist(pl)}
                    />
                  ))}
                </div>
              </Rail>
            )}

            {!results.tracks?.items?.length && !results.albums?.items?.length && !results.playlists?.items?.filter(Boolean).length && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl" style={{ border: `1px dashed ${S.border}` }}>
                <Search className="h-6 w-6" style={{ color: S.label }} />
                <span className="text-[10px]" style={{ color: S.muted }}>No results for "{query}"</span>
              </div>
            )}
          </>
        )}

        {/* ══ DRILL-DOWN ══ */}
        {(view === 'playlist' || view === 'album') && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 p-2.5 rounded-2xl mb-1 shrink-0" style={{ background: S.surfaceLo, border: `1px solid ${S.border}` }}>
              {drilldownImage
                ? <img src={drilldownImage} alt={drilldownTitle} className="w-14 h-14 rounded-xl object-cover shrink-0" style={{ boxShadow: cardShadow }} />
                : <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center" style={{ background: S.surface }}>
                    {view === 'playlist' ? <ListMusic className="h-6 w-6" style={{ color: S.muted }} /> : <Disc3 className="h-6 w-6" style={{ color: S.muted }} />}
                  </div>
              }
              <div className="min-w-0 flex-grow">
                <p className="text-sm font-extrabold truncate leading-tight" style={{ color: S.strong }}>{drilldownTitle}</p>
                <p className="text-[10px] mt-0.5" style={{ color: S.muted }}>{drilldownTracks.length} tracks</p>
              </div>
              {onPlayContext && drilldownUri && (
                <button
                  onClick={() => onPlayContext(drilldownUri)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider cursor-pointer active:scale-95 transition-all shrink-0"
                  style={{ background: S.accent, color: S.accentFg }}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Play All
                </button>
              )}
            </div>

            {isLoading ? loading : (
              <div className="space-y-0">
                {drilldownTracks.map((track, i) => (
                  <TrackRow key={`drill-${track?.uri || i}`} track={track} />
                ))}
                {drilldownTracks.length === 0 && (
                  <p className="text-center text-[10px] py-6" style={{ color: S.muted }}>No tracks in this {view}.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
