import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// Báo cáo tuần "ưu tiên share": bài đã đăng trong kỳ + số liệu share thật
// (PostShareStat) + điểm dự báo. Gộp bằng SQL, chỉ kéo các bài trong kỳ.

export type SharePostRow = {
  postId: string;
  kenh: string;
  ten_kenh: string;
  agent: string | null;
  loai: string;
  publishDate: Date;
  createdAt: Date;
  noi_dung: string;
  link: string | null;
  format: string | null;
  rubricType: string | null;
  forecastScore: number | null;
  verdict: string | null;
  goc: string | null;
  reach: number | null;
  shares: number | null;
  comments: number | null;
  shareRate: number | null;
  linkClicks: number | null;
  zaloShares: number | null;
  measuredAt: Date | null;
};

export type ScoredRow = {
  rubricType: string | null;
  forecastScore: number | null;
  verdict: string | null;
};

const MEDIA_COUNT_SQL = Prisma.sql`(
  (length(COALESCE(p.image, '')) - length(replace(COALESCE(p.image, ''), '"path":', ''))) / 7
  - (length(COALESCE(p.image, '')) - length(replace(COALESCE(p.image, ''), '"hidden":true', ''))) / 13
)`;
const VIDEO_RE = String.raw`"path":"[^"]*\.(mp4|mov)(\?[^"]*)?"`;

@Injectable()
export class ShareReportRepository {
  constructor(private _raw: PrismaRepository<'$queryRaw'>) {}

  publishedInRange(orgId: string, from: Date, to: Date) {
    return this._raw.model.$queryRaw<SharePostRow[]>`
      SELECT p.id AS "postId",
             i."providerIdentifier" AS kenh,
             i.name AS ten_kenh,
             p.agent AS agent,
             CASE
               WHEN ${MEDIA_COUNT_SQL} <= 0 THEN 'chu'
               WHEN p.image ~* ${VIDEO_RE} THEN 'video'
               WHEN ${MEDIA_COUNT_SQL} > 1 THEN 'album'
               ELSE 'anh'
             END AS loai,
             p."publishDate", p."createdAt",
             left(regexp_replace(COALESCE(p.content, ''), '<[^>]+>', ' ', 'g'), 160) AS noi_dung,
             p."releaseURL" AS link,
             s.format, s."rubricType", s."forecastScore", s.verdict, s.goc,
             s.reach, s.shares, s.comments, s."shareRate",
             s."linkClicks", s."zaloShares", s."measuredAt"
      FROM "Post" p
      JOIN "Integration" i ON i.id = p."integrationId"
      LEFT JOIN "PostShareStat" s ON s."postId" = p.id
      WHERE p."organizationId" = ${orgId}
        AND p."parentPostId" IS NULL
        AND p."deletedAt" IS NULL
        AND p.state = 'PUBLISHED'
        AND p."publishDate" >= ${from} AND p."publishDate" < ${to}
      ORDER BY p."publishDate" DESC
    `;
  }

  // Bài được người chấm độc lập chấm trong kỳ (kể cả bài bị loại, không đăng).
  scoredInRange(orgId: string, from: Date, to: Date) {
    return this._raw.model.$queryRaw<ScoredRow[]>`
      SELECT s."rubricType", s."forecastScore", s.verdict
      FROM "PostShareStat" s
      WHERE s."organizationId" = ${orgId}
        AND s."forecastScore" IS NOT NULL
        AND s."createdAt" >= ${from} AND s."createdAt" < ${to}
    `;
  }
}
