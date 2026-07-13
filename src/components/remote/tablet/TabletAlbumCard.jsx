import { useContext, useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { Tk } from '../shared';
import { api } from '../../../api';

// One card in the tablet Library's Albums grid. Cover art isn't available
// from MPD's own library listing — `mpc list album`/`queue/detailed` return
// names only, no artwork — so each card fetches it on mount from the
// existing /api/metadata/album aggregator (MusicBrainz Cover Art Archive +
// TheAudioDB), the same source the now-playing info sheet already uses.
// That endpoint serialises MusicBrainz calls server-side (~1.1s/request,
// see server/metadata.js's mbThrottle) and caches results for 30 days, so
// cards reveal their art progressively on first browse and load instantly
// on every visit after.
export default function TabletAlbumCard({ artist, album, onClick }) {
  const { C } = useContext(Tk);
  const [art, setArt] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getAlbumMetadata(artist, album)
      .then(d => { if (alive) setArt(d?.coverArt || d?.albumImage || null); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [artist, album]);

  return (
    <button onClick={onClick}
      className="text-left rounded-2xl overflow-hidden active:scale-[0.98] transition-all cursor-pointer"
      style={{ background: '#ffffff', border: `0.5px solid ${C.outline}`, boxShadow: '0 6px 20px rgba(180,170,150,0.12)' }}>
      <div className="w-full aspect-square flex items-center justify-center overflow-hidden"
        style={{ background: C.containerLow }}>
        {art
          ? <img src={art} alt="" className="w-full h-full object-cover" draggable={false} />
          : <Music className={`h-8 w-8 ${loaded ? '' : 'animate-pulse'}`} style={{ color: C.outline }} />}
      </div>
      <div className="p-3">
        <p className="text-[14px] font-semibold truncate" style={{ color: C.text1 }}>{album}</p>
        <p className="text-[12px] truncate" style={{ color: C.text3 }}>{artist}</p>
      </div>
    </button>
  );
}
