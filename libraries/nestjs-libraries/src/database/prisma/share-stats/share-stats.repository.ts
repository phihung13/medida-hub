import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface ShareStatInput {
  postId: string;
  organizationId: string;
  agent?: string | null;
  format?: string | null;
  rubricType?: string | null;
  forecastScore?: number | null;
  verdict?: string | null;
  rubric?: string | null;
  goc?: string | null;
  zaloThreadId?: string | null;
  utmCampaign?: string | null;
}

export interface ShareMetricsInput {
  reach?: number | null;
  shares?: number | null;
  comments?: number | null;
  reactions?: number | null;
  clicks?: number | null;
  saves?: number | null;
  shareRate?: number | null;
  measuredAt?: Date;
}

@Injectable()
export class ShareStatsRepository {
  constructor(
    private _stat: PrismaRepository<'postShareStat'>,
    private _link: PrismaRepository<'shareLink'>,
    private _post: PrismaRepository<'post'>
  ) {}

  // Ghi/ghi đè phần DỰ BÁO (điểm, góc kể...). Chỉ field có giá trị mới ghi.
  upsertForecast(input: ShareStatInput) {
    const data = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    ) as ShareStatInput;
    const { postId, ...rest } = data;
    return this._stat.model.postShareStat.upsert({
      where: { postId },
      create: data,
      update: rest,
    });
  }

  saveMetrics(postId: string, organizationId: string, m: ShareMetricsInput) {
    return this._stat.model.postShareStat.upsert({
      where: { postId },
      create: { postId, organizationId, ...m },
      update: m,
    });
  }

  getByPostIds(postIds: string[]) {
    return this._stat.model.postShareStat.findMany({
      where: { postId: { in: postIds } },
    });
  }

  listRange(organizationId: string, from: Date, to: Date) {
    return this._stat.model.postShareStat.findMany({
      where: { organizationId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Link chuyển hướng của Hub (đếm lượt bấm) ─────────────────────────────
  findLink(postId: string, target: string) {
    return this._link.model.shareLink.findFirst({ where: { postId, target } });
  }

  createLink(data: {
    code: string;
    postId: string;
    organizationId: string;
    target: string;
  }) {
    return this._link.model.shareLink.create({ data });
  }

  getLinkByCode(code: string) {
    return this._link.model.shareLink.findUnique({ where: { code } });
  }

  async countClick(code: string) {
    const link = await this._link.model.shareLink.update({
      where: { code },
      data: { clicks: { increment: 1 } },
    });
    await this.increment(link.postId, link.organizationId, 'linkClicks');
    return link;
  }

  increment(
    postId: string,
    organizationId: string,
    field: 'linkClicks' | 'zaloShares'
  ) {
    return this._stat.model.postShareStat.upsert({
      where: { postId },
      create: { postId, organizationId, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  }

  // Bài gốc đã đăng có releaseURL/releaseId chứa mã bài Facebook
  // (vd 1234_5678, 5678 hoặc pfbid...).
  findPostByReleaseFragment(organizationId: string, fragment: string) {
    return this._post.model.post.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        parentPostId: null,
        OR: [
          { releaseURL: { contains: fragment } },
          { releaseId: { contains: fragment } },
        ],
      },
      select: { id: true, organizationId: true },
    });
  }
}
