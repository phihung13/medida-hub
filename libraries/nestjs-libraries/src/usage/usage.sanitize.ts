import { randomUUID } from 'crypto';

// ============================================================================
//  Làm sạch sự kiện / góp ý từ TRÌNH DUYỆT trước khi lưu DB — Major OS đọc
//  lại qua API /major-os/v1/* (chuẩn "Kết nối app với Major OS" v2).
//
//  - Chỉ giữ đúng các trường đã định, sai kiểu thì bỏ sự kiện đó.
//  - KHÔNG nhận email/tên từ trình duyệt: máy chủ gắn từ phiên đăng nhập
//    (trình duyệt tự khai thì giả được).
//  - Hub là app truyền thông: bài viết có ảnh/tên học sinh, nên tuyệt đối không
//    đưa nội dung bài, caption, tên file vào `them`/`trang`/`tinh_nang` — chỉ
//    số đếm và mã nền tảng (facebook, zalo…). Lưới chặn ở đây: `them` chỉ
//    nhận số / boolean / chuỗi ngắn dạng mã.
// ============================================================================

export const EVENT_TYPES = [
  'phien_bat_dau',
  'nhip',
  'phien_ket_thuc',
  'xem_trang',
  'dung_tinh_nang',
  'loi',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const SESSION_TYPES = new Set<string>(['phien_bat_dau', 'nhip', 'phien_ket_thuc']);
const RESULTS = new Set(['thanh_cong', 'loi']);
const DEVICES = new Set(['may_tinh', 'dien_thoai', 'may_tinh_bang', 'khac']);
const FEEDBACK_TYPES = new Set(['loi', 'de_xuat', 'khen', 'khac']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const FEATURE_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
// Chuỗi trong `them` chỉ được là mã ngắn (vd "facebook", "week", "HET_THOI_GIAN"),
// không phải câu chữ người dùng gõ.
const CODE_RE = /^[A-Za-z0-9._:-]{1,40}$/;

const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

export type UsageIdentity = { email?: string; ten?: string };

export type OutEvent = {
  id: string;
  loai: EventType;
  luc: string;
  email?: string;
  ten?: string;
  phien_id?: string;
  trang?: string;
  tinh_nang?: string;
  thoi_luong_ms?: number;
  ket_qua?: 'thanh_cong' | 'loi';
  thiet_bi?: string;
  phien_ban_app?: string;
  them?: Record<string, string | number | boolean>;
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// Giờ ISO có múi giờ, không cũ hơn 7 ngày, không ở tương lai quá 5 phút.
const validTime = (v: unknown, now: number) => {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t) || t < now - MAX_AGE_MS || t > now + MAX_FUTURE_MS) return null;
  return s;
};

// Đường dẫn trang: bỏ ?query và #hash, chỉ giữ phần path. Major OS còn tự thay
// số dài / uuid / email bằng :so / :id / :email.
const cleanPath = (v: unknown) => {
  const s = str(v).split(/[?#]/)[0].trim();
  if (!s.startsWith('/') || s.length > 300) return null;
  return s;
};

const cleanExtra = (v: unknown) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (n >= 12 || !/^[a-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    else if (typeof val === 'boolean') out[k] = val;
    else if (typeof val === 'string' && CODE_RE.test(val)) out[k] = val;
    else continue;
    n++;
  }
  return n ? out : undefined;
};

/** Làm sạch MỘT sự kiện từ trình duyệt; sai luật -> null (bỏ). */
export function sanitizeEvent(raw: any, who: UsageIdentity, now = Date.now()): OutEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const loai = str(raw.loai) as EventType;
  if (!(EVENT_TYPES as readonly string[]).includes(loai)) return null;
  const id = str(raw.id);
  if (!UUID_RE.test(id)) return null;
  const luc = validTime(raw.luc, now);
  if (!luc) return null;

  const ev: OutEvent = { id, loai, luc };
  if (who.email) ev.email = who.email;
  if (who.ten) ev.ten = who.ten.slice(0, 120);

  const phien = str(raw.phien_id);
  if (phien) {
    if (!SESSION_RE.test(phien)) return null;
    ev.phien_id = phien;
  } else if (SESSION_TYPES.has(loai)) {
    return null;
  }

  if (raw.trang != null) {
    const p = cleanPath(raw.trang);
    if (p) ev.trang = p;
  }
  if (loai === 'xem_trang' && !ev.trang) return null;

  const feature = str(raw.tinh_nang);
  if (feature) {
    if (!FEATURE_RE.test(feature)) return null;
    ev.tinh_nang = feature;
  }
  if (loai === 'dung_tinh_nang' && !ev.tinh_nang) return null;

  if (raw.thoi_luong_ms != null) {
    const ms = Math.round(Number(raw.thoi_luong_ms));
    if (Number.isFinite(ms) && ms >= 0 && ms <= 86_400_000) ev.thoi_luong_ms = ms;
  }

  if (loai === 'loi') ev.ket_qua = 'loi';
  else if (RESULTS.has(str(raw.ket_qua))) ev.ket_qua = raw.ket_qua;
  else if (loai === 'dung_tinh_nang') ev.ket_qua = 'thanh_cong';

  if (DEVICES.has(str(raw.thiet_bi))) ev.thiet_bi = raw.thiet_bi;
  const ver = str(raw.phien_ban_app);
  if (ver && ver.length <= 40) ev.phien_ban_app = ver;

  const extra = cleanExtra(raw.them);
  if (extra) ev.them = extra;
  return ev;
}

export type OutFeedback = {
  id: string;
  luc: string;
  loai: string;
  noi_dung: string;
  email?: string;
  ten?: string;
  tinh_nang?: string;
  muc_hai_long?: number;
  trang?: string;
};

/** Làm sạch góp ý; sai luật -> chuỗi lý do để báo lại người dùng. */
export function sanitizeFeedback(raw: any, who: UsageIdentity): OutFeedback | string {
  if (!raw || typeof raw !== 'object') return 'Góp ý không hợp lệ';
  const loai = str(raw.loai);
  if (!FEEDBACK_TYPES.has(loai)) return 'Loại góp ý không hợp lệ';
  const noiDung = str(raw.noi_dung).trim();
  if (!noiDung) return 'Nội dung góp ý đang trống';
  if (noiDung.length > 4000) return 'Góp ý dài quá 4.000 ký tự';
  const id = UUID_RE.test(str(raw.id)) ? str(raw.id) : randomUUID();
  const fb: OutFeedback = { id, luc: new Date().toISOString(), loai, noi_dung: noiDung };
  if (who.email) fb.email = who.email;
  if (who.ten) fb.ten = who.ten.slice(0, 120);
  const feature = str(raw.tinh_nang);
  if (feature && FEATURE_RE.test(feature)) fb.tinh_nang = feature;
  const m = Number(raw.muc_hai_long);
  if (Number.isInteger(m) && m >= 1 && m <= 5) fb.muc_hai_long = m;
  const p = cleanPath(raw.trang);
  if (p) fb.trang = p;
  return fb;
}
