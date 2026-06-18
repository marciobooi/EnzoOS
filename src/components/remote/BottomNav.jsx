import React, { useContext } from 'react';
import { Music, Library, Layers, Radio, Sliders, Search } from 'lucide-react';
import { Tk } from './shared';

const BASE_TABS = [
  { id: 'player',   Icon: Music,    label: 'Player'   },
  { id: 'library',  Icon: Library,  label: 'Library'  },
  { id: 'source',   Icon: Layers,   label: 'Source'   },
  { id: 'radio',    Icon: Radio,    label: 'Radio'    },
  { id: 'settings', Icon: Sliders,  label: 'Settings' },
];

const N = BASE_TABS.length;

export default function BottomNav({ navH }) {
  const { C, activeTab, setActiveTab, darkMode, source } = useContext(Tk);

  const TABS = BASE_TABS.map(t =>
    t.id === 'radio'
      ? source === 'radio'
        ? t
        : { ...t, Icon: Search, label: 'Search' }
      : t
  );

  const activeIdx = TABS.findIndex(t => t.id === activeTab);

  return (
    <div className="relative shrink-0 z-10" style={{ height: navH, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="absolute inset-0 rounded-t-2xl"
        style={{
          background: darkMode ? 'rgba(10,15,30,0.93)' : 'rgba(249,249,249,0.93)',
          backdropFilter: 'saturate(180%) blur(32px)',
          borderTop: `0.5px solid ${C.outline}`,
          boxShadow: darkMode ? '0 -4px 20px rgba(0,0,0,0.5)' : '0 -4px 20px rgba(0,0,0,0.04)',
        }} />

      {/* Sliding active indicator */}
      <div
        className="absolute top-0 h-[2px] w-8 rounded-full"
        style={{
          background: C.champagne,
          boxShadow: `0 0 10px ${C.champagne}cc, 0 0 20px ${C.champagne}44`,
          left: `calc(${activeIdx} * ${100 / N}% + ${50 / N}%)`,
          transform: 'translateX(-50%)',
          transition: 'left 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />

      <div className="relative flex items-start justify-around pt-3 px-1">
        {TABS.map(({ id, Icon, label }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className="flex flex-col items-center gap-1 py-1 flex-1 cursor-pointer active:scale-90"
              style={{ transition: 'transform 0.1s ease' }}>
              <Icon className="h-5 w-5"
                strokeWidth={active ? 2 : 1.5}
                style={{ color: active ? C.champagne : C.text3, transition: 'color 0.2s ease' }} />
              <span className="text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: active ? C.champagne : C.text3, fontFamily: C.fontLabel, transition: 'color 0.2s ease' }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
