import { useCallback } from 'react';

const isLocalHostname = (h: string) => h === 'localhost' || h === '127.0.0.1';

// Media local được lưu trong DB dạng URL tuyệt đối http://localhost:4200/uploads/...
// Khi mở app từ nơi khác (điện thoại LAN http://<IP>:4200 hoặc tunnel public
// https://xxx.trycloudflare.com), localhost = chính thiết bị đang xem → ảnh
// chết. File vẫn do frontend serve nên chỉ cần thay NGUYÊN origin bằng origin
// của trang đang mở (đúng cả port lẫn https của tunnel).
export const fixMediaHost = (path: string) => {
  if (!path || typeof window === 'undefined') {
    return path;
  }
  try {
    const u = new URL(path);
    if (isLocalHostname(u.hostname) && !isLocalHostname(window.location.hostname)) {
      return window.location.origin + u.pathname + u.search;
    }
  } catch {
    /* path tương đối — giữ nguyên */
  }
  return path;
};

export const useMediaDirectory = () => {
  const set = useCallback((path: string) => {
    return fixMediaHost(path);
  }, []);
  return {
    set,
  };
};
