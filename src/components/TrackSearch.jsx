import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Play, Loader, ChevronLeft, Clock, TrendingUp, ListMusic, Disc3 } from 'lucide-react';
import { api } from '../api';

/**
 * TrackSearch — Spotify search + browse component.
 *
 * Default view: user's playlists + recently played.
 * Search view: full search across tracks, albums, playlists.
 * Playlist drill-down: tap a playlist to see its tracks.
 */
export default function TrackSearch({ token, onPlayTrack, onPlayContext, isDrawer = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Browse state
  const [view, setView] = useState('browse'); // 'browse' | 'search' | 'playlist' | 'album'
  const [playlists, setPlaylists] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [drilldownTracks, setDrilldownTracks] = useState([]);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownImage, setDrilldownImage] = useState('');
  const [drilldownUri, setDrilldownUri] = useState('');
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);

  const inputRef = useRef(null);

  // Load playlists & recent on mount
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
        api.getRecentlyPlayed(token, 10),
        api.getUserTopTracks(token, 10, 'short_term')
      ]);

      if (playlistData.status === 'fulfilled' && playlistData.value?.items) {
        setPlaylists(playlistData.value.items);
      }
      if (recentData.status === 'fulfilled' && recentData.value?.items) {
        // Deduplicate by track URI
        const seen = new Set();
        const unique = recentData.value.items.filter(item => {
          if (seen.has(item.track?.uri)) return false;
          seen.add(item.track?.uri);
          return true;
        });
        setRecentTracks(unique.map(item => item.track));
      }
      if (topData.status === 'fulfilled' && topData.value?.items) {
        setTopTracks(topData.value.items);
      }
    } catch (err) {
      console.error('[TrackSearch] Failed to load browse data:', err);
    } finally {
      setIsBrowseLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault?.();
    if (!query.trim()) {
      setView('browse');
      setResults(null);
      return;
    }

    try {
      setIsLoading(true);
      setView('search');
      const data = await api.searchAll(token, query, 'track,album,playlist', 8);
      setResults(data);
    } catch (err) {
      console.error('[TrackSearch] Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrilldownPlaylist = async (playlist) => {
    try {
      setIsLoading(true);
      const data = await api.getPlaylistTracks(token, playlist.id, 50);
      setDrilldownTracks((data?.items || []).map(i => i.track).filter(Boolean));
      setDrilldownTitle(playlist.name);
      setDrilldownImage(playlist.images?.[0]?.url || '');
      setDrilldownUri(playlist.uri);
      setView('playlist');
    } catch (err) {
      console.error('[TrackSearch] Playlist drilldown error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrilldownAlbum = async (album) => {
    try {
      setIsLoading(true);
      const data = await api.getAlbumTracks(token, album.id, 50);
      setDrilldownTracks((data?.items || []).map(t => ({
        ...t,
        album: { name: album.name, images: album.images }
      })));
      setDrilldownTitle(album.name);
      setDrilldownImage(album.images?.[0]?.url || '');
      setDrilldownUri(album.uri);
      setView('album');
    } catch (err) {
      console.error('[TrackSearch] Album drilldown error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (view === 'playlist' || view === 'album') {
      setView(results ? 'search' : 'browse');
    } else {
      setView('browse');
      setQuery('');
      setResults(null);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setView('browse');
    inputRef.current?.focus();
  };

  // Shared track row renderer
  const TrackRow = ({ track, index }) => {
    if (!track) return null;
    const art = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
    return (
      <div className={`p-2.5 rounded-xl flex items-center justify-between gap-3 transition-all group ${
        isDrawer
          ? 'border border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-sm'
          : 'border border-zinc-900 bg-zinc-950/40 hover:border-zinc-800'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-grow">
          {art ? (
            <img src={art} alt={track.name} className="w-9 h-9 object-cover rounded shrink-0 border border-zinc-900/20" />
          ) : (
            <div className={`w-9 h-9 rounded shrink-0 flex items-center justify-center ${
              isDrawer ? 'bg-zinc-100 border border-zinc-200 text-zinc-400' : 'bg-zinc-950 border border-zinc-900 text-zinc-700'
            }`}>
              <Music className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className={`text-xs font-bold truncate ${isDrawer ? 'text-zinc-800' : 'text-slate-200'}`}>
              {track.name}
            </p>
            <p className={`text-[9px] truncate ${isDrawer ? 'text-zinc-500' : 'text-zinc-500'}`}>
              {track.artists?.map(a => a.name).join(', ')}
            </p>
          </div>
        </div>
        <button
          onClick={() => onPlayTrack(track.uri)}
          className={`p-2 rounded-lg hover:opacity-90 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-md ${
            isDrawer ? 'bg-zinc-900 text-white' : 'theme-bg text-black'
          }`}
          title="Play"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
    );
  };

  // Shared context card renderer (playlists, albums)
  const ContextCard = ({ item, type, onClick }) => {
    const image = item.images?.[0]?.url || item.images?.[1]?.url;
    const subtitle = type === 'playlist'
      ? `${item.tracks?.total || 0} tracks`
      : (item.artists?.map(a => a.name).join(', ') || item.release_date?.substring(0, 4));

    return (
      <button
        onClick={() => onClick(item)}
        className={`flex items-center gap-3 p-2.5 rounded-xl transition-all group cursor-pointer w-full text-left ${
          isDrawer
            ? 'border border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-sm'
            : 'border border-zinc-900 bg-zinc-950/40 hover:border-zinc-800'
        }`}
      >
        {image ? (
          <img src={image} alt={item.name} className={`w-11 h-11 object-cover shrink-0 ${type === 'playlist' ? 'rounded-lg' : 'rounded'}`} />
        ) : (
          <div className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-lg ${
            isDrawer ? 'bg-zinc-100 text-zinc-400' : 'bg-zinc-900 text-zinc-600'
          }`}>
            {type === 'playlist' ? <ListMusic className="h-5 w-5" /> : <Disc3 className="h-5 w-5" />}
          </div>
        )}
        <div className="min-w-0 flex-grow">
          <p className={`text-xs font-bold truncate ${isDrawer ? 'text-zinc-800' : 'text-slate-200'}`}>{item.name}</p>
          <p className={`text-[9px] truncate ${isDrawer ? 'text-zinc-500' : 'text-zinc-500'}`}>{subtitle}</p>
        </div>
        <Play className={`h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
          isDrawer ? 'text-zinc-500' : 'text-zinc-500'
        }`} />
      </button>
    );
  };

  // Section header
  const SectionHeader = ({ icon: Icon, label }) => (
    <div className={`flex items-center gap-2 pt-3 pb-1.5 ${isDrawer ? 'text-zinc-500' : 'text-zinc-500'}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-[9px] font-extrabold uppercase tracking-[0.15em]">{label}</span>
    </div>
  );

  return (
    <div className={isDrawer
      ? "flex flex-col h-full font-mono relative"
      : "p-6 rounded-2xl bg-gradient-to-b from-[#22252c] to-[#0f1013] border border-[#303643] shadow-xl flex flex-col h-full font-mono relative"
    }>

      {/* Header with back button */}
      <div className={`flex items-center justify-between mb-4 pb-2.5 ${
        isDrawer ? 'border-b border-zinc-200' : 'border-b border-zinc-900/60'
      }`}>
        {(view !== 'browse') ? (
          <button
            onClick={handleBack}
            className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              isDrawer ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : (
          <h3 className={`text-xs font-bold tracking-widest uppercase flex items-center gap-2 ${
            isDrawer ? 'text-zinc-800' : 'text-white'
          }`}>
            <Search className="h-4 w-4" style={isDrawer ? {} : undefined} />
            Spotify
          </h3>
        )}
        {query && (
          <button
            onClick={handleClear}
            className={`text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              isDrawer ? 'text-zinc-400 hover:text-zinc-700' : 'text-zinc-600 hover:text-zinc-300'
            }`}
          >
            Clear
          </button>
        )}
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search songs, albums, playlists..."
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) {
              setView('browse');
              setResults(null);
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSearch(e);
          }}
          className={`flex-grow py-2.5 px-3 rounded-xl text-xs focus:outline-none transition-colors tracking-wider font-semibold ${
            isDrawer
              ? 'bg-zinc-50 border border-zinc-200 text-zinc-800 placeholder-zinc-400 focus:border-zinc-300'
              : 'bg-zinc-950 border border-zinc-900 theme-text placeholder-zinc-800 focus:border-zinc-850 uppercase'
          }`}
        />
        <button
          type="submit"
          disabled={isLoading}
          className={`py-2.5 px-4 rounded-xl text-xs border transition-colors cursor-pointer flex items-center justify-center min-w-[50px] active:scale-95 ${
            isDrawer
              ? 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-900'
              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:text-white'
          }`}
        >
          {isLoading ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </button>
      </form>

      {/* Scrollable Content Area */}
      <div className={`flex-grow overflow-y-auto custom-scrollbar pr-1 ${isDrawer ? 'max-h-[80vh]' : 'max-h-[340px]'}`}>

        {/* BROWSE VIEW — Default when no search */}
        {view === 'browse' && (
          <div className="space-y-1">
            {isBrowseLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className={`h-5 w-5 animate-spin ${isDrawer ? 'text-zinc-400' : 'text-zinc-600'}`} />
              </div>
            ) : (
              <>
                {/* Recently Played */}
                {recentTracks.length > 0 && (
                  <>
                    <SectionHeader icon={Clock} label="Recently Played" />
                    <div className="space-y-2">
                      {recentTracks.slice(0, 6).map((track, i) => (
                        <TrackRow key={`recent-${track.uri}-${i}`} track={track} index={i} />
                      ))}
                    </div>
                  </>
                )}

                {/* Top Tracks */}
                {topTracks.length > 0 && (
                  <>
                    <SectionHeader icon={TrendingUp} label="Your Top Tracks" />
                    <div className="space-y-2">
                      {topTracks.slice(0, 6).map((track, i) => (
                        <TrackRow key={`top-${track.uri}-${i}`} track={track} index={i} />
                      ))}
                    </div>
                  </>
                )}

                {/* User Playlists */}
                {playlists.length > 0 && (
                  <>
                    <SectionHeader icon={ListMusic} label="Your Playlists" />
                    <div className="space-y-2">
                      {playlists.map((pl) => (
                        <ContextCard
                          key={pl.id}
                          item={pl}
                          type="playlist"
                          onClick={handleDrilldownPlaylist}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Empty state */}
                {recentTracks.length === 0 && topTracks.length === 0 && playlists.length === 0 && (
                  <div className={`text-center py-8 text-[10px] flex flex-col items-center justify-center border border-dashed rounded-xl select-none ${
                    isDrawer ? 'border-zinc-200 text-zinc-400' : 'border-zinc-900 text-zinc-600'
                  }`}>
                    <Music className={`h-5 w-5 mb-2 animate-pulse ${isDrawer ? 'text-zinc-300' : 'text-zinc-700'}`} />
                    <span>No library data available.</span>
                    <span>Search for something above.</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* SEARCH RESULTS VIEW */}
        {view === 'search' && results && (
          <div className="space-y-1">
            {/* Tracks */}
            {results.tracks?.items?.length > 0 && (
              <>
                <SectionHeader icon={Music} label="Tracks" />
                <div className="space-y-2">
                  {results.tracks.items.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} />
                  ))}
                </div>
              </>
            )}

            {/* Albums */}
            {results.albums?.items?.length > 0 && (
              <>
                <SectionHeader icon={Disc3} label="Albums" />
                <div className="space-y-2">
                  {results.albums.items.map((album) => (
                    <ContextCard
                      key={album.id}
                      item={album}
                      type="album"
                      onClick={handleDrilldownAlbum}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Playlists */}
            {results.playlists?.items?.length > 0 && (
              <>
                <SectionHeader icon={ListMusic} label="Playlists" />
                <div className="space-y-2">
                  {results.playlists.items.filter(Boolean).map((pl) => (
                    <ContextCard
                      key={pl.id}
                      item={pl}
                      type="playlist"
                      onClick={handleDrilldownPlaylist}
                    />
                  ))}
                </div>
              </>
            )}

            {/* No results */}
            {!results.tracks?.items?.length && !results.albums?.items?.length && !results.playlists?.items?.length && (
              <div className={`text-center py-8 text-[10px] flex flex-col items-center justify-center border border-dashed rounded-xl select-none ${
                isDrawer ? 'border-zinc-200 text-zinc-400' : 'border-zinc-900 text-zinc-600'
              }`}>
                <Search className={`h-5 w-5 mb-2 ${isDrawer ? 'text-zinc-300' : 'text-zinc-700'}`} />
                <span>No results found for "{query}"</span>
              </div>
            )}
          </div>
        )}

        {/* DRILL-DOWN VIEW — Playlist or Album tracks */}
        {(view === 'playlist' || view === 'album') && (
          <div className="space-y-2">
            {/* Header card */}
            <div className={`flex items-center gap-3 p-3 rounded-xl mb-2 ${
              isDrawer ? 'bg-zinc-50 border border-zinc-200' : 'bg-zinc-900/50 border border-zinc-800'
            }`}>
              {drilldownImage ? (
                <img src={drilldownImage} alt={drilldownTitle} className="w-14 h-14 object-cover rounded-lg shrink-0" />
              ) : (
                <div className={`w-14 h-14 rounded-lg shrink-0 flex items-center justify-center ${
                  isDrawer ? 'bg-zinc-200 text-zinc-400' : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {view === 'playlist' ? <ListMusic className="h-6 w-6" /> : <Disc3 className="h-6 w-6" />}
                </div>
              )}
              <div className="min-w-0 flex-grow">
                <p className={`text-sm font-bold truncate ${isDrawer ? 'text-zinc-800' : 'text-white'}`}>{drilldownTitle}</p>
                <p className={`text-[10px] ${isDrawer ? 'text-zinc-500' : 'text-zinc-500'}`}>{drilldownTracks.length} tracks</p>
              </div>
              {onPlayContext && drilldownUri && (
                <button
                  onClick={() => onPlayContext(drilldownUri)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer ${
                    isDrawer ? 'bg-zinc-900 text-white' : 'theme-bg text-black'
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  Play All
                </button>
              )}
            </div>

            {/* Track list */}
            {drilldownTracks.map((track, i) => (
              <TrackRow key={`drill-${track.uri || track.id}-${i}`} track={track} index={i} />
            ))}

            {drilldownTracks.length === 0 && !isLoading && (
              <div className={`text-center py-6 text-[10px] select-none ${isDrawer ? 'text-zinc-400' : 'text-zinc-600'}`}>
                No tracks in this {view}.
              </div>
            )}
          </div>
        )}

        {/* Search empty prompt (before first search, no browse data) */}
        {view === 'search' && !results && !isLoading && (
          <div className={`text-center py-8 text-[10px] flex flex-col items-center justify-center border border-dashed rounded-xl select-none ${
            isDrawer ? 'border-zinc-200 text-zinc-400' : 'border-zinc-900 text-zinc-600'
          }`}>
            <Search className={`h-5 w-5 mb-2 animate-pulse ${isDrawer ? 'text-zinc-300' : 'text-zinc-700'}`} />
            <span>Search for songs, albums, or playlists.</span>
          </div>
        )}
      </div>
    </div>
  );
}
