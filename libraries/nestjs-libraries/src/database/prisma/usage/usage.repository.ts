import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  OutEvent,
  OutFeedback,
} from '@gitroom/nestjs-libraries/usage/usage.sanitize';

export type UsageCursor = { t: Date; id: string };

export type DailyUsageRow = {
  userId: string;
  day: Date;
  email: string;
  name: string | null;
  cells: number;
  sessions: number;
  actions: number;
  updated: Date;
};

// Sau mốc tính theo "lúc Hub nhận" (createdAt), kèm id để phân trang ổn định
// khi nhiều dòng trùng mili-giây.
const after = (cursor?: UsageCursor) =>
  cursor
    ? {
        OR: [
          { createdAt: { gt: cursor.t } },
          { createdAt: cursor.t, id: { gt: cursor.id } },
        ],
      }
    : {};

@Injectable()
export class UsageRepository {
  constructor(
    private _events: PrismaRepository<'usageEvent'>,
    private _feedback: PrismaRepository<'usageFeedback'>,
    private _keys: PrismaRepository<'majorOsKey'>,
    private _raw: PrismaRepository<'$queryRaw'>
  ) {}

  insertEvents(userId: string, events: OutEvent[]) {
    return this._events.model.usageEvent.createMany({
      skipDuplicates: true,
      data: events.map((e) => ({
        id: e.id,
        userId,
        email: e.email || '',
        name: e.ten || null,
        sessionId: e.phien_id || null,
        type: e.loai,
        feature: e.tinh_nang || null,
        page: e.trang || null,
        durationMs: e.thoi_luong_ms ?? null,
        result: e.ket_qua || null,
        device: e.thiet_bi || null,
        extra: e.them ?? Prisma.JsonNull,
        occurredAt: new Date(e.luc),
      })),
    });
  }

  insertFeedback(userId: string, fb: OutFeedback) {
    return this._feedback.model.usageFeedback.createMany({
      skipDuplicates: true,
      data: [
        {
          id: fb.id,
          userId,
          email: fb.email || '',
          name: fb.ten || null,
          type: fb.loai,
          content: fb.noi_dung,
          rating: fb.muc_hai_long ?? null,
          feature: fb.tinh_nang || null,
          page: fb.trang || null,
        },
      ],
    });
  }

  /** Thao tác tính năng + lỗi, theo lúc Hub nhận. */
  listFeatureEvents(from: Date, to: Date, take: number, cursor?: UsageCursor) {
    return this._events.model.usageEvent.findMany({
      where: {
        type: { in: ['dung_tinh_nang', 'loi'] },
        createdAt: { gte: from, lt: to },
        ...after(cursor),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  listFeedback(from: Date, to: Date, take: number, cursor?: UsageCursor) {
    return this._feedback.model.usageFeedback.findMany({
      where: { createdAt: { gte: from, lt: to }, ...after(cursor) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  /**
   * Thời gian dùng theo người theo ngày (giờ Việt Nam, +07:00 cố định).
   * Lấy các (người, ngày) có sự kiện MỚI NHẬN trong [from, to), rồi tính lại
   * CẢ NGÀY đó: số "ô 30 giây" khác nhau có sự kiện (trừ phien_ket_thuc).
   * Cùng id -> Major OS ghi đè bằng số mới, không cộng dồn sai.
   */
  dailyUsage(from: Date, to: Date) {
    return this._raw.model.$queryRaw<DailyUsageRow[]>`
      WITH touched AS (
        SELECT DISTINCT "userId", ("occurredAt" + interval '7 hours')::date AS day
        FROM "UsageEvent"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      )
      SELECT e."userId" AS "userId",
             t.day AS day,
             max(e.email) AS email,
             max(e.name) AS name,
             (count(DISTINCT floor(extract(epoch FROM e."occurredAt") / 30))
               FILTER (WHERE e.type <> 'phien_ket_thuc'))::int AS cells,
             count(DISTINCT e."sessionId")::int AS sessions,
             (count(*) FILTER (WHERE e.type = 'dung_tinh_nang'))::int AS actions,
             max(e."createdAt") AS updated
      FROM touched t
      JOIN "UsageEvent" e
        ON e."userId" = t."userId"
       AND e."occurredAt" >= t.day::timestamp - interval '7 hours'
       AND e."occurredAt" < t.day::timestamp + interval '17 hours'
      GROUP BY e."userId", t.day
      ORDER BY t.day, e."userId"
    `;
  }

  /** Dọn dữ liệu thô cũ. */
  pruneBefore(date: Date) {
    return Promise.all([
      this._events.model.usageEvent.deleteMany({
        where: { createdAt: { lt: date } },
      }),
      this._feedback.model.usageFeedback.deleteMany({
        where: { createdAt: { lt: date } },
      }),
    ]);
  }

  // ---- key cho Major OS ------------------------------------------------------
  activeKeys() {
    return this._keys.model.majorOsKey.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, last4: true, createdAt: true, lastUsedAt: true },
    });
  }

  createKey(hash: string, last4: string, createdBy: string) {
    return this._keys.model.majorOsKey.create({
      data: { hash, last4, createdBy },
      select: { id: true, last4: true, createdAt: true },
    });
  }

  revokeKey(id: string) {
    return this._keys.model.majorOsKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  findActiveKey(hash: string) {
    return this._keys.model.majorOsKey.findFirst({
      where: { hash, revokedAt: null },
      select: { id: true, lastUsedAt: true },
    });
  }

  touchKey(id: string) {
    return this._keys.model.majorOsKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }
}
