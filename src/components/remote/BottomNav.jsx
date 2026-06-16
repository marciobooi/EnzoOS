import React, { useContext } from 'react';
import { Music, Library, Radio, Sliders } from 'lucide-react';
import { Tk } from './shared';

const TABS = [
  { id: 'player',   Icon: Music,    label: 'Now Playing' },
  { id: 'library',  Icon: Library,  label: 'Library'     },
  { id: 'source',   Icon: Radio,    label: 'Source'      },
  { id: 'settings', Icon: Sliders,  label: 'Settings'    },
];

export default function BottomNav({ navH }) {
  const { C, activeTab, setActiveTab, darkMode } = useContext(Tk);
  return (
    <div className="relative shrink-0 z-10" style={{ height: navH, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="absolute inset-0 rounded-t-2xl"
        style={{
          background: darkMode ? 'rgba(10,15,30,0.93)' : 'rgba(249,249,249,0.93)',
          backdropFilter: 'saturate(180%) blur(32px)',
          borderTop: `0.5px solid ${C.outline}`,
          boxShadow: darkMode ? '0 -4px 20px rgba(0,0,0,0.5)' : '0 -4px 20px rgba(0,0,0,0.04)',
        }} />
      <div className="relative flex items-start justify-around pt-3 px-2">
        {TABS.map(({ id, Icon, label }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className="flex flex-col items-center gap-1 py-1 flex-1 cursor-pointer transition-all active:scale-90">
              <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5}
                style={{ color: active ? C.champagne : C.text3 }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: active ? C.champagne : C.text3, fontFamily: C.fontLabel }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
