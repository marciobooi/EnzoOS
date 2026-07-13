import { useContext } from 'react';
import { Trash2, Music } from 'lucide-react';
import { Tk } from '../shared';
import { useLocalQueue } from '../../../hooks/useLocalQueue';

// Queue rows only — no chrome, no scrim, no header. Used inline by
// TabletPlayerHero's expandable "Up Next" card so browsing the queue
// changes what's already on screen instead of opening QueuePanel's
// bottom-sheet modal on top of it (that modal is still what the phone
// uses; this is its tablet-inline equivalent, not a replacement for it —
// QueuePanel itself is untouched).
export default function TabletQueueList() {
  const { C, queue, queueLoading } = useContext(Tk);
  const { isLocal, localQueue, localLoading, removeLocal } = useLocalQueue();

  const loading = isLocal ? localLoading : queueLoading;
  const list = isLocal ? localQueue : (Array.isArray(queue) ? queue.slice(0, 20) : []);

  if (loading) return (
    <div className="flex justify-center py-6">
      <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: C.container, borderTopColor: C.champagne }} />
    </div>
  );
  if (!list.length) return <p className="text-[12px] py-3 text-center" style={{ color: C.text4 }}>Queue is empty</p>;

  return (
    <div className="flex flex-col">
      {list.map((tr, idx) => {
        const name   = isLocal ? tr.title : tr.name;
        const artist = isLocal ? tr.artist : tr.artists?.map(a => a.name).join(', ');
        // MPD's queue/detailed endpoint only returns id/title/artist/file —
        // no per-track art — so local rows always fall back to the generic
        // icon, same limitation the phone's QueuePanel has for local queues.
        const art = isLocal ? null : (tr.album?.images?.[2]?.url || tr.album?.images?.[0]?.url);
        return (
          <div key={isLocal ? tr.id : `${tr.uri}-${idx}`}
            className="flex items-center gap-2.5 py-2"
            style={idx > 0 ? { borderTop: `0.5px solid ${C.outline}` } : undefined}>
            <span className="text-[11px] w-4 text-right shrink-0 font-semibold tabular-nums" style={{ color: C.text4 }}>{idx + 1}</span>
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
              {art
                ? <img src={art} alt="" className="w-full h-full object-cover" draggable={false} />
                : <Music className="h-3.5 w-3.5" style={{ color: C.text4 }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate" style={{ color: C.text1 }}>{name}</p>
              <p className="text-[11px] truncate" style={{ color: C.text3 }}>{artist}</p>
            </div>
            {isLocal && (
              <button onClick={() => removeLocal(tr.id)}
                className="w-7 h-7 flex items-center justify-center rounded-full shrink-0 active:scale-90 transition-all cursor-pointer"
                style={{ color: C.text4 }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
