import React, { useContext } from 'react';
import { Music, Library, Layers, Sliders, Search } from 'lucide-react';
import { Tk } from './shared';
import { useI18n } from '../../i18n';

const BASE_TABS = [
  { id: 'player',   Icon: Music,    labelKey: 'nav.player'   },
  { id: 'library',  Icon: Library,  labelKey: 'nav.library'  },
  { id: 'source',   Icon: Layers,   labelKey: 'nav.source'   },
  { id: 'radio',    Icon: Search,   labelKey: 'nav.search'   },
  { id: 'settings', Icon: Sliders,  labelKey: 'nav.settings' },
];

const N = BASE_TABS.length;

export default function BottomNav({ navH }) {
  const { C, activeTab, setActiveTab, darkMode } = useContext(Tk);
  const { t } = useI18n();

  const activeIdx = BASE_TABS.findIndex(t => t.id === activeTab);

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
        {BASE_TABS.map(({ id, Icon, labelKey }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className="flex flex-col items-center gap-1 py-1 flex-1 cursor-pointer active:scale-90"
              style={{ transition: 'transform 0.1s ease' }}>
              <Icon className="h-[22px] w-[22px]"
                strokeWidth={active ? 2.2 : 1.7}
                style={{ color: active ? C.champagne : C.text3, transition: 'color 0.2s ease' }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: active ? C.champagne : C.text3, fontFamily: C.fontLabel, transition: 'color 0.2s ease' }}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
