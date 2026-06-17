import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { subscribe } from '../../lib/toast';

export default function ToastContainer({ bottomOffset = 24 }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => subscribe(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse gap-2 items-center pointer-events-none"
      style={{ bottom: bottomOffset }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl pointer-events-auto
            ${t.exiting ? 'toast-exit' : 'toast-enter'}`}
          style={{
            background: 'rgba(10, 14, 28, 0.93)',
            backdropFilter: 'blur(24px) saturate(180%)',
            border: '0.5px solid rgba(255,255,255,0.11)',
            borderLeft: t.type === 'success'
              ? '2px solid rgba(201,168,76,0.7)'
              : '2px solid rgba(248,113,113,0.6)',
            boxShadow: [
              '0 8px 28px rgba(0,0,0,0.55)',
              'inset 0 1px 0 rgba(255,255,255,0.07)',
              t.type === 'success'
                ? '0 0 0 0.5px rgba(201,168,76,0.12)'
                : '0 0 0 0.5px rgba(248,113,113,0.12)',
            ].join(', '),
          }}
        >
          {t.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#c9a84c' }} />
            : <AlertCircle  className="h-4 w-4 shrink-0 text-rose-400" />
          }
          <span className="text-[13px] font-medium text-zinc-100 whitespace-nowrap max-w-[280px] truncate"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            {t.message}
          </span>
        </div>
      ))}
    </div>
  );
}
