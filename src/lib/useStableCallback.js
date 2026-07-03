import { useRef, useCallback, useLayoutEffect } from 'react';

// Returns a function whose identity never changes across renders but which
// always invokes the latest closure. For event handlers only (onPress /
// onClick / WS callbacks) — never call the result during render.
//
// Why not plain useCallback: the kiosk/remote context values are built with
// useMemo over ~20 handler functions; with inline handlers the memo
// recomputed every render and every context consumer re-rendered constantly
// (AUDIT-2026-07-03.md §B.1). useCallback would need a correct dependency
// list per handler (and most close over half the component's state);
// a ref-backed stable wrapper gives the same identity-stability without
// stale-closure risk, at the cost of being render-unsafe — fine for
// handlers, which all of these are.
export function useStableCallback(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...args) => ref.current(...args), []);
}
