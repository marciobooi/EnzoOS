import React, { useContext } from 'react';
import { Tk } from '../remote/shared';

export default function SkeletonList({ count = 5 }) {
  const { C, cardWhite } = useContext(Tk);
  const shimmer = {
    background: `linear-gradient(90deg, ${C.containerLow} 25%, ${C.container} 50%, ${C.containerLow} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
  };
  return (
    <div className="rounded-xl overflow-hidden" style={cardWhite}>
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
          )}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl shrink-0" style={shimmer} />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-3 rounded-full" style={{ width: `${50 + (i * 13) % 35}%`, ...shimmer }} />
              <div className="h-2.5 rounded-full" style={{ width: `${30 + (i * 9) % 25}%`, ...shimmer }} />
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
