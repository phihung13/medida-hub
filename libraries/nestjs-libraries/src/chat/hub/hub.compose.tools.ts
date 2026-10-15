import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { SignatureService } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.service';
import { SetsService } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  HubOrg,
  HubToolError,
  HubToolGroup,
  HubToolMap,
  MCP_AGENT,
  htmlToText,
  hubTool,
  requireLevel,
  toPostHtml,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Soạn bài": chân bài kênh, chữ ký, hashtag, tách thread, rút gọn link,
//  nhân bản bài, mẫu bài (sets), AI sinh bài, kiểm tra trước khi đăng, gắn
//  link bài đã đăng, khách hàng.
//  Mọi thao tác sửa bài đi qua PostsService.mapTypeToPost + createPost y như
//  hub_bai_sua: nháp / lỗi → khoá "tạo nháp"; đã lên lịch → khoá "được đăng";
//  đã đăng → không sửa.
// ============================================================================

const STATE_VI: Record<string, string> = {
  DRAFT: 'nhap',
  QUEUE: 'da_len_lich',
  PUBLISHED: 'da_dang',
  ERROR: 'loi',
};

type Val = { id?: string; content: string; delay: number; image: any[] };

// ---------------------------------------------------------------- văn bản ---

// Chuẩn hoá để so khớp "đã có chưa" (giống applyPostFooter): thẻ → khoảng
// trắng, giải mã entity hay gặp, gộp khoảng trắng.
const norm = (s: string) =>
  String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const isBlank = (html: string) =>
  htmlToText(html).replace(/ /g, ' ').trim() === '';

const P_RE = () => /<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi;

// Hashtag: '#' không đứng sau chữ/số/&(entity)/'/'(link)/'#'.
const HT_RE = () => /(^|[^\p{L}\p{N}_&\/#])#([\p{L}\p{N}_]+)/gu;
const ONLY_TAGS_RE = /^(?:#[\p{L}\p{N}_]+[\s ]*)+$/u;

const cleanTag = (t: string) =>
  String(t || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/[\s ]+/g, '');

// Áp fn lên phần CHỮ của HTML, bỏ qua thẻ và nội dung trong <a> (link).
const mapText = (html: string, fn: (t: string) => string) => {
  let inA = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<a[\s>]/i.test(part)) inA++;
        else if (/^<\/a>/i.test(part)) inA = Math.max(0, inA - 1);
        return part;
      }
      return inA ? part : fn(part);
    })
    .join('');
};

// Áp fn theo từng đoạn <p>; đoạn bị fn làm rỗng thì bỏ hẳn.
const perBlock = (html: string, fn: (t: string) => string) => {
  if (!/<p[\s>]/i.test(html)) return mapText(html, fn).trim();
  return html.replace(P_RE(), (_m, attrs: string | undefined, inner: string) => {
    let ni = mapText(inner, fn);
    if (ni === inner) return `<p${attrs || ''}>${inner}</p>`;
    ni = ni.replace(/^(?:\s|&nbsp;)+|(?:\s|&nbsp;)+$/g, '');
    if (isBlank(ni)) return '';
    return `<p${attrs || ''}>${ni}</p>`;
  });
};

const listTags = (html: string) => {
  const out: string[] = [];
  mapText(html, (t) => {
    for (const m of t.matchAll(HT_RE())) out.push('#' + m[2]);
    return t;
  });
  return out;
};

const dedupeTags = (tags: string[]) => {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const removeTags = (html: string, pred: (tag: string) => boolean) =>
  perBlock(html, (t) =>
    t
      .replace(HT_RE(), (m, pre: string, tag: string) => (pred(tag) ? pre : m))
      .replace(/ {2,}/g, ' ')
  );

const replaceTag = (html: string, cu: string, moi: string) => {
  const from = cleanTag(cu).toLowerCase();
  const to = cleanTag(moi);
  return perBlock(html, (t) =>
    t.replace(HT_RE(), (m, pre: string, tag: string) =>
      tag.toLowerCase() === from ? `${pre}#${to}` : m
    )
  );
};

// Các đoạn <p> cuối bài: trả vị trí bắt đầu cụm đoạn "chỉ toàn hashtag" ở đáy
// (bỏ qua đoạn trống), hoặc -1 nếu không có.
const trailingTagsStart = (html: string) => {
  const blocks = [...html.matchAll(P_RE())];
  if (!blocks.length) return -1;
  const last = blocks[blocks.length - 1];
  if ((last.index || 0) + last[0].length < html.trimEnd().length) return -1;
  let start = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const text = htmlToText(blocks[i][2]).replace(/ /g, ' ').trim();
    if (!text) continue;
    if (ONLY_TAGS_RE.test(text)) {
      start = blocks[i].index || 0;
      continue;
    }
    break;
  }
  return start;
};

const addTags = (html: string, tags: string[]) => {
  const have = new Set(listTags(html).map((t) => t.toLowerCase()));
  const add = dedupeTags(
    tags.map(cleanTag).filter(Boolean).map((t) => '#' + t)
  ).filter((t) => !have.has(t.toLowerCase()));
  if (!add.length) return html;
  const blocks = [...html.matchAll(P_RE())];
  const last = blocks[blocks.length - 1];
  if (
    last &&
    (last.index || 0) + last[0].length >= html.trimEnd().length &&
    ONLY_TAGS_RE.test(htmlToText(last[2]).replace(/ /g, ' ').trim())
  ) {
    const idx = (last.index || 0) + last[0].length - 4; // trước </p>
    return html.slice(0, idx) + ' ' + add.join(' ') + html.slice(idx);
  }
  return html + `<p>${add.join(' ')}</p>`;
};

const stripTrailingEmpty = (html: string) =>
  html.replace(/(?:<p(?:\s[^>]*)?>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i, '');

// Chèn khối (chữ ký / chân bài) DƯỚI caption, TRÊN cụm hashtag cuối bài.
const insertBlock = (html: string, block: string) => {
  const base = stripTrailingEmpty(html);
  const at = trailingTagsStart(base);
  if (at < 0) return base + block;
  return base.slice(0, at) + block + base.slice(at);
};

// Giới hạn hashtag "an toàn" theo nền tảng (bảo thủ hơn giới hạn cứng).
const TAG_LIMIT: Record<string, number> = {
  instagram: 30,
  x: 3,
  linkedin: 5,
  tiktok: 5,
  facebook: 5,
  threads: 1,
  youtube: 15,
  pinterest: 20,
  bluesky: 3,
  mastodon: 5,
};
const tagLimitOf = (provider?: string) => {
  const p = String(provider || '').toLowerCase();
  return TAG_LIMIT[p] ?? TAG_LIMIT[p.split('-')[0]] ?? 10;
};

const signatureHtml = (content: string) => toPostHtml(content || '');

@Injectable()
export class HubComposeTools implements HubToolGroup {
  constructor(
    private _postsService: PostsService,
    private _integrationService: IntegrationService,
    private _signatureService: SignatureService,
    private _setsService: SetsService,
    private _shortLinkService: ShortLinkService,
    private _openaiService: OpenaiService,
    private _agentGraphService: AgentGraphService
  ) {}

  // ------------------------------------------------------------ helpers ---

  private async loadPost(org: HubOrg, postId: string) {
    const cur = await this._postsService
      .getPost(org.id, postId)
      .catch(() => null);
    if (!cur?.posts?.length) {
      throw new HubToolError(
        `Không tìm thấy bài ${postId} (id phải là id bài chính — lấy từ hub_lich_xem / hub_bai_danh_sach).`
      );
    }
    return cur;
  }

  private async loadChannel(org: HubOrg, id: string) {
    const ch = await this._integrationService.getIntegrationById(org.id, id);
    if (!ch || ch.deletedAt) {
      throw new HubToolError(
        `Không tìm thấy kênh ${id} (lấy id từ hub_kenh_danh_sach / integrationList).`
      );
    }
    return ch;
  }

  private settingsOf(list?: { key?: string; value?: any }[]) {
    return (list || []).reduce(
      (acc, s) => (s.key ? { ...acc, [s.key]: s.value } : acc),
      {} as Record<string, any>
    );
  }

  private async validate(org: HubOrg, type: string, posts: any[]) {
    const validation = await this._postsService.validatePosts(org.id, posts);
    for (const item of validation) {
      if (item.emptyContent) {
        throw new HubToolError(
          `${item.name}: bài phải có ít nhất 1 ký tự hoặc 1 ảnh.`
        );
      }
      if (type === 'draft') continue;
      if (!item.valid) {
        throw new HubToolError(
          `${item.name}: ${item.settingsError || 'thiếu/sai cài đặt kênh'} — xem integrationSchema rồi truyền settings.`
        );
      }
      if (item.errors !== true) {
        throw new HubToolError(`${item.name}: ${item.errors}`);
      }
      if (item.tooLong) {
        throw new HubToolError(
          `${item.name}: quá dài (tối đa ${item.maximumCharacters} ký tự).`
        );
      }
    }
  }

  /**
   * Viết lại nội dung một bài (bài chính + comment đầu) qua đúng đường lưu
   * của trình soạn. transform trả null = không đổi gì. Kiểm quyền theo trạng
   * thái bài (QUEUE cần "được đăng").
   */
  private async rewritePost(
    org: HubOrg,
    id: string,
    transform: (
      values: Val[],
      ctx: { provider: string; first: any; cur: any }
    ) => Promise<Val[] | null> | Val[] | null,
    what = 'sửa bài đã lên lịch'
  ) {
    const cur = await this.loadPost(org, id);
    const first: any = cur.posts[0];
    if (first.state === 'PUBLISHED') {
      throw new HubToolError('Bài đã đăng — không sửa qua MCP được.');
    }
    if (first.state === 'QUEUE') requireLevel(org, 'dang', what);
    const type = first.state === 'QUEUE' ? 'schedule' : 'draft';
    const existing: Val[] = cur.posts.map((p: any) => ({
      id: p.id,
      content: p.content || '',
      delay: p.delay || 0,
      image: p.image || [],
    }));
    const provider =
      first.integration?.providerIdentifier || cur.settings?.__type || '';
    const next = await transform(
      existing.map((v) => ({ ...v })),
      { provider, first, cur }
    );
    if (
      !next ||
      (next.length === existing.length &&
        next.every(
          (v, i) =>
            v.content === existing[i].content && v.id === existing[i].id
        ))
    ) {
      return { id: first.id, doi: false, trang_thai: STATE_VI[first.state] };
    }
    const post = {
      integration: { id: cur.integration },
      group: cur.group,
      settings: cur.settings,
      value: next,
    };
    await this.validate(org, type, [post]);
    const tags = (first.tags || [])
      .map((t: any) => t?.tag?.name)
      .filter(Boolean)
      .map((t: string) => ({ value: t, label: t }));
    const body = await this._postsService.mapTypeToPost(
      {
        type,
        date: dayjs(first.publishDate).toISOString(),
        shortLink: false,
        tags,
        posts: [post],
      } as any,
      org.id
    );
    await this._postsService.createPost(org.id, body, 'MCP', MCP_AGENT);
    return {
      id: first.id,
      doi: true,
      trang_thai: first.state === 'QUEUE' ? 'da_len_lich' : 'nhap',
    };
  }

  // Chạy cho nhiều bài, một bài lỗi không chặn bài khác.
  private async eachPost<T>(ids: string[], fn: (id: string) => Promise<T>) {
    const ket_qua: any[] = [];
    for (const id of ids) {
      try {
        ket_qua.push({ ok: true, ...(await fn(id)) });
      } catch (e: any) {
        ket_qua.push({ id, ok: false, loi: e?.message || 'Lỗi' });
      }
    }
    return {
      thanh_cong: ket_qua.filter((x) => x.ok).length,
      loi: ket_qua.filter((x) => !x.ok).length,
      ket_qua,
    };
  }

  private async resolveSignature(org: HubOrg, id?: string) {
    const list = await this._signatureService.getSignaturesByOrgId(org.id);
    const sig = id ? list.find((s: any) => s.id === id) : list.find((s: any) => s.autoAdd);
    if (!sig) {
      throw new HubToolError(
        id
          ? 'Không tìm thấy chữ ký (xem hub_chu_ky).'
          : 'Tổ chức chưa có chữ ký mặc định — truyền chu_ky_id hoặc dùng nguon "van_ban".'
      );
    }
    return sig;
  }

  // -------------------------------------------------------------- tools ---

  tools(): HubToolMap {
    return {
      hub_chan_bai_kenh: hubTool({
        id: 'hub_chan_bai_kenh',
        title: 'Chân bài cố định của kênh',
        level: 'doc',
        writes: true,
        description: `Xem hoặc đặt chân bài (footer) cố định của một kênh. Chân bài KHÔNG nằm trong nội dung bài: hệ thống tự ghép vào bài chính đúng lúc đăng thật (dưới caption, trên cụm hashtag cuối; bỏ qua nếu bài đã chứa sẵn).
- Bỏ trống chan_bai: chỉ xem (khoá "chỉ đọc").
- Truyền chan_bai (chuỗi rỗng "" = xoá): đổi cấu hình kênh — cần khoá "được đăng".`,
        input: z.object({
          kenh: z.string().describe('id kênh'),
          chan_bai: z
            .string()
            .max(5000)
            .optional()
            .describe('Chân bài mới (chữ thường, xuống dòng giữ nguyên). "" = xoá.'),
        }),
        run: async (input, org) => {
          const ch: any = await this.loadChannel(org, input.kenh);
          if (input.chan_bai === undefined) {
            return {
              kenh: { id: ch.id, ten: ch.name, nen_tang: ch.providerIdentifier },
              chan_bai: ch.postFooter || '',
            };
          }
          requireLevel(org, 'dang', 'đổi chân bài của kênh');
          const res = await this._integrationService.updatePostFooter(
            org.id,
            input.kenh,
            input.chan_bai
          );
          if (!res) throw new HubToolError('Không tìm thấy kênh.');
          return { ok: true, kenh: ch.id, chan_bai: input.chan_bai.trim() };
        },
      }),

      hub_chan_bai_ap: hubTool({
        id: 'hub_chan_bai_ap',
        title: 'Gắn chữ ký / chân bài vào bài',
        level: 'nhap',
        description: `Gắn một khối chữ ký vào CUỐI nội dung của một hoặc nhiều bài (≤ 50) — đặt dưới caption, trên cụm hashtag cuối bài. Không gắn trùng nếu bài đã chứa khối đó.
- nguon "chu_ky": chữ ký đã lưu (chu_ky_id, bỏ trống = chữ ký mặc định).
- nguon "van_ban": khối chữ tuỳ ý (noi_dung).
- nguon "chan_kenh": chân bài cố định của kênh của từng bài. LƯU Ý: chân bài kênh vốn đã TỰ ghép lúc đăng thật — chỉ dùng khi cần nó nằm hẳn trong nội dung (không bị đăng 2 lần vì hệ thống bỏ qua khi bài đã chứa sẵn).
- thay_cho: gỡ khối cũ (các dòng của chữ ký/chân bài cũ) trước khi gắn khối mới.
Bài nháp/lỗi: khoá "tạo nháp"; bài đã lên lịch: khoá "được đăng"; bài đã đăng: bỏ qua.`,
        input: z.object({
          ids: z.array(z.string()).min(1).max(50).describe('id bài chính'),
          nguon: z.enum(['chu_ky', 'van_ban', 'chan_kenh']).default('chu_ky'),
          chu_ky_id: z.string().optional(),
          noi_dung: z.string().max(5000).optional().describe('Dùng với nguon "van_ban"'),
          thay_cho: z
            .string()
            .max(5000)
            .optional()
            .describe('Khối cũ cần gỡ (mỗi dòng khớp nguyên một đoạn trong bài)'),
        }),
        run: async (input, org) => {
          let fixed: string | null = null;
          if (input.nguon === 'van_ban') {
            if (!input.noi_dung?.trim()) {
              throw new HubToolError('nguon "van_ban" cần noi_dung.');
            }
            fixed = signatureHtml(input.noi_dung);
          } else if (input.nguon === 'chu_ky') {
            fixed = signatureHtml(
              (await this.resolveSignature(org, input.chu_ky_id)).content
            );
          }
          const oldLines = new Set(
            String(input.thay_cho || '')
              .split(/\r?\n/)
              .map(norm)
              .filter(Boolean)
          );
          return this.eachPost(input.ids, (id) =>
            this.rewritePost(org, id, async (values, { cur }) => {
              let block = fixed;
              if (!block) {
                const ch: any = await this._integrationService.getIntegrationById(
                  org.id,
                  cur.integration
                );
                if (!ch?.postFooter) {
                  throw new HubToolError('Kênh của bài chưa có chân bài.');
                }
                block = signatureHtml(ch.postFooter);
              }
              let html = values[0].content;
              if (oldLines.size) {
                html = html.replace(P_RE(), (m) =>
                  oldLines.has(norm(m)) ? '' : m
                );
              }
              if (!norm(html).includes(norm(block))) {
                html = insertBlock(html, block);
              }
              if (html === values[0].content) return null;
              values[0] = { ...values[0], content: html };
              return values;
            })
          );
        },
      }),

      hub_chu_ky: hubTool({
        id: 'hub_chu_ky',
        title: 'Quản lý chữ ký',
        level: 'doc',
        writes: true,
        description: `Chữ ký bài của tổ chức (khối chữ chèn cuối bài trong trình soạn).
- hanh_dong "danh_sach" (mặc định, khoá "chỉ đọc").
- "tao": noi_dung (+ mac_dinh); "sua": id + noi_dung và/hoặc mac_dinh; "xoa": id; "dat_mac_dinh": id (chữ ký mặc định = tự chèn khi soạn bài; chỉ có một). Các thao tác ghi cần khoá "tạo nháp".`,
        input: z.object({
          hanh_dong: z
            .enum(['danh_sach', 'tao', 'sua', 'xoa', 'dat_mac_dinh'])
            .default('danh_sach'),
          id: z.string().optional(),
          noi_dung: z
            .string()
            .max(5000)
            .optional()
            .describe('Chữ thường (mỗi dòng một đoạn) hoặc HTML'),
          mac_dinh: z.boolean().optional().describe('autoAdd — tự chèn khi soạn bài'),
        }),
        run: async (input, org) => {
          const list = async () =>
            (await this._signatureService.getSignaturesByOrgId(org.id)).map(
              (s: any) => ({
                id: s.id,
                mac_dinh: s.autoAdd,
                noi_dung: htmlToText(s.content),
                html: s.content,
              })
            );
          if (input.hanh_dong === 'danh_sach') return { chu_ky: await list() };
          requireLevel(org, 'nhap', 'sửa chữ ký');

          if (input.hanh_dong === 'tao') {
            if (!input.noi_dung?.trim()) throw new HubToolError('Thiếu noi_dung.');
            const r = await this._signatureService.createOrUpdateSignature(
              org.id,
              { content: toPostHtml(input.noi_dung), autoAdd: !!input.mac_dinh }
            );
            return { ok: true, id: r.id };
          }
          if (!input.id) throw new HubToolError('Thiếu id chữ ký.');
          const cur = await this.resolveSignature(org, input.id);
          if (input.hanh_dong === 'xoa') {
            await this._signatureService.deleteSignature(org.id, input.id);
            return { ok: true, da_xoa: input.id };
          }
          const r = await this._signatureService.createOrUpdateSignature(
            org.id,
            {
              content:
                input.hanh_dong === 'sua' && input.noi_dung != null
                  ? toPostHtml(input.noi_dung)
                  : cur.content,
              autoAdd:
                input.hanh_dong === 'dat_mac_dinh'
                  ? true
                  : input.mac_dinh ?? cur.autoAdd,
            },
            input.id
          );
          return { ok: true, id: r.id, chu_ky: await list() };
        },
      }),

      hub_hashtag: hubTool({
        id: 'hub_hashtag',
        title: 'Xử lý hashtag trong bài',
        level: 'doc',
        writes: true,
        description: `Hashtag trong nội dung một hoặc nhiều bài (≤ 50). Không đụng link, @mention.
- "xem": liệt kê hashtag (khoá "chỉ đọc").
- "them": thêm tags (bỏ qua cái đã có) vào dòng hashtag cuối bài (hoặc tạo dòng mới).
- "bo": gỡ tags (không phân biệt hoa/thường); đoạn chỉ còn trống bị bỏ.
- "thay": đổi hashtag cu → moi.
- "chuan_hoa": bỏ trùng (không phân biệt hoa/thường), gom TẤT CẢ hashtag về một dòng cuối bài, cắt theo số tối đa của kênh (instagram 30, youtube 15, pinterest 20, x 3, linkedin/tiktok/facebook 5, threads 1, khác 10 — hoặc gioi_han).
"them"/"chuan_hoa" chỉ áp vào bài chính; "xem"/"bo"/"thay" áp cả comment đầu nếu ca_comment = true. Ghi bài nháp/lỗi: khoá "tạo nháp"; bài đã lên lịch: khoá "được đăng".`,
        input: z.object({
          ids: z.array(z.string()).min(1).max(50),
          hanh_dong: z.enum(['xem', 'them', 'bo', 'thay', 'chuan_hoa']),
          tags: z.array(z.string()).optional().describe('Cho "them" / "bo" (có hoặc không có #)'),
          cu: z.string().optional().describe('Cho "thay"'),
          moi: z.string().optional().describe('Cho "thay"'),
          gioi_han: z.number().int().min(0).max(60).optional().describe('Cho "chuan_hoa" — ghi đè bảng mặc định'),
          ca_comment: z.boolean().default(false),
        }),
        run: async (input, org) => {
          const act = input.hanh_dong;
          if (act === 'xem') {
            return this.eachPost(input.ids, async (id) => {
              const cur = await this.loadPost(org, id);
              const posts = input.ca_comment ? cur.posts : cur.posts.slice(0, 1);
              const provider = (cur.posts[0] as any).integration?.providerIdentifier;
              const tags = posts.flatMap((p: any) => listTags(p.content || ''));
              return {
                id,
                nen_tang: provider,
                hashtag: tags,
                so_luong: tags.length,
                trung_lap: tags.length - dedupeTags(tags).length,
                toi_da_goi_y: tagLimitOf(provider),
              };
            });
          }
          requireLevel(org, 'nhap', 'sửa hashtag');
          const tagSet = new Set(
            (input.tags || []).map((t) => cleanTag(t).toLowerCase()).filter(Boolean)
          );
          if ((act === 'them' || act === 'bo') && !tagSet.size) {
            throw new HubToolError('Thiếu tags.');
          }
          if (act === 'thay' && (!cleanTag(input.cu || '') || !cleanTag(input.moi || ''))) {
            throw new HubToolError('"thay" cần cu và moi.');
          }
          return this.eachPost(input.ids, (id) =>
            this.rewritePost(org, id, (values, { provider }) => {
              const apply = (html: string, i: number) => {
                if (act === 'them') return i === 0 ? addTags(html, input.tags || []) : html;
                if (act === 'bo') {
                  return i === 0 || input.ca_comment
                    ? removeTags(html, (t) => tagSet.has(t.toLowerCase()))
                    : html;
                }
                if (act === 'thay') {
                  return i === 0 || input.ca_comment
                    ? replaceTag(html, input.cu!, input.moi!)
                    : html;
                }
                // chuan_hoa
                if (i !== 0) return html;
                const all = dedupeTags(listTags(html));
                if (!all.length) return html;
                const keep = all.slice(0, input.gioi_han ?? tagLimitOf(provider));
                const body = stripTrailingEmpty(removeTags(html, () => true));
                return keep.length ? body + `<p>${keep.join(' ')}</p>` : body;
              };
              return values.map((v, i) => ({ ...v, content: apply(v.content, i) }));
            }, 'sửa hashtag bài đã lên lịch')
          );
        },
      }),

      hub_hashtag_goi_y: hubTool({
        id: 'hub_hashtag_goi_y',
        title: 'AI gợi ý hashtag',
        level: 'nhap',
        openWorld: true,
        description:
          'AI gợi ý hashtag cho một đoạn chữ hoặc một bài (id). Chỉ trả gợi ý, không sửa bài — muốn gắn thì gọi hub_hashtag hanh_dong "them".',
        input: z.object({
          noi_dung: z.string().max(10000).optional(),
          id: z.string().optional().describe('id bài — dùng nội dung bài chính'),
          so_luong: z.number().int().min(1).max(30).optional(),
          nen_tang: z.string().optional().describe('vd instagram, facebook, tiktok'),
        }),
        run: async (input, org) => {
          let text = input.noi_dung || '';
          let provider = input.nen_tang;
          let existing: string[] = [];
          if (input.id) {
            const cur = await this.loadPost(org, input.id);
            const first: any = cur.posts[0];
            text = htmlToText(first.content);
            existing = listTags(first.content || '');
            provider = provider || first.integration?.providerIdentifier;
          }
          if (!text.trim()) throw new HubToolError('Cần noi_dung hoặc id bài.');
          const n = input.so_luong ?? Math.min(tagLimitOf(provider), 10);
          const goi_y = await this._openaiService.suggestHashtags(text, n, provider);
          if (!goi_y.length) throw new HubToolError('AI không trả gợi ý — thử lại sau.');
          const have = new Set(existing.map((t) => t.toLowerCase()));
          return {
            goi_y,
            moi: goi_y.filter((t) => !have.has(t.toLowerCase())),
            da_co_trong_bai: existing,
            toi_da_goi_y: tagLimitOf(provider),
          };
        },
      }),

      hub_bai_tach_thread: hubTool({
        id: 'hub_bai_tach_thread',
        title: 'Tách bài dài thành thread',
        level: 'nhap',
        openWorld: true,
        description: `AI tách một đoạn chữ dài (hoặc bài chính của một bài) thành các phần ≤ do_dai ký tự, giữ nguyên câu chữ.
ap_dung = true (cần id): phần 1 thành bài chính (giữ media), các phần sau thành comment đầu / bài nối thread (thay toàn bộ comment đầu cũ). Bài đã lên lịch cần khoá "được đăng".`,
        input: z.object({
          noi_dung: z.string().max(20000).optional(),
          id: z.string().optional(),
          do_dai: z.number().int().min(50).max(5000).default(280).describe('Số ký tự tối đa mỗi phần (X: 280, Threads: 500, Bluesky: 300)'),
          ap_dung: z.boolean().default(false),
        }),
        run: async (input, org) => {
          let text = input.noi_dung || '';
          if (!text && input.id) {
            const cur = await this.loadPost(org, input.id);
            text = htmlToText((cur.posts[0] as any).content);
          }
          if (!text.trim()) throw new HubToolError('Cần noi_dung hoặc id bài.');
          const { posts } = await this._postsService.separatePosts(text, input.do_dai);
          if (!input.ap_dung) return { so_phan: posts.length, phan: posts };
          if (!input.id) throw new HubToolError('ap_dung cần id bài.');
          const res = await this.rewritePost(org, input.id, (values) => [
            { ...values[0], content: toPostHtml(posts[0]) },
            ...posts.slice(1).map((p, i) => ({
              ...(values[i + 1]?.id ? { id: values[i + 1].id } : {}),
              content: toPostHtml(p),
              delay: values[i + 1]?.delay || 0,
              image: values[i + 1]?.image || [],
            })),
          ]);
          return { ...res, so_phan: posts.length, phan: posts };
        },
      }),

      hub_rut_gon_link: hubTool({
        id: 'hub_rut_gon_link',
        title: 'Rút gọn link',
        level: 'nhap',
        openWorld: true,
        description:
          'Rút gọn mọi link trong một đoạn chữ, hoặc trong nội dung một bài (bài chính + comment đầu, có lưu lại) bằng dịch vụ rút gọn đã cài cho Hub (có thống kê lượt bấm). Bài đã lên lịch cần khoá "được đăng".',
        input: z.object({
          noi_dung: z.string().max(20000).optional(),
          id: z.string().optional(),
        }),
        run: async (input, org) => {
          if ((ShortLinkService as any).provider?.shortLinkDomain === 'empty') {
            throw new HubToolError('Hub chưa cài dịch vụ rút gọn link.');
          }
          if (input.noi_dung) {
            const [out] = await this._shortLinkService.convertTextToShortLinks(
              org.id,
              [input.noi_dung]
            );
            return { noi_dung: out, doi: out !== input.noi_dung };
          }
          if (!input.id) throw new HubToolError('Cần noi_dung hoặc id bài.');
          return this.rewritePost(org, input.id, async (values) => {
            const out = await this._shortLinkService.convertTextToShortLinks(
              org.id,
              values.map((v) => v.content)
            );
            return values.map((v, i) => ({ ...v, content: out[i] }));
          });
        },
      }),

      hub_bai_nhan_ban: hubTool({
        id: 'hub_bai_nhan_ban',
        title: 'Nhân bản bài',
        level: 'nhap',
        description: `Nhân bản một bài (nội dung, comment đầu, media, tag, cài đặt kênh nếu cùng nền tảng) sang cùng kênh hoặc các kênh khác.
Mặc định tạo NHÁP; len_lich = true thì lên lịch thật (khoá "được đăng"). Bỏ trống gio_dang = giờ trống kế tiếp của từng kênh.`,
        input: z.object({
          id: z.string().describe('id bài gốc'),
          kenh: z.array(z.string()).optional().describe('id kênh đích (bỏ trống = kênh của bài gốc)'),
          gio_dang: z.string().optional().describe('ISO 8601'),
          len_lich: z.boolean().default(false),
        }),
        run: async (input, org) => {
          if (input.len_lich) requireLevel(org, 'dang', 'lên lịch bản sao');
          const type = input.len_lich ? 'schedule' : 'draft';
          const cur = await this.loadPost(org, input.id);
          const first: any = cur.posts[0];
          const srcProvider = first.integration?.providerIdentifier;
          const targets = input.kenh?.length ? input.kenh : [cur.integration];
          if (input.gio_dang && !dayjs(input.gio_dang).isValid()) {
            throw new HubToolError('gio_dang không hợp lệ.');
          }
          const tags = (first.tags || [])
            .map((t: any) => t?.tag?.name)
            .filter(Boolean)
            .map((t: string) => ({ value: t, label: t }));
          const out: any[] = [];
          for (const kenh of targets) {
            try {
              const ch = await this.loadChannel(org, kenh);
              const post = {
                integration: { id: kenh },
                group: makeId(10),
                settings:
                  ch.providerIdentifier === srcProvider ? { ...cur.settings } : {},
                value: cur.posts.map((p: any) => ({
                  content: p.content || '',
                  delay: p.delay || 0,
                  image: (p.image || []).map((m: any) => ({ ...m })),
                })),
              };
              await this.validate(org, type, [post]);
              const date = input.gio_dang
                ? dayjs(input.gio_dang).toISOString()
                : dayjs(
                    (await this._postsService.findFreeDateTime(org.id, kenh)) + 'Z'
                  ).toISOString();
              const body = await this._postsService.mapTypeToPost(
                { type, date, shortLink: false, tags, posts: [post] } as any,
                org.id
              );
              const res = await this._postsService.createPost(
                org.id,
                body,
                'MCP',
                MCP_AGENT
              );
              out.push({ ok: true, kenh, id: res[0]?.postId, gio_dang: date });
            } catch (e: any) {
              out.push({ ok: false, kenh, loi: e?.message || 'Lỗi' });
            }
          }
          return { loai: type, ban_sao: out };
        },
      }),

      hub_bo_cai_dat: hubTool({
        id: 'hub_bo_cai_dat',
        title: 'Mẫu bài (sets)',
        level: 'doc',
        writes: true,
        description: `Mẫu bài soạn sẵn ("Sets": bộ kênh + nội dung + cài đặt, chọn nhanh trong trình soạn).
- "danh_sach" (khoá "chỉ đọc").
- "tao" / "sua" (cần id): ten + kenh + noi_dung (+ comment_dau, media, cai_dat, tags) — hoặc noi_dung_json (JSON thô đúng định dạng trình soạn) — khoá "tạo nháp".
- "xoa": id — khoá "tạo nháp".`,
        input: z.object({
          hanh_dong: z.enum(['danh_sach', 'tao', 'sua', 'xoa']).default('danh_sach'),
          id: z.string().optional(),
          ten: z.string().max(200).optional(),
          kenh: z.array(z.string()).optional(),
          noi_dung: z.string().optional(),
          comment_dau: z.array(z.string()).optional(),
          media: z.array(z.string()).optional().describe('Link media đã có trong thư viện Hub'),
          cai_dat: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
          tags: z.array(z.string()).optional(),
          noi_dung_json: z.string().optional(),
        }),
        run: async (input, org) => {
          const sets = async () =>
            (await this._setsService.getSets(org.id)).map((s: any) => {
              let content: any = s.content;
              try {
                content = JSON.parse(s.content);
              } catch {
                /* giữ chuỗi */
              }
              return { id: s.id, ten: s.name, noi_dung: content };
            });
          if (input.hanh_dong === 'danh_sach') return { mau_bai: await sets() };
          requireLevel(org, 'nhap', 'sửa mẫu bài');
          const exists = async () => {
            const list = await this._setsService.getSets(org.id);
            const s = list.find((x: any) => x.id === input.id);
            if (!s) throw new HubToolError('Không tìm thấy mẫu bài (xem danh_sach).');
            return s;
          };
          if (input.hanh_dong === 'xoa') {
            if (!input.id) throw new HubToolError('Thiếu id.');
            await exists();
            await this._setsService.deleteSet(org.id, input.id);
            return { ok: true, da_xoa: input.id };
          }
          if (input.hanh_dong === 'sua') {
            if (!input.id) throw new HubToolError('Thiếu id.');
          }
          const old: any = input.hanh_dong === 'sua' ? await exists() : null;
          let content: string;
          if (input.noi_dung_json) {
            try {
              JSON.parse(input.noi_dung_json);
            } catch {
              throw new HubToolError('noi_dung_json không phải JSON hợp lệ.');
            }
            content = input.noi_dung_json;
          } else if (input.noi_dung != null || input.kenh?.length) {
            if (!input.kenh?.length || input.noi_dung == null) {
              throw new HubToolError('Cần cả kenh và noi_dung.');
            }
            for (const k of input.kenh) await this.loadChannel(org, k);
            const settings = this.settingsOf(input.cai_dat);
            const value = [input.noi_dung, ...(input.comment_dau || [])].map(
              (c, i) => ({
                content: toPostHtml(c),
                delay: 0,
                image:
                  i === 0
                    ? (input.media || []).map((path) => ({ id: makeId(10), path }))
                    : [],
              })
            );
            content = JSON.stringify({
              type: 'draft',
              tags: (input.tags || []).map((t) => ({ value: t, label: t })),
              shortLink: false,
              date: new Date().toISOString().slice(0, 19),
              posts: input.kenh.map((id) => ({
                integration: { id },
                group: makeId(10),
                settings: { ...settings },
                value,
              })),
            });
          } else if (old) {
            content = old.content;
          } else {
            throw new HubToolError('Cần kenh + noi_dung hoặc noi_dung_json.');
          }
          const name = input.ten || old?.name;
          if (!name) throw new HubToolError('Thiếu ten.');
          const r = await this._setsService.createSet(org.id, {
            ...(input.id ? { id: input.id } : {}),
            name,
            content,
          });
          return { ok: true, id: r.id };
        },
      }),

      hub_ai_sinh_bai: hubTool({
        id: 'hub_ai_sinh_bai',
        title: 'AI sinh bài (Generator)',
        level: 'nhap',
        openWorld: true,
        description: `Chạy "Generator" của Hub: AI nghiên cứu chủ đề (tìm web nếu có), chọn hook, viết bài (một bài hoặc thread), tuỳ chọn tạo ảnh. Mất khoảng 30-120 giây.
Truyền kenh để lưu kết quả thành NHÁP trên từng kênh (giờ = gio_dang hoặc giờ trống AI chọn); bỏ trống kenh = chỉ trả nội dung.`,
        input: z.object({
          chu_de: z.string().min(10).max(5000).describe('Chủ đề / tư liệu nghiên cứu (≥ 10 ký tự)'),
          dinh_dang: z
            .enum(['one_short', 'one_long', 'thread_short', 'thread_long'])
            .default('one_short'),
          giong: z.enum(['personal', 'company']).default('company'),
          tao_anh: z.boolean().default(false),
          kenh: z.array(z.string()).optional(),
          gio_dang: z.string().optional().describe('ISO 8601'),
        }),
        run: async (input, org) => {
          let last: any = null;
          for await (const ev of this._agentGraphService.start(org.id, {
            research: input.chu_de,
            isPicture: input.tao_anh,
            format: input.dinh_dang,
            tone: input.giong,
          }) as any) {
            if (ev?.data?.output?.content) last = ev.data.output;
          }
          if (!last?.content) {
            throw new HubToolError('Generator không trả nội dung — thử lại.');
          }
          const parts: any[] = Array.isArray(last.content)
            ? last.content
            : [{ content: String(last.content) }];
          const value = parts.map((p: any, i: number) => ({
            content: toPostHtml(
              i === 0 && last.hook ? `${last.hook}\n${p.content}` : String(p.content || '')
            ),
            delay: 0,
            image: p?.image?.path ? [{ id: p.image.id || makeId(10), path: p.image.path }] : [],
          }));
          const preview = value.map((v) => htmlToText(v.content));
          if (!input.kenh?.length) {
            return { noi_dung: preview, gio_goi_y: last.date };
          }
          const date = input.gio_dang
            ? dayjs(input.gio_dang).toISOString()
            : last.date
            ? dayjs(String(last.date).endsWith('Z') ? last.date : last.date + 'Z').toISOString()
            : dayjs().add(1, 'day').toISOString();
          const created: any[] = [];
          for (const kenh of input.kenh) {
            try {
              await this.loadChannel(org, kenh);
              const post = {
                integration: { id: kenh },
                group: makeId(10),
                settings: {},
                value,
              };
              await this.validate(org, 'draft', [post]);
              const body = await this._postsService.mapTypeToPost(
                { type: 'draft', date, shortLink: false, tags: [], posts: [post] } as any,
                org.id
              );
              const res = await this._postsService.createPost(org.id, body, 'MCP', MCP_AGENT);
              created.push({ ok: true, kenh, id: res[0]?.postId });
            } catch (e: any) {
              created.push({ ok: false, kenh, loi: e?.message || 'Lỗi' });
            }
          }
          return { noi_dung: preview, gio_dang: date, nhap: created };
        },
      }),

      hub_bai_kiem_tra: hubTool({
        id: 'hub_bai_kiem_tra',
        title: 'Kiểm tra bài trước khi đăng',
        level: 'doc',
        description: `Chạy thử kiểm hợp lệ (không lưu gì) cho một bài dự định (kenh + noi_dung + media + cai_dat) hoặc một bài có sẵn (id). Trả theo từng kênh: hợp lệ để lên lịch không, độ dài so với giới hạn (kể cả chân bài kênh ghép lúc đăng), số ảnh, lỗi media, cài đặt thiếu, kênh tắt / mất kết nối.`,
        input: z.object({
          id: z.string().optional(),
          kenh: z.array(z.string()).optional(),
          noi_dung: z.string().optional(),
          comment_dau: z.array(z.string()).optional(),
          media: z.array(z.string()).optional(),
          cai_dat: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
        }),
        run: async (input, org) => {
          let posts: any[];
          if (input.id) {
            const cur = await this.loadPost(org, input.id);
            posts = [
              {
                integration: { id: cur.integration },
                settings: cur.settings,
                value: cur.posts.map((p: any) => ({
                  content: p.content || '',
                  image: p.image || [],
                })),
              },
            ];
          } else {
            if (!input.kenh?.length || input.noi_dung == null) {
              throw new HubToolError('Cần id bài, hoặc kenh + noi_dung.');
            }
            const settings = this.settingsOf(input.cai_dat);
            const value = [input.noi_dung, ...(input.comment_dau || [])].map(
              (c, i) => ({
                content: toPostHtml(c),
                image:
                  i === 0
                    ? (input.media || []).map((path) => ({ id: makeId(10), path }))
                    : [],
              })
            );
            posts = input.kenh.map((id) => ({ integration: { id }, settings, value }));
          }
          const res = await this._postsService.validatePosts(org.id, posts);
          const out = await Promise.all(
            res.map(async (r, idx) => {
              const ch: any = await this._integrationService.getIntegrationById(
                org.id,
                r.id
              );
              const values = posts[idx].value;
              const footer = String(ch?.postFooter || '').trim();
              const lens = values.map((v: any) => htmlToText(v.content).length);
              const max = r.maximumCharacters || null;
              const mainWithFooter = lens[0] + (footer ? footer.length + 2 : 0);
              const problems: string[] = [];
              if (r.emptyContent) problems.push('Có phần trống (không chữ, không ảnh).');
              if (!r.valid) problems.push(`Cài đặt kênh: ${r.settingsError || 'thiếu/sai'}`);
              if (r.errors !== true) problems.push(`Media: ${r.errors}`);
              if (r.tooLong) problems.push(`Quá dài (tối đa ${max} ký tự).`);
              else if (max && footer && mainWithFooter > max) {
                problems.push(`Kèm chân bài kênh sẽ dài ${mainWithFooter}/${max} ký tự — có thể bị cắt/lỗi.`);
              }
              if (ch?.disabled) problems.push('Kênh đang TẮT.');
              if (ch?.refreshNeeded || ch?.inBetweenSteps) {
                problems.push('Kênh MẤT KẾT NỐI — cần kết nối lại trong Hub.');
              }
              return {
                kenh: { id: r.id, ten: r.name, nen_tang: r.identifier },
                hop_le_len_lich: problems.length === 0,
                hop_le_nhap: !r.emptyContent,
                van_de: problems,
                do_dai: lens,
                toi_da_ky_tu: max,
                chan_bai_kenh: footer || undefined,
                so_anh: values.map((v: any) => (v.image || []).length),
                so_hashtag: listTags(values[0]?.content || '').length,
                hashtag_toi_da_goi_y: tagLimitOf(r.identifier),
              };
            })
          );
          return {
            tat_ca_hop_le: out.every((o) => o.hop_le_len_lich),
            kenh: out,
          };
        },
      }),

      hub_bai_gan_link_da_dang: hubTool({
        id: 'hub_bai_gan_link_da_dang',
        title: 'Gắn link cho bài đã đăng bị thiếu',
        level: 'dang',
        openWorld: true,
        description: `Với bài đã đăng mà Hub chưa lấy được link (releaseId "missing" — vd TikTok/Instagram xử lý chậm): bỏ trống release_id để xem danh sách bài gần đây trên kênh (id + url) lấy từ mạng xã hội; truyền release_id (id bài trên mạng xã hội) để gắn vào bài trong Hub.`,
        input: z.object({
          id: z.string().describe('id bài trong Hub'),
          release_id: z.string().optional(),
        }),
        run: async (input, org) => {
          const post: any = await this._postsService.getPostById(input.id, org.id);
          if (!post) throw new HubToolError('Không tìm thấy bài.');
          if (post.releaseId !== 'missing') {
            return {
              ok: false,
              ghi_chu: 'Bài này không ở trạng thái thiếu link.',
              link_da_dang: post.releaseURL || undefined,
            };
          }
          if (!input.release_id) {
            const list = await this._postsService.getMissingContent(org.id, input.id);
            return {
              ung_vien: list,
              ghi_chu: list.length
                ? 'Chọn id khớp với bài rồi gọi lại kèm release_id.'
                : 'Nền tảng không hỗ trợ hoặc không lấy được danh sách.',
            };
          }
          await this._postsService.updateReleaseId(org.id, input.id, input.release_id);
          return { ok: true, id: input.id, release_id: input.release_id };
        },
      }),

      hub_khach_hang: hubTool({
        id: 'hub_khach_hang',
        title: 'Khách hàng & kênh',
        level: 'doc',
        description:
          'Danh sách khách hàng (nhóm kênh) kèm các kênh thuộc từng khách. id khách hàng dùng làm khach_hang trong hub_lich_xem / hub_bai_danh_sach để lọc lịch theo khách.',
        input: z.object({}),
        run: async (_i, org) => {
          const [customers, channels] = await Promise.all([
            this._integrationService.customers(org.id),
            this._integrationService.getIntegrationsList(org.id),
          ]);
          const ch = (c: any) => ({
            id: c.id,
            ten: c.name,
            nen_tang: c.providerIdentifier,
            tat: c.disabled || undefined,
            mat_ket_noi: c.refreshNeeded || c.inBetweenSteps || undefined,
          });
          return {
            khach_hang: customers.map((cu: any) => ({
              id: cu.id,
              ten: cu.name,
              kenh: channels.filter((c: any) => c.customerId === cu.id).map(ch),
            })),
            kenh_chua_gan_khach: channels.filter((c: any) => !c.customerId).map(ch),
          };
        },
      }),
    };
  }
}
