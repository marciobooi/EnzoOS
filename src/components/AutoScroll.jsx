import { useEffect, useRef, useState } from 'react';

// Conditional text ticker — scrolls only when text is wider than its container.
// A hidden absolute-positioned measurement span gives accurate scrollWidth
// without affecting layout. No ResizeObserver — the kiosk has a fixed width
// so we only recheck when the text content itself changes.
export default function AutoScroll({ children, outerClass = '', innerClass = '', speed = 70, minDuration = 6 }) {
  const containerRef = useRef(null);
  const measureRef   = useRef(null);
  const [scrolling, setScrolling] = useState(false);
  const [duration,  setDuration]  = useState(10);

  useEffect(() => {
    const container = containerRef.current;
    const measure   = measureRef.current;
    if (!container || !measure) return;
    // Single synchronous read — no ResizeObserver so no feedback loop.
    const overflows = measure.scrollWidth > container.clientWidth + 2;
    setScrolling(overflows);
    if (overflows) {
      const excess = measure.scrollWidth - container.clientWidth;
      setDuration(Math.max(minDuration, excess / speed));
    } else {
      setScrolling(false);
    }
  }, [children, speed, minDuration]);

  return (
    <div ref={containerRef} className={`overflow-hidden relative ${outerClass}`}>
      {/* Hidden single-copy — accurate width measurement, never affects layout */}
      <span ref={measureRef} aria-hidden="true" className={innerClass}
        style={{ position: 'absolute', visibility: 'hidden',
                 whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {children}
      </span>
      {/* Visible — ellipsis when fits, ticker when overflows */}
      <span className={innerClass}
        style={scrolling
          ? { display: 'inline-block', whiteSpace: 'nowrap',
              animation: `marquee ${duration + minDuration}s linear infinite` }
          : { display: 'block', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {scrolling
          ? <>{children}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{children}</>
          : children}
      </span>
    </div>
  );
}
