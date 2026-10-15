import { Injectable, OnModuleInit } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { ShareStatsService } from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-stats.service';

// Đặc tả v2 "ưu tiên share": tỷ lệ share = share ÷ reach, đo SAU 72 GIỜ.
// Mỗi 6 giờ quét bài gốc đã đăng (Facebook/Instagram) có publishDate trong
// [now − 10 ngày, now − 72 giờ] mà chưa đo (hoặc lần đo trước còn trong 72 giờ
// đầu) rồi ghi số liệu cạnh điểm dự báo. CHỈ chạy ở tiến trình backend (cờ
// RUN_VIRAL_CRAWLER do main.ts bật) để không đo 2 lần ở orchestrator.
const PROVIDERS = ['facebook', 'instagram', 'instagram-standalone'];
const EVERY_MS = 6 * 3600 * 1000;
const WAIT_MS = 72 * 3600 * 1000;
const WINDOW_MS = 10 * 24 * 3600 * 1000;
const PER_RUN = 100;

@Injectable()
export class ShareMetricsCollector implements OnModuleInit {
  private running = false;

  constructor(
    private _posts: PostsService,
    private _stats: ShareStatsService
  ) {}

  onModuleInit() {
    if (process.env.RUN_VIRAL_CRAWLER !== '1') return;
    if (process.env.SHARE_METRICS_DISABLED === '1') return;
    // Lượt đầu sau 5 phút cho backend khởi động xong.
    setTimeout(() => this.run().catch(() => undefined), 5 * 60 * 1000).unref?.();
    setInterval(() => this.run().catch(() => undefined), EVERY_MS).unref?.();
  }

  async run() {
    if (this.running) return { measured: 0, failed: 0 };
    this.running = true;
    let measured = 0;
    let failed = 0;
    try {
      const now = Date.now();
      const candidates = await this._posts.findPublishedForShareMetrics(
        new Date(now - WINDOW_MS),
        new Date(now - WAIT_MS),
        PROVIDERS,
        PER_RUN * 3
      );
      if (!candidates.length) return { measured, failed };
      const stats = await this._stats.getByPostIds(candidates.map((p) => p.id));
      const byId = new Map(stats.map((s) => [s.postId, s]));
      const due = candidates
        .filter((p) => {
          const s = byId.get(p.id);
          if (!s?.measuredAt) return true;
          // lần đo cũ rơi vào 72 giờ đầu -> đo lại cho đúng mốc
          return s.measuredAt.getTime() < p.publishDate.getTime() + WAIT_MS;
        })
        .slice(0, PER_RUN);

      for (const p of due) {
        try {
          const m = await this._posts.getPostShareMetrics(
            p.organizationId,
            p.id
          );
          if (!m) continue;
          await this._stats.saveMetrics(p.id, p.organizationId, m);
          measured++;
        } catch (e) {
          failed++;
          console.warn(
            `[share-metrics] ${p.id}: ${(e as Error)?.message || e}`
          );
        }
      }
      if (measured || failed) {
        console.log(
          `[share-metrics] đo ${measured} bài, lỗi ${failed} (còn ${
            candidates.length - due.length
          } bài ngoài lượt)`
        );
      }
      return { measured, failed };
    } finally {
      this.running = false;
    }
  }
}
