import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { ShareJudgeService } from '@gitroom/nestjs-libraries/viral/share.judge.service';
import { ShareStatsService } from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-stats.service';

// Đặc tả v2 (15/10/2026) — người chấm độc lập theo rubric dự báo share.
// Bot Zalo gọi trước khi tự đăng bài nhóm ổn định (UGC ≥ 80, qua 5 cổng).
@ApiTags('Public API')
@Controller('/public/v1')
export class PublicShareController {
  constructor(
    private _judge: ShareJudgeService,
    private _stats: ShareStatsService
  ) {}

  // Body: {type:'UGC'|'GT', text, note?, story?}
  // Trả: {type, gates:{G1..G5: true=TRƯỢT}, scores, evidence, total, verdict, one_fix}
  @Post('/share-judge')
  async judge(
    @GetOrgFromRequest() _org: Organization,
    @Body() body: { type?: string; text?: string; note?: string; story?: string }
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._judge.judge({
      type: body?.type === 'UGC' ? 'UGC' : 'GT',
      text: String(body?.text || ''),
      note: body?.note,
      story: body?.story,
    });
  }

  // Bot Zalo thấy link bài được gửi vào một nhóm Zalo -> +1 lượt chia sẻ.
  // Body: {url}. Trả {matched, postId?} (link không phải bài của Hub -> false).
  @Post('/zalo-share')
  async zaloShare(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { url?: string }
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const url = String(body?.url || '').slice(0, 2000);
    if (!url) return { matched: false };
    return this._stats.registerZaloShare(org.id, url);
  }
}
