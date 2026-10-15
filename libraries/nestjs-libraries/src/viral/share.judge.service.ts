import { HttpException, Injectable } from '@nestjs/common';
import {
  judgeShare,
  ShareJudgeInput,
  ShareJudgeResult,
} from '@gitroom/nestjs-libraries/viral/share.judge';
import { ShareStatsService } from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-stats.service';

// Lớp Service cho người chấm độc lập + lưu điểm dự báo (Đặc tả v2, 15/10/2026).
// Controller (public API) gọi qua đây, không gọi share.judge trực tiếp.
@Injectable()
export class ShareJudgeService {
  constructor(private _shareStats: ShareStatsService) {}

  async judge(input: ShareJudgeInput): Promise<ShareJudgeResult> {
    if (!String(input?.text || '').trim()) {
      throw new HttpException({ msg: 'Thiếu text (bài cần chấm).' }, 400);
    }
    try {
      return await judgeShare({
        type: input.type === 'UGC' ? 'UGC' : 'GT',
        text: String(input.text),
        note: input.note ? String(input.note) : null,
        story: input.story ? String(input.story) : null,
      });
    } catch (e: any) {
      throw new HttpException({ msg: e?.message || 'Người chấm lỗi' }, 502);
    }
  }

  // shareStat tuỳ chọn gửi kèm POST /public/v1/posts (bot Zalo). Validate nhẹ:
  // field sai kiểu thì bỏ, không làm hỏng việc tạo bài.
  async saveForecastForPosts(
    orgId: string,
    postIds: string[],
    raw: any,
    agent?: string
  ) {
    if (!raw || typeof raw !== 'object' || !postIds.length) return;
    const str = (v: any, max = 200) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
    const num = Number(raw.forecastScore);
    const rubric =
      typeof raw.rubric === 'string'
        ? raw.rubric.slice(0, 8000)
        : raw.rubric && typeof raw.rubric === 'object'
        ? JSON.stringify(raw.rubric).slice(0, 8000)
        : null;
    for (const postId of postIds) {
      await this._shareStats
        .upsertForecast({
          postId,
          organizationId: orgId,
          agent: agent || null,
          format: str(raw.format, 40),
          rubricType: raw.rubricType === 'UGC' || raw.rubricType === 'GT' ? raw.rubricType : null,
          forecastScore: Number.isFinite(num) ? Math.round(num) : null,
          verdict: str(raw.verdict, 30),
          rubric,
          goc: str(raw.goc, 4),
          zaloThreadId: str(raw.zaloThreadId, 100),
        })
        .catch(() => null);
    }
  }
}
