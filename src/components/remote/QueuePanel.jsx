import React, { useContext } from 'react';
import { X, Music, ListMusic, Trash2 } from 'lucide-react';
import { Tk } from './shared';
import { useLocalQueue } from '../../hooks/useLocalQueue';
import { useI18n } from '../../i18n';

export default function QueuePanel({ queue, queueLoading, onClose }) {
  const { C, cardWhite, darkMode, albumImage, trackName, trackArtist } = useContext(Tk);
  const { t } = useI18n();

  const { isLocal, localQueue, localLoading, removeLocal } = useLocalQueue();

  const panelBg = darkMode
    ? { background: 'rgba(10,14,28,0.97)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' }
    : { background: 'rgba(249,249,249,0.97)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' };

  const spotifyTracks = Array.isArray(queue) ? queue.slice(0, 20) : [];

  return (
    <div className="fixed inset-0 z-[9998]" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden queue-panel-in"
        style={{ ...panelBg, border: `0.5px solid ${C.outline}`, maxHeight: '80vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={e => e.stopPropagation()}>

        {/* handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ background: C.outline }} />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <ListMusic className="h-5 w-5" style={{ color: C.champagne }} />
            <span className="text-[17px] font-semibold" style={{ color: C.text1 }}>{t('queue.upNext')}</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
            <X className="h-4 w-4" style={{ color: C.text3 }} />
          </button>
        </div>

        {/* now playing */}
        {trackName && trackName !== 'Nothing playing' && (
          <div className="mx-4 mb-3 rounded-xl p-3 flex items-center gap-3" style={cardWhite}>
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
              {albumImage
                ? <img src={albumImage} alt="" className="w-full h-full object-cover" draggable={false} />
                : <Music className="h-4 w-4" style={{ color: C.text4 }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5"
                style={{ color: C.champagne, fontFamily: 'Hanken Grotesk, system-ui' }}>{t('queue.nowPlaying')}</p>
              <p className="text-[14px] font-medium truncate" style={{ color: C.text1 }}>{trackName}</p>
              <p className="text-[12px] truncate" style={{ color: C.text3 }}>{trackArtist}</p>
            </div>
          </div>
        )}

        {/* queue list */}
        <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: '50vh' }}>
          {(isLocal ? localLoading : queueLoading) ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: C.container, borderTopColor: C.champagne }} />
            </div>
          ) : isLocal ? (
            localQueue.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <ListMusic className="h-8 w-8" style={{ color: C.outline }} />
                <p className="text-[14px]" style={{ color: C.text3 }}>{t('queue.empty')}</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={cardWhite}>
                {localQueue.map((t, idx) => (
                  <React.Fragment key={t.id}>
                    {idx > 0 && (
                      <div className="ml-14" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
                    )}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span className="text-[11px] w-5 text-right shrink-0 font-semibold tabular-nums"
                        style={{ color: C.text4 }}>{idx + 1}</span>
                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                        style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                        <Music className="h-3.5 w-3.5" style={{ color: C.text4 }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: C.text1 }}>{t.title}</p>
                        <p className="text-[11px] truncate" style={{ color: C.text3 }}>{t.artist}</p>
                      </div>
                      <button onClick={() => removeLocal(t.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 active:scale-90 transition-all cursor-pointer"
                        style={{ color: C.text4 }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )
          ) : spotifyTracks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <ListMusic className="h-8 w-8" style={{ color: C.outline }} />
              <p className="text-[14px]" style={{ color: C.text3 }}>{t('queue.empty')}</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={cardWhite}>
              {spotifyTracks.map((t, idx) => {
                const img    = t.album?.images?.[2]?.url || t.album?.images?.[0]?.url;
                const name   = t.name;
                const artist = t.artists?.map(a => a.name).join(', ');
                return (
                  <React.Fragment key={`${t.uri}-${idx}`}>
                    {idx > 0 && (
                      <div className="ml-14" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
                    )}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span className="text-[11px] w-5 text-right shrink-0 font-semibold tabular-nums"
                        style={{ color: C.text4 }}>{idx + 1}</span>
                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                        style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                        {img
                          ? <img src={img} alt="" className="w-full h-full object-cover" draggable={false} />
                          : <Music className="h-3.5 w-3.5" style={{ color: C.text4 }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: C.text1 }}>{name}</p>
                        <p className="text-[11px] truncate" style={{ color: C.text3 }}>{artist}</p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
