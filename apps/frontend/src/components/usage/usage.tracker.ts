'use client';

// ============================================================================
//  Thu thập sử dụng (chuẩn Major OS v1) — phía trình duyệt.
//
//  Người dùng Hub là NHÂN VIÊN truyền thông, nên ta đo các việc của nghề:
//  lên lịch / đăng bài, lịch, kênh, thư viện media, AI, Zalo… (bảng khoá ở
//  docs/THU_THAP_SU_DUNG.md). Trình duyệt KHÔNG gửi thẳng Major OS: gom lô về
//  máy chủ Hub (/usage/events), máy chủ gắn email/tên từ phiên đăng nhập rồi
//  mới chuyển tiếp bằng khoá app.
//
//  LUẬT CỨNG: bài viết có ảnh/tên học sinh — `them` chỉ chứa SỐ ĐẾM và MÃ
//  (facebook, week…), không bao giờ caption, tên file, tên kênh, tên nhóm.
//
//  - Một lần tải trang = một phiên (phien_id giữ trong bộ nhớ).
//  - `nhip` mỗi 30 giây khi tab đang hiện; tab hiện lại -> nhịp ngay.
//  - Gửi mỗi 60 giây / đủ 50 sự kiện / khi tab ẩn hoặc rời trang (keepalive).
//  - Gửi lỗi (mất mạng, 429, 5xx) -> giữ lại; sắp rời trang thì cất vào
//    localStorage, lần mở sau gửi tiếp (Major OS chống trùng theo `id`).
// ============================================================================

export type UsageResult = 'thanh_cong' | 'loi';
export type UsageExtra = Record<string, string | number | boolean>;

export type UsageEvent = {
  id: string;
  loai: string;
  luc: string;
  phien_id: string;
  trang?: string;
  tinh_nang?: string;
  thoi_luong_ms?: number;
  ket_qua?: UsageResult;
  thiet_bi?: string;
  them?: UsageExtra;
};

/** true = xong (đã nhận hoặc lỗi vĩnh viễn, bỏ); false = gửi lại sau. */
export type UsageSender = (
  events: UsageEvent[],
  keepalive: boolean
) => Promise<boolean>;

const BEAT_MS = 30_000;
const FLUSH_MS = 60_000;
const FLUSH_AT = 50;
const MAX_QUEUE = 2000;
// Major OS từ chối sự kiện cũ hơn 7 ngày — chừa 1 giờ cho đường truyền.
const MAX_AGE_MS = 7 * 24 * 3600_000 - 3600_000;
const STORE_PREFIX = 'hub_usage_q_';

const isBrowser = () => typeof window !== 'undefined';

// crypto.randomUUID chỉ có trên HTTPS/localhost; mở Hub qua IP LAN (http)
// thì tự dựng uuid v4 từ getRandomValues.
const uuid = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
};

const detectDevice = () => {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua))) {
    return 'may_tinh_bang';
  }
  // iPadOS báo UA như Mac — nhận ra nhờ màn cảm ứng.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) {
    return 'may_tinh_bang';
  }
  if (/Mobi|iPhone|Android/i.test(ua)) return 'dien_thoai';
  return 'may_tinh';
};

// Đường dẫn: bỏ query/hash; đoạn trông như mã (cuid, uuid, số dài) -> :id
// để /p/cm3x…/preview không thành hàng nghìn "trang" khác nhau.
export const normalizePath = (path: string) =>
  (path.split(/[?#]/)[0] || '/')
    .split('/')
    .map((seg) =>
      /^\d{4,}$/.test(seg) ||
      (seg.length >= 16 && /\d/.test(seg) && /^[A-Za-z0-9_-]+$/.test(seg))
        ? ':id'
        : seg
    )
    .join('/')
    .slice(0, 300);

let sessionId = '';
let device: string | undefined;
let queue: UsageEvent[] = [];
let sender: UsageSender | null = null;
let sending = false;
let inflight: UsageEvent[] = [];
let started = false;
let lastPage = '';

const push = (e: Omit<UsageEvent, 'id' | 'luc' | 'phien_id'>) => {
  if (!isBrowser()) return;
  if (!sessionId) sessionId = uuid().replace(/-/g, '').slice(0, 24);
  queue.push({
    id: uuid(),
    luc: new Date().toISOString(),
    phien_id: sessionId,
    ...(device ? { thiet_bi: device } : {}),
    ...e,
  });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  // Trang không gắn UsageTracker (vd trang quay về sau OAuth kết nối kênh):
  // cất ngay để trang có tracker kế tiếp nhận và gửi.
  if (!started) persist();
  else if (queue.length >= FLUSH_AT) void flush(false);
};

const flush = async (keepalive: boolean) => {
  if (!sender || sending || !queue.length) return;
  const now = Date.now();
  queue = queue.filter((e) => now - Date.parse(e.luc) < MAX_AGE_MS);
  // Rời trang: bắn tối đa 3 lô keepalive (giới hạn ~64KB của trình duyệt),
  // phần dư cất localStorage. Bình thường: gửi lần lượt tới khi hết/lỗi.
  sending = true;
  try {
    for (let i = 0; queue.length && (!keepalive || i < 3); i++) {
      const batch = queue.splice(0, FLUSH_AT);
      if (keepalive) {
        // Tab chỉ bị ẩn (chưa đóng) mà gửi hỏng -> trả về hàng đợi gửi lại.
        void sender(batch, true).then((ok) => {
          if (!ok) queue = [...batch, ...queue];
        });
        continue;
      }
      inflight = batch;
      const ok = await sender(batch, false);
      inflight = [];
      if (!ok) {
        queue = [...batch, ...queue];
        break;
      }
    }
  } finally {
    sending = false;
  }
};

const storeKey = () => STORE_PREFIX + sessionId;

const persist = () => {
  try {
    // Gồm cả lô đang gửi dở: rời trang giữa chừng thì lần sau gửi lại.
    const rest = [...inflight, ...queue];
    if (rest.length) {
      localStorage.setItem(storeKey(), JSON.stringify(rest));
    } else {
      localStorage.removeItem(storeKey());
    }
  } catch {
    /* hết chỗ / chế độ riêng tư — bỏ qua */
  }
};

// Nhận lại hàng đợi các lần mở trước (kể cả tab khác đã đóng). Lỡ "nhận" cả
// hàng của một tab còn sống thì cùng lắm gửi trùng — Major OS gộp theo id.
const adoptStored = () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORE_PREFIX) || key === storeKey()) continue;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.removeItem(key);
      if (Array.isArray(list)) queue.unshift(...list);
    }
  } catch {
    /* dữ liệu hỏng — bỏ */
  }
};

/** Gắn hàm gửi (đi qua useFetch: cookie đăng nhập, showorg, base URL). */
export const setUsageSender = (fn: UsageSender | null) => {
  sender = fn;
};

/** Bật theo dõi cho tab này. Trả về hàm dọn (gỡ listener/timer). */
export const startUsageTracking = () => {
  if (!isBrowser() || started) return () => {};
  started = true;
  device = detectDevice();
  push({ loai: 'phien_bat_dau' });
  adoptStored();

  const beat = () => {
    if (document.visibilityState === 'visible') push({ loai: 'nhip' });
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Hàng đợi vẫn trong bộ nhớ — bỏ bản cất lúc ẩn để khỏi gửi trùng.
      try {
        localStorage.removeItem(storeKey());
      } catch {
        /* bỏ qua */
      }
      beat();
    } else {
      // Điện thoại chuyển app thường KHÔNG có pagehide — gửi luôn lúc ẩn.
      void flush(true);
      persist();
    }
  };
  const onPageHide = () => {
    push({ loai: 'phien_ket_thuc' });
    void flush(true);
    persist();
  };
  // Quay lại từ bfcache = phiên mới.
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    sessionId = '';
    push({ loai: 'phien_bat_dau' });
    if (lastPage) push({ loai: 'xem_trang', trang: lastPage });
  };

  const beatTimer = window.setInterval(beat, BEAT_MS);
  const flushTimer = window.setInterval(() => {
    void flush(false);
  }, FLUSH_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  beat();
  // Lô đầu gửi sớm để hàng đợi cũ (nếu có) không phải chờ 60 giây.
  const firstFlush = window.setTimeout(() => {
    void flush(false);
  }, 5000);

  return () => {
    window.clearInterval(beatTimer);
    window.clearInterval(flushTimer);
    window.clearTimeout(firstFlush);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    started = false;
  };
};

export const trackPageView = (pathname: string) => {
  const trang = normalizePath(pathname);
  if (trang === lastPage) return;
  lastPage = trang;
  push({ loai: 'xem_trang', trang });
};

/**
 * Ghi một thao tác có ý nghĩa. `key` dạng `nhom.hanh-dong`
 * (vd `bai-viet.len-lich`) — khoá cố định, đổi chữ trên nút không đổi khoá.
 */
export const trackFeature = (
  key: string,
  opts: { result?: UsageResult; durationMs?: number; extra?: UsageExtra } = {}
) => {
  push({
    loai: 'dung_tinh_nang',
    tinh_nang: key,
    ...(lastPage ? { trang: lastPage } : {}),
    ket_qua: opts.result || 'thanh_cong',
    ...(opts.durationMs != null
      ? { thoi_luong_ms: Math.max(0, Math.round(opts.durationMs)) }
      : {}),
    ...(opts.extra ? { them: opts.extra } : {}),
  });
};

/** Thao tác thất bại. `code` là mã ngắn (HTTP_500, HET_THOI_GIAN…). */
export const trackFeatureError = (
  key: string,
  code?: string | number,
  extra?: UsageExtra
) => {
  push({
    loai: 'loi',
    tinh_nang: key,
    ...(lastPage ? { trang: lastPage } : {}),
    them: { ...(extra || {}), ...(code != null ? { ma_loi: String(code) } : {}) },
  });
};

/** Bấm giờ một thao tác: `const done = startTimer(); … done()` -> ms. */
export const startTimer = () => {
  const t = performance.now();
  return () => Math.round(performance.now() - t);
};
