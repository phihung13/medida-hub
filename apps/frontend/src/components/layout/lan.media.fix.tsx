'use client';

import { FC, useEffect } from 'react';

// ============================================================================
//  Vá TOÀN CỤC cho truy cập LAN (điện thoại/tablet mở http://<IP>:4200):
//  media cũ trong DB lưu URL tuyệt đối http://localhost:4200/uploads/... —
//  trên thiết bị khác "localhost" là chính thiết bị đó → ảnh/video chết hàng
//  loạt ở mọi component render path trực tiếp. Thay vì sửa hàng chục chỗ,
//  quan sát DOM và đổi host của các src localhost theo host trang đang mở.
//  Trên máy chủ (mở bằng localhost) component này không làm gì.
// ============================================================================

const LOCAL_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?=\/)/i;

export const LanMediaFix: FC = () => {
  useEffect(() => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return; // đang mở trên chính máy chủ — không cần vá
    }
    // Thay NGUYÊN origin (scheme+host+port) bằng origin trang đang mở —
    // đúng cho cả LAN (http://IP:4200) lẫn tunnel public (https://...):
    const origin = window.location.origin;

    const fixEl = (el: Element) => {
      if (
        el instanceof HTMLImageElement ||
        el instanceof HTMLVideoElement ||
        el instanceof HTMLSourceElement
      ) {
        const src = el.getAttribute('src');
        if (src && LOCAL_RE.test(src)) {
          el.setAttribute('src', src.replace(LOCAL_RE, origin));
        }
      }
    };

    const scan = (root: ParentNode) => {
      if (root instanceof Element) {
        fixEl(root);
      }
      root.querySelectorAll?.('img, video, source').forEach(fixEl);
    };

    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.target instanceof Element) {
          fixEl(m.target);
        }
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            scan(n);
          }
        });
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    return () => observer.disconnect();
  }, []);

  return null;
};

export default LanMediaFix;
