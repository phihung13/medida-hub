import { Injectable } from '@nestjs/common';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  ShareMetricsInput,
  ShareStatInput,
  ShareStatsRepository,
} from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-stats.repository';

// Đặc tả v2 "ưu tiên share": điểm dự báo (người chấm độc lập) + góc kể +
// số liệu share thật của từng bài, cùng một dòng để đối chiếu.
@Injectable()
export class ShareStatsService {
  constructor(private _repo: ShareStatsRepository) {}

  upsertForecast(input: ShareStatInput) {
    return this._repo.upsertForecast(input);
  }

  saveMetrics(postId: string, organizationId: string, m: ShareMetricsInput) {
    const shareRate =
      m.shareRate ??
      (m.reach && m.reach > 0 && m.shares != null ? m.shares / m.reach : null);
    return this._repo.saveMetrics(postId, organizationId, {
      ...m,
      shareRate,
      measuredAt: m.measuredAt || new Date(),
    });
  }

  getByPostIds(postIds: string[]) {
    return this._repo.getByPostIds(postIds);
  }

  listRange(organizationId: string, from: Date, to: Date) {
    return this._repo.listRange(organizationId, from, to);
  }

  // ── Link chuyển hướng: đo lượt bấm link của trường theo từng bài ─────────
  // Link (đã gắn UTM) trong bình luận đầu -> {base}/public/r/{code}. Hub chỉ
  // chuyển hướng tới đích ĐÃ LƯU (không phải open redirect).
  // Tắt: SHARE_LINK_REDIRECT=0 (khi đó chỉ còn UTM như cũ).
  async wrapLinks(text: string, postId: string, organizationId: string) {
    if (process.env.SHARE_LINK_REDIRECT === '0') return text;
    const base = shareLinkBase();
    if (!base) return text;
    // dài trước để link này không bị thay lẫn vào link khác cùng tiền tố
    const found = [
      ...new Set(String(text || '').match(UTM_LINK_RE) || []),
    ].sort((a, b) => b.length - a.length);
    let out = text;
    for (const raw of found) {
      const target = raw.replace(/[.,;:!?]+$/, '');
      try {
        const link =
          (await this._repo.findLink(postId, target)) ||
          (await this._repo.createLink({
            code: makeId(8),
            postId,
            organizationId,
            target,
          }));
        out = out.split(target).join(`${base}/public/r/${link.code}`);
      } catch {
        // lỗi ghi link -> giữ link UTM gốc, không chặn đăng bình luận
      }
    }
    return out;
  }

  // Trả đích để chuyển hướng; bot xem trước link (Facebook/Zalo...) không tính.
  async click(code: string, userAgent?: string) {
    const link = await this._repo.getLinkByCode(code);
    if (!link) return null;
    if (!BOT_UA_RE.test(userAgent || '')) {
      this._repo.countClick(code).catch(() => undefined);
    }
    return link.target;
  }

  // Bot Zalo thấy link bài (link /public/r/ của Hub hoặc link bài Facebook)
  // được gửi vào một nhóm -> +1 lượt chia sẻ vào Zalo cho bài đó.
  async registerZaloShare(organizationId: string, url: string) {
    const postId = await this.resolvePostId(organizationId, url);
    if (!postId) return { matched: false };
    await this._repo.increment(postId, organizationId, 'zaloShares');
    return { matched: true, postId };
  }

  private async resolvePostId(organizationId: string, url: string) {
    const u = String(url || '').trim();
    const code = u.match(/\/public\/r\/([A-Za-z0-9]{6,16})/)?.[1];
    if (code) {
      const link = await this._repo.getLinkByCode(code);
      return link && link.organizationId === organizationId ? link.postId : null;
    }
    let fbUrl = u;
    // Link rút gọn facebook.com/share/... -> hỏi Facebook link đầy đủ (best-effort).
    if (/facebook\.com\/share\//i.test(fbUrl)) {
      fbUrl = (await resolveFbShare(fbUrl)) || fbUrl;
    }
    for (const frag of fbFragments(fbUrl)) {
      const post = await this._repo.findPostByReleaseFragment(organizationId, frag);
      if (post) return post.id;
    }
    return null;
  }
}

const UTM_LINK_RE =
  /https?:\/\/(?:[a-z0-9-]+\.)*(?:truongvietanh\.com|nguyenmanhduong\.com|bandohoctap\.com)\/?[^\s<>"')\]]*utm_campaign=[^\s<>"')\]]*/gi;

// KHÔNG có "zalo": trình duyệt trong app Zalo mang chữ Zalo — đó là người thật.
const BOT_UA_RE =
  /bot|crawl|spider|preview|facebookexternalhit|facebookcatalog|slurp|curl|wget|python|axios|node-fetch|headless/i;

export function shareLinkBase() {
  return (
    process.env.SHARE_LINK_BASE ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/api` : '')
  ).replace(/\/$/, '');
}

// Các mảnh định danh bài trong link Facebook, mảnh dài/đặc trưng trước.
export function fbFragments(url: string): string[] {
  if (!/facebook\.com|fb\.watch|fb\.com/i.test(url)) return [];
  const out: string[] = [];
  const pf = url.match(/pfbid[A-Za-z0-9]{10,}/)?.[0];
  if (pf) out.push(pf);
  const pair = url.match(/(\d{6,})_(\d{6,})/);
  if (pair) out.push(pair[0], pair[2]);
  for (const re of [
    /story_fbid=(\d{6,})/,
    /[?&]fbid=(\d{6,})/,
    /\/posts\/(\d{6,})/,
    /\/permalink\/(\d{6,})/,
    /\/videos\/(\d{6,})/,
    /\/reel\/(\d{6,})/,
  ]) {
    const m = url.match(re);
    if (m) out.push(m[1]);
  }
  return [...new Set(out)];
}

async function resolveFbShare(url: string): Promise<string | null> {
  try {
    const res = await fetch(url.replace(/^http:/i, 'https:'), {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    return res.headers.get('location');
  } catch {
    return null;
  }
}
