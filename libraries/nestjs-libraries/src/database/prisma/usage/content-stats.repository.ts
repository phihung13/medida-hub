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
  het_han: number;
  nhap_trung: number;
  cap_nhat: Date;
};

// Một dòng theo BÀI (gộp các thẻ nhiều kênh của cùng một nội dung).
export type PostGopRow = {
  ngay: string;
  agent: string;
  loai: string;
  so_kenh: number;
  lam_ra: number;
  dung: number;
  da_dang: number;
  cho_dang: number;
  loi: number;
  nhap: number;
  da_xoa: number;
  het_han: number;
  nhap_trung: number;
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
// Blog đã lên website: meta có "webUrl":"http..." (đánh dấu bằng tool MCP
// hub_blog_da_len_web). Không có = mới "sản xuất xong".
const WEB_RE = String.raw`"webUrl"\s*:\s*"https?://`;

// DraftExpiryService xoá nháp bot Zalo quá 48 giờ và ghi error = 'tu-xoa-48h':
// đó là "hết hạn, không ai duyệt", KHÔNG phải người duyệt bấm bỏ.
const EXPIRED = 'tu-xoa-48h';

// Khoá "một bài": bot Zalo gọi API riêng cho TỪNG kênh nên mỗi kênh một
// group — gộp lại bằng nội dung + ảnh đầu tiên (upload 1 lần, dùng chung).
// Bài khác: các kênh tạo cùng lúc chung một group.
const BAI_KEY_SQL = Prisma.sql`
  CASE WHEN ${AGENT_SQL} = 'zalo-bot'
    THEN md5(COALESCE(p.content, '') || COALESCE(substring(p.image from '"path":"([^"]+)"'), ''))
    ELSE p."group"
  END`;

@Injectable()
export class ContentStatsRepository {
  constructor(
    private _raw: PrismaRepository<'$queryRaw'>,
    private _exec: PrismaRepository<'$executeRaw'>
  ) {}

  /**
   * Mỗi dòng = (ngày làm ra, agent, kênh, loại) với số bài theo trạng thái
   * HIỆN TẠI. Một "bài" = một thẻ trên Lịch (gốc thread, parentPostId null).
   * `days` = các ngày VN (YYYY-MM-DD) cần tính lại TRỌN NGÀY.
   */
  postsByDay(days: string[], dupIntegrations: string[] = []) {
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
             (count(*) FILTER (WHERE p."deletedAt" IS NOT NULL AND p.error IS DISTINCT FROM ${EXPIRED}))::int AS da_xoa,
             (count(*) FILTER (WHERE p."deletedAt" IS NOT NULL AND p.error = ${EXPIRED}))::int AS het_han,
             0::int AS nhap_trung,
             max(GREATEST(p."updatedAt", COALESCE(p."deletedAt", p."updatedAt"))) AS cap_nhat
      FROM "Post" p
      JOIN "Integration" i ON i.id = p."integrationId"
      WHERE p."parentPostId" IS NULL
        AND to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') = ANY(${days})
        AND NOT ${this.dupDraft(dupIntegrations)}
      GROUP BY 1, 2, 3, 4
      ORDER BY 1, 2, 3, 4
    `;
  }

  /**
   * Bản nháp TRÙNG: nhóm Zalo bật tự đăng Facebook/GBP thì bot đã đăng thẳng
   * lên trang, NHƯNG vẫn đẩy một thẻ nháp vào Lịch. Thẻ nháp của bot nằm trên
   * kênh thuộc nhóm tự đăng = bản thừa, không phải "nội dung chưa dùng" →
   * loại khỏi mẫu số (đếm riêng ở cột nhap_trung).
   */
  private dupDraft(dupIntegrations: string[]) {
    if (!dupIntegrations.length) return Prisma.sql`false`;
    return Prisma.sql`(
      ${AGENT_SQL} = 'zalo-bot' AND p."deletedAt" IS NULL AND p.state = 'DRAFT'
      AND p."integrationId" = ANY(${dupIntegrations})
    )`;
  }

  /** Số thẻ nháp trùng (đã loại khỏi mẫu số) theo ngày / kênh / loại. */
  dupDraftsByDay(days: string[], dupIntegrations: string[]) {
    type Row = { ngay: string; kenh: string; loai: string; so: number };
    if (!days.length || !dupIntegrations.length)
      return Promise.resolve([] as Row[]);
    return this._raw.model.$queryRaw<Row[]>`
      SELECT to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') AS ngay,
             i."providerIdentifier" AS kenh,
             ${TYPE_SQL} AS loai,
             count(*)::int AS so
      FROM "Post" p
      JOIN "Integration" i ON i.id = p."integrationId"
      WHERE p."parentPostId" IS NULL
        AND to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') = ANY(${days})
        AND ${this.dupDraft(dupIntegrations)}
      GROUP BY 1, 2, 3
    `;
  }

  /**
   * Cùng số liệu nhưng đơn vị là BÀI (nội dung), không phải THẺ (mỗi kênh một
   * thẻ). Trạng thái một bài = trạng thái "tốt nhất" của các thẻ: có thẻ đã
   * đăng → đã đăng; chờ đăng / lỗi → vẫn là dùng; mọi thẻ bị xoá → bỏ; còn
   * lại nháp. Dùng cho bảng tổng / theo agent; bảng theo kênh dùng postsByDay.
   */
  postsByDayGop(days: string[], dupIntegrations: string[] = []) {
    if (!days.length) return Promise.resolve([] as PostGopRow[]);
    return this._raw.model.$queryRaw<PostGopRow[]>`
      WITH the AS (
        SELECT to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') AS ngay,
               ${AGENT_SQL} AS agent,
               ${TYPE_SQL} AS loai,
               ${BAI_KEY_SQL} AS bai,
               p."integrationId" AS kenh_id,
               (p."deletedAt" IS NULL AND p.state = 'PUBLISHED') AS da_dang,
               (p."deletedAt" IS NULL AND p.state = 'QUEUE') AS cho_dang,
               (p."deletedAt" IS NULL AND p.state = 'ERROR') AS loi,
               (p."deletedAt" IS NULL AND p.state = 'DRAFT') AS nhap,
               (p."deletedAt" IS NOT NULL AND p.error = ${EXPIRED}) AS het_han,
               ${this.dupDraft(dupIntegrations)} AS trung,
               GREATEST(p."updatedAt", COALESCE(p."deletedAt", p."updatedAt")) AS cap_nhat
        FROM "Post" p
        WHERE p."parentPostId" IS NULL
          AND to_char((p."createdAt" + interval '7 hours')::date, 'YYYY-MM-DD') = ANY(${days})
      ), bai AS (
        SELECT ngay, agent, max(loai) AS loai, bai,
               count(DISTINCT kenh_id) FILTER (WHERE NOT trung) AS so_kenh,
               bool_or(da_dang) AS da_dang,
               bool_or(cho_dang) AS cho_dang,
               bool_or(loi) AS loi,
               bool_or(nhap AND NOT trung) AS nhap,
               bool_or(het_han) AS het_han,
               bool_and(trung) AS chi_trung,
               bool_or(trung) AS co_trung,
               max(cap_nhat) AS cap_nhat
        FROM the
        GROUP BY ngay, agent, bai
      )
      SELECT ngay, agent, loai,
             sum(so_kenh)::int AS so_kenh,
             (count(*) FILTER (WHERE NOT chi_trung))::int AS lam_ra,
             (count(*) FILTER (WHERE NOT chi_trung AND (da_dang OR cho_dang OR loi)))::int AS dung,
             (count(*) FILTER (WHERE NOT chi_trung AND da_dang))::int AS da_dang,
             (count(*) FILTER (WHERE NOT chi_trung AND NOT da_dang AND cho_dang))::int AS cho_dang,
             (count(*) FILTER (WHERE NOT chi_trung AND NOT da_dang AND NOT cho_dang AND loi))::int AS loi,
             (count(*) FILTER (WHERE NOT chi_trung AND NOT (da_dang OR cho_dang OR loi) AND nhap))::int AS nhap,
             (count(*) FILTER (WHERE NOT chi_trung AND NOT (da_dang OR cho_dang OR loi OR nhap) AND NOT het_han))::int AS da_xoa,
             (count(*) FILTER (WHERE NOT chi_trung AND NOT (da_dang OR cho_dang OR loi OR nhap) AND het_han))::int AS het_han,
             (count(*) FILTER (WHERE co_trung))::int AS nhap_trung,
             max(cap_nhat) AS cap_nhat
      FROM bai
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3
    `;
  }

  /** Loại kênh (providerIdentifier) của các kênh Hub theo id. */
  integrationProviders(ids: string[]) {
    if (!ids.length) return Promise.resolve([] as { id: string; kenh: string }[]);
    return this._raw.model.$queryRaw<{ id: string; kenh: string }[]>`
      SELECT id, "providerIdentifier" AS kenh FROM "Integration" WHERE id = ANY(${ids})
    `;
  }

  /** Đánh dấu blog đã lên website (meta.webUrl). Trả số dòng cập nhật. */
  markBlogOnWeb(orgId: string, productId: string, url: string) {
    return this._exec.model.$executeRaw`
      UPDATE "ViralProduct"
      SET meta = (COALESCE(NULLIF(meta, '')::jsonb, '{}'::jsonb)
                  || jsonb_build_object('webUrl', ${url}::text, 'webAt', now()::text))::text,
          "updatedAt" = now()
      WHERE id = ${productId} AND "organizationId" = ${orgId}
        AND format = 'blog' AND "deletedAt" IS NULL
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
               WHEN v.format = 'blog' AND COALESCE(v.meta, '') ~ ${WEB_RE} THEN 'len_web'
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
