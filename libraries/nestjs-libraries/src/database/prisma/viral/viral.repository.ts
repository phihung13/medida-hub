import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ViralRepository {
  constructor(
    private _posts: PrismaRepository<'viralPost'>,
    private _sources: PrismaRepository<'viralSource'>,
    private _clones: PrismaRepository<'viralClone'>
  ) {}

  // Điều kiện WHERE theo tab: pending/approved (chưa xóa), archive (bỏ qua HOẶC
  // đã xóa mềm). Mặc định: các thẻ đang hoạt động (chưa xóa).
  private tabWhere(tab?: string): any {
    if (tab === 'archive') {
      return { OR: [{ status: 'skipped', deletedAt: null }, { deletedAt: { not: null } }] };
    }
    if (tab === 'pending' || tab === 'approved' || tab === 'skipped') {
      return { status: tab, deletedAt: null };
    }
    return { deletedAt: null }; // active/all
  }

  list(
    orgId: string,
    filter: { platform?: string; level?: string; sort?: string; status?: string }
  ) {
    const orderBy =
      filter.sort === 'new'
        ? [{ createdAt: 'desc' as const }]
        : filter.sort === 'score'
        ? [{ score: { sort: 'desc' as const, nulls: 'last' as const } }, { createdAt: 'desc' as const }]
        : // mặc định: share cao nhất trước, null xuống cuối, rồi mới nhất
          [{ shares: { sort: 'desc' as const, nulls: 'last' as const } }, { createdAt: 'desc' as const }];
    return this._posts.model.viralPost.findMany({
      where: {
        organizationId: orgId,
        ...this.tabWhere(filter.status),
        ...(filter.platform && filter.platform !== 'all'
          ? { platform: filter.platform }
          : {}),
        ...(filter.level && filter.level !== 'all'
          ? { level: filter.level }
          : {}),
      },
      orderBy,
      take: 300,
    });
  }

  // Đếm cho các tab: Chờ duyệt / Đã duyệt / Lưu trữ / Bài của mình.
  async statusCounts(orgId: string) {
    const [rows, deletedCount, mineCount] = await Promise.all([
      this._posts.model.viralPost.groupBy({
        by: ['status'],
        where: { organizationId: orgId, deletedAt: null },
        _count: { _all: true },
      }),
      this._posts.model.viralPost.count({
        where: { organizationId: orgId, deletedAt: { not: null } },
      }),
      this._clones.model.viralClone.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
    ]);
    const by: Record<string, number> = { approved: 0, pending: 0, skipped: 0 };
    for (const r of rows) by[r.status] = r._count._all;
    return {
      pending: by.pending,
      approved: by.approved,
      // Lưu trữ = bỏ qua (chưa xóa) + đã xóa mềm
      archive: by.skipped + deletedCount,
      mine: mineCount,
    };
  }

  // ── Thao tác hàng loạt ────────────────────────────────────────────────────
  setStatusMany(orgId: string, ids: string[], status: string) {
    return this._posts.model.viralPost.updateMany({
      where: { id: { in: ids }, organizationId: orgId },
      data: { status, deletedAt: null }, // duyệt/bỏ qua kéo về active
    });
  }

  softDeleteMany(orgId: string, ids: string[]) {
    return this._posts.model.viralPost.updateMany({
      where: { id: { in: ids }, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  // Xóa cứng (khỏi DB) — dùng trong Lưu trữ.
  hardDelete(orgId: string, ids: string[]) {
    return this._posts.model.viralPost.deleteMany({
      where: { id: { in: ids }, organizationId: orgId },
    });
  }

  // Xóa cứng TOÀN BỘ Lưu trữ (bỏ qua + đã xóa).
  hardDeleteArchive(orgId: string) {
    return this._posts.model.viralPost.deleteMany({
      where: {
        organizationId: orgId,
        OR: [{ status: 'skipped', deletedAt: null }, { deletedAt: { not: null } }],
      },
    });
  }

  // Tự dọn Lưu trữ cũ hơn N ngày (xóa cứng). Trả số bản ghi đã xóa.
  async purgeArchiveOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const r = await this._posts.model.viralPost.deleteMany({
      where: {
        OR: [
          { status: 'skipped', deletedAt: null, updatedAt: { lt: cutoff } },
          { deletedAt: { not: null, lt: cutoff } },
        ],
      },
    });
    // dọn cả clone đã xóa mềm cũ
    await this._clones.model.viralClone.deleteMany({
      where: { deletedAt: { not: null, lt: cutoff } },
    });
    return r.count;
  }

  getByIds(orgId: string, ids: string[]) {
    return this._posts.model.viralPost.findMany({
      where: { id: { in: ids }, organizationId: orgId },
    });
  }

  // ── Bài của mình (ViralClone) ─────────────────────────────────────────────
  createClone(orgId: string, data: any) {
    return this._clones.model.viralClone.create({
      data: {
        organizationId: orgId,
        sourceId: data.sourceId || null,
        title: String(data.title || 'Bài của mình').slice(0, 300),
        content: String(data.content || '').slice(0, 6000),
        persona: data.persona ? String(data.persona).slice(0, 30) : null,
        score: typeof data.score === 'number' ? data.score : null,
        sourceScore: typeof data.sourceScore === 'number' ? data.sourceScore : null,
        scoreDetail: data.scoreDetail ? String(data.scoreDetail).slice(0, 3000) : null,
        status: 'mine',
      },
    });
  }

  listClones(orgId: string) {
    return this._clones.model.viralClone.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  getClone(orgId: string, id: string) {
    return this._clones.model.viralClone.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
  }

  updateClone(id: string, data: any) {
    return this._clones.model.viralClone.update({ where: { id }, data });
  }

  hardDeleteClone(orgId: string, id: string) {
    return this._clones.model.viralClone.deleteMany({
      where: { id, organizationId: orgId },
    });
  }

  // Bài chưa được AI chấm điểm (score null) — để chấm sau mỗi lần cào.
  unscored(orgId: string, limit = 60) {
    return this._posts.model.viralPost.findMany({
      where: { organizationId: orgId, deletedAt: null, score: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  setStatus(orgId: string, id: string, status: string) {
    return this._posts.model.viralPost.updateMany({
      where: { id, organizationId: orgId },
      data: { status },
    });
  }

  getById(orgId: string, id: string) {
    return this._posts.model.viralPost.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
  }

  async existsByUrl(orgId: string, url: string) {
    if (!url) return false;
    const found = await this._posts.model.viralPost.findFirst({
      where: { organizationId: orgId, url },
      select: { id: true },
    });
    return !!found;
  }

  // danh sách org có nguồn auto (cho scheduler cào định kỳ)
  orgIdsWithAutoSources() {
    return this._sources.model.viralSource.findMany({
      where: { auto: true, deletedAt: null },
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
  }

  autoSources(orgId: string) {
    return this._sources.model.viralSource.findMany({
      where: { organizationId: orgId, auto: true, deletedAt: null },
    });
  }

  // Mọi nguồn còn sống — cho nút "Cào ngay" (người dùng bấm tay thì quét hết,
  // kể cả nguồn chưa bật lịch tự động).
  allSources(orgId: string) {
    return this._sources.model.viralSource.findMany({
      where: { organizationId: orgId, deletedAt: null },
    });
  }

  private num(v: any) {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  }

  create(orgId: string, body: any) {
    return this._posts.model.viralPost.create({
      data: {
        organizationId: orgId,
        platform: String(body.platform || 'facebook'),
        level: String(body.level || 'all'),
        title: String(body.title || 'Bài viral').slice(0, 300),
        sourceName: body.sourceName ? String(body.sourceName).slice(0, 120) : null,
        url: body.url ? String(body.url).slice(0, 800) : null,
        thumbnail: body.thumbnail ? String(body.thumbnail).slice(0, 800) : null,
        content: body.content ? String(body.content).slice(0, 5000) : null,
        shares: this.num(body.shares),
        likes: this.num(body.likes),
        comments: this.num(body.comments),
        views: this.num(body.views),
        origin: body.origin === 'auto' ? 'auto' : 'manual',
      },
    });
  }

  update(id: string, data: any) {
    return this._posts.model.viralPost.update({ where: { id }, data });
  }

  softDelete(orgId: string, id: string) {
    return this._posts.model.viralPost.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  stats(orgId: string) {
    return Promise.all([
      this._posts.model.viralPost.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
      this._posts.model.viralPost.aggregate({
        where: { organizationId: orgId, deletedAt: null },
        _sum: { shares: true, clonedCount: true },
      }),
      this._sources.model.viralSource.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
    ]);
  }

  // sources
  listSources(orgId: string) {
    return this._sources.model.viralSource.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  createSource(orgId: string, body: any) {
    return this._sources.model.viralSource.create({
      data: {
        organizationId: orgId,
        platform: String(body.platform || 'facebook'),
        name: String(body.name || 'Nguồn').slice(0, 120),
        url: body.url ? String(body.url).slice(0, 800) : null,
        auto: !!body.auto,
      },
    });
  }

  deleteSource(orgId: string, id: string) {
    return this._sources.model.viralSource.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  setSourceAuto(orgId: string, id: string, auto: boolean) {
    return this._sources.model.viralSource.updateMany({
      where: { id, organizationId: orgId },
      data: { auto },
    });
  }
}
