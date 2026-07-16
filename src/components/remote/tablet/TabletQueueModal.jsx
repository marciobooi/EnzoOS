import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { X, ListMusic } from 'lucide-react';
import { Tk } from '../shared';
import TabletQueueList from './TabletQueueList';
import { useI18n } from '../../../i18n';

// The "Up Next" card on the Player tab used to expand TabletQueueList in
// place, but that pane (.rt-main--player) is deliberately non-scrolling in
// landscape — a queue longer than a couple of rows had nowhere to go and
// just got clipped by overflow-y:hidden, with no way to reach the rest of
// it. This is a real modal instead: scrim + centered card with its own
// overflow-y:auto, portaled to document.body so it isn't anchored to
// .rt-content-inner (that pane permanently carries `transform: translateX(0)`
// from its tab-switch entrance animation even after the animation ends —
// still a real transform value, so it establishes a containing block that
// would misplace a plain position:fixed child; see .rt-dock in
// TabletShell.jsx for the same gotcha).
export default function TabletQueueModal({ onClose }) {
  const { C, darkMode } = useContext(Tk);
  const { t } = useI18n();

  const panelBg = darkMode
    ? { background: 'rgba(10,14,28,0.97)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' }
    : { background: 'rgba(249,249,249,0.97)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' };

  return createPortal(
    <div className="remote-root fixed inset-0 z-[9999] flex items-center justify-center p-8"
      style={{ '--rc-outline': C.outline, '--rc-champagne': C.champagne, '--rc-container': C.container }}
      onClick={onClose}>
      <div className="absolute inset-0 remote-scrim" />
      <div
        className="relative w-full rounded-3xl overflow-hidden flex flex-col remote-sheet-in"
        style={{ ...panelBg, border: `0.5px solid ${C.outline}`, maxWidth: 480, maxHeight: '75vh' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: `0.5px solid ${C.outline}` }}>
          <div className="flex items-center gap-2">
            <ListMusic className="h-5 w-5" style={{ color: C.champagne }} />
            <span className="text-[17px] font-semibold" style={{ color: C.text1 }}>{t('queue.upNext') || 'Up Next'}</span>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
            <X className="h-4 w-4" style={{ color: C.text3 }} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          <TabletQueueList />
        </div>
      </div>
    </div>,
    document.body
  );
}
