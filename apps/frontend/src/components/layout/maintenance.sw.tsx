'use client';

import { FC, useEffect } from 'react';

// Cài "nhân viên trực" trang bảo trì (public/sw-maintenance.js): khi server sập
// lúc deploy, trình duyệt của người ĐÃ TỪNG mở app hiện trang mascot sư tử thay
// cho lỗi trần "no available server" của Traefik, tự vào lại khi server sống.
// Tầng thứ 2 (phủ khách chưa từng mở app) là Cloudflare Worker —
// docs/cloudflare-worker-bao-tri.js.
export const MaintenanceSw: FC = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw-maintenance.js').catch(() => null);
  }, []);
  return null;
};
