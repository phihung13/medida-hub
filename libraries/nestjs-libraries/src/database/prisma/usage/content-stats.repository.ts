import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// ============================================================================
//  Số liệu "làm ra / dùng" của nội dung (Major OS /noi-dung). Mọi phép đếm gộp
//  bằng SQL — không kéo từng bài về Node. Giờ Việt Nam = UTC+7 cố định.
// ============================================================================

export type PostAggRow = {
  ngay: string;
  agent: string;
  kenh: string;
  loai: string;
  lam_ra: number;
  cho_dang: number;
  da_dang: number;
  loi: number;
  nhap: number;
  da_xoa: number;
  cap_nhat: Date;
};

export type ViralAggRow = {
  ngay: string;
  kind: string;
  format: string;
  status: string;
  so: number;
  cap_nhat: Date;
};

// Agent của một bài: cột Post.agent; bài cũ (trước khi có cột) suy ra từ
// creationMethod + tag "Zalo". MCP cũ không tách được viral / agent chat.
const AGENT_SQL = Prisma.sql`
  COALESCE(
    p."agent",
    CASE
      WHEN p."creationMethod" = 'AUTOPOST' THEN 'autopost-rss'
      WHEN p."creationMethod" = 'API' AND EXISTS (
        SELECT 1 FROM "TagsPosts" tp JOIN "Tags" t ON t.id = tp."tagId"
        WHERE tp."postId" = p.id AND lower(t.name) = 'zalo'
      ) THEN 'zalo-bot'
      WHEN p."creationMethod" = 'MCP' THEN 'ai-khac'
      WHEN p."creationMethod" = 'API' THEN 'api'
      WHEN p."creationMethod" = 'CLI' THEN 'cli'
      ELSE 'thu-cong'
    END
  )`;

// Số media ĐƯỢC ĐĂNG của bài. `image` là JSON.stringify (không khoảng trắng):
// đếm bằng chuỗi thay vì ép jsonb — một bài JSON hỏng không làm hỏng cả báo
// cáo. Ảnh bị AI ẩn ("hidden":true) không đăng nên trừ ra.
const MEDIA_COUNT_SQL = Prisma.sql`(
  (length(COALESCE(p.image, '')) - length(replace(COALESCE(p.image, ''), '"path":', ''))) / 7
  - (length(COALESCE(p.image, '')) - length(replace(COALESCE(p.image, ''), '"hidden":true', ''))) / 13
)`;

// Loại nội dung theo media (như các provider: .mp4/.mov = video).
const VIDEO_RE = String.raw`"path":"[^"]*\.(mp4|mov)(\?[^"]*)?"`;
const TYPE_SQL = Prisma.sql`
  CASE
    WHEN ${MEDIA_COUNT_SQL} <= 0 THEN 'chu'
    WHEN p.image ~* ${VIDEO_RE} THEN 'video'
    WHEN ${MEDIA_COUNT_SQL} > 1 THEN 'album'
    ELSE 'anh'
  END`;

const RSS_RE = String.raw`"rss"\s*:\s*\{`;

@Injectable()
export class ContentStatsRepository {
  constructor(private _raw: PrismaRepository<'$queryRaw'>) {}

  /**
   * Mỗi dòng = (ngày làm ra, agent, kênh, loại) với số bài theo trạng thái
   * HIỆN TẠI. Một "bài" = một thẻ trên Lịch (gốc thread, parentPostId null).
   * `days` = các ngày VN (YYYY-MM-DD) cần tính lại TRỌN NGÀY.
   */
  postsByDay(days: string[]) {
    if (!days.length) return Promise.resolve([] as PostAggRow[]);
    return this._raw.model.$queryRaw<PostAggRow[]>`
      SELECT to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') AS ngay,
             ${AGENT_SQL} AS agent,
             i."providerIdentifier" AS kenh,
             ${TYPE_SQL} AS loai,
             count(*)::int AS lam_ra,
             (count(*) FILTER (WHERE p."deletedAt" IS NULL AND p.state = 'QUEUE'))::int AS cho_dang,
             (count(*) FILTER (WHERE p."deletedAt" IS NULL AND p.state = 'PUBLISHED'))::int AS da_dang,
             (count(*) FILTER (WHERE p."deletedAt" IS NULL AND p.state = 'ERROR'))::int AS loi,
             (count(*) FILTER (WHERE p."deletedAt" IS NULL AND p.state = 'DRAFT'))::int AS nhap,
             (count(*) FILTER (WHERE p."deletedAt" IS NOT NULL))::int AS da_xoa,
             max(GREATEST(p."updatedAt", COALESCE(p."deletedAt", p."updatedAt"))) AS cap_nhat
      FROM "Post" p
      JOIN "Integration" i ON i.id = p."integrationId"
      WHERE p."parentPostId" IS NULL
        AND to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') = ANY(${days})
      GROUP BY 1, 2, 3, 4
      ORDER BY 1, 2, 3, 4
    `;
  }

  /** Ngày VN (theo lúc làm ra) của các bài làm ra / đổi trạng thái / bị xoá trong [from, to). */
  postDaysTouched(from: Date, to: Date) {
    return this._raw.model.$queryRaw<{ ngay: string }[]>`
      SELECT DISTINCT to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') AS ngay
      FROM "Post" p
      WHERE p."parentPostId" IS NULL
        AND (
          (p."updatedAt" >= ${from} AND p."updatedAt" < ${to})
          OR (p."createdAt" >= ${from} AND p."createdAt" < ${to})
          OR (p."deletedAt" >= ${from} AND p."deletedAt" < ${to})
        )
      ORDER BY 1
    `;
  }

  /**
   * Phát hiện / Sản xuất: sản phẩm (blog / infographic / podcast) và "Bài của
   * mình" theo ngày làm ra + trạng thái hiện tại.
   */
  viralByDay(days: string[]) {
    if (!days.length) return Promise.resolve([] as ViralAggRow[]);
    return this._raw.model.$queryRaw<ViralAggRow[]>`
      SELECT to_char((v."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') AS ngay,
             'san-pham' AS kind,
             v.format AS format,
             CASE
               WHEN v."deletedAt" IS NOT NULL THEN 'da_xoa'
               WHEN v.status <> 'done' THEN v.status
               WHEN v.format = 'podcast' AND COALESCE(v.meta, '') ~ ${RSS_RE} THEN 'da_phat_hanh'
               ELSE 'xong'
             END AS status,
             count(*)::int AS so,
             max(COALESCE(v."updatedAt", v."createdAt")) AS cap_nhat
      FROM "ViralProduct" v
      WHERE to_char((v."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') = ANY(${days})
      GROUP BY 1, 2, 3, 4
      UNION ALL
      SELECT to_char((c."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') AS ngay,
             'bai-cua-minh' AS kind,
             'bai-viet' AS format,
             CASE WHEN c."deletedAt" IS NOT NULL THEN 'da_xoa' ELSE c.status END AS status,
             count(*)::int AS so,
             max(COALESCE(c."updatedAt", c."createdAt")) AS cap_nhat
      FROM "ViralClone" c
      WHERE to_char((c."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') = ANY(${days})
      GROUP BY 1, 2, 3, 4
      ORDER BY 1, 2, 3, 4
    `;
  }

  viralDaysTouched(from: Date, to: Date) {
    return this._raw.model.$queryRaw<{ ngay: string }[]>`
      SELECT DISTINCT to_char((x."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') AS ngay
      FROM (
        SELECT "createdAt", "updatedAt" FROM "ViralProduct"
        UNION ALL
        SELECT "createdAt", "updatedAt" FROM "ViralClone"
      ) x
      WHERE (x."createdAt" >= ${from} AND x."createdAt" < ${to})
         OR (x."updatedAt" >= ${from} AND x."updatedAt" < ${to})
      ORDER BY 1
    `;
  }
}
