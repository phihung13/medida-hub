import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ViralGroupRepository } from '@gitroom/nestjs-libraries/database/prisma/viral/viral-group.repository';
import { ViralRepository } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.repository';
import { ViralService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.service';

// ── Khu "Group Facebook" ──────────────────────────────────────────────────
// Luồng mỗi kỳ (đối tác cào = Claude qua Public API):
//   GET  /public/v1/viral/groups          → danh sách group cần cào
//   POST /public/v1/viral/groups/posts    → từng bài (link, group, chủ đề, loại)
//   POST /public/v1/viral/groups/finish   → kết kỳ + chủ đề hot / câu hỏi nhiều
// Không gọi AI ở đâu cả. Không vào phễu content — chỉ khi người bấm "Làm content".

export const GROUP_POST_KINDS = ['hoi', 'chia_se', 'review', 'phan_nan', 'khac'] as const;
const LEVELS = ['mn', 'th', 'cs', 'pt', 'all'];

type TopicStat = {
  topic: string;
  posts: number;
  comments: number;
  groups: string[];
  urls: string[];
  note?: string;
};

const str = (v: any, max: number) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : '';
};
const int = (v: any) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[.,\s]/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

@Injectable()
export class ViralGroupService {
  constructor(
    private _repo: ViralGroupRepository,
    private _viral: ViralService
  ) {}

  // facebook.com/groups/<id|slug> → 1 dạng duy nhất (bỏ www/m/query/slash).
  static normGroupUrl(u?: string | null): string {
    const raw = String(u || '').trim();
    if (!raw) return '';
    const s = raw
      .replace(/^https?:\/\//i, '')
      .replace(/^(www\.|m\.|web\.|mbasic\.)/i, '');
    const m = s.match(/^facebook\.com\/groups\/([^/?#]+)/i);
    if (m) return `https://www.facebook.com/groups/${m[1].toLowerCase()}`;
    return ViralRepository.normUrl(raw);
  }

  private static stripHost(u: string) {
    return u
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^(www\.|m\.|web\.|mbasic\.)/i, '');
  }

  // Link trỏ vào TRANG group (không phải 1 bài cụ thể)?
  static isGroupHome(u: string) {
    return /^facebook\.com\/groups\/[^/?#]+\/?(?:[?#].*)?$/i.test(
      ViralGroupService.stripHost(u)
    );
  }

  // Khoá chống trùng của 1 bài: id bài Facebook nếu đọc được (cùng bài dù
  // link có www/m/tham số khác nhau), không thì URL chuẩn hoá.
  static postKey(u: string) {
    const s = ViralGroupService.stripHost(u);
    const m =
      s.match(/^facebook\.com\/groups\/[^/?#]+\/(?:posts|permalink)\/(\d+)/i) ||
      s.match(/[?&](?:story_fbid|multi_permalinks)=(\d+)/i);
    if (m) return 'fbpost:' + m[1];
    return ViralRepository.normUrl('https://www.' + s);
  }

  // ── Group ──────────────────────────────────────────────────────────────
  async listGroups(orgId: string, onlyActive = false) {
    const [groups, counts] = await Promise.all([
      this._repo.listGroups(orgId, onlyActive),
      this._repo.postCountsByGroup(orgId, new Date(Date.now() - 30 * 86400000)),
    ]);
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      url: g.url,
      area: g.area,
      note: g.note,
      active: g.active,
      lastCrawledAt: g.lastCrawledAt,
      posts30d: counts.get(g.id) || 0,
    }));
  }

  async addGroup(
    orgId: string,
    body: { url?: string; name?: string; area?: string; note?: string }
  ) {
    const url = ViralGroupService.normGroupUrl(body.url);
    if (!/facebook\.com\/groups\//.test(url)) {
      throw new HttpException('Link group không hợp lệ (cần dạng facebook.com/groups/...).', 400);
    }
    const existing = await this._repo.findGroupByUrl(orgId, url);
    const name =
      str(body.name, 160) ||
      (existing && !existing.deletedAt ? existing.name : '') ||
      url.split('/groups/')[1];
    return this._repo.upsertGroup(orgId, {
      url,
      name,
      area: body.area !== undefined ? str(body.area, 160) : undefined,
      note: body.note !== undefined ? str(body.note, 500) : undefined,
    });
  }

  updateGroup(
    orgId: string,
    id: string,
    body: { name?: string; area?: string; note?: string; active?: boolean }
  ) {
    const data: any = {};
    if (body.name !== undefined && str(body.name, 160)) data.name = str(body.name, 160);
    if (body.area !== undefined) data.area = str(body.area, 160) || null;
    if (body.note !== undefined) data.note = str(body.note, 500) || null;
    if (typeof body.active === 'boolean') data.active = body.active;
    return this._repo.updateGroup(orgId, id, data);
  }

  deleteGroup(orgId: string, id: string) {
    return this._repo.deleteGroup(orgId, id);
  }

  // ── Nhận 1 bài từ đối tác ──────────────────────────────────────────────
  async capture(
    orgId: string,
    body: {
      groupUrl?: string;
      groupName?: string;
      url?: string;
      author?: string;
      text?: string;
      topic?: string;
      kind?: string;
      level?: string;
      likes?: any;
      comments?: any;
      shares?: any;
      postedAt?: string;
      topComments?: string[];
    }
  ): Promise<{ id?: string; duplicated?: boolean; groupId?: string }> {
    const text = str(body.text, 6000);
    if (!text) throw new HttpException('Thiếu text (nội dung bài).', 400);
    const groupUrl = ViralGroupService.normGroupUrl(body.groupUrl);
    if (!/facebook\.com\/groups\//.test(groupUrl)) {
      throw new HttpException('Thiếu hoặc sai groupUrl (facebook.com/groups/...).', 400);
    }
    // link bài: bỏ nếu chỉ là link group (không phải permalink)
    let url = str(body.url, 800);
    if (url && ViralGroupService.isGroupHome(url)) url = '';
    const dedupKey = url
      ? ViralGroupService.postKey(url)
      : 'g:' +
        createHash('sha1')
          .update(groupUrl + '|' + text.toLowerCase().replace(/\s+/g, ' ').slice(0, 400))
          .digest('hex');
    if (await this._repo.existsPost(orgId, dedupKey)) return { duplicated: true };

    // group chưa có trong danh sách → tự thêm (đối tác cào group mới)
    let group = await this._repo.findGroupByUrl(orgId, groupUrl);
    const givenName = str(body.groupName, 160);
    if (!group || group.deletedAt) {
      group = await this._repo.upsertGroup(orgId, {
        url: groupUrl,
        name: givenName || groupUrl.split('/groups/')[1],
      });
    } else if (givenName && group.name === groupUrl.split('/groups/')[1]) {
      // tên tạm (id group) → thay bằng tên thật người cào đọc được
      await this._repo.updateGroup(orgId, group.id, { name: givenName });
      group = { ...group, name: givenName };
    }

    const postedAt = body.postedAt ? new Date(body.postedAt) : null;
    const kind = (GROUP_POST_KINDS as readonly string[]).includes(String(body.kind))
      ? String(body.kind)
      : 'khac';
    const topComments = Array.isArray(body.topComments)
      ? body.topComments.map((c) => str(c, 400)).filter(Boolean).slice(0, 5)
      : [];
    const created = await this._repo.createPost(orgId, {
      groupId: group.id,
      groupName: givenName || group.name,
      url: url || null,
      dedupKey,
      author: str(body.author, 120) || null,
      content: text,
      topic: str(body.topic, 120) || null,
      kind,
      level: LEVELS.includes(String(body.level)) ? String(body.level) : 'all',
      likes: int(body.likes),
      comments: int(body.comments),
      shares: int(body.shares),
      topComments: topComments.length ? JSON.stringify(topComments) : null,
      postedAt: postedAt && !isNaN(postedAt.getTime()) ? postedAt : null,
    });
    return { id: created.id, groupId: group.id };
  }

  // ── Kết kỳ: gom bài chưa thuộc kỳ nào + chủ đề hot / câu hỏi nhiều ─────
  async finish(
    orgId: string,
    body: { summary?: string; hotTopics?: any[]; askedTopics?: any[] }
  ) {
    const posts = await this._repo.openPosts(orgId, 4);
    const computed = this.computeTopics(posts);
    const hotTopics = this.cleanTopics(body.hotTopics) || computed.hot;
    const askedTopics = this.cleanTopics(body.askedTopics) || computed.asked;
    const groupIds = Array.from(new Set(posts.map((p) => p.groupId).filter(Boolean))) as string[];
    if (!posts.length && !hotTopics.length && !askedTopics.length) {
      return { ok: true, posts: 0, note: 'Không có bài mới nào để kết kỳ.' };
    }
    const batch = await this._repo.createBatch(orgId, {
      summary: str(body.summary, 4000) || null,
      hotTopics: JSON.stringify(hotTopics),
      askedTopics: JSON.stringify(askedTopics),
      postCount: posts.length,
      groupCount: groupIds.length,
    });
    await this._repo.attachToBatch(orgId, posts.map((p) => p.id), batch.id);
    await this._repo.touchGroups(orgId, groupIds);
    return {
      ok: true,
      batchId: batch.id,
      posts: posts.length,
      groups: groupIds.length,
      hotTopics: hotTopics.length,
      askedTopics: askedTopics.length,
    };
  }

  // Đếm theo nhãn chủ đề người cào gắn — hot = nhiều bài + nhiều bình luận,
  // hỏi nhiều = chỉ tính bài loại "hoi".
  private computeTopics(posts: any[]) {
    const build = (list: any[]) => {
      const by = new Map<string, TopicStat & { score: number }>();
      for (const p of list) {
        const label = String(p.topic || '').trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const cur =
          by.get(key) ||
          ({ topic: label, posts: 0, comments: 0, groups: [], urls: [], score: 0 } as any);
        cur.posts++;
        cur.comments += p.comments || 0;
        if (p.groupName && !cur.groups.includes(p.groupName)) cur.groups.push(p.groupName);
        if (p.url && cur.urls.length < 3) cur.urls.push(p.url);
        cur.score = cur.posts * 10 + cur.comments;
        by.set(key, cur);
      }
      return Array.from(by.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ score, ...rest }) => rest);
    };
    return { hot: build(posts), asked: build(posts.filter((p) => p.kind === 'hoi')) };
  }

  private cleanTopics(list?: any[]): TopicStat[] | null {
    if (!Array.isArray(list) || !list.length) return null;
    return list
      .map((x) => ({
        topic: str(x?.topic ?? x?.label ?? x?.question, 160),
        posts: int(x?.posts ?? x?.count) || 0,
        comments: int(x?.comments) || 0,
        groups: (Array.isArray(x?.groups) ? x.groups : [])
          .map((g: any) => str(g, 160))
          .filter(Boolean)
          .slice(0, 10),
        urls: (Array.isArray(x?.urls) ? x.urls : [])
          .map((u: any) => str(u, 500))
          .filter((u: string) => /^https?:\/\//.test(u))
          .slice(0, 5),
        note: str(x?.note ?? x?.why, 400) || undefined,
      }))
      .filter((x) => x.topic)
      .slice(0, 20);
  }

  // ── Cho giao diện ──────────────────────────────────────────────────────
  async batches(orgId: string) {
    const rows = await this._repo.listBatches(orgId, 20);
    return rows.map((b) => this.shapeBatch(b));
  }

  private shapeBatch(b: any) {
    const parse = (s?: string | null) => {
      try {
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    };
    return {
      id: b.id,
      createdAt: b.createdAt,
      summary: b.summary,
      postCount: b.postCount,
      groupCount: b.groupCount,
      hotTopics: parse(b.hotTopics),
      askedTopics: parse(b.askedTopics),
    };
  }

  async posts(
    orgId: string,
    f: { batch?: string; group?: string; kind?: string; topic?: string; q?: string }
  ) {
    const rows = await this._repo.listPosts(orgId, {
      batchId: f.batch || undefined,
      groupId: f.group || undefined,
      kind: f.kind || undefined,
      topic: f.topic || undefined,
      q: str(f.q, 100) || undefined,
      days: f.batch ? undefined : 30,
    });
    const stages = await this._viral
      .contentStages(
        orgId,
        rows.map((p) => p.pushedTopicId || '')
      )
      .catch(() => ({} as Record<string, { stage: string; score: number | null }>));
    return rows.map((p) => ({
      id: p.id,
      groupId: p.groupId,
      groupName: p.groupName,
      url: p.url,
      author: p.author,
      content: p.content,
      topic: p.topic,
      kind: p.kind,
      level: p.level,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      topComments: (() => {
        try {
          return p.topComments ? JSON.parse(p.topComments) : [];
        } catch {
          return [];
        }
      })(),
      postedAt: p.postedAt,
      createdAt: p.createdAt,
      batchId: p.batchId,
      pushedTopicId: p.pushedTopicId,
      contentStage: p.pushedTopicId ? stages[p.pushedTopicId]?.stage || null : null,
      contentScore: p.pushedTopicId ? stages[p.pushedTopicId]?.score ?? null : null,
    }));
  }

  deletePost(orgId: string, id: string) {
    return this._repo.deletePost(orgId, id);
  }

  deleteBatch(orgId: string, id: string) {
    return this._repo.deleteBatch(orgId, id);
  }

  // Đưa 1 bài group sang phễu content (thành 1 content 1 nguồn, AI tổng hợp
  // như "Thêm bài viral" tay). Bấm lại lần 2 thì trả content đã tạo.
  async toContent(orgId: string, id: string) {
    const p = await this._repo.getPost(orgId, id);
    if (!p) throw new HttpException('Không tìm thấy bài.', 404);
    if (p.pushedTopicId) {
      // Bấm lại khi content còn kẹt "AI đang tổng hợp" -> tổng hợp lại.
      const retried =
        p.pushedTopicId !== 'pushed' &&
        (await this._viral
          .resynthesizeTopic(orgId, p.pushedTopicId)
          .catch(() => false));
      return { topicId: p.pushedTopicId, existed: true, retried };
    }
    let comments: string[] = [];
    try {
      comments = p.topComments ? JSON.parse(p.topComments) : [];
    } catch {
      comments = [];
    }
    const text = [
      p.content,
      comments.length ? '\nBình luận tiêu biểu:\n- ' + comments.join('\n- ') : '',
      `\nNguồn: ${p.groupName} (group Facebook)`,
      `Lượt share: ${p.shares ?? 0}, like: ${p.likes ?? 0}, comment: ${p.comments ?? 0}`,
    ]
      .filter(Boolean)
      .join('\n');
    const created: any = await this._viral.capture(orgId, {
      url: p.url || undefined,
      text,
      platform: 'facebook',
      level: p.level,
      sourceName: p.groupName,
      sourceType: 'group',
    });
    const topicId = created?.topicId || null;
    await this._repo.updatePost(orgId, id, { pushedTopicId: topicId || 'pushed' });
    return { topicId, existed: false };
  }
}
