import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

// Khu "Group Facebook" — group theo dõi, bài thô từng group, tổng hợp mỗi kỳ.
@Injectable()
export class ViralGroupRepository {
  constructor(
    private _groups: PrismaRepository<'viralGroup'>,
    private _posts: PrismaRepository<'viralGroupPost'>,
    private _batches: PrismaRepository<'viralGroupBatch'>
  ) {}

  // ── Group ──────────────────────────────────────────────────────────────
  listGroups(orgId: string, onlyActive = false) {
    return this._groups.model.viralGroup.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(onlyActive ? { active: true } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findGroupByUrl(orgId: string, url: string) {
    return this._groups.model.viralGroup.findUnique({
      where: { organizationId_url: { organizationId: orgId, url } },
    });
  }

  // Thêm hoặc hồi sinh group (đã xoá mềm thì bật lại). Tên chỉ ghi đè khi có.
  upsertGroup(
    orgId: string,
    data: { url: string; name: string; area?: string | null; note?: string | null }
  ) {
    return this._groups.model.viralGroup.upsert({
      where: { organizationId_url: { organizationId: orgId, url: data.url } },
      create: {
        organizationId: orgId,
        url: data.url,
        name: data.name,
        area: data.area || null,
        note: data.note || null,
      },
      update: {
        deletedAt: null,
        name: data.name,
        ...(data.area !== undefined ? { area: data.area || null } : {}),
        ...(data.note !== undefined ? { note: data.note || null } : {}),
      },
    });
  }

  updateGroup(
    orgId: string,
    id: string,
    data: { name?: string; area?: string | null; note?: string | null; active?: boolean }
  ) {
    return this._groups.model.viralGroup.updateMany({
      where: { id, organizationId: orgId, deletedAt: null },
      data,
    });
  }

  deleteGroup(orgId: string, id: string) {
    return this._groups.model.viralGroup.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  touchGroups(orgId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve({ count: 0 });
    return this._groups.model.viralGroup.updateMany({
      where: { organizationId: orgId, id: { in: ids } },
      data: { lastCrawledAt: new Date() },
    });
  }

  async postCountsByGroup(orgId: string, since: Date) {
    const rows = await this._posts.model.viralGroupPost.groupBy({
      by: ['groupId'],
      where: { organizationId: orgId, deletedAt: null, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.groupId || '', r._count._all]));
  }

  // ── Bài ────────────────────────────────────────────────────────────────
  existsPost(orgId: string, dedupKey: string) {
    return this._posts.model.viralGroupPost.findUnique({
      where: { organizationId_dedupKey: { organizationId: orgId, dedupKey } },
      select: { id: true },
    });
  }

  createPost(orgId: string, data: any) {
    return this._posts.model.viralGroupPost.create({
      data: { organizationId: orgId, ...data },
    });
  }

  listPosts(
    orgId: string,
    f: {
      batchId?: string;
      groupId?: string;
      kind?: string;
      topic?: string;
      q?: string;
      days?: number;
      take?: number;
    }
  ) {
    const where: any = { organizationId: orgId, deletedAt: null };
    if (f.batchId === 'open') where.batchId = null;
    else if (f.batchId) where.batchId = f.batchId;
    else if (f.days) where.createdAt = { gte: new Date(Date.now() - f.days * 86400000) };
    if (f.groupId) where.groupId = f.groupId;
    if (f.kind) where.kind = f.kind;
    if (f.topic) where.topic = { equals: f.topic, mode: 'insensitive' };
    if (f.q) {
      where.OR = [
        { content: { contains: f.q, mode: 'insensitive' } },
        { topic: { contains: f.q, mode: 'insensitive' } },
      ];
    }
    return this._posts.model.viralGroupPost.findMany({
      where,
      orderBy: [{ comments: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: Math.min(f.take || 200, 500),
    });
  }

  getPost(orgId: string, id: string) {
    return this._posts.model.viralGroupPost.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
  }

  updatePost(orgId: string, id: string, data: any) {
    return this._posts.model.viralGroupPost.updateMany({
      where: { id, organizationId: orgId },
      data,
    });
  }

  deletePost(orgId: string, id: string) {
    return this._posts.model.viralGroupPost.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  // Bài chưa thuộc kỳ nào trong N ngày gần nhất — gom vào kỳ khi kết mẻ.
  openPosts(orgId: string, days = 4) {
    return this._posts.model.viralGroupPost.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        batchId: null,
        createdAt: { gte: new Date(Date.now() - days * 86400000) },
      },
    });
  }

  attachToBatch(orgId: string, ids: string[], batchId: string) {
    return this._posts.model.viralGroupPost.updateMany({
      where: { organizationId: orgId, id: { in: ids } },
      data: { batchId },
    });
  }

  // ── Kỳ cào ─────────────────────────────────────────────────────────────
  createBatch(orgId: string, data: any) {
    return this._batches.model.viralGroupBatch.create({
      data: { organizationId: orgId, ...data },
    });
  }

  listBatches(orgId: string, take = 20) {
    return this._batches.model.viralGroupBatch.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  getBatch(orgId: string, id: string) {
    return this._batches.model.viralGroupBatch.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  deleteBatch(orgId: string, id: string) {
    return this._batches.model.viralGroupBatch.deleteMany({
      where: { id, organizationId: orgId },
    });
  }
}
