import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

// ============================================================================
//  Đặc tả Media Hub v2 (15/10/2026): "Bản nháp quá 48 giờ tự xoá" — nháp Bot
//  Zalo không ai duyệt sau 48 giờ thì xoá mềm (khôi phục được trong DB), mỗi
//  giờ quét một lần. Chỉ chạy ở tiến trình backend (main.ts đặt
//  RUN_VIRAL_CRAWLER=1), không chạy ở orchestrator để khỏi chạy đôi.
//  Tắt hẳn: DRAFT_EXPIRY_HOURS=0. Đổi hạn: DRAFT_EXPIRY_HOURS=<giờ>.
// ============================================================================

export const DRAFT_EXPIRED_REASON = 'tu-xoa-48h';

@Injectable()
export class DraftExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DraftExpiry');
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private _postsService: PostsService) {}

  onModuleInit() {
    if (process.env.RUN_VIRAL_CRAWLER !== '1') return;
    const hours = Number(process.env.DRAFT_EXPIRY_HOURS ?? 48);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const tick = () => this.run(hours).catch(() => undefined);
    // Lần đầu sau 5 phút cho backend khởi động xong, rồi mỗi giờ.
    setTimeout(tick, 5 * 60_000).unref?.();
    this.timer = setInterval(tick, 3600_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(hours = 48) {
    if (this.running) return { deleted: 0 };
    this.running = true;
    try {
      const r = await this._postsService.expireStaleAgentDrafts(
        'zalo-bot',
        hours,
        DRAFT_EXPIRED_REASON
      );
      if (r.deleted) {
        this.logger.log(
          `Đã xoá ${r.deleted} nháp Bot Zalo quá ${hours} giờ không ai duyệt.`
        );
      }
      return r;
    } catch (e: any) {
      this.logger.warn(`Xoá nháp quá hạn lỗi: ${e?.message || e}`);
      return { deleted: 0 };
    } finally {
      this.running = false;
    }
  }
}
