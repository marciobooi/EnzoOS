import { useContext, useEffect, useState } from 'react';
import { Tk } from '../components/remote/shared';
import { api } from '../api';
import { reportError } from '../lib/errors';
import { toast } from '../lib/toast';

// Local/non-Spotify sources (radio, local files, Tidal, Qobuz, AirPlay,
// Bluetooth, UPnP) don't carry a queue through playbackState the way
// Spotify does — MPD's queue is fetched separately via
// api.getDetailedQueue(). Every queue-showing surface needs the same
// isLocal branch + fetch + delete, so it lives here once. Previously
// duplicated in QueuePanel and TabletQueueList — and NOT wired into
// TabletPlayerHero's collapsed "Up Next" preview at all, which is why
// that preview stayed empty ("Nothing queued") for anything but Spotify
// even though the queue itself was populated.
export function useLocalQueue() {
  const { source, spotifyBacked, setActiveTab } = useContext(Tk);
  const [localQueue, setLocalQueue] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  // spotifyBacked (not spotify): DJ mode plays real Spotify tracks under the
  // hood and needs the Spotify-shaped queue path, not MPD's — dj.js stops
  // MPD outright at session start, so `!spotify` alone routed DJ mode here
  // and got a permanently empty MPD queue back. Reported live: "in dj the
  // up next is also empty too" (AUDIT-2026-08-02).
  const isLocal = !spotifyBacked && source !== 'radio';

  useEffect(() => {
    if (!isLocal) return;
    setLocalLoading(true);
    api.getDetailedQueue()
      .then(d => setLocalQueue(d.tracks || []))
      .catch(() => {})
      .finally(() => setLocalLoading(false));
  }, [isLocal]);

  const removeLocal = async (id) => {
    try {
      await api.removeFromQueue(id);
      setLocalQueue(prev => prev.filter(t => t.id !== id));
    } catch (e) { reportError(e.message); }
  };

  const playLocal = async (id) => {
    try {
      await api.playQueueItem(id);
      setActiveTab?.('player');
      toast.success('Playing');
    } catch (e) { reportError(e.message); }
  };

  return { isLocal, localQueue, localLoading, removeLocal, playLocal };
}
