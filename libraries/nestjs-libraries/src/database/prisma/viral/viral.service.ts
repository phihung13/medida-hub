import { Injectable, OnModuleInit } from '@nestjs/common';
import { ViralRepository } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { GeminiService } from '@gitroom/nestjs-libraries/openai/gemini.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  getViralConfig,
  hasBgm,
  bgmPath,
} from '@gitroom/nestjs-libraries/viral/viral.keys';
import {
  VIRAL_PERSONAS,
  VIRAL_RUBRIC,
  viralStatusForScore,
} from '@gitroom/nestjs-libraries/viral/viral.personas';
import {
  buildBlogPrompt,
  buildInfographicPrompt,
  buildPodcastPrompt,
  ProduceInput,
} from '@gitroom/nestjs-libraries/viral/viral.produce.prompts';
import { VIRAL_DEFAULT_SOURCES } from '@gitroom/nestjs-libraries/viral/viral.default.sources';
import { VIRAL_PERSONA_SEEDS } from '@gitroom/nestjs-libraries/viral/viral.personas.seed';
import { getSkill } from '@gitroom/nestjs-libraries/viral/viral.skills';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { blogHtmlToDocx } from '@gitroom/nestjs-libraries/viral/viral.docx';

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
  // storage cho sản phẩm sản xuất (ảnh infographic, mp3 podcast) — cùng
  // provider với media library (local/cloudflare theo env).
  private storage = UploadFactory.createStorage();

  constructor(
    private _repo: ViralRepository,
    private _openai: OpenaiService,
    private _gemini: GeminiService,
    private _media: MediaService,
    private _postsService: PostsService,
    private _integrationService: IntegrationService,
    private _notification: NotificationService
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
    // Chế độ "mỗi N giờ": chạy 1 lần sau 60s khi khởi động, rồi mỗi giờ kiểm
    // hạn. Giá trị 246 = lịch T2-4-6 19h VN — xử ở vòng 10 phút bên dưới.
    let lastRun = 0;
    const hourly = () => {
      const hours = getViralConfig().crawlEveryHours;
      return hours > 0 && hours !== 246 ? hours : 0;
    };
    setTimeout(() => {
      if (hourly()) tick().then(() => (lastRun = Date.now()));
    }, 60000);
    setInterval(() => {
      const hours = hourly();
      if (hours && Date.now() - lastRun >= hours * 3600000) {
        tick().then(() => (lastRun = Date.now()));
      }
    }, 3600000);

    // Lịch T2-4-6 19h VN (như cron n8n): cào → ĐỢI chấm điểm xong → bản tin
    // tuần + todo list gửi Zalo/email/in-app.
    let lastCrawl246Day = '';
    setInterval(async () => {
      if (getViralConfig().crawlEveryHours !== 246) return;
      const vn = new Date(Date.now() + 7 * 3600 * 1000);
      const day = vn.toISOString().slice(0, 10);
      // getUTCDay trên trục VN: T2=1, T4=3, T6=5
      if (![1, 3, 5].includes(vn.getUTCDay())) return;
      if (vn.getUTCHours() !== 19 || lastCrawl246Day === day) return;
      lastCrawl246Day = day;
      try {
        const orgs = await this._repo.orgIdsWithAutoSources();
        for (const { organizationId } of orgs) {
          await this.crawlAll(organizationId, false, true).catch(() => null);
          await this.sendWeeklyReport(organizationId, 'crawl').catch(() => null);
        }
      } catch {
        /* vòng lỗi — kỳ cào sau thử lại */
      }
    }, 10 * 60000);

    // Tự dọn Lưu trữ (bỏ qua + đã xóa) cũ hơn 7 ngày + reaper bài chờ duyệt ứ
    // quá 30 ngày → bỏ qua. Chạy sau 2 phút rồi mỗi 6h.
    const purge = () =>
      this._repo
        .expirePendingOlderThan(30)
        .catch(() => null)
        .then(() => this._repo.purgeArchiveOlderThan(7))
        .catch(() => null);
    setTimeout(purge, 120000);
    setInterval(purge, 6 * 3600000);

    // Backfill tombstone URL 1 lần lúc khởi động — dedup bền qua purge.
    setTimeout(() => this._repo.backfillSeen().catch(() => null), 90000);

    // Nhắc duyệt 9h sáng + digest tuần CN 20h (giờ VN) — notification in-app
    // (port cron "nhắc duyệt 9h" + "digest tuần CN 20h" của n8n, bỏ Telegram).
    let lastRemindDay = '';
    let lastDigestDay = '';
    setInterval(async () => {
      const vn = new Date(Date.now() + 7 * 3600 * 1000); // giờ VN qua trục UTC
      const day = vn.toISOString().slice(0, 10);
      const hour = vn.getUTCHours();
      try {
        if (hour === 9 && lastRemindDay !== day) {
          lastRemindDay = day;
          const orgs = await this._repo.orgIdsWithPosts();
          for (const { organizationId } of orgs) {
            const c = await this._repo.statusCounts(organizationId);
            if (c.pending > 0) {
              await this._notification
                .inAppNotification(
                  organizationId,
                  'Phát hiện: bài chờ duyệt',
                  `🔔 Có ${c.pending} bài đang chờ duyệt trong trang Phát hiện — vào duyệt/bỏ để dây chuyền chạy tiếp.`,
                  false
                )
                .catch(() => null);
            }
          }
        }
        if (vn.getUTCDay() === 0 && hour === 20 && lastDigestDay !== day) {
          lastDigestDay = day;
          const orgs = await this._repo.orgIdsWithPosts();
          for (const { organizationId } of orgs) {
            // Tổng kết CN: AI viết bản tin tuần + todo → in-app + email + Zalo
            await this.sendWeeklyReport(organizationId, 'sunday').catch(() => null);
          }
        }
      } catch {
        /* vòng nhắc lỗi — thử lại lượt sau */
      }
    }, 10 * 60000);
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
        rubric: getSkill('tieu-chi-cham-diem') || VIRAL_RUBRIC,
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
        rubric: getSkill('tieu-chi-cham-diem') || VIRAL_RUBRIC,
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
  // Việc NỀN sau cào: chấm điểm → làm giàu persona. Trả số bài đã chấm.
  private async afterCrawl(orgId: string): Promise<number> {
    const n = await this.scoreUnscored(orgId);
    if (n > 0) await this.enrichPersonas(orgId).catch(() => null);
    return n;
  }

  async crawlAll(
    orgId: string,
    includeManual = false,
    awaitScoring = false // lịch T2-4-6 cần đợi chấm xong mới gửi bản tin
  ): Promise<{ added: number; scanned: number; scored: number }> {
    const sources = includeManual
      ? await this._repo.allSources(orgId)
      : await this._repo.autoSources(orgId);
    let added = 0;
    for (const s of sources) {
      try {
        if (s.platform === 'news') added += await this.crawlRss(orgId, s);
        else if (s.platform === 'gnews')
          added += await this.crawlGnews(orgId, s);
        else if (s.platform === 'youtube')
          added += await this.crawlYoutube(orgId, s);
        else added += await this.crawlApify(orgId, s);
      } catch {
        /* nguồn lỗi — bỏ qua, cào tiếp nguồn khác */
      }
    }
    // Chấm điểm + enrich persona: mặc định chạy NỀN — không giữ request
    // (tunnel Cloudflare cắt ~100s); lịch T2-4-6 thì ĐỢI xong để gửi bản tin.
    if (awaitScoring) await this.afterCrawl(orgId).catch(() => null);
    else this.afterCrawl(orgId).catch(() => null);
    return { added, scanned: sources.length, scored: 0 };
  }

  // ── CHÂN DUNG KHÁCH HÀNG (persona động) ───────────────────────────────────
  // Org chưa có persona trong DB → seed 8 hồ sơ từ sheet Profiles n8n.
  private async ensurePersonas(orgId: string) {
    if ((await this._repo.countPersonas(orgId)) > 0) return;
    for (const s of VIRAL_PERSONA_SEEDS) {
      await this._repo.createPersona(orgId, s).catch(() => null);
    }
  }

  // Text hồ sơ cho prompt chấm điểm — đọc từ DB (đã enrich); DB trống thì
  // rơi về bộ tĩnh VIRAL_PERSONAS.
  private async personasTextFor(orgId: string): Promise<string> {
    await this.ensurePersonas(orgId);
    const rows = await this._repo.listPersonas(orgId);
    if (!rows.length) {
      return VIRAL_PERSONAS.map(
        (p) => `- ${p.code} (${p.label}): ${p.profile}`
      ).join('\n');
    }
    return rows
      .map(
        (p: any) =>
          `- ${p.code} (${p.label}) [${p.capHoc || ''} · ${p.khuVuc || ''}]:` +
          ` Mối quan tâm: ${p.moiQuanTam || ''} | Tâm lý: ${p.tamLy || ''}` +
          (p.insights ? ` | Insight content: ${p.insights}` : '')
      )
      .join('\n');
  }

  // Làm giàu hồ sơ từ bài đã chấm 24h qua — 3 tín hiệu: VOICE (group),
  // TREND (news), WINNING (share cao). Port [Prof] Aggregate của n8n.
  private async enrichPersonas(orgId: string): Promise<void> {
    const personas = await this._repo.listPersonas(orgId);
    if (!personas.length) return;
    const posts = await this._repo.scoredSince(orgId, 24);
    if (!posts.length) return;
    const isGroup = (p: any) => /group/i.test(String(p.sourceName || ''));
    const isNews = (p: any) => String(p.platform) === 'news';
    const eng = (p: any) =>
      (Number(p.shares) || 0) * 3 +
      (Number(p.comments) || 0) * 2 +
      (Number(p.likes) || 0);
    const byProf: Record<
      string,
      { voice: { t: string; e: number }[]; trend: { t: string; e: number }[]; win: { t: string; e: number }[] }
    > = {};
    const cnt: Record<string, number> = {};
    for (const r of posts as any[]) {
      const c = r.persona;
      if (!c) continue;
      if (!byProf[c]) {
        byProf[c] = { voice: [], trend: [], win: [] };
        cnt[c] = 0;
      }
      cnt[c]++;
      const cap = String(r.content || r.title || '').replace(/\s+/g, ' ').slice(0, 220);
      if (isGroup(r))
        byProf[c].voice.push({ t: `"${cap}" (cmt=${r.comments || 0}, like=${r.likes || 0})`, e: eng(r) });
      else if (isNews(r)) byProf[c].trend.push({ t: `${r.title}${cap ? ` — ${cap.slice(0, 120)}` : ''}`, e: eng(r) });
      else byProf[c].win.push({ t: `[share=${r.shares || 0}] ${r.title} -> ${cap.slice(0, 140)}`, e: eng(r) });
    }
    const top = (arr: { t: string; e: number }[], n: number) =>
      arr.sort((a, b) => b.e - a.e).slice(0, n).map((x) => x.t).join('\n    ');
    const blocks = (personas as any[])
      .map((p) => {
        const s = byProf[p.code] || { voice: [], trend: [], win: [] };
        let st: any = {};
        try {
          st = JSON.parse(p.statics || '{}');
        } catch {
          /* statics hỏng — bỏ qua nhân khẩu */
        }
        return `### ${p.code} (${p.label})
NHAN KHAU (tinh - khong sua): hoc van ${st.hoc_van || '?'} | nghe ${st.nghe_nghiep || '?'} | thu nhap ${st.thu_nhap || '?'} | ${st.kinh_te || '?'}
HIEN TAI:
- moi_quan_tam: ${p.moiQuanTam || ''}
- tam_ly: ${p.tamLy || ''}
- hanh_vi: ${p.hanhVi || ''}
- insights: ${p.insights || '(chua co)'}
TIN HIEU MOI (${cnt[p.code] || 0} content):
  [VOICE - loi phu huynh that tu group, ${s.voice.length} tin]:
    ${top(s.voice, 8) || '(khong co)'}
  [TREND - chu de nong tu bao chi, ${s.trend.length} tin]:
    ${top(s.trend, 5) || '(khong co)'}
  [WINNING - content thang cua KOL/doi thu, ${s.win.length} tin]:
    ${top(s.win, 6) || '(khong co)'}`;
      })
      .join('\n\n');
    const out = await this._openai.viralUpdatePersonas(blocks).catch(() => null);
    if (!Array.isArray(out)) return;
    for (const u of out) {
      if (!u?.profile_id) continue;
      await this._repo
        .updatePersonaDynamic(orgId, String(u.profile_id), {
          moiQuanTam: u.moi_quan_tam,
          tamLy: u.tam_ly,
          hanhVi: u.hanh_vi,
          insights: u.insights,
          addDataPoints: cnt[String(u.profile_id)] || 0,
        })
        .catch(() => null);
    }
  }

  listPersonas(orgId: string) {
    return this.ensurePersonas(orgId).then(() => this._repo.listPersonas(orgId));
  }

  // ── AI CHẤM ĐIỂM THEO CHÂN DUNG ─────────────────────────────────────────
  // Chấm các bài score=null theo lô 8 bài/lần gọi. Ngưỡng: >=90 tự duyệt,
  // 50-89 chờ duyệt, <50 bỏ qua (viralStatusForScore).
  async scoreUnscored(orgId: string, limit = 60): Promise<number> {
    const posts = await this._repo.unscored(orgId, limit);
    if (!posts.length) return 0;
    const personasText = await this.personasTextFor(orgId);
    // Rubric đọc ĐỘNG từ kho skill (tab 🧪 Công thức AI) — chỉnh là ăn ngay.
    const rubric = getSkill('tieu-chi-cham-diem') || VIRAL_RUBRIC;
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
          rubric
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
            // biến thể cho các nhóm khác cùng cấp (multi-variant n8n K5/B)
            aiVariants: Array.isArray(r.variants)
              ? JSON.stringify(
                  r.variants
                    .filter((v: any) => v?.persona && v?.text)
                    .slice(0, 3)
                    .map((v: any) => ({
                      persona: String(v.persona).slice(0, 30),
                      text: String(v.text).slice(0, 3000),
                    }))
                ).slice(0, 10000)
              : null,
            scoreDetail: JSON.stringify({
              scores: r.scores || {},
              verdict: r.verdict || '',
              reason: r.reason || '',
              // gợi ý sản xuất (AI gán): loại + độ hợp podcast (n8n K5/D)
              content_type: ['blog', 'infographic', 'video'].includes(
                String(r.content_type)
              )
                ? r.content_type
                : 'blog',
              podcast_score:
                typeof r.podcast_score === 'number'
                  ? Math.max(0, Math.min(100, Math.round(r.podcast_score)))
                  : null,
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

  // ── LỌC SPAM + TUỔI + NGƯỠNG VIRAL (port node "[Filter] Spam + Cũ + Viral")
  // Chặn minigame/câu share/khuyến mãi + bài quá cũ + bài ít tương tác TRƯỚC
  // khi lưu (đỡ rác tường + đỡ tốn tiền Claude chấm). News/GNews miễn ngưỡng
  // tương tác (RSS không có metric).
  private static MAX_AGE_DAYS = 45;
  private static SPAM_RES = [
    /minigame|mini game|give ?away/,
    /the le|the le chuong trinh|le trao giai/,
    /trung thuong|giai thuong|co cau giai|qua tang|tang qua|san qua|rinh qua/,
    /like ?(&|va|and|,) ?share|share ?(&|va|,) ?like/,
    /vong quay may man/,
    /tag \d* ?(nguoi|ban)\b/,
    /(comment|binh luan)[^.\n]{0,15}(de |nhan|trung)/,
    /(inbox|nhan tin)[^.\n]{0,12}(de |nhan)/,
    /khuyen mai|uu dai|giam gia|flash ?sale|sale ?off/,
    /dang ky ngay|dang ky nhan|nhanh tay/,
    /(share|chia se)[^.\n]{0,20}(diem|point|\+ ?\d|x ?\d)/,
    /moi (luot )?(share|chia se)/,
    /(han chot|deadline)[^.\n]{0,15}(tham gia|du thi|nhan|minigame)?/,
  ];

  // Bỏ dấu tiếng Việt để regex spam bắt được mọi cách gõ.
  private stripVn(s: any): string {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ');
  }

  private isSpam(...texts: (string | null | undefined)[]): boolean {
    const t = this.stripVn(texts.filter(Boolean).join(' '));
    if (!t) return false;
    return ViralService.SPAM_RES.some((re) => re.test(t));
  }

  // Ngưỡng tương tác tối thiểu theo nền tảng (giá trị "THẬT" của n8n).
  private passesEngagement(
    platform: string,
    isGroup: boolean,
    m: { views?: number | null; likes?: number | null; shares?: number | null }
  ): boolean {
    const view = Number(m.views) || 0;
    const like = Number(m.likes) || 0;
    const share = Number(m.shares) || 0;
    if (platform === 'tiktok') return view >= 10000 || share >= 50;
    if (platform === 'facebook') {
      return isGroup ? like >= 20 || share >= 5 : like >= 50 || share >= 10;
    }
    return true; // news/gnews/youtube/instagram: miễn ngưỡng
  }

  // Bài quá cũ (>45 ngày) — parse mốc thời gian nếu nguồn có.
  private isTooOld(ts: any): boolean {
    if (!ts) return false;
    const t = new Date(ts).getTime();
    if (isNaN(t)) return false;
    return (Date.now() - t) / 86400000 > ViralService.MAX_AGE_DAYS;
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
      if (this.isSpam(title)) continue; // tin PR/khuyến mãi trên RSS
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
        if (this.isSpam(v.snippet?.title)) continue; // video minigame/quảng cáo
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

  // Google News RSS theo TỪ KHOÁ — FREE. AI mở rộng từ khoá thành 6-7 truy vấn
  // cùng chủ đề (port node n8n "🔑 Mở rộng chủ đề" + "🌐 Cào News") rồi cào
  // news.google.com/rss/search từng truy vấn, dedup theo URL.
  private async crawlGnews(orgId: string, source: any): Promise<number> {
    const kw = String(source.name || '').trim();
    if (!kw) return 0;
    let queries = [kw];
    try {
      const more = await this._openai.viralExpandQueries(kw);
      if (more.length) queries = [...new Set([kw, ...more])].slice(0, 7);
    } catch {
      /* AI lỗi — vẫn cào với từ khoá gốc */
    }
    const clean = (s: string) =>
      decodeEntities(
        String(s || '')
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    const xmls = await Promise.all(
      queries.map(async (q) => {
        try {
          const res = await fetch(
            `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=vi&gl=VN&ceid=VN:vi`,
            {
              headers: { 'user-agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(10000),
            }
          );
          return res.ok ? (await res.text()).slice(0, 400000) : '';
        } catch {
          return '';
        }
      })
    );
    let added = 0;
    for (const xml of xmls) {
      if (!xml) continue;
      const items = xml.split(/<item[\s>]/i).slice(1, 13); // ~12 tin/truy vấn
      for (const it of items) {
        const title = clean(it.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
        const link = (it.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '')
          .replace(/<!\[CDATA\[|\]\]>/g, '')
          .trim();
        if (!title || !link) continue;
        if (this.isSpam(title)) continue; // tin PR/khuyến mãi
        if (await this._repo.existsByUrl(orgId, link)) continue;
        const src =
          clean(it.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '') ||
          'Google News';
        await this._repo.create(orgId, {
          platform: 'news',
          level: 'all',
          title,
          sourceName: `${src} · ${kw}`,
          url: link,
          origin: 'auto',
        });
        added++;
        if (added >= 30) return added; // trần mỗi nguồn/lần cào
      }
    }
    return added;
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
      const isGroup =
        /group/i.test(String(source.name || '')) ||
        /\/groups\//i.test(String(source.url || ''));
      for (const r of (rows || []).slice(0, 12)) {
        const url = r.url || r.postUrl || r.webVideoUrl || r.link;
        if (!url || (await this._repo.existsByUrl(orgId, url))) continue;
        // lọc spam / bài quá cũ / dưới ngưỡng tương tác (port filter n8n)
        if (this.isSpam(r.text, r.caption, r.title, r.desc)) continue;
        if (this.isTooOld(r.time || r.createTimeISO || r.createTime || r.timestamp)) continue;
        if (
          !this.passesEngagement(source.platform, isGroup, {
            views: r.views ?? r.playCount ?? r.videoViewCount,
            likes: r.likes ?? r.likesCount ?? r.diggCount,
            shares: r.shares ?? r.shareCount ?? r.sharesCount,
          })
        )
          continue;
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

  // ── SẢN XUẤT (port WF-SanXuat n8n): blog / infographic / podcast ──────────
  // Từ bài đã duyệt (post) hoặc "Bài của mình" (clone) → tạo hàng ViralProduct
  // (processing) → chạy NỀN tuần tự → done/error. Đầu ra hiện ở tab Sản phẩm.

  private static PRODUCE_FORMATS = ['blog', 'infographic', 'podcast'];

  async produce(
    orgId: string,
    body: { ids?: string[]; source?: string; formats?: string[]; bgm?: boolean }
  ): Promise<{ queued: number }> {
    const ids = (body.ids || []).filter(Boolean).slice(0, 20);
    const formats = (body.formats || []).filter((f) =>
      ViralService.PRODUCE_FORMATS.includes(f)
    );
    if (!ids.length || !formats.length) return { queued: 0 };
    // chặn dồn job: tối đa 40 sản phẩm đang chạy / org
    const processing = await this._repo.countProcessingProducts(orgId);
    if (processing > 40) throw new Error('Đang sản xuất quá nhiều — đợi xong bớt rồi bấm tiếp.');

    const fromClone = body.source === 'clone';
    const created: any[] = [];
    for (const id of ids) {
      const src = fromClone
        ? await this._repo.getClone(orgId, id)
        : await this._repo.getById(orgId, id);
      if (!src) continue;
      for (const format of formats) {
        const row = await this._repo.createProduct(orgId, {
          postId: fromClone ? null : id,
          cloneId: fromClone ? id : null,
          format,
          topic: decodeEntities((src as any).title),
        });
        // podcast: ghi lựa chọn trộn nhạc nền vào meta ngay khi tạo job
        if (format === 'podcast' && body.bgm) {
          await this._repo
            .updateProduct(row.id, { meta: JSON.stringify({ bgm: true }) })
            .catch(() => null);
        }
        created.push(row);
      }
    }
    // chạy nền — không giữ request (giống scoreUnscored)
    if (created.length) {
      this.runProducts(orgId, created.map((p) => p.id)).catch(() => null);
    }
    return { queued: created.length };
  }

  // Chạy tuần tự từng sản phẩm (tránh dội rate-limit Claude/Gemini/MiniMax).
  private async runProducts(orgId: string, productIds: string[]) {
    for (const pid of productIds) {
      const product = await this._repo.getProduct(orgId, pid).catch(() => null);
      if (!product || product.status !== 'processing') continue;
      try {
        await this.produceOne(orgId, product);
      } catch (e: any) {
        await this._repo
          .updateProduct(pid, {
            status: 'error',
            error: String(e?.message || e).slice(0, 500),
          })
          .catch(() => null);
      }
    }
  }

  // Nội dung nguồn → input prompt (chủ đề, định hướng, góc tiếp cận, nhóm).
  private async produceInput(orgId: string, product: any): Promise<ProduceInput | null> {
    if (product.cloneId) {
      const c = await this._repo.getClone(orgId, product.cloneId);
      if (!c) return null;
      let detail = '';
      try {
        detail = JSON.parse(c.scoreDetail || '{}')?.reason || '';
      } catch {
        /* scoreDetail hỏng — bỏ qua góc tiếp cận */
      }
      return {
        id: product.id,
        topic: decodeEntities(c.title),
        idea: c.content || c.title,
        detail,
        category: c.persona || '',
      };
    }
    if (product.postId) {
      const p = await this._repo.getById(orgId, product.postId);
      if (!p) return null;
      let detail = '';
      try {
        detail = JSON.parse(p.scoreDetail || '{}')?.reason || '';
      } catch {
        /* scoreDetail hỏng — bỏ qua góc tiếp cận */
      }
      return {
        id: product.id,
        topic: decodeEntities(p.title),
        // ưu tiên bản AI viết lại (đã duyệt) — bám sát n8n (noi_dung_sx)
        idea: p.aiContent || decodeEntities(p.content) || decodeEntities(p.title),
        detail,
        category: p.persona || '',
        url: p.url || '',
      };
    }
    return null;
  }

  private async produceOne(orgId: string, product: any) {
    const input = await this.produceInput(orgId, product);
    if (!input) throw new Error('Bài nguồn không còn (đã bị xóa?).');

    if (product.format === 'blog') {
      const { system, user } = buildBlogPrompt(input);
      const out = await this._openai.viralProduceBlog(system, user);
      if (!out?.body_html) throw new Error('AI chưa viết được bài — thử lại.');
      await this._repo.updateProduct(product.id, {
        status: 'done',
        title: String(out.title || input.topic).slice(0, 300),
        textContent: String(out.body_html).slice(0, 60000),
        meta: JSON.stringify({
          slug: out.slug || 'blog',
          meta_description: out.meta_description || '',
          tags: Array.isArray(out.tags) ? out.tags.slice(0, 12) : [],
        }).slice(0, 3000),
        error: null,
      });
      return;
    }

    if (product.format === 'infographic') {
      const { prompt, ratio } = buildInfographicPrompt(input);
      const b64 = await this._gemini.generateImage(prompt);
      if (!b64) throw new Error('Gemini không trả ảnh — thử lại.');
      const file = await this.storage.uploadSimple(`data:image/png;base64,${b64}`);
      const saved = await this._media.saveFile(
        orgId,
        file.split('/').pop()!,
        file
      );
      await this._repo.updateProduct(product.id, {
        status: 'done',
        title: input.topic.slice(0, 300),
        mediaPath: saved.path,
        meta: JSON.stringify({ ratio }),
        error: null,
      });
      return;
    }

    if (product.format === 'podcast') {
      const cfg = getViralConfig();
      if (!cfg.minimaxKey || !cfg.minimaxGroupId) {
        throw new Error(
          'Chưa có key MiniMax — vào Cài đặt (trang Phát hiện) nhập MiniMax API key + GroupId.'
        );
      }
      const { system, user } = buildPodcastPrompt(input);
      const script = await this._openai.viralProducePodcast(system, user);
      if (!script?.full_script) throw new Error('AI chưa viết được kịch bản — thử lại.');
      // MiniMax TTS t2a_v2 (giọng đọc sách tiếng Việt, như n8n)
      const ttsRes = await fetch(
        `https://api.minimax.io/v1/t2a_v2?GroupId=${encodeURIComponent(cfg.minimaxGroupId)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${cfg.minimaxKey}`,
          },
          body: JSON.stringify({
            model: 'speech-02-hd',
            text: script.full_script,
            stream: false,
            language_boost: 'Vietnamese',
            output_format: 'url',
            voice_setting: {
              voice_id: 'Vietnamese_Audiobook_woman_v2',
              speed: 1.2,
              vol: 1,
              pitch: 0,
              emotion: 'calm',
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate: 128000,
              format: 'mp3',
              channel: 1,
            },
          }),
          signal: AbortSignal.timeout(180000),
        }
      );
      const tts: any = await ttsRes.json().catch(() => null);
      if (tts?.base_resp?.status_code !== 0 || !tts?.data?.audio) {
        throw new Error(
          'TTS lỗi: ' + (tts?.base_resp?.status_msg || `HTTP ${ttsRes.status}`)
        );
      }
      // tải mp3 về rồi lưu qua storage (URL MiniMax hết hạn nhanh)
      const audioRes = await fetch(tts.data.audio, {
        signal: AbortSignal.timeout(180000),
      });
      if (!audioRes.ok) throw new Error(`Không tải được audio (HTTP ${audioRes.status}).`);
      let buf = Buffer.from(await audioRes.arrayBuffer());
      // trộn nhạc nền nếu job chọn + có file nhạc + có ffmpeg (lỗi → giọng thuần)
      let bgmMixed = false;
      let wantBgm = false;
      try {
        wantBgm = !!JSON.parse(product.meta || '{}')?.bgm;
      } catch {
        /* meta hỏng — không trộn */
      }
      if (wantBgm && hasBgm()) {
        const mixed = await this.mixBgm(buf).catch(() => null);
        if (mixed) {
          buf = mixed;
          bgmMixed = true;
        }
      }
      const file = await this.storage.uploadSimple(
        `data:audio/mpeg;base64,${buf.toString('base64')}`
      );
      const saved = await this._media.saveFile(
        orgId,
        file.split('/').pop()!,
        file
      );
      await this._repo.updateProduct(product.id, {
        status: 'done',
        title: String(script.title || input.topic).slice(0, 300),
        textContent: String(script.full_script).slice(0, 20000),
        mediaPath: saved.path,
        meta: JSON.stringify({
          est_minutes: script.est_minutes || null,
          bgm: bgmMixed,
        }),
        error: null,
      });
      return;
    }

    throw new Error('Định dạng không hỗ trợ.');
  }

  // Trộn nhạc nền vào giọng đọc bằng ffmpeg — port tham số node n8n
  // "🎚️ Trộn nhạc": nhạc solo 6s đầu / 8s cuối, fade in 3s / out 5s, nền 0.18,
  // duck nhạc dưới voice bằng sidechaincompress. Trả null nếu thiếu ffmpeg/lỗi.
  private async mixBgm(voice: Buffer): Promise<Buffer | null> {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { execFile } = await import('child_process');
    const INTRO = 6, OUTRO = 8, FADEIN = 3, FADEOUT = 5, MUSIC_BASE = 0.18;
    const id = makeId(8);
    const vPath = path.join(os.tmpdir(), `viral-voice-${id}.mp3`);
    const oPath = path.join(os.tmpdir(), `viral-mix-${id}.mp3`);
    const run = (cmd: string, args: string[], timeout = 180000) =>
      new Promise<string>((resolve, reject) => {
        execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) =>
          err ? reject(new Error(String(stderr || err.message).slice(0, 300))) : resolve(String(stdout))
        );
      });
    try {
      fs.writeFileSync(vPath, voice);
      // thời lượng voice → tổng = intro + voice + outro
      const probe = await run('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', vPath,
      ]);
      const dur = parseFloat(probe.trim());
      if (!Number.isFinite(dur) || dur <= 0) return null;
      const total = INTRO + dur + OUTRO;
      const filter =
        `[0:a]adelay=${INTRO * 1000}|${INTRO * 1000}[v];` +
        `[1:a]volume=${MUSIC_BASE},afade=t=in:d=${FADEIN}[m];` +
        `[m][v]sidechaincompress=threshold=0.03:ratio=16:attack=20:release=400[md];` +
        `[md][v]amix=inputs=2:duration=longest:dropout_transition=3,` +
        `afade=t=out:st=${Math.max(0, total - FADEOUT)}:d=${FADEOUT}[out]`;
      await run('ffmpeg', [
        '-y', '-i', vPath, '-stream_loop', '-1', '-i', bgmPath(),
        '-filter_complex', filter, '-map', '[out]',
        '-t', String(total), '-c:a', 'libmp3lame', '-b:a', '128k', oPath,
      ]);
      const out = fs.readFileSync(oPath);
      return out.length > 1000 ? out : null;
    } finally {
      try { fs.unlinkSync(vPath); } catch { /* dọn tmp */ }
      try { fs.unlinkSync(oPath); } catch { /* dọn tmp */ }
    }
  }

  listProducts(orgId: string) {
    return this._repo.listProducts(orgId);
  }

  deleteProduct(orgId: string, id: string) {
    return this._repo.hardDeleteProduct(orgId, id);
  }

  // Thử lại sản phẩm lỗi — reset về processing rồi chạy nền.
  async retryProduct(orgId: string, id: string): Promise<boolean> {
    const p = await this._repo.getProduct(orgId, id);
    if (!p) return false;
    await this._repo.updateProduct(id, { status: 'processing', error: null });
    this.runProducts(orgId, [id]).catch(() => null);
    return true;
  }

  // Blog → file .docx (base64) cho nút tải về.
  async productDocx(
    orgId: string,
    id: string
  ): Promise<{ fileName: string; base64: string } | null> {
    const p = await this._repo.getProduct(orgId, id);
    if (!p || p.format !== 'blog' || !p.textContent) return null;
    let meta: any = {};
    try {
      meta = JSON.parse(p.meta || '{}');
    } catch {
      /* meta hỏng — vẫn xuất docx với tiêu đề */
    }
    const buf = blogHtmlToDocx({
      title: p.title || p.topic || 'blog',
      metaDescription: meta.meta_description || '',
      bodyHtml: p.textContent,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
    });
    const slug = String(meta.slug || 'blog')
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .slice(0, 60);
    return { fileName: `${slug || 'blog'}.docx`, base64: buf.toString('base64') };
  }

  // ── BẢN TIN TUẦN + TODO LIST (gửi Zalo/email/in-app) ─────────────────────
  // Gửi tin nhắn văn bản vào nhóm Zalo qua bot (endpoint /api/postiz/send,
  // auth x-hub-token — cùng cơ chế proxy /botapi của dashboard).
  private async sendZaloReport(threadId: string, text: string) {
    const base = (process.env.ZALO_BOT_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');
    const res = await fetch(`${base}/api/postiz/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.HUB_BOT_TOKEN
          ? { 'x-hub-token': process.env.HUB_BOT_TOKEN }
          : {}),
      },
      body: JSON.stringify({ threadId, text }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Bot Zalo trả ${res.status}`);
  }

  // Tổng hợp 7 ngày → AI viết bản tin (tin nóng + diễn biến thị trường + todo
  // list) → LƯU vào tab 📰 Bản tin + gửi 3 kênh: chuông in-app, email cả org,
  // nhóm Zalo (nếu cấu hình). kind: 'crawl' = sau cào theo lịch T2-4-6 ·
  // 'sunday' = tổng kết CN · 'manual' = bấm nút tạo ngay.
  async sendWeeklyReport(orgId: string, kind: 'crawl' | 'sunday' | 'manual') {
    const [d, counts, { trend, winning }] = await Promise.all([
      this._repo.weeklyDigest(orgId),
      this._repo.statusCounts(orgId),
      this._repo.weeklyBriefPosts(orgId),
    ]);
    const trendText = trend
      .map((t: any) => `- [${t.persona || '?'} · ${t.score ?? '-'}đ] ${decodeEntities(t.title)} (${t.sourceName || ''})`)
      .join('\n')
      .slice(0, 6000);
    const winningText = winning
      .map(
        (w: any) =>
          `- [${w.platform}${w.shares ? ` · ${w.shares} share` : w.views ? ` · ${w.views} view` : ''}] ${decodeEntities(w.title)} (${w.sourceName || ''})`
      )
      .join('\n')
      .slice(0, 4000);
    const statsText = `7 ngày qua: cào ${d.crawled} bài mới · duyệt ${d.approved} · sản xuất ${d.produced} sản phẩm · đang chờ duyệt ${counts.pending} bài.`;
    const brief = await this._openai
      .viralWeeklyBrief({ trendText, winningText, statsText })
      .catch(() => null);

    const dateVn = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const head =
      kind === 'sunday'
        ? `📊 TỔNG KẾT TUẦN — Phát hiện (CN ${dateVn})`
        : kind === 'manual'
        ? `📰 BẢN TIN TUẦN — Phát hiện (${dateVn})`
        : `📰 BẢN TIN SAU CÀO — Phát hiện (${dateVn})`;
    const lines: string[] = [head, ''];
    if (brief?.summary) lines.push(brief.summary, '');
    if (brief?.highlights?.length) {
      lines.push('🔥 TIN NÓNG TUẦN:');
      brief.highlights.slice(0, 6).forEach((h, i) => lines.push(`${i + 1}. ${h}`));
      lines.push('');
    }
    if (brief?.market?.length) {
      lines.push('📈 DIỄN BIẾN THỊ TRƯỜNG:');
      brief.market.slice(0, 5).forEach((m) => lines.push(`• ${m}`));
      lines.push('');
    }
    if (brief?.todos?.length) {
      lines.push('✅ VIỆC TUẦN NÀY:');
      brief.todos
        .slice(0, 8)
        .forEach((td, i) => lines.push(`${i + 1}. ${td.title} — ${td.action}`));
      lines.push('');
    }
    lines.push(`📊 ${statsText}`);
    lines.push('👉 Vào trang Phát hiện để duyệt & sản xuất.');
    const text = lines.join('\n');

    // Lưu vào tab 📰 Bản tin TRƯỚC khi gửi — kênh gửi lỗi vẫn đọc được trên web.
    const saved = await this._repo
      .createReport(orgId, {
        kind,
        title: head,
        content: text,
        meta: JSON.stringify({
          summary: brief?.summary || '',
          highlights: brief?.highlights || [],
          market: brief?.market || [],
          todos: brief?.todos || [],
          stats: statsText,
        }),
      })
      .catch(() => null);

    // 3 kênh — kênh nào lỗi thì bỏ qua kênh đó, không chặn kênh khác.
    await this._notification
      .inAppNotification(orgId, head, text.slice(0, 3500), false)
      .catch(() => null);
    if (this._notification.hasEmailProvider()) {
      await this._notification
        .sendEmailsToOrg(orgId, head, text.replace(/\n/g, '<br/>'), 'info')
        .catch(() => null);
    }
    const threadId = getViralConfig().reportZaloThreadId;
    if (threadId) await this.sendZaloReport(threadId, text).catch(() => null);
    return { ok: true, zalo: !!threadId, reportId: (saved as any)?.id || null };
  }

  listReports(orgId: string) {
    return this._repo.listReports(orgId);
  }

  deleteReport(orgId: string, id: string) {
    return this._repo.deleteReport(orgId, id);
  }

  // Nhập bộ nguồn mặc định (port sheet Sources của n8n) — bỏ qua nguồn đã có
  // (trùng URL hoặc trùng platform+name). FB/TikTok để auto=false (cần Apify);
  // gnews bật auto luôn (free).
  async importDefaultSources(orgId: string): Promise<number> {
    const existing = await this._repo.listSources(orgId);
    const haveUrl = new Set(
      existing.map((s: any) => (s.url || '').toLowerCase()).filter(Boolean)
    );
    const haveKey = new Set(
      existing.map((s: any) => `${s.platform}|${(s.name || '').toLowerCase()}`)
    );
    let added = 0;
    for (const d of VIRAL_DEFAULT_SOURCES) {
      if (d.url && haveUrl.has(d.url.toLowerCase())) continue;
      if (haveKey.has(`${d.platform}|${d.name.toLowerCase()}`)) continue;
      await this._repo.createSource(orgId, {
        platform: d.platform,
        name: d.name,
        url: d.url || null,
        auto: d.platform === 'gnews',
      });
      added++;
    }
    return added;
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
