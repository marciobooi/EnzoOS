import React, { useContext, useState } from 'react';
import { Search, Music } from 'lucide-react';
import { Tk, SpotifyIcon } from './shared';
import { api } from '../../api';
import { toast } from '../../lib/toast';
import { useI18n } from '../../i18n';

export default function SpotifySearchTab() {
  const { t } = useI18n();
  const {
    C, card, cardWhite,
    token, handlePlayTrack, setActiveTab,
    wakeKiosk,
  } = useContext(Tk);

  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched]   = useState(false);

  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const data = await api.searchTracks(token, q);
      setResults(data?.tracks?.items || []);
      setSearched(true);
    } catch (e) {
      toast.error(t('spotifyTab.searchFailed'));
    } finally {
      setSearching(false);
    }
  };

  const playTrack = async (track) => {
    wakeKiosk();
    await handlePlayTrack(track.uri);
  };

  const fmt = ms => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (!token) {
    return (
      <div className="flex flex-col pt-5 pb-2 px-5">
        <div className="px-0 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>Spotify</p>
          <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('source.search')}</h2>
        </div>
        <div className="rounded-xl p-5 flex flex-col gap-4 text-center" style={cardWhite}>
          <div>
            <p className="text-[17px] font-medium" style={{ color: C.text1 }}>{t('spotifyTab.connect')}</p>
            <p className="text-[14px] mt-1" style={{ color: C.text4 }}>{t('spotifyTab.signInSearch')}</p>
          </div>
          <a href="/auth/spotify/login?from=remote"
            className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
            style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.fontLabel }}>
            <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
            {t('settings.connectSpotify')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pt-5 pb-2">

      <div className="px-5 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>Spotify</p>
        <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('source.search')}</h2>
      </div>

      {/* search bar */}
      <div className="px-4 flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
            style={{ color: C.text3 }} />
          <input
            type="text"
            placeholder={t('spotifyTab.placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            className="w-full rounded-xl pl-10 pr-4 py-3 text-[15px] focus:outline-none"
            style={{ ...card, color: C.text1 }}
          />
        </div>
        <button
          onClick={doSearch}
          disabled={searching}
          className="px-5 py-3 rounded-xl text-[14px] font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }}>
          {searching ? '…' : t('common.go')}
        </button>
      </div>

      {searched && (
        <p className="px-6 mb-2 text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>
          {t('common.resultsCount', { n: results.length })}
        </p>
      )}

      {/* results */}
      <div className="mx-4 rounded-xl overflow-hidden" style={cardWhite}>
        {results.length === 0 && !searched ? (
          <div className="px-4 py-8 text-center">
            <SpotifyIcon className="h-8 w-8 mx-auto mb-3" style={{ fill: C.outline }} />
            <p className="text-[15px] font-medium mb-1" style={{ color: C.text1 }}>Find something to play</p>
            <p className="text-[13px]" style={{ color: C.text4 }}>Search by song, artist or album</p>
          </div>
        ) : results.length === 0 && searched ? (
          <div className="px-4 py-8 text-center">
            <Music className="h-8 w-8 mx-auto mb-3" style={{ color: C.outline }} />
            <p className="text-[15px] font-medium" style={{ color: C.text1 }}>No results found</p>
          </div>
        ) : results.map((track, idx) => {
          const img = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
          const artist = track.artists?.map(a => a.name).join(', ');
          return (
            <React.Fragment key={track.uri}>
              {idx > 0 && (
                <div className="ml-16"
                  style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
              )}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer list-item-rise active:opacity-70 transition-opacity"
                style={{ animationDelay: `${Math.min(idx * 0.035, 0.35)}s` }}
                onClick={() => playTrack(track)}>
                <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                  style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                  {img
                    ? <img src={img} alt="" className="w-full h-full object-cover" />
                    : <Music className="h-4 w-4" style={{ color: C.text3 }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium truncate" style={{ color: C.text1 }}>{track.name}</p>
                  <p className="text-[12px] truncate" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                    {artist}{track.album?.name ? ` · ${track.album.name}` : ''}
                  </p>
                </div>
                <span className="text-[11px] shrink-0 tabular-nums" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                  {fmt(track.duration_ms)}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
