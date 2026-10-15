import { Injectable } from '@nestjs/common';
import {
  ShareMetricsInput,
  ShareStatInput,
  ShareStatsRepository,
} from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-stats.repository';

// Đặc tả v2 "ưu tiên share": điểm dự báo (người chấm độc lập) + góc kể +
// số liệu share thật của từng bài, cùng một dòng để đối chiếu.
@Injectable()
export class ShareStatsService {
  constructor(private _repo: ShareStatsRepository) {}

  upsertForecast(input: ShareStatInput) {
    return this._repo.upsertForecast(input);
  }

  saveMetrics(postId: string, organizationId: string, m: ShareMetricsInput) {
    const shareRate =
      m.shareRate ??
      (m.reach && m.reach > 0 && m.shares != null ? m.shares / m.reach : null);
    return this._repo.saveMetrics(postId, organizationId, {
      ...m,
      shareRate,
      measuredAt: m.measuredAt || new Date(),
    });
  }

  getByPostIds(postIds: string[]) {
    return this._repo.getByPostIds(postIds);
  }

  listRange(organizationId: string, from: Date, to: Date) {
    return this._repo.listRange(organizationId, from, to);
  }
}
