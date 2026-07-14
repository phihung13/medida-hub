'use client';

import { useSyncExternalStore } from 'react';

// ============================================================================
//  useIsMobile — nguồn sự thật DUY NHẤT cho "đang ở bố cục mobile?" phía JS.
//  Khớp đúng breakpoint mobile: của Tailwind (max-width 1025px, xem
//  tailwind.config.cjs) — đừng tự matchMedia rải rác nữa.
//  SSR trả false (server không có window) → desktop-first, khớp markup gốc.
// ============================================================================

const QUERY = '(max-width: 1025px)';

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

export const useIsMobile = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
