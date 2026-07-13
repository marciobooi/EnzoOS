import { useContext, useEffect, useState } from 'react';
import { Tk } from '../components/remote/shared';
import { api } from '../api';
import { reportError } from '../lib/errors';

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
  const { source, spotify } = useContext(Tk);
  const [localQueue, setLocalQueue] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const isLocal = !spotify && source !== 'radio';

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

  return { isLocal, localQueue, localLoading, removeLocal };
}
