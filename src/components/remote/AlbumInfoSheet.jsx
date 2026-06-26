import React, { useContext } from 'react';
import { X, Disc2, User, Music } from 'lucide-react';
import { Tk } from './shared';

export default function AlbumInfoSheet({ artist, album, albumImage, onClose }) {
  const { C, cardWhite } = useContext(Tk);

  return (
    <div className="fixed inset-0 z-[9998]" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden"
        style={{ ...cardWhite, maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: C.outline }} />
        </div>

        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Disc2 className="h-5 w-5" style={{ color: C.champagne }} />
            <span className="text-[17px] font-semibold" style={{ color: C.text1 }}>Album</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
            <X className="h-4 w-4" style={{ color: C.text3 }} />
          </button>
        </div>

        <div className="px-5 pb-10 flex-1 overflow-y-auto">
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
              {albumImage
                ? <img src={albumImage} alt={album} className="w-full h-full object-cover" />
                : <Music className="h-10 w-10" style={{ color: C.text4 }} />}
            </div>
            <div className="flex-1 min-w-0 pt-2">
              <p className="text-[18px] font-semibold leading-snug mb-2" style={{ color: C.text1 }}>{album}</p>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 shrink-0" style={{ color: C.text4 }} />
                <p className="text-[14px] truncate" style={{ color: C.text3 }}>{artist}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
