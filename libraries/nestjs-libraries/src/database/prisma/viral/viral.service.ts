import { Injectable, OnModuleInit } from '@nestjs/common';
import { ViralRepository } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { getViralConfig } from '@gitroom/nestjs-libraries/viral/viral.keys';
import {
  VIRAL_PERSONAS,
  VIRAL_RUBRIC,
  viralStatusForScore,
} from '@gitroom/nestjs-libraries/viral/viral.personas';

// Entity HTML có tên hay gặp trong RSS tiếng Việt (báo VN dùng Latin-1 có dấu).
const RSS_ENTITIES: Record<string, string> = {
  yacute: 'ý', Yacute: 'Ý', aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À',
  acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã', eacute: 'é', Eacute: 'É',
  egrave: 'è', Egrave: 'È', ecirc: 'ê', Ecirc: 'Ê', iacute: 'í', Iacute: 'Í',
  igrave: 'ì', Igrave: 'Ì', oacute: 'ó', Oacute: 'Ó', ograve: 'ò', Ograve: 'Ò',
  ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ', uacute: 'ú', Uacute: 'Ú',
  ugrave: 'ù', Ugrave: 'Ù', ndash: '–', mdash: '—', hellip: '…',
};

// Giải mã entity HTML (RSS báo VN hay để &yacute; &amp; &#233; ...).
export const decodeEntities = (s?: string | null): string => {
  if (!s) return s || '';
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&([A-Za-z]+);/g, (m, name) => RSS_ENTITIES[name] ?? m);
};

// "Phát hiện" (Discover): bắt bài viral → AI mổ công thức + chấm điểm theo
// chân dung → duyệt → nhân bản. Thước đo chính: lượt share.
@Injectable()
export class ViralService implements OnModuleInit {
  constructor(
    private _repo: ViralRepository,
    private _openai: OpenaiService,
    private _postsService: PostsService,
    private _integrationService: IntegrationService
  ) {}

  // Scheduler cào định kỳ — CHỈ chạy ở tiến trình backend (main.ts set cờ),
  // không chạy ở orchestrator để tránh cào 2 lần.
  onModuleInit() {
    if (process.env.RUN_VIRAL_CRAWLER !== '1') return;
    const tick = async () => {
      const hours = getViralConfig().crawlEveryHours;
      if (!hours || hours <= 0) return;
      try {
        const orgs = await this._repo.orgIdsWithAutoSources();
        for (const { organizationId } of orgs) {
          await this.crawlAll(organizationId).catch(() => null);
        }
      } catch {
        /* bỏ qua vòng lỗi */
      }
    };
    // chạy 1 lần sau 60s khi khởi động, rồi mỗi giờ kiểm xem tới hạn chưa
    let lastRun = 0;
    setTimeout(() => tick().then(() => (lastRun = Date.now())), 60000);
    setInterval(() => {
      const hours = getViralConfig().crawlEveryHours;
      if (hours > 0 && Date.now() - lastRun >= hours * 3600000) {
        tick().then(() => (lastRun = Date.now()));
      }
    }, 3600000);

    // Tự dọn Lưu trữ (bỏ qua + đã xóa) cũ hơn 7 ngày — chạy sau 2 phút rồi mỗi 6h.
    const purge = () =>
      this._repo.purgeArchiveOlderThan(7).catch(() => null);
    setTimeout(purge, 120000);
    setInterval(purge, 6 * 3600000);
  }

  async list(
    orgId: string,
    filter: { platform?: string; level?: string; sort?: string; status?: string }
  ) {
    const items = await this._repo.list(orgId, filter);
    // Giải mã entity ngay khi trả về (bài cũ cào trước bản vá vẫn hiện đúng)
    return items.map((p: any) => ({
      ...p,
      title: decodeEntities(p.title),
      content: decodeEntities(p.content),
    }));
  }

  async stats(orgId: string) {
    const [total, sums, sources] = await this._repo.stats(orgId);
    return {
      total,
      totalShares: sums._sum.shares || 0,
      cloned: sums._sum.clonedCount || 0,
      sources,
    };
  }

  // Tải trang web (link báo/blog/bài công khai) → rút og:title/og:image + text thô.
  private async fetchUrl(url: string): Promise<{
    title?: string;
    image?: string;
    text?: string;
  }> {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SocialHubBot/1.0)' },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
      const html = (await res.text()).slice(0, 400000);
      const pick = (re: RegExp) => html.match(re)?.[1]?.trim();
      const title =
        pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ||
        pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title/i) ||
        pick(/<title[^>]*>([^<]+)<\/title>/i);
      const image =
        pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) ||
        pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i);
      // text thô: bỏ script/style/tag
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 12000);
      return { title, image, text };
    } catch {
      return {};
    }
  }

  // YouTube: fetch trang chỉ ra mã JS nội bộ (ytcfg) → AI bó tay. Dùng oEmbed
  // (free, không cần key) lấy title/kênh/thumbnail; có key YouTube thì lấy thêm
  // view/like/comment qua Data API.
  private async youtubeMeta(url: string): Promise<{
    title?: string;
    author?: string;
    thumbnail?: string;
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    description?: string;
  } | null> {
    const idMatch = url.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/
    );
    if (!idMatch && !/youtube\.com|youtu\.be/.test(url)) return null;
    const out: any = {};
    try {
      const oe = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (oe.ok) {
        const d: any = await oe.json();
        out.title = d.title;
        out.author = d.author_name;
        out.thumbnail = d.thumbnail_url;
      }
    } catch {
      /* oEmbed lỗi — thử tiếp Data API */
    }
    const key = getViralConfig().youtubeKey;
    const videoId = idMatch?.[1];
    if (key && videoId) {
      try {
        const st = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${key}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (st.ok) {
          const d: any = await st.json();
          const v = d.items?.[0];
          if (v) {
            out.title = out.title || v.snippet?.title;
            out.author = out.author || v.snippet?.channelTitle;
            out.thumbnail =
              out.thumbnail || v.snippet?.thumbnails?.high?.url;
            out.description = (v.snippet?.description || '').slice(0, 1500);
            out.views = Number(v.statistics?.viewCount) || null;
            out.likes = Number(v.statistics?.likeCount) || null;
            out.comments = Number(v.statistics?.commentCount) || null;
          }
        }
      } catch {
        /* thiếu stats vẫn dùng được oEmbed */
      }
    }
    return out.title ? out : null;
  }

  // Link Facebook: page HTML chặn bot → thử Graph og_object (app token) lấy
  // tiêu đề/mô tả/ảnh + share count của chính URL đó.
  private async fbOgObject(url: string): Promise<{
    title?: string;
    description?: string;
    image?: string;
    shares?: number | null;
  } | null> {
    const id = process.env.FACEBOOK_APP_ID;
    const secret = process.env.FACEBOOK_APP_SECRET;
    if (!id || !secret) return null;
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/?id=${encodeURIComponent(url)}&fields=og_object{title,description,image},engagement&access_token=${id}|${secret}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      const og = data?.og_object;
      if (!og && !data?.engagement) return null;
      return {
        title: og?.title,
        description: og?.description,
        image: og?.image?.[0]?.url || og?.image?.url,
        shares:
          typeof data?.engagement?.share_count === 'number'
            ? data.engagement.share_count
            : null,
      };
    } catch {
      return null;
    }
  }

  // Tra lượt share của MỘT URL qua Graph API (free, dùng app token sẵn có).
  // Chỉ chạy cho link web/báo — bài FB gốc không tra được (Meta không cho).
  private async fbShareCount(url: string): Promise<number | null> {
    const id = process.env.FACEBOOK_APP_ID;
    const secret = process.env.FACEBOOK_APP_SECRET;
    if (!id || !secret) return null;
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/?id=${encodeURIComponent(url)}&fields=engagement&access_token=${id}|${secret}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      return typeof data?.engagement?.share_count === 'number'
        ? data.engagement.share_count
        : null;
    } catch {
      return null;
    }
  }

  // Thêm bài viral: AI đọc (link/text/ảnh) → metadata → lưu.
  async capture(
    orgId: string,
    body: {
      url?: string;
      text?: string;
      images?: { base64: string; mediaType: string }[];
      platform?: string;
      level?: string;
    }
  ) {
    let pageTitle: string | undefined;
    let pageImage: string | undefined;
    let pageText: string | undefined;
    let ytStats: Awaited<ReturnType<typeof this.youtubeMeta>> = null;
    let fbOg: Awaited<ReturnType<typeof this.fbOgObject>> = null;
    let forcedPlatform: string | undefined;

    if (body.url) {
      if (/youtube\.com|youtu\.be/.test(body.url)) {
        // YouTube: trang render bằng JS, fetch thô chỉ ra ytcfg → dùng oEmbed/API
        ytStats = await this.youtubeMeta(body.url);
        if (ytStats) {
          forcedPlatform = 'youtube';
          pageTitle = ytStats.title;
          pageImage = ytStats.thumbnail;
          pageText = [ytStats.title, ytStats.author, ytStats.description]
            .filter(Boolean)
            .join('\n');
        }
      } else if (/facebook\.com|fb\.watch|fb\.com/.test(body.url)) {
        // Facebook: HTML chặn bot → hỏi Graph og_object trước, fetch làm dự phòng
        forcedPlatform = 'facebook';
        fbOg = await this.fbOgObject(body.url);
        const page = await this.fetchUrl(body.url);
        pageTitle = fbOg?.title || page.title;
        pageImage = fbOg?.image || page.image;
        pageText =
          [fbOg?.title, fbOg?.description].filter(Boolean).join('\n') ||
          page.text;
      } else {
        const page = await this.fetchUrl(body.url);
        pageTitle = page.title;
        pageImage = page.image;
        pageText = page.text;
      }
    }

    const ai = await this._openai
      .viralAnalyze({
        url: body.url,
        text: body.text || pageText,
        images: body.images,
      })
      .catch(() => null);

    // share của link web/báo: tra Graph API nếu AI không đọc được số
    let shares = ai?.shares ?? fbOg?.shares ?? null;
    if (shares == null && body.url) {
      shares = await this.fbShareCount(body.url);
    }

    const created = await this._repo.create(orgId, {
      platform: body.platform || forcedPlatform || ai?.platform || 'facebook',
      level: body.level || ai?.level || 'all',
      title: ai?.title || pageTitle || body.text?.slice(0, 120) || body.url || 'Bài viral',
      sourceName: ai?.sourceName || ytStats?.author || (body.url ? new URL(body.url).hostname : null),
      url: body.url || null,
      thumbnail: pageImage || null,
      content: ai?.content || pageText || body.text || null,
      shares,
      likes: ai?.likes ?? ytStats?.likes ?? null,
      comments: ai?.comments ?? ytStats?.comments ?? null,
      views: ai?.views ?? ytStats?.views ?? null,
      origin: 'manual',
    });

    // chấm điểm ngay để thẻ hiện điểm + trạng thái (lỗi chấm không chặn bắt bài)
    await this.scoreUnscored(orgId, 3).catch(() => null);
    return this._repo.getById(orgId, created.id);
  }

  // Mổ công thức (cache vào formula để không tốn token gọi lại).
  async formula(orgId: string, id: string) {
    const post = await this._repo.getById(orgId, id);
    if (!post) return null;
    if (post.formula) {
      try {
        return { post, formula: JSON.parse(post.formula) };
      } catch {
        /* cache hỏng → mổ lại */
      }
    }
    const formula = await this._openai.viralFormula({
      title: post.title,
      content: post.content,
      platform: post.platform,
      shares: post.shares,
    });
    if (formula) {
      await this._repo.update(id, { formula: JSON.stringify(formula) });
    }
    return { post, formula };
  }

  // Nhân bản: sinh bài mới theo công thức → BẢN NHÁP vào hàng chờ duyệt.
  async clone(orgId: string, id: string, integrationId: string) {
    const data = await this.formula(orgId, id);
    if (!data?.formula) return null;
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) return null;

    const content = await this._openai.viralClone({
      formula: data.formula,
      original: { title: data.post.title, platform: data.post.platform },
      target: {
        channelName: integration.name,
        platform: integration.providerIdentifier,
        level: data.post.level,
      },
    });

    const nextTime = await this._postsService.findFreeDateTime(orgId);
    await this._postsService.createPost(
      orgId,
      {
        date: nextTime + 'Z',
        order: makeId(10),
        shortLink: false,
        type: 'draft',
        tags: [],
        posts: [
          {
            settings: {
              __type: integration.providerIdentifier as any,
              title: '',
              tags: [],
              subreddit: [],
            },
            group: makeId(10),
            integration: { id: integration.id },
            value: [
              {
                id: makeId(10),
                delay: 0,
                content: content.replace(/\n/g, '\n\n'),
                image: [],
              },
            ],
          },
        ],
      } as any,
      'MCP' as any
    );

    await this._repo.update(id, { clonedCount: (data.post.clonedCount || 0) + 1 });
    return { ok: true, content };
  }

  delete(orgId: string, id: string) {
    return this._repo.softDelete(orgId, id);
  }

  // ── THAO TÁC HÀNG LOẠT ────────────────────────────────────────────────────
  bulkStatus(orgId: string, ids: string[], status: string) {
    const valid = ['approved', 'pending', 'skipped'];
    if (!valid.includes(status)) throw new Error('Trạng thái không hợp lệ');
    return this._repo.setStatusMany(orgId, ids, status);
  }

  bulkSoftDelete(orgId: string, ids: string[]) {
    return this._repo.softDeleteMany(orgId, ids);
  }

  // Clone hàng loạt → "Bài của mình". Chạy NỀN (mỗi bài 1 lần gọi AI) rồi thẻ
  // hiện dần ở tab Bài của mình. Trả số bài đưa vào hàng đợi.
  async bulkCloneToMine(orgId: string, ids: string[]): Promise<{ queued: number }> {
    const posts = await this._repo.getByIds(orgId, ids);
    const toClone = posts.filter((p: any) => !p.deletedAt);
    (async () => {
      for (const p of toClone) {
        await this.cloneToMine(orgId, p).catch(() => null);
      }
    })();
    return { queued: toClone.length };
  }

  // Viết lại 1 bài viral thành "Bài của mình" (tốt hơn) + chấm điểm lại.
  private async cloneToMine(orgId: string, post: any) {
    const personasText = VIRAL_PERSONAS.map(
      (p) => `- ${p.code} (${p.label}): ${p.profile}`
    ).join('\n');
    const res = await this._openai
      .viralRewriteAndScore({
        title: post.title,
        content: post.content,
        prevContent: post.aiContent,
        prevScore: post.score,
        persona: post.persona,
        personasText,
        rubric: VIRAL_RUBRIC,
      })
      .catch(() => null);
    if (!res?.content) return null;
    const clone = await this._repo.createClone(orgId, {
      sourceId: post.id,
      title: post.title,
      content: res.content,
      persona: res.persona || post.persona,
      score: typeof res.score === 'number' ? Math.round(res.score) : null,
      sourceScore: post.score ?? null,
      scoreDetail: JSON.stringify({
        scores: res.scores || {},
        verdict: res.verdict || '',
        reason: res.reason || '',
      }),
    });
    await this._repo
      .update(post.id, { clonedCount: (post.clonedCount || 0) + 1 })
      .catch(() => null);
    return clone;
  }

  // ── BÀI CỦA MÌNH ──────────────────────────────────────────────────────────
  listClones(orgId: string) {
    return this._repo.listClones(orgId);
  }

  async regenerateClone(orgId: string, cloneId: string) {
    const clone = await this._repo.getClone(orgId, cloneId);
    if (!clone) return null;
    const personasText = VIRAL_PERSONAS.map(
      (p) => `- ${p.code} (${p.label}): ${p.profile}`
    ).join('\n');
    // nguồn để so: bản clone hiện tại (viết cho hơn nó)
    const source = clone.sourceId
      ? await this._repo.getById(orgId, clone.sourceId)
      : null;
    const res = await this._openai
      .viralRewriteAndScore({
        title: clone.title,
        content: source?.content || clone.content,
        prevContent: clone.content,
        prevScore: clone.score,
        persona: clone.persona,
        personasText,
        rubric: VIRAL_RUBRIC,
      })
      .catch(() => null);
    if (!res?.content) return null;
    return this._repo.updateClone(cloneId, {
      content: res.content,
      persona: res.persona || clone.persona,
      score: typeof res.score === 'number' ? Math.round(res.score) : clone.score,
      scoreDetail: JSON.stringify({
        scores: res.scores || {},
        verdict: res.verdict || '',
        reason: res.reason || '',
      }),
    });
  }

  // Đăng "Bài của mình" → tạo BẢN NHÁP trên Lịch cho kênh đã chọn.
  async postClone(orgId: string, cloneId: string, integrationId: string) {
    const clone = await this._repo.getClone(orgId, cloneId);
    if (!clone) return null;
    const integration = await this._integrationService.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) return null;
    const nextTime = await this._postsService.findFreeDateTime(orgId);
    await this._postsService.createPost(
      orgId,
      {
        date: nextTime + 'Z',
        order: makeId(10),
        shortLink: false,
        type: 'draft',
        tags: [],
        posts: [
          {
            settings: {
              __type: integration.providerIdentifier as any,
              title: '',
              tags: [],
              subreddit: [],
            },
            group: makeId(10),
            integration: { id: integration.id },
            value: [
              {
                id: makeId(10),
                delay: 0,
                content: clone.content.replace(/\n/g, '\n\n'),
                image: [],
              },
            ],
          },
        ],
      } as any,
      'MCP' as any
    );
    await this._repo.updateClone(cloneId, { status: 'posted' });
    return { ok: true };
  }

  deleteClone(orgId: string, cloneId: string) {
    return this._repo.hardDeleteClone(orgId, cloneId);
  }

  // ── LƯU TRỮ (xóa cứng khỏi DB) ────────────────────────────────────────────
  hardDelete(orgId: string, ids: string[]) {
    return this._repo.hardDelete(orgId, ids);
  }

  hardDeleteArchive(orgId: string) {
    return this._repo.hardDeleteArchive(orgId);
  }

  // ── CÀO TỰ ĐỘNG ─────────────────────────────────────────────────────────
  // Scheduler chỉ quét nguồn auto; nút "Cào ngay" (includeManual=true) quét
  // TẤT CẢ nguồn còn sống. Cào xong → AI chấm điểm các bài chưa chấm.
  async crawlAll(
    orgId: string,
    includeManual = false
  ): Promise<{ added: number; scanned: number; scored: number }> {
    const sources = includeManual
      ? await this._repo.allSources(orgId)
      : await this._repo.autoSources(orgId);
    let added = 0;
    for (const s of sources) {
      try {
        if (s.platform === 'news') added += await this.crawlRss(orgId, s);
        else if (s.platform === 'youtube')
          added += await this.crawlYoutube(orgId, s);
        else added += await this.crawlApify(orgId, s);
      } catch {
        /* nguồn lỗi — bỏ qua, cào tiếp nguồn khác */
      }
    }
    // Chấm điểm chạy NỀN — không giữ request (tunnel Cloudflare cắt ở ~100s);
    // điểm sẽ tự xuất hiện dần trên thẻ sau vài phút.
    this.scoreUnscored(orgId).catch(() => 0);
    return { added, scanned: sources.length, scored: 0 };
  }

  // ── AI CHẤM ĐIỂM THEO CHÂN DUNG ─────────────────────────────────────────
  // Chấm các bài score=null theo lô 8 bài/lần gọi. Ngưỡng: >=90 tự duyệt,
  // 50-89 chờ duyệt, <50 bỏ qua (viralStatusForScore).
  async scoreUnscored(orgId: string, limit = 60): Promise<number> {
    const posts = await this._repo.unscored(orgId, limit);
    if (!posts.length) return 0;
    const personasText = VIRAL_PERSONAS.map(
      (p) => `- ${p.code} (${p.label}): ${p.profile}`
    ).join('\n');
    let scored = 0;
    for (let i = 0; i < posts.length; i += 8) {
      const batch = posts.slice(i, i + 8);
      const results = await this._openai
        .viralScoreBatch(
          batch.map((p, idx) => ({
            i: idx,
            title: p.title,
            content: p.content,
            platform: p.platform,
            shares: p.shares,
            likes: p.likes,
          })),
          personasText,
          VIRAL_RUBRIC
        )
        .catch(() => null);
      if (!results) continue;
      for (const r of results) {
        const post = batch[r.i];
        if (!post || typeof r.score !== 'number') continue;
        const score = Math.max(0, Math.min(100, Math.round(r.score)));
        await this._repo
          .update(post.id, {
            score,
            persona: r.persona ? String(r.persona).slice(0, 30) : null,
            aiContent: r.rewritten ? String(r.rewritten).slice(0, 5000) : null,
            scoreDetail: JSON.stringify({
              scores: r.scores || {},
              verdict: r.verdict || '',
              reason: r.reason || '',
            }).slice(0, 3000),
            status: viralStatusForScore(score),
          })
          .catch(() => null);
        scored++;
      }
    }
    return scored;
  }

  setStatus(orgId: string, id: string, status: string) {
    const valid = ['approved', 'pending', 'skipped'];
    if (!valid.includes(status)) throw new Error('Trạng thái không hợp lệ');
    return this._repo.setStatus(orgId, id, status);
  }

  statusCounts(orgId: string) {
    return this._repo.statusCounts(orgId);
  }

  setSourceAuto(orgId: string, id: string, auto: boolean) {
    return this._repo.setSourceAuto(orgId, id, auto);
  }

  // RSS (báo/blog) — FREE, không cần key. Lấy title/link/ảnh + tra share qua FB.
  private async crawlRss(orgId: string, source: any): Promise<number> {
    if (!source.url) return 0;
    let xml = '';
    try {
      const res = await fetch(source.url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SocialHubBot/1.0)' },
        signal: AbortSignal.timeout(12000),
      });
      xml = (await res.text()).slice(0, 500000);
    } catch {
      return 0;
    }
    const items = xml.split(/<item[\s>]/i).slice(1, 21);
    let added = 0;
    for (const it of items) {
      const grab = (re: RegExp) =>
        decodeEntities(
          (it.match(re)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim()
        );
      const title = grab(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const link =
        grab(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
        (it.match(/<link[^>]*href=["']([^"']+)/i)?.[1] || '').trim();
      if (!title || !link) continue;
      if (await this._repo.existsByUrl(orgId, link)) continue;
      const image =
        it.match(/<enclosure[^>]+url=["']([^"']+)/i)?.[1] ||
        it.match(/<media:content[^>]+url=["']([^"']+)/i)?.[1] ||
        it.match(/<img[^>]+src=["']([^"']+)/i)?.[1] ||
        null;
      const shares = await this.fbShareCount(link);
      await this._repo.create(orgId, {
        platform: 'news',
        level: 'all',
        title: title.slice(0, 250),
        sourceName: source.name,
        url: link,
        thumbnail: image,
        shares,
        origin: 'auto',
      });
      added++;
    }
    return added;
  }

  // YouTube Data API — FREE (key Google Cloud). Tìm theo từ khoá, xếp theo view.
  private async crawlYoutube(orgId: string, source: any): Promise<number> {
    const key = getViralConfig().youtubeKey;
    if (!key || !source.name) return 0;
    try {
      const s = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&order=viewCount&regionCode=VN&relevanceLanguage=vi&q=${encodeURIComponent(source.name)}&key=${key}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!s.ok) return 0;
      const sd: any = await s.json();
      const ids = (sd.items || [])
        .map((i: any) => i.id?.videoId)
        .filter(Boolean);
      if (!ids.length) return 0;
      const st = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}&key=${key}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const std: any = await st.json();
      let added = 0;
      for (const v of std.items || []) {
        const url = `https://www.youtube.com/watch?v=${v.id}`;
        if (await this._repo.existsByUrl(orgId, url)) continue;
        await this._repo.create(orgId, {
          platform: 'youtube',
          level: 'all',
          title: v.snippet?.title,
          sourceName: v.snippet?.channelTitle,
          url,
          thumbnail:
            v.snippet?.thumbnails?.high?.url ||
            v.snippet?.thumbnails?.medium?.url,
          views: Number(v.statistics?.viewCount) || null,
          likes: Number(v.statistics?.likeCount) || null,
          comments: Number(v.statistics?.commentCount) || null,
          origin: 'auto',
        });
        added++;
      }
      return added;
    } catch {
      return 0;
    }
  }

  // Apify — TRẢ PHÍ (token). Cào trang FB/IG/TikTok → bài kèm lượt share.
  private async crawlApify(orgId: string, source: any): Promise<number> {
    const token = getViralConfig().apifyToken;
    if (!token || !source.url) return 0;
    // actor phù hợp theo nền tảng (mặc định phổ biến; user có thể đổi sau)
    const actor =
      source.platform === 'tiktok'
        ? 'clockworks~tiktok-scraper'
        : source.platform === 'instagram'
        ? 'apify~instagram-scraper'
        : 'apify~facebook-posts-scraper';
    const input =
      source.platform === 'tiktok'
        ? { profiles: [source.url], resultsPerPage: 10 }
        : source.platform === 'instagram'
        ? { directUrls: [source.url], resultsLimit: 10 }
        : { startUrls: [{ url: source.url }], resultsLimit: 10 };
    try {
      const run = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=90`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(100000),
        }
      );
      if (!run.ok) return 0;
      const rows: any[] = await run.json();
      let added = 0;
      for (const r of (rows || []).slice(0, 12)) {
        const url = r.url || r.postUrl || r.webVideoUrl || r.link;
        if (!url || (await this._repo.existsByUrl(orgId, url))) continue;
        await this._repo.create(orgId, {
          platform: source.platform,
          level: 'all',
          title: r.text || r.caption || r.title || r.desc || '(không tiêu đề)',
          sourceName: source.name,
          url,
          thumbnail:
            r.thumbnailUrl || r.displayUrl || r.previewImageUrl || r.image || null,
          content: r.text || r.caption || null,
          shares:
            r.shares ?? r.shareCount ?? r.sharesCount ?? null,
          likes: r.likes ?? r.likesCount ?? r.diggCount ?? null,
          comments: r.comments ?? r.commentsCount ?? null,
          views: r.views ?? r.playCount ?? r.videoViewCount ?? null,
          origin: 'auto',
        });
        added++;
      }
      return added;
    } catch {
      return 0;
    }
  }

  // sources
  listSources(orgId: string) {
    return this._repo.listSources(orgId);
  }
  createSource(orgId: string, body: any) {
    return this._repo.createSource(orgId, body);
  }
  deleteSource(orgId: string, id: string) {
    return this._repo.deleteSource(orgId, id);
  }
}
