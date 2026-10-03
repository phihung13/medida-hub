import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MajorOsClient } from '@gitroom/nestjs-libraries/usage/major-os.client';
import {
  OutEvent,
  sanitizeEvent,
  sanitizeFeedback,
  UsageIdentity,
} from '@gitroom/nestjs-libraries/usage/usage.sanitize';

// ============================================================================
//  "Trạm chuyển tiếp" thu thập sử dụng của Media Hub -> Major OS (chuẩn v1).
//
//  Trình duyệt gửi sự kiện về máy chủ Hub (kèm phiên đăng nhập), máy chủ gắn
//  email/tên người dùng, làm sạch, GOM LÔ 5 giây/lần (≤500 sự kiện) rồi gửi
//  Major OS bằng khoá app. Theo bảng mã trả về của chuẩn (mục 4.1, 11):
//   200 -> xong (sự kiện sai trong `loi` chỉ ghi log, không gửi lại)
//   400/401 -> bỏ lô (401: khoá sai/thu hồi -> báo người vận hành qua log)
//   413 -> chia nhỏ lô        429 -> chờ Retry-After
//   5xx / mất mạng -> gửi lại sau, lùi dần tới 5 phút
//  Không có MAJOR_OS_APP_KEY -> nhận rồi bỏ, KHÔNG tích hàng đợi.
// ============================================================================

const MAX_BATCH = 500;
const MAX_QUEUE = 20_000;
const MAX_PER_REQUEST = 100;
const USER_LIMIT_PER_MIN = 600;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000 - 60_000;

@Injectable()
export class UsageService implements OnModuleDestroy {
  private readonly logger = new Logger('UsageService');
  private queue: OutEvent[] = [];
  private sending = false;
  private pausedUntil = 0;
  private backoffMs = 0;
  private batchSize = MAX_BATCH;
  private lastAuthWarn = 0;
  private readonly perUser = new Map<string, { start: number; count: number }>();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private _client: MajorOsClient) {
    this.timer = setInterval(() => this.flush(), 5000);
    this.timer.unref?.();
  }

  get enabled() {
    return this._client.enabled;
  }

  /** Nhận một lô sự kiện từ trình duyệt của người đang đăng nhập. */
  accept(rawEvents: unknown, who: UsageIdentity, userKey: string) {
    if (!Array.isArray(rawEvents)) return { nhan: 0, bo: 0 };
    const list = rawEvents.slice(0, MAX_PER_REQUEST);
    if (!this.enabled) return { nhan: 0, bo: list.length };

    // Hạn mức theo người: một tab lỗi lặp vô hạn không được làm ngập hàng đợi.
    const now = Date.now();
    const slot = this.perUser.get(userKey);
    const win = slot && now - slot.start < 60_000 ? slot : { start: now, count: 0 };
    this.perUser.set(userKey, win);
    if (this.perUser.size > 5000) this.perUser.clear();

    let nhan = 0;
    let bo = 0;
    for (const raw of list) {
      if (win.count >= USER_LIMIT_PER_MIN) {
        bo++;
        continue;
      }
      const ev = sanitizeEvent(raw, who, now);
      if (!ev) {
        bo++;
        continue;
      }
      this.queue.push(ev);
      win.count++;
      nhan++;
    }
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    return { nhan, bo };
  }

  private requeue(batch: OutEvent[]) {
    this.queue = [...batch, ...this.queue].slice(0, MAX_QUEUE);
  }

  private async flush() {
    if (this.sending || !this.enabled || !this.queue.length || Date.now() < this.pausedUntil) return;
    this.sending = true;
    try {
      const now = Date.now();
      // Major OS từ chối sự kiện cũ hơn 7 ngày -> bỏ trước cho đỡ tốn lượt.
      this.queue = this.queue.filter((e) => now - Date.parse(e.luc) < MAX_AGE_MS);
      const batch = this.queue.splice(0, this.batchSize);
      if (!batch.length) return;
      const r = await this._client.sendEvents(batch);

      if (r.status === 200) {
        this.backoffMs = 0;
        this.batchSize = Math.min(MAX_BATCH, this.batchSize * 2);
        const loi = r.body?.loi;
        if (Array.isArray(loi) && loi.length) {
          this.logger.warn(
            `Major OS từ chối ${loi.length} sự kiện, vd: ${loi
              .slice(0, 3)
              .map((x: any) => x?.ly_do)
              .join(' | ')}`
          );
        }
        return;
      }
      if (r.status === 413) {
        if (batch.length > 1) {
          this.batchSize = Math.max(1, Math.floor(batch.length / 2));
          this.requeue(batch);
        }
        return;
      }
      if (r.status === 429) {
        this.requeue(batch);
        this.pausedUntil = Date.now() + (r.retryAfterSec || 60) * 1000;
        return;
      }
      if (r.status === 0 || r.status >= 500) {
        this.requeue(batch);
        this.backoffMs = Math.min(Math.max(5000, this.backoffMs * 2), 5 * 60_000);
        this.pausedUntil = Date.now() + this.backoffMs;
        return;
      }
      if (r.status === 401) {
        if (Date.now() - this.lastAuthWarn > 10 * 60_000) {
          this.lastAuthWarn = Date.now();
          this.logger.error('MAJOR_OS_APP_KEY sai hoặc đã bị thu hồi — xin khoá mới ở Major OS (Quản trị → Thu thập sử dụng).');
        }
        this.pausedUntil = Date.now() + 10 * 60_000;
        return;
      }
      // 400 và mã khác: lô hỏng, gửi lại y hệt cũng vô ích.
      this.logger.warn(`Major OS trả ${r.status} cho lô ${batch.length} sự kiện — bỏ lô: ${JSON.stringify(r.body || {}).slice(0, 200)}`);
    } catch (e: any) {
      this.logger.warn(`Gửi sự kiện sử dụng lỗi: ${e?.message || e}`);
    } finally {
      this.sending = false;
    }
  }

  /** Chuyển tiếp MỘT góp ý (gửi ngay, không gom lô). */
  async feedback(raw: unknown, who: UsageIdentity): Promise<{ ok: boolean; error?: string }> {
    const fb = sanitizeFeedback(raw, who);
    if (typeof fb === 'string') return { ok: false, error: fb };
    if (!this.enabled) {
      return { ok: false, error: 'Hub chưa được cấu hình gửi góp ý về Major OS.' };
    }
    let r = await this._client.sendFeedback(fb);
    if (r.status === 0 || r.status >= 500) {
      await new Promise((res) => setTimeout(res, 2000));
      r = await this._client.sendFeedback(fb);
    }
    if (r.status === 200) return { ok: true };
    if (r.status === 429) return { ok: false, error: 'Đang gửi nhiều quá — thử lại sau ít phút.' };
    return { ok: false, error: `Major OS chưa nhận được góp ý (mã ${r.status || 'mất mạng'}).` };
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    // Tắt máy chủ (deploy): cố gửi nốt phần còn trong hàng đợi.
    this.pausedUntil = 0;
    for (let i = 0; i < 3 && this.queue.length; i++) await this.flush();
  }
}
