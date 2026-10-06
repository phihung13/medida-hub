import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  UsageCursor,
  UsageRepository,
} from '@gitroom/nestjs-libraries/database/prisma/usage/usage.repository';
import { ContentStatsRepository } from '@gitroom/nestjs-libraries/database/prisma/usage/content-stats.repository';
import {
  OutEvent,
  sanitizeEvent,
  sanitizeFeedback,
  UsageIdentity,
} from '@gitroom/nestjs-libraries/usage/usage.sanitize';

// ============================================================================
//  Thu thập sử dụng & góp ý — chuẩn "Kết nối app với Major OS" v2.
//
//  Hub TỰ LƯU sự kiện (trình duyệt gửi về /usage/events) và góp ý. Major OS
//  gọi API chỉ đọc /major-os/v1/* (~15 phút/lần) bằng key do Hub cấp ở
//  Cài đặt → Kết nối Major OS. Mô tả API gửi Major OS:
//  apps/frontend/public/major-os-mo-ta.md
// ============================================================================

const MAX_PER_REQUEST = 100;
const USER_LIMIT_PER_MIN = 600;
const KEY_LIMIT_PER_MIN = 120;
const MAX_ACTIVE_KEYS = 3;
const RETENTION_DAYS = 180;
const MAX_RANGE_DAYS = 190;
const DEFAULT_PAGE = 500;
const MAX_PAGE = 1000;
const STAFF_DOMAIN = '@truongvietanh.com';

const ISO_TZ_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Giờ Việt Nam cố định +07:00 (không có giờ mùa hè).
const toVn = (d: Date) =>
  new Date(d.getTime() + 7 * 3600_000).toISOString().replace('Z', '+07:00');

// Nhân viên (@truongvietanh.com): email + họ tên. Người khác: chỉ mã nội bộ
// của Hub — Major OS đếm được nhưng không biết là ai.
const person = (userId: string, email: string, name: string | null) =>
  email.toLowerCase().endsWith(STAFF_DOMAIN)
    ? { email, ...(name ? { ten: name } : {}) }
    : { ma: userId };

const encodeCursor = (c: object) =>
  Buffer.from(JSON.stringify(c)).toString('base64url');

const decodeCursor = (s?: string): any => {
  if (!s) return undefined;
  try {
    return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException({ loi: 'trang_sau không hợp lệ' });
  }
};

export type ReportQuery = {
  tu?: string;
  den?: string;
  trang_sau?: string;
  so_dong?: string;
};

@Injectable()
export class UsageService implements OnModuleDestroy {
  private readonly logger = new Logger('UsageService');
  private readonly perUser = new Map<string, { start: number; count: number }>();
  private readonly perKey = new Map<string, { start: number; count: number }>();
  private readonly pruneTimer: ReturnType<typeof setInterval>;

  constructor(
    private _usageRepository: UsageRepository,
    private _contentStats: ContentStatsRepository
  ) {
    // Dọn dữ liệu thô quá 180 ngày, 6 giờ/lần.
    this.pruneTimer = setInterval(() => this.prune(), 6 * 3600_000);
    this.pruneTimer.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.pruneTimer);
  }

  private async prune() {
    try {
      await this._usageRepository.pruneBefore(
        new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000)
      );
    } catch (e: any) {
      this.logger.warn(`Dọn dữ liệu sử dụng cũ lỗi: ${e?.message || e}`);
    }
  }

  private allow(
    map: Map<string, { start: number; count: number }>,
    key: string,
    limit: number,
    amount = 1
  ) {
    const now = Date.now();
    const slot = map.get(key);
    const win = slot && now - slot.start < 60_000 ? slot : { start: now, count: 0 };
    map.set(key, win);
    if (map.size > 5000) map.clear();
    const room = Math.max(0, limit - win.count);
    const granted = Math.min(room, amount);
    win.count += granted;
    return granted;
  }

  // ---- nhận từ trình duyệt ---------------------------------------------------

  /** Lưu một lô sự kiện của người đang đăng nhập. */
  async accept(rawEvents: unknown, who: UsageIdentity, userId: string) {
    if (!Array.isArray(rawEvents)) return { nhan: 0, bo: 0 };
    const list = rawEvents.slice(0, MAX_PER_REQUEST);
    const now = Date.now();
    const clean = list
      .map((raw) => sanitizeEvent(raw, who, now))
      .filter((e): e is OutEvent => !!e);
    // Hạn mức theo người: một tab lỗi lặp vô hạn không được làm ngập DB.
    const room = this.allow(this.perUser, userId, USER_LIMIT_PER_MIN, clean.length);
    const keep = clean.slice(0, room);
    if (keep.length) await this._usageRepository.insertEvents(userId, keep);
    return { nhan: keep.length, bo: list.length - keep.length };
  }

  async feedback(raw: unknown, who: UsageIdentity, userId: string) {
    const fb = sanitizeFeedback(raw, who);
    if (typeof fb === 'string') return { ok: false, error: fb };
    if (!this.allow(this.perUser, `gop-y:${userId}`, 10)) {
      return { ok: false, error: 'Đang gửi nhiều quá — thử lại sau ít phút.' };
    }
    await this._usageRepository.insertFeedback(userId, fb);
    return { ok: true };
  }

  // ---- key cho Major OS ------------------------------------------------------

  listKeys() {
    return this._usageRepository.activeKeys();
  }

  /** Tạo key mới — key gốc chỉ trả về đúng lần này, DB chỉ giữ sha256. */
  async createKey(createdBy: string) {
    const active = await this._usageRepository.activeKeys();
    if (active.length >= MAX_ACTIVE_KEYS) {
      throw new BadRequestException(
        `Đã có ${MAX_ACTIVE_KEYS} key — thu hồi bớt key cũ trước khi tạo key mới.`
      );
    }
    const key = `mhk_${randomBytes(24).toString('hex')}`;
    const row = await this._usageRepository.createKey(
      sha256(key),
      key.slice(-4),
      createdBy
    );
    return { ...row, key };
  }

  revokeKey(id: string) {
    return this._usageRepository.revokeKey(id);
  }

  /** Kiểm key trong header Authorization: Bearer <key>. Sai -> 401. */
  async verifyKey(authorization?: string) {
    const key = /^Bearer\s+(\S+)$/i.exec(authorization || '')?.[1];
    const row = key ? await this._usageRepository.findActiveKey(sha256(key)) : null;
    if (!row) {
      throw new UnauthorizedException({ loi: 'Key sai hoặc đã bị thu hồi' });
    }
    if (!this.allow(this.perKey, row.id, KEY_LIMIT_PER_MIN)) {
      throw new HttpException(
        { loi: `Quá ${KEY_LIMIT_PER_MIN} lần gọi/phút — thử lại sau` },
        429
      );
    }
    // Ghi "lần cuối Major OS gọi" thưa thôi (5 phút/lần), đỡ ghi DB mỗi lượt.
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
      this._usageRepository.touchKey(row.id).catch(() => undefined);
    }
  }

  // ---- báo cáo cho Major OS ----------------------------------------------------

  private range(q: ReportQuery) {
    const parse = (v: string | undefined, name: string) => {
      if (!v) return undefined;
      const t = Date.parse(v);
      if (!ISO_TZ_RE.test(v) || !Number.isFinite(t)) {
        throw new BadRequestException({
          loi: `${name} phải là giờ ISO 8601 có múi giờ, vd 2026-10-04T08:00:00+07:00`,
        });
      }
      return new Date(t);
    };
    const to = parse(q.den, 'den') || new Date();
    const from = parse(q.tu, 'tu') || new Date(to.getTime() - 24 * 3600_000);
    if (from >= to) throw new BadRequestException({ loi: 'tu phải trước den' });
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 3600_000) {
      throw new BadRequestException({
        loi: `Mỗi lần lấy tối đa ${MAX_RANGE_DAYS} ngày`,
      });
    }
    const size = Math.min(MAX_PAGE, Math.max(1, Number(q.so_dong) || DEFAULT_PAGE));
    return { from, to, size };
  }

  private cursor(q: ReportQuery): UsageCursor | undefined {
    const c = decodeCursor(q.trang_sau);
    if (!c) return undefined;
    const t = new Date(c.t);
    if (!Number.isFinite(t.getTime()) || typeof c.id !== 'string') {
      throw new BadRequestException({ loi: 'trang_sau không hợp lệ' });
    }
    return { t, id: c.id };
  }

  private page<T extends { id: string; createdAt: Date }>(rows: T[], size: number) {
    const more = rows.length > size;
    const items = more ? rows.slice(0, size) : rows;
    const last = items[items.length - 1];
    return {
      items,
      trang_sau:
        more && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  /** Mỗi dòng = một lần dùng tính năng (hoặc một lần lỗi). */
  async featureReport(q: ReportQuery) {
    const { from, to, size } = this.range(q);
    const rows = await this._usageRepository.listFeatureEvents(
      from,
      to,
      size + 1,
      this.cursor(q)
    );
    const { items, trang_sau } = this.page(rows, size);
    return {
      du_lieu: items.map((e) => ({
        id: e.id,
        luc: toVn(e.occurredAt),
        nhan_luc: toVn(e.createdAt),
        nguoi: person(e.userId, e.email, e.name),
        loai: e.type,
        tinh_nang: e.feature,
        ket_qua: e.result || (e.type === 'loi' ? 'loi' : 'thanh_cong'),
        so_lan: 1,
        ...(e.durationMs != null ? { thoi_luong_ms: e.durationMs } : {}),
        ...(e.page ? { trang: e.page } : {}),
        ...(e.device ? { thiet_bi: e.device } : {}),
        ...(e.extra ? { them: e.extra } : {}),
      })),
      trang_sau,
    };
  }

  /** Mỗi dòng = thời gian dùng Hub của một người trong một ngày. */
  async dailyReport(q: ReportQuery) {
    const { from, to, size } = this.range(q);
    const rows = await this._usageRepository.dailyUsage(from, to);
    const offset = Math.max(0, Number(decodeCursor(q.trang_sau)?.o) || 0);
    const items = rows.slice(offset, offset + size);
    return {
      du_lieu: items.map((r) => {
        const ngay = r.day.toISOString().slice(0, 10);
        return {
          id: `tg_${r.userId}_${ngay}`,
          ngay,
          luc: `${ngay}T00:00:00+07:00`,
          cap_nhat_luc: toVn(r.updated),
          nguoi: person(r.userId, r.email, r.name),
          tinh_nang: 'hub.su-dung',
          so_phut: r.cells / 2,
          so_phien: r.sessions,
          so_thao_tac: r.actions,
        };
      }),
      trang_sau:
        offset + size < rows.length ? encodeCursor({ o: offset + size }) : null,
    };
  }

  async feedbackReport(q: ReportQuery) {
    const { from, to, size } = this.range(q);
    const rows = await this._usageRepository.listFeedback(
      from,
      to,
      size + 1,
      this.cursor(q)
    );
    const { items, trang_sau } = this.page(rows, size);
    return {
      du_lieu: items.map((f) => ({
        id: f.id,
        luc: toVn(f.createdAt),
        nguoi: person(f.userId, f.email, f.name),
        loai: f.type,
        noi_dung: f.content,
        ...(f.rating != null ? { muc_hai_long: f.rating } : {}),
        ...(f.feature ? { tinh_nang: f.feature } : {}),
        ...(f.page ? { trang: f.page } : {}),
      })),
      trang_sau,
    };
  }

  /**
   * Nội dung LÀM RA và được DÙNG, theo ngày / agent / kênh / loại.
   * Mỗi dòng = SỐ HIỆN TẠI của một nhóm bài làm ra trong một ngày VN — Major
   * OS ghi đè theo `id` (bài đổi trạng thái sau đó thì lượt lấy sau trả lại
   * cùng `id` với số mới). `tu`/`den` chọn các ngày có thay đổi trong khoảng.
   */
  async contentReport(q: ReportQuery) {
    const { from, to, size } = this.range(q);
    const [postDays, viralDays] = await Promise.all([
      this._contentStats.postDaysTouched(from, to),
      this._contentStats.viralDaysTouched(from, to),
    ]);
    const [posts, viral] = await Promise.all([
      this._contentStats.postsByDay(postDays.map((d) => d.ngay)),
      this._contentStats.viralByDay(viralDays.map((d) => d.ngay)),
    ]);

    const rows = [
      ...posts.map((r) => {
        const dung = r.cho_dang + r.da_dang + r.loi;
        return {
          id: `nd_${r.ngay}_${r.agent}_${r.kenh}_${r.loai}`,
          nguon: 'bai-dang',
          ngay: r.ngay,
          luc: `${r.ngay}T00:00:00+07:00`,
          cap_nhat_luc: toVn(r.cap_nhat),
          agent: r.agent,
          kenh: r.kenh,
          loai: r.loai,
          tinh_nang: `noi-dung.${r.agent}`,
          so_lam_ra: r.lam_ra,
          so_dung: dung,
          so_da_dang: r.da_dang,
          so_cho_dang: r.cho_dang,
          so_loi: r.loi,
          so_nhap: r.nhap,
          so_bo: r.da_xoa,
          ty_le_dung: r.lam_ra ? Math.round((dung / r.lam_ra) * 1000) / 10 : 0,
        };
      }),
      ...this.viralRows(viral),
    ];

    const offset = Math.max(0, Number(decodeCursor(q.trang_sau)?.o) || 0);
    return {
      du_lieu: rows.slice(offset, offset + size),
      trang_sau:
        offset + size < rows.length ? encodeCursor({ o: offset + size }) : null,
    };
  }

  // Phát hiện / Sản xuất: gộp trạng thái của từng (ngày, loại sản phẩm) thành
  // một dòng cùng khuôn với bài đăng. "Dùng" = blog/infographic xong (tải về
  // hoặc đẩy lên Lịch), podcast đã phát hành RSS, "Bài của mình" đã đăng.
  private viralRows(rows: Awaited<ReturnType<ContentStatsRepository['viralByDay']>>) {
    const groups = new Map<string, any>();
    for (const r of rows) {
      const agent = r.kind === 'bai-cua-minh' ? 'viral-ban-cua-minh' : `viral-${r.format}`;
      const key = `${r.ngay}_${agent}`;
      const g =
        groups.get(key) ||
        groups
          .set(key, {
            id: `nd_${r.ngay}_${agent}_hub_${r.format}`,
            nguon: 'phat-hien-san-xuat',
            ngay: r.ngay,
            luc: `${r.ngay}T00:00:00+07:00`,
            cap_nhat_luc: '',
            agent,
            kenh: 'hub',
            loai: r.format,
            tinh_nang: `noi-dung.${agent}`,
            so_lam_ra: 0,
            so_dung: 0,
            so_da_dang: 0,
            so_cho_dang: 0,
            so_loi: 0,
            so_nhap: 0,
            so_bo: 0,
            ty_le_dung: 0,
            _updated: 0,
          })
          .get(key);
      g.so_lam_ra += r.so;
      const used =
        r.kind === 'bai-cua-minh'
          ? r.status === 'posted'
          : r.format === 'podcast'
          ? r.status === 'da_phat_hanh'
          : r.status === 'xong';
      if (r.status === 'da_xoa') g.so_bo += r.so;
      else if (r.status === 'error') g.so_loi += r.so;
      else if (used) {
        g.so_dung += r.so;
        g.so_da_dang += r.so;
      } else g.so_nhap += r.so;
      g._updated = Math.max(g._updated, new Date(r.cap_nhat).getTime());
    }
    return [...groups.values()].map(({ _updated, ...g }) => ({
      ...g,
      cap_nhat_luc: toVn(new Date(_updated)),
      ty_le_dung: g.so_lam_ra ? Math.round((g.so_dung / g.so_lam_ra) * 1000) / 10 : 0,
    }));
  }
}
