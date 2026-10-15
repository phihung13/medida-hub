import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import { readFile } from 'fs/promises';
import { resolve, sep } from 'path';
import { Readable } from 'stream';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { GeminiService } from '@gitroom/nestjs-libraries/openai/gemini.service';
import { hasGeminiKey } from '@gitroom/nestjs-libraries/openai/gemini.key';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  HubOrg,
  HubToolError,
  HubToolGroup,
  HubToolMap,
  MCP_AGENT,
  hubTool,
  requireLevel,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';
import { bot, botBinary } from '@gitroom/nestjs-libraries/chat/hub/hub.zalo.client';
import {
  ANCHORS,
  COLLAGE_COUNT,
  CollageLayout,
  EditResult,
  ImageOp,
  RATIOS,
  Ratio,
  collage,
  editImage,
  extractVideoFrame,
  findDuplicateGroups,
  hasFfmpeg,
  imageInfo,
  measureQuality,
  scoreQuality,
  toJpeg,
  toPng,
} from '@gitroom/nestjs-libraries/chat/hub/hub.image.ops';

// ============================================================================
//  Nhóm "Ảnh": sắp xếp / bỏ / chèn ảnh trong bài Hub và bài chờ bot Zalo,
//  sửa ảnh (cắt, chỉnh màu, chữ, logo, đệm nền mờ, nén…), ghép ảnh, AI sửa ảnh
//  (Gemini), chấm điểm chất lượng + tìm ảnh trùng, kiểm ảnh theo luật kênh,
//  cắt thumbnail video. Ảnh sửa luôn lưu thành media MỚI — không ghi đè gốc.
//  Quyền: sửa nháp = "tạo nháp"; bài ĐÃ LÊN LỊCH = "được đăng"; bài đã đăng
//  không sửa (giống hub_bai_sua).
// ============================================================================

const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi|mkv)$/i;
const isVideo = (path?: string) => VIDEO_EXT.test(String(path || '').split(/[?#]/)[0]);

const anhRef = z
  .string()
  .min(1)
  .describe('path (link) hoặc id của media trong thư viện Hub');

const ratioField = z
  .union([z.enum(RATIOS), z.number().positive().max(10)])
  .describe('Tỉ lệ rộng:cao, vd "4:5", "9:16", "16:9" hoặc số (0.8)');

const anchorField = z.enum(ANCHORS);
const colorField = z
  .string()
  .max(40)
  .describe('Màu: #rrggbb, #rrggbbaa, rgba(0,0,0,0.5) hoặc tên màu');

const opSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('cat_ti_le'),
    ti_le: ratioField,
    tam: z
      .union([anchorField, z.enum(['thong_minh', 'chi_tiet'])])
      .optional()
      .describe('Giữ phần nào: thong_minh (mặc định, AI tìm chủ thể), chi_tiet, hoặc vị trí'),
  }),
  z.object({
    op: z.literal('cat_vung'),
    x: z.number().min(0),
    y: z.number().min(0),
    rong: z.number().positive(),
    cao: z.number().positive(),
    don_vi: z.enum(['px', '%']).optional().describe('Mặc định px'),
  }),
  z.object({
    op: z.literal('xoay'),
    goc: z.number().min(-360).max(360).describe('Độ, chiều kim đồng hồ'),
    nen: colorField.optional(),
  }),
  z.object({ op: z.literal('lat'), huong: z.enum(['doc', 'ngang']) }),
  z.object({
    op: z.literal('doi_co'),
    rong: z.number().int().min(1).max(8000).optional(),
    cao: z.number().int().min(1).max(8000).optional(),
    kieu: z
      .enum(['cover', 'contain', 'inside', 'fill'])
      .optional()
      .describe('inside (mặc định, giữ tỉ lệ) | cover (cắt cho kín) | contain (thêm nền) | fill (kéo méo)'),
    nen: colorField.optional(),
  }),
  z.object({
    op: z.literal('phong_to'),
    he_so: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({
    op: z.literal('chinh_mau'),
    do_sang: z.number().min(0).max(5).optional().describe('1 = giữ nguyên, 1.2 = sáng hơn 20%'),
    tuong_phan: z.number().min(0).max(5).optional().describe('1 = giữ nguyên'),
    bao_hoa: z.number().min(0).max(5).optional().describe('1 = giữ nguyên, 0 = đen trắng'),
  }),
  z.object({ op: z.literal('lam_net'), muc: z.number().min(0.3).max(10).optional() }),
  z.object({ op: z.literal('lam_mo'), muc: z.number().min(0.3).max(100) }),
  z.object({ op: z.literal('den_trang') }),
  z.object({
    op: z.literal('chu'),
    noi_dung: z.string().min(1).max(500),
    vi_tri: anchorField.optional().describe('Mặc định duoi'),
    co_chu: z.number().min(1).max(30).optional().describe('% chiều rộng ảnh, mặc định 5'),
    mau: colorField.optional(),
    nen: z
      .string()
      .max(40)
      .optional()
      .describe('Màu hộp nền chữ (mặc định đen mờ 55%), "none" = không nền (chữ có viền)'),
    dam: z.boolean().optional().describe('Chữ đậm, mặc định true'),
    le: z.number().min(0).max(30).optional().describe('Lề, % cạnh ngắn'),
  }),
  z.object({
    op: z.literal('logo'),
    logo: anhRef.describe('path hoặc id media của logo (PNG nền trong suốt là đẹp nhất)'),
    vi_tri: anchorField.optional().describe('Mặc định duoi_phai'),
    ti_le: z.number().min(1).max(100).optional().describe('Rộng logo = % rộng ảnh, mặc định 18'),
    do_mo: z.number().min(0).max(1).optional().describe('Độ đậm 0-1, mặc định 0.85'),
    le: z.number().min(0).max(30).optional(),
  }),
  z.object({
    op: z.literal('vien'),
    mau: colorField.optional(),
    day: z.number().min(1).max(500).optional().describe('px, mặc định 2% cạnh ngắn'),
  }),
  z.object({
    op: z.literal('dem_ti_le'),
    ti_le: ratioField,
    nen: z.string().max(40).optional().describe('"mo" (mặc định, nền mờ từ chính ảnh) hoặc màu'),
  }),
  z.object({
    op: z.literal('nen'),
    toi_da_kb: z.number().int().min(30).max(20000).optional(),
    chat_luong: z.number().int().min(30).max(100).optional(),
  }),
  z.object({
    op: z.literal('dinh_dang'),
    kieu: z.enum(['jpeg', 'png', 'webp']),
    chat_luong: z.number().int().min(30).max(100).optional(),
  }),
]);

const opsField = z
  .array(opSchema)
  .min(1)
  .max(20)
  .describe(
    `Chuỗi thao tác, chạy theo thứ tự:
- cat_ti_le {ti_le, tam?}: cắt về tỉ lệ (1:1, 4:5, 9:16, 16:9, 3:4, 2:3…), mặc định giữ chủ thể
- cat_vung {x,y,rong,cao,don_vi?}: cắt theo hộp (px hoặc %)
- xoay {goc} · lat {huong: doc|ngang} · den_trang
- doi_co {rong?,cao?,kieu?} · phong_to {he_so: 2|3|4} (lanczos + làm nét, không dùng AI)
- chinh_mau {do_sang?,tuong_phan?,bao_hoa?} (1 = giữ nguyên) · lam_net {muc?} · lam_mo {muc}
- chu {noi_dung, vi_tri?, co_chu?, mau?, nen?, dam?}: chèn chữ (có dấu tiếng Việt)
- logo {logo, vi_tri?, ti_le?, do_mo?}: đóng dấu logo
- vien {mau?, day?}: viền khung
- dem_ti_le {ti_le, nen?}: đệm thành tỉ lệ (vd 9:16) với nền mờ, không cắt mất nội dung
- nen {toi_da_kb?, chat_luong?} · dinh_dang {kieu: jpeg|png|webp}`
  );

type OpInput = z.infer<typeof opSchema>;

// ---------------------------------------------------------------------------
//  Luật ảnh theo kênh — BẢO THỦ (chặt hơn giới hạn thật của nền tảng một chút
//  để ảnh qua chắc chắn). Luật riêng của từng provider (checkValidity) vẫn chạy
//  qua validatePosts và trả ở "kenh_bao_loi".
// ---------------------------------------------------------------------------
interface ChannelRule {
  ten: string;
  toi_da_anh: number;
  ti_le_min?: number;
  ti_le_max?: number;
  canh_ngan_min: number;
  toi_da_kb: number;
  ghi_chu?: string;
}

const CHANNEL_RULES: Record<string, ChannelRule> = {
  facebook: { ten: 'Facebook', toi_da_anh: 10, ti_le_min: 0.5, ti_le_max: 1.91, canh_ngan_min: 600, toi_da_kb: 4096 },
  instagram: { ten: 'Instagram', toi_da_anh: 10, ti_le_min: 0.8, ti_le_max: 1.91, canh_ngan_min: 320, toi_da_kb: 8192, ghi_chu: 'Feed: 4:5 đến 1.91:1' },
  x: { ten: 'X', toi_da_anh: 4, ti_le_min: 0.5, ti_le_max: 3, canh_ngan_min: 300, toi_da_kb: 5120 },
  linkedin: { ten: 'LinkedIn', toi_da_anh: 9, ti_le_min: 0.42, ti_le_max: 2.4, canh_ngan_min: 400, toi_da_kb: 5120 },
  tiktok: { ten: 'TikTok', toi_da_anh: 35, ti_le_min: 0.5, ti_le_max: 1, canh_ngan_min: 720, toi_da_kb: 20480, ghi_chu: 'Ảnh dọc 9:16 hiển thị đẹp nhất' },
  youtube: { ten: 'YouTube (thumbnail)', toi_da_anh: 1, ti_le_min: 1.7, ti_le_max: 1.85, canh_ngan_min: 360, toi_da_kb: 2048, ghi_chu: 'Thumbnail 16:9, ≤ 2MB' },
  threads: { ten: 'Threads', toi_da_anh: 10, ti_le_min: 0.5, ti_le_max: 1.91, canh_ngan_min: 320, toi_da_kb: 8192 },
  pinterest: { ten: 'Pinterest', toi_da_anh: 5, ti_le_min: 0.5, ti_le_max: 1, canh_ngan_min: 600, toi_da_kb: 10240, ghi_chu: 'Pin dọc 2:3 là chuẩn' },
  zalo: { ten: 'Zalo', toi_da_anh: 10, ti_le_min: 0.5, ti_le_max: 2, canh_ngan_min: 400, toi_da_kb: 5120 },
  gmb: { ten: 'Google Business', toi_da_anh: 1, ti_le_min: 0.75, ti_le_max: 1.78, canh_ngan_min: 250, toi_da_kb: 5120 },
};
const DEFAULT_RULE: ChannelRule = {
  ten: 'Mặc định',
  toi_da_anh: 10,
  canh_ngan_min: 200,
  toi_da_kb: 8192,
};

const ruleFor = (provider?: string): ChannelRule => {
  const p = String(provider || '').toLowerCase();
  if (CHANNEL_RULES[p]) return CHANNEL_RULES[p];
  const key = Object.keys(CHANNEL_RULES).find((k) => p.startsWith(k));
  return key ? CHANNEL_RULES[key] : DEFAULT_RULE;
};

const anhView = (m: any, i: number) => ({
  vi_tri: i + 1,
  id: m?.id,
  path: m?.path,
  alt: m?.alt || undefined,
  video: isVideo(m?.path) || undefined,
});

interface ListPlan {
  thu_tu?: number[];
  bo?: number[];
  anh_bia?: number;
}

/** Thứ tự mới (chỉ số 0-based của danh sách gốc). Mọi vị trí đầu vào là 1-based theo danh sách GỐC. */
const planOrder = (n: number, plan: ListPlan): number[] => {
  const check = (i: number, field: string) => {
    if (!Number.isInteger(i) || i < 1 || i > n) {
      throw new HubToolError(
        `${field}: không có ảnh số ${i} (đang có ${n} ảnh, đánh số từ 1).`
      );
    }
  };
  let order = Array.from({ length: n }, (_, i) => i);
  if (plan.thu_tu?.length) {
    plan.thu_tu.forEach((i) => check(i, 'thu_tu'));
    if (new Set(plan.thu_tu).size !== plan.thu_tu.length) {
      throw new HubToolError('thu_tu bị lặp số.');
    }
    const listed = plan.thu_tu.map((i) => i - 1);
    order = [...listed, ...order.filter((i) => !listed.includes(i))];
  }
  if (plan.anh_bia != null) {
    check(plan.anh_bia, 'anh_bia');
    const k = plan.anh_bia - 1;
    order = [k, ...order.filter((i) => i !== k)];
  }
  if (plan.bo?.length) {
    plan.bo.forEach((i) => check(i, 'bo'));
    const drop = new Set(plan.bo.map((i) => i - 1));
    order = order.filter((i) => !drop.has(i));
  }
  return order;
};

const listPlanFields = {
  thu_tu: z
    .array(z.number().int().min(1))
    .optional()
    .describe('Thứ tự mới theo số ảnh GỐC (1-based), vd [3,1,2]. Ảnh không liệt kê giữ thứ tự cũ ở sau.'),
  bo: z
    .array(z.number().int().min(1))
    .optional()
    .describe('Số ảnh GỐC cần bỏ'),
  anh_bia: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Số ảnh GỐC đưa lên đầu làm ảnh bìa'),
};

const baseName = (name?: string | null) =>
  (String(name || 'anh')
    .split(/[\\/]/)
    .pop() || 'anh')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 50) || 'anh';

@Injectable()
export class HubImageTools implements HubToolGroup {
  private storage = UploadFactory.createStorage();

  constructor(
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _gemini: GeminiService
  ) {}

  // ------------------------------------------------------------------------
  //  Nguồn ảnh: chỉ nhận file trong kho media của Hub (đĩa local hoặc bucket)
  //  — không fetch link lạ (SSRF), không cho thoát khỏi UPLOAD_DIRECTORY.
  // ------------------------------------------------------------------------
  private locate(path: string): { file?: string; url?: string } {
    const clean = String(path || '').trim().split(/[?#]/)[0];
    const up = process.env.UPLOAD_DIRECTORY;
    if (up) {
      const root = resolve(up);
      const marker = '/uploads/';
      const idx = clean.indexOf(marker);
      let candidate: string | undefined;
      if (idx >= 0) {
        let rel: string;
        try {
          rel = decodeURIComponent(clean.slice(idx + marker.length));
        } catch {
          throw new HubToolError('Đường dẫn media không hợp lệ.');
        }
        candidate = resolve(root, rel);
      } else if (!/^https?:\/\//i.test(clean) && resolve(clean).startsWith(root + sep)) {
        candidate = resolve(clean);
      }
      if (candidate) {
        if (!candidate.startsWith(root + sep)) {
          throw new HubToolError('Đường dẫn media không hợp lệ.');
        }
        return { file: candidate };
      }
    }
    if (/^https?:\/\//i.test(clean)) {
      const bases = [process.env.CLOUDFLARE_BUCKET_URL, process.env.FRONTEND_URL]
        .filter((b): b is string => !!b)
        .map((b) => b.replace(/\/+$/, '') + '/');
      if (bases.some((b) => clean.startsWith(b))) return { url: clean };
    }
    throw new HubToolError(
      'Ảnh phải nằm trong thư viện Hub (lấy path từ hub_media_danh_sach / hub_bai_chi_tiet). Link ngoài: tải lên trước bằng uploadFromUrlTool.'
    );
  }

  private async readPath(path: string): Promise<Buffer> {
    const loc = this.locate(path);
    if (loc.file) {
      const buf = await readFile(loc.file).catch(() => null);
      if (!buf) throw new HubToolError('Không đọc được file media (đã bị xoá?).');
      if (buf.length > MAX_SOURCE_BYTES) throw new HubToolError('File quá lớn (> 40MB).');
      return buf;
    }
    let res: Response;
    try {
      res = await fetch(loc.url!, { signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new HubToolError('Không tải được file media.');
    }
    if (!res.ok) throw new HubToolError(`Không tải được file media (HTTP ${res.status}).`);
    if (Number(res.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) {
      throw new HubToolError('File quá lớn (> 40MB).');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) throw new HubToolError('File quá lớn (> 40MB).');
    return buf;
  }

  private async mediaRecord(org: HubOrg, id: string) {
    const media = await this._mediaService.getMediaById(id).catch(() => null);
    if (!media || media.organizationId !== org.id || media.deletedAt) {
      throw new HubToolError(`Không tìm thấy media "${id}" trong thư viện.`);
    }
    return media;
  }

  /** path hoặc id media → {id?, path, name?, alt?} (chưa đọc file). */
  private async resolveRef(org: HubOrg, ref: string) {
    const s = ref.trim();
    if (/^https?:\/\//i.test(s) || s.startsWith('/')) {
      this.locate(s);
      return { id: undefined as string | undefined, path: s, name: s, alt: undefined as string | undefined };
    }
    const m = await this.mediaRecord(org, s);
    return { id: m.id, path: m.path, name: m.originalName || m.name, alt: m.alt || undefined };
  }

  private async loadRef(org: HubOrg, ref: string) {
    const r = await this.resolveRef(org, ref);
    if (isVideo(r.path)) throw new HubToolError(`"${ref}" là video, không phải ảnh.`);
    return { ...r, buffer: await this.readPath(r.path) };
  }

  private async resolveOps(org: HubOrg, ops: OpInput[]): Promise<ImageOp[]> {
    const out: ImageOp[] = [];
    for (const o of ops) {
      if (o.op === 'logo') {
        const logo = await this.loadRef(org, o.logo);
        out.push({
          op: 'logo',
          anh: logo.buffer,
          vi_tri: o.vi_tri,
          ti_le: o.ti_le,
          do_mo: o.do_mo,
          le: o.le,
        });
      } else {
        out.push(o as ImageOp);
      }
    }
    return out;
  }

  /** Lưu ảnh mới vào thư viện media → {id, path}. Không đụng file gốc. */
  private async saveImage(org: HubOrg, res: EditResult, name: string) {
    const ext = res.format === 'jpeg' ? 'jpg' : res.format;
    const fileName = `${baseName(name)}.${ext}`;
    const uploaded = await this.storage.uploadFile({
      buffer: res.buffer,
      mimetype: `image/${res.format}`,
      size: res.bytes,
      originalname: fileName,
      fieldname: 'file',
      encoding: '7bit',
      destination: '',
      filename: '',
      path: '',
      stream: Readable.from([]),
    } as any);
    const saved = await this._mediaService.saveFile(
      org.id,
      uploaded.originalname,
      uploaded.path,
      fileName
    );
    return {
      id: saved.id,
      path: saved.path,
      rong: res.width,
      cao: res.height,
      dung_luong_kb: Math.round(res.bytes / 1024),
    };
  }

  // ------------------------------------------------------------------------
  //  Bài Hub — chép từ hub.posts.tools.ts (loadPost / validate) + luồng lưu
  //  của hub_bai_sua (mapTypeToPost + createPost 'MCP').
  // ------------------------------------------------------------------------
  private async loadPost(org: HubOrg, postId: string) {
    const cur = await this._postsService
      .getPost(org.id, postId)
      .catch(() => null);
    if (!cur?.posts?.length) {
      throw new HubToolError(
        'Không tìm thấy bài (id phải là id bài chính — lấy từ hub_lich_xem / hub_bai_danh_sach).'
      );
    }
    return cur;
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

  /** Bài sửa được không + mức quyền cần (đã lên lịch → "được đăng"). */
  private async editablePost(org: HubOrg, id: string) {
    const cur = await this.loadPost(org, id);
    const first: any = cur.posts[0];
    if (first.state === 'PUBLISHED') {
      throw new HubToolError('Bài đã đăng — không sửa qua MCP được.');
    }
    if (first.state === 'QUEUE') {
      requireLevel(org, 'dang', 'sửa ảnh bài đã lên lịch');
    }
    const type: 'schedule' | 'draft' = first.state === 'QUEUE' ? 'schedule' : 'draft';
    return { cur, first, type };
  }

  private lineImages(cur: any, dong: number): any[] {
    if (!Number.isInteger(dong) || dong < 0 || dong >= cur.posts.length) {
      throw new HubToolError(
        `Bài có ${cur.posts.length} dòng (0 = bài chính, 1.. = comment đầu) — không có dòng ${dong}.`
      );
    }
    return [...(cur.posts[dong].image || [])];
  }

  private async savePostImages(
    org: HubOrg,
    ctx: { cur: any; first: any; type: 'schedule' | 'draft' },
    changes: Map<number, any[]>
  ) {
    const { cur, first, type } = ctx;
    const value = cur.posts.map((p: any, i: number) => ({
      id: p.id,
      content: p.content,
      delay: p.delay || 0,
      image: changes.has(i) ? changes.get(i) : p.image || [],
    }));
    const post = {
      integration: { id: cur.integration },
      group: cur.group,
      settings: cur.settings,
      value,
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
  }

  private replaceEntry(old: any, media: { id: string; path: string }) {
    // bỏ url / thumbnail cũ (thuộc file cũ), giữ alt & các trường khác
    const { url: _u, thumbnail: _t, thumbnailTimestamp: _ts, ...rest } = old || {};
    return { ...rest, id: media.id, path: media.path };
  }

  // ------------------------------------------------------------------------
  //  Bot Zalo
  // ------------------------------------------------------------------------
  private async zaloPending(id: string) {
    const list = (await bot('/api/postiz/pending')) as any[];
    const d = (list || []).find((x) => x?.id === id);
    if (!d) throw new HubToolError('Không thấy bài trong hàng chờ bot (zalo_hang_cho).');
    return {
      count: Number(d.imageCount || 0),
      captions: (d.imageCaptions || []).map((c: any) => String(c || '')),
    };
  }

  private zaloImage(id: string, idx: number) {
    return botBinary(
      `/api/postiz/draft-image/${encodeURIComponent(id)}/${idx}`
    );
  }

  private async zaloSave(id: string, items: any[]) {
    const size = items.reduce((s, it) => s + (it.newImage?.length || 0), 0);
    if (size > 35 * 1024 * 1024) {
      throw new HubToolError('Ảnh chèn quá nặng cho một lần lưu — chèn ít ảnh hơn mỗi lần.');
    }
    const d = await bot(
      `/api/pending/${encodeURIComponent(id)}/save`,
      { method: 'POST', body: { items } },
      120_000
    );
    return {
      so_anh: Array.isArray(d?.savedImages) ? d.savedImages.length : items.length,
      chu_thich_anh: d?.imageCaptions,
    };
  }

  // ------------------------------------------------------------------------
  //  AI nhìn ảnh (Claude vision — cùng key với "bút phép thuật")
  // ------------------------------------------------------------------------
  private async aiReview(
    bufs: Buffer[]
  ): Promise<{ ket_qua?: any[]; loi?: string }> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        loi: 'Chưa có key Claude — vào Cài đặt dán key AI đọc ảnh (dùng chung với "bút phép thuật").',
      };
    }
    const take = bufs.slice(0, 12);
    const blocks: any[] = [];
    for (const b of take) {
      const jpeg = await toJpeg(b, 1024, 80);
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') },
      });
    }
    blocks.push({
      type: 'text',
      text:
        `Trên đây là ${take.length} ảnh (đúng thứ tự) dự định đăng mạng xã hội cho một trường học. ` +
        'Đánh giá TỪNG ảnh, trả về DUY NHẤT một mảng JSON đúng ' +
        `${take.length} phần tử, mỗi phần tử: {"nham_mat": boolean (có người nhắm mắt/chớp mắt rõ), ` +
        '"bo_cuc": "tot"|"tam"|"kem", "chu_kho_doc": boolean (có chữ trong ảnh bị nhỏ/mờ/khó đọc), ' +
        '"nhay_cam": boolean (lộ thông tin cá nhân, ảnh trẻ em không phù hợp, bạo lực, phản cảm), ' +
        '"diem": số 0-10, "nhan_xet": "1 câu tiếng Việt"}.',
    });
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
          max_tokens: 2500,
          system: 'Bạn là biên tập viên ảnh. LUÔN trả về DUY NHẤT JSON hợp lệ, không markdown.',
          messages: [{ role: 'user', content: blocks }],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) return { loi: `AI đọc ảnh lỗi HTTP ${res.status}` };
      const data: any = await res.json();
      const raw = (data?.content || []).map((c: any) => c?.text || '').join('');
      const s = raw.indexOf('[');
      const e = raw.lastIndexOf(']');
      if (s < 0 || e <= s) return { loi: 'AI không trả kết quả hợp lệ.' };
      const arr = JSON.parse(raw.slice(s, e + 1));
      return { ket_qua: Array.isArray(arr) ? arr : [] };
    } catch (err: any) {
      return { loi: `AI đọc ảnh lỗi: ${String(err?.message || err).slice(0, 150)}` };
    }
  }

  // ------------------------------------------------------------------------
  //  Nguồn ảnh cho hub_anh_sua / hub_anh_ai_sua: media hoặc ảnh trong bài
  // ------------------------------------------------------------------------
  private async sourceImage(
    org: HubOrg,
    input: { anh?: string; bai_id?: string; vi_tri?: number; dong?: number; thay_vao_bai?: boolean }
  ) {
    if (input.bai_id) {
      if (!input.vi_tri) throw new HubToolError('Truyền vi_tri (số ảnh trong bài, từ 1).');
      const dong = input.dong ?? 0;
      const ctx = input.thay_vao_bai
        ? await this.editablePost(org, input.bai_id)
        : { cur: await this.loadPost(org, input.bai_id), first: null, type: 'draft' as const };
      const images = this.lineImages(ctx.cur, dong);
      const entry = images[input.vi_tri - 1];
      if (!entry) {
        throw new HubToolError(`Dòng ${dong} chỉ có ${images.length} ảnh — không có ảnh số ${input.vi_tri}.`);
      }
      if (isVideo(entry.path)) throw new HubToolError('Mục này là video, không phải ảnh.');
      return {
        buffer: await this.readPath(entry.path),
        name: entry.name || entry.path,
        post: ctx.first ? { ctx: ctx as any, dong, images, idx: input.vi_tri - 1 } : undefined,
      };
    }
    if (input.thay_vao_bai) {
      throw new HubToolError('thay_vao_bai cần bai_id + vi_tri.');
    }
    if (!input.anh) throw new HubToolError('Truyền anh (path/id media) hoặc bai_id + vi_tri.');
    const r = await this.loadRef(org, input.anh);
    return { buffer: r.buffer, name: r.name || r.path, post: undefined };
  }

  private async putBackIntoPost(
    org: HubOrg,
    post: { ctx: any; dong: number; images: any[]; idx: number },
    media: { id: string; path: string }
  ) {
    const next = [...post.images];
    next[post.idx] = this.replaceEntry(next[post.idx], media);
    await this.savePostImages(org, post.ctx, new Map([[post.dong, next]]));
    return next.map(anhView);
  }

  tools(): HubToolMap {
    return {
      hub_bai_anh: hubTool({
        id: 'hub_bai_anh',
        title: 'Sắp xếp / bỏ / chèn ảnh trong bài',
        level: 'nhap',
        description: `Thao tác trên danh sách ảnh của một bài Hub theo SỐ THỨ TỰ, không cần gửi lại cả danh sách. Mọi số (thu_tu, bo, anh_bia, alt) tính theo danh sách GỐC, đánh số từ 1 (xem hub_bai_chi_tiet). Thứ tự áp: alt → thu_tu → anh_bia → bo → chen.
Mặc định sửa bài chính; dong = 1, 2… để sửa ảnh của comment đầu. Bài NHÁP/LỖI: khoá "tạo nháp"; bài ĐÃ LÊN LỊCH: khoá "được đăng"; bài đã đăng: không sửa được.`,
        input: z.object({
          id: z.string().describe('id bài chính'),
          dong: z.number().int().min(0).default(0).describe('0 = bài chính, 1.. = comment đầu'),
          ...listPlanFields,
          chen: z
            .array(
              z.object({
                vi_tri: z
                  .number()
                  .int()
                  .min(1)
                  .optional()
                  .describe('Vị trí trong danh sách MỚI (1 = đầu). Bỏ trống = cuối'),
                anh: anhRef,
              })
            )
            .max(20)
            .optional(),
          alt: z
            .array(z.object({ vi_tri: z.number().int().min(1), alt: z.string().max(1000) }))
            .optional()
            .describe('Mô tả ảnh (alt) theo số ảnh GỐC'),
        }),
        run: async (input, org) => {
          if (
            !input.thu_tu?.length &&
            !input.bo?.length &&
            input.anh_bia == null &&
            !input.chen?.length &&
            !input.alt?.length
          ) {
            throw new HubToolError('Truyền ít nhất một trong: thu_tu, bo, anh_bia, chen, alt.');
          }
          const ctx = await this.editablePost(org, input.id);
          const images = this.lineImages(ctx.cur, input.dong).map((m) => ({ ...m }));
          for (const a of input.alt || []) {
            if (!images[a.vi_tri - 1]) {
              throw new HubToolError(`alt: không có ảnh số ${a.vi_tri} (đang có ${images.length}).`);
            }
            images[a.vi_tri - 1].alt = a.alt;
          }
          const next = planOrder(images.length, input).map((i) => images[i]);
          for (const c of input.chen || []) {
            const r = await this.resolveRef(org, c.anh);
            const pos = c.vi_tri ? Math.min(c.vi_tri - 1, next.length) : next.length;
            next.splice(pos, 0, {
              id: r.id || makeId(10),
              path: r.path,
              ...(r.alt ? { alt: r.alt } : {}),
            });
          }
          await this.savePostImages(org, ctx, new Map([[input.dong, next]]));
          return { ok: true, id: ctx.first.id, dong: input.dong, anh: next.map(anhView) };
        },
      }),

      hub_media_thong_tin: hubTool({
        id: 'hub_media_thong_tin',
        title: 'Đặt alt / thumbnail cho media',
        level: 'nhap',
        description:
          'Đặt mô tả ảnh (alt — giúp tiếp cận & SEO) và/hoặc ảnh thumbnail (cho video) của một media trong thư viện. Đổi tên file chưa hỗ trợ (kho media không có thao tác đổi tên).',
        input: z.object({
          media_id: z.string(),
          alt: z.string().max(1000).optional(),
          thumbnail: anhRef.optional().describe('Ảnh làm thumbnail (path/id media)'),
          thumbnail_giay: z.number().min(0).optional().describe('Thumbnail lấy ở giây thứ mấy của video (ghi chú)'),
        }),
        run: async (input, org) => {
          if (input.alt == null && !input.thumbnail && input.thumbnail_giay == null) {
            throw new HubToolError('Truyền alt và/hoặc thumbnail.');
          }
          const media = await this.mediaRecord(org, input.media_id);
          const thumb = input.thumbnail
            ? (await this.resolveRef(org, input.thumbnail)).path
            : undefined;
          const saved = await this._mediaService.saveMediaInformation(org.id, {
            id: media.id,
            alt: input.alt ?? media.alt ?? '',
            thumbnail: thumb ?? (media.thumbnail || undefined),
            thumbnailTimestamp:
              input.thumbnail_giay != null
                ? Math.round(input.thumbnail_giay * 1000)
                : media.thumbnailTimestamp ?? undefined,
          } as any);
          return {
            ok: true,
            id: saved.id,
            alt: saved.alt,
            thumbnail: saved.thumbnail || undefined,
            ghi_chu: 'Alt trong thư viện áp cho lần chèn sau; ảnh đã nằm trong bài thì đặt alt bằng hub_bai_anh (alt).',
          };
        },
      }),

      hub_anh_sua: hubTool({
        id: 'hub_anh_sua',
        title: 'Sửa ảnh (cắt, chỉnh màu, chữ, logo…)',
        level: 'nhap',
        description: `Sửa một ảnh rồi lưu thành media MỚI trong thư viện (ảnh gốc giữ nguyên). Nguồn: anh (path/id media) HOẶC bai_id + vi_tri (+ dong). thay_vao_bai: true → thay ảnh đó trong bài (bài đã lên lịch cần khoá "được đăng"). Phóng to không AI: op phong_to.`,
        input: z.object({
          anh: anhRef.optional(),
          bai_id: z.string().optional(),
          vi_tri: z.number().int().min(1).optional().describe('Số ảnh trong bài (từ 1)'),
          dong: z.number().int().min(0).optional().describe('0 = bài chính (mặc định)'),
          thao_tac: opsField,
          thay_vao_bai: z.boolean().optional(),
        }),
        run: async (input, org) => {
          const src = await this.sourceImage(org, input);
          const ops = await this.resolveOps(org, input.thao_tac);
          const res = await editImage(src.buffer, ops);
          const media = await this.saveImage(org, res, `${baseName(src.name)}-sua`);
          const out: any = { ok: true, media };
          if (!res.dat_dung_luong) {
            out.canh_bao = 'Đã nén hết mức nhưng vẫn lớn hơn toi_da_kb.';
          }
          if (input.thay_vao_bai && src.post) {
            out.anh_trong_bai = await this.putBackIntoPost(org, src.post, media);
          }
          return out;
        },
      }),

      hub_anh_ghep: hubTool({
        id: 'hub_anh_ghep',
        title: 'Ghép nhiều ảnh (collage)',
        level: 'nhap',
        description:
          'Ghép 2-9 ảnh thành một ảnh mới trong thư viện. Bố cục: grid (lưới, 2-9 ảnh), 1+2 (1 to trên + 2 dưới, đúng 3 ảnh), 1+3 (đúng 4 ảnh), ngang (2-6 ảnh cạnh nhau), doc (2-6 ảnh chồng dọc). Ảnh được cắt thông minh cho vừa ô.',
        input: z.object({
          anh: z.array(anhRef).min(2).max(9),
          bo_cuc: z.enum(['grid', '1+2', '1+3', 'ngang', 'doc']).default('grid'),
          khoang_cach: z.number().int().min(0).max(200).optional().describe('px giữa các ô, mặc định 1% chiều rộng'),
          mau_nen: colorField.optional(),
          rong: z.number().int().min(400).max(4096).default(2048).describe('Chiều rộng ảnh ghép (px)'),
        }),
        run: async (input, org) => {
          const layout = input.bo_cuc as CollageLayout;
          const [min, max] = COLLAGE_COUNT[layout];
          if (input.anh.length < min || input.anh.length > max) {
            throw new HubToolError(
              `Bố cục "${layout}" cần ${min === max ? min : `${min}-${max}`} ảnh.`
            );
          }
          const bufs: Buffer[] = [];
          for (const a of input.anh) bufs.push((await this.loadRef(org, a)).buffer);
          const res = await collage(bufs, {
            layout,
            gap: input.khoang_cach,
            bg: input.mau_nen,
            size: input.rong,
          });
          return { ok: true, media: await this.saveImage(org, res, `ghep-${layout}`) };
        },
      }),

      hub_anh_ai_sua: hubTool({
        id: 'hub_anh_ai_sua',
        title: 'AI sửa ảnh theo câu lệnh',
        level: 'nhap',
        openWorld: true,
        description: `Gemini (model ảnh cài trong Cài đặt → Gemini) sửa ảnh: xoa_phong (tách chủ thể ra nền trắng), thay_phong (nền mới theo cau_lenh), mo_rong_khung (vẽ thêm cho đủ tỉ lệ ti_le), doi_phong_cach (theo cau_lenh), tuy_chinh (làm đúng cau_lenh). Lưu thành media MỚI; thay_vao_bai như hub_anh_sua. AI có thể đổi chi tiết nhỏ — xem lại trước khi đăng. Tốn lượt gọi Gemini.`,
        input: z.object({
          anh: anhRef.optional(),
          bai_id: z.string().optional(),
          vi_tri: z.number().int().min(1).optional(),
          dong: z.number().int().min(0).optional(),
          kieu: z.enum(['xoa_phong', 'thay_phong', 'mo_rong_khung', 'doi_phong_cach', 'tuy_chinh']),
          cau_lenh: z.string().max(2000).optional(),
          ti_le: ratioField.optional().describe('Cho mo_rong_khung, vd "9:16"'),
          thay_vao_bai: z.boolean().optional(),
        }),
        run: async (input, org) => {
          if (!hasGeminiKey()) {
            throw new HubToolError('Chưa cấu hình Gemini API key (Cài đặt → Gemini).');
          }
          const need = ['thay_phong', 'doi_phong_cach', 'tuy_chinh'];
          if (need.includes(input.kieu) && !input.cau_lenh?.trim()) {
            throw new HubToolError(`"${input.kieu}" cần cau_lenh mô tả muốn sửa thế nào.`);
          }
          if (input.kieu === 'mo_rong_khung' && !input.ti_le) {
            throw new HubToolError('mo_rong_khung cần ti_le (vd "9:16").');
          }
          const src = await this.sourceImage(org, input);
          let ref = src.buffer;
          const extra = input.cau_lenh?.trim() ? ` Additional instruction: ${input.cau_lenh.trim()}` : '';
          let prompt: string;
          switch (input.kieu) {
            case 'xoa_phong':
              prompt =
                'Edit this photo: remove the background completely and place the main subject on a clean pure white background. Keep the subject exactly as it is (same face, pose, colours, details).' +
                extra;
              break;
            case 'thay_phong':
              prompt = `Edit this photo: replace the background with: ${input.cau_lenh}. Keep the main subject exactly as it is (same face, pose, clothing, lighting direction matched naturally).`;
              break;
            case 'mo_rong_khung': {
              // Đệm trước về đúng tỉ lệ (nền mờ) để model giữ khung, rồi vẽ thêm.
              const padded = await editImage(ref, [
                { op: 'dem_ti_le', ti_le: input.ti_le as Ratio, nen: 'mo' },
              ]);
              ref = padded.buffer;
              prompt =
                'Outpaint this image: the blurred margins are placeholders. Replace them by naturally extending the original scene so the whole frame is one coherent photo. Keep the original central content unchanged and keep this exact aspect ratio.' +
                extra;
              break;
            }
            case 'doi_phong_cach':
              prompt = `Restyle this image in the following style: ${input.cau_lenh}. Keep the composition, the people and their identity recognisable.`;
              break;
            default:
              prompt = `Edit this image: ${input.cau_lenh}. Change only what is asked, keep everything else identical.`;
          }
          const png = await toPng(ref, 1536);
          const b64 = await this._gemini.generateImage(prompt, png.toString('base64'));
          if (!b64) throw new HubToolError('Gemini không trả ảnh — thử lại hoặc đổi câu lệnh.');
          const jpeg = await toJpeg(Buffer.from(b64, 'base64'), 4096, 92);
          const info = await imageInfo(jpeg);
          const media = await this.saveImage(
            org,
            {
              buffer: jpeg,
              format: 'jpeg',
              width: info.width,
              height: info.height,
              bytes: jpeg.length,
              dat_dung_luong: true,
            },
            `${baseName(src.name)}-ai`
          );
          const out: any = { ok: true, kieu: input.kieu, media };
          if (input.thay_vao_bai && src.post) {
            out.anh_trong_bai = await this.putBackIntoPost(org, src.post, media);
          }
          return out;
        },
      }),

      hub_anh_cham_diem: hubTool({
        id: 'hub_anh_cham_diem',
        title: 'Chấm điểm ảnh & tìm ảnh trùng',
        level: 'doc',
        writes: true,
        description: `Chấm điểm kỹ thuật 0-100 từng ảnh (mờ, tối, cháy sáng, độ phân giải, tương phản) + nhóm ảnh gần trùng. Nguồn (chọn MỘT): anh (danh sách path/id media), bai_id (+dong) bài Hub, hoặc zalo_id bài chờ bot Zalo.
- ai: true → thêm nhận xét AI (nhắm mắt, bố cục, chữ khó đọc, nhạy cảm) — cần khoá "tạo nháp".
- bo_duoi: N → BỎ ảnh dưới N điểm + ảnh trùng (giữ ảnh tốt nhất mỗi nhóm), luôn chừa ít nhất 1 ảnh.
- xep_lai: true → xếp ảnh tốt nhất lên đầu.
Có bo_duoi/xep_lai thì sửa thật bài (khoá "tạo nháp"; bài Hub đã lên lịch cần "được đăng"). Không có thì chỉ đọc.`,
        input: z.object({
          anh: z.array(anhRef).min(1).max(30).optional(),
          bai_id: z.string().optional(),
          dong: z.number().int().min(0).default(0),
          zalo_id: z.string().optional(),
          ai: z.boolean().default(false),
          bo_duoi: z.number().min(0).max(100).optional(),
          xep_lai: z.boolean().default(false),
          canh_ngan_toi_thieu: z.number().int().min(200).max(4000).default(1080),
        }),
        run: async (input, org) => {
          const sources = [input.anh?.length ? 1 : 0, input.bai_id ? 1 : 0, input.zalo_id ? 1 : 0];
          if (sources.reduce((a, b) => a + b, 0) !== 1) {
            throw new HubToolError('Chọn đúng MỘT nguồn: anh, bai_id hoặc zalo_id.');
          }
          const change = input.bo_duoi != null || input.xep_lai;
          if (change || input.ai) {
            requireLevel(org, 'nhap', change ? 'bỏ / xếp lại ảnh' : 'AI chấm ảnh');
          }
          if (change && input.anh?.length) {
            throw new HubToolError('bo_duoi / xep_lai chỉ áp cho bai_id hoặc zalo_id.');
          }

          type Item = { label: any; buffer?: Buffer; video?: boolean; loi?: string };
          const items: Item[] = [];
          let postCtx: { cur: any; first: any; type: 'schedule' | 'draft' } | undefined;
          let postImages: any[] = [];
          let zalo: { count: number; captions: string[] } | undefined;

          if (input.anh?.length) {
            for (const a of input.anh) {
              try {
                const r = await this.loadRef(org, a);
                items.push({ label: { anh: a, path: r.path }, buffer: r.buffer });
              } catch (e: any) {
                items.push({ label: { anh: a }, loi: e?.message });
              }
            }
          } else if (input.bai_id) {
            postCtx = change
              ? await this.editablePost(org, input.bai_id)
              : { cur: await this.loadPost(org, input.bai_id), first: null, type: 'draft' };
            postImages = this.lineImages(postCtx.cur, input.dong);
            for (const [i, m] of postImages.entries()) {
              const label = { vi_tri: i + 1, path: m.path };
              if (isVideo(m.path)) {
                items.push({ label, video: true });
                continue;
              }
              try {
                items.push({ label, buffer: await this.readPath(m.path) });
              } catch (e: any) {
                items.push({ label, loi: e?.message });
              }
            }
          } else {
            zalo = await this.zaloPending(input.zalo_id!);
            for (let i = 0; i < zalo.count; i++) {
              const label = { vi_tri: i + 1, chu_thich: zalo.captions[i] || undefined };
              try {
                items.push({ label, buffer: await this.zaloImage(input.zalo_id!, i) });
              } catch (e: any) {
                items.push({ label, loi: e?.message });
              }
            }
          }
          if (!items.some((x) => x.buffer)) {
            throw new HubToolError('Không có ảnh nào đọc được để chấm.');
          }

          const rows: any[] = [];
          const hashes: string[] = [];
          for (const it of items) {
            if (!it.buffer) {
              rows.push({ ...it.label, diem: null, ghi_chu: it.video ? 'video — bỏ qua' : it.loi });
              hashes.push('');
              continue;
            }
            try {
              const m = await measureQuality(it.buffer);
              const s = scoreQuality(m, input.canh_ngan_toi_thieu);
              hashes.push(m.dhash);
              rows.push({
                ...it.label,
                diem: s.score,
                ly_do: s.reasons,
                so_lieu: {
                  rong: m.width,
                  cao: m.height,
                  ti_le: m.ratio,
                  dung_luong_kb: Math.round(m.bytes / 1024),
                  do_net: m.sharpness,
                  do_sang: m.brightness,
                  pct_toi: m.pctDark,
                  pct_chay_sang: m.pctBlown,
                  tuong_phan: m.contrast,
                  dhash: m.dhash,
                },
              });
            } catch (e: any) {
              hashes.push('');
              rows.push({ ...it.label, diem: null, ghi_chu: e?.message || 'không đọc được ảnh' });
            }
          }

          let ai_loi: string | undefined;
          if (input.ai) {
            const idx = rows.map((r, i) => (r.diem != null ? i : -1)).filter((i) => i >= 0);
            const review = await this.aiReview(idx.map((i) => items[i].buffer!));
            if (review.loi) ai_loi = review.loi;
            if (idx.length > 12) ai_loi = `AI chỉ xem 12 ảnh đầu (có ${idx.length}).`;
            (review.ket_qua || []).forEach((r: any, k: number) => {
              const row = rows[idx[k]];
              if (!row || !r) return;
              row.ai = r;
              let pen = 0;
              if (r.nham_mat) { pen += 15; row.ly_do.push('AI: có người nhắm mắt'); }
              if (r.bo_cuc === 'kem') { pen += 10; row.ly_do.push('AI: bố cục kém'); }
              if (r.chu_kho_doc) { pen += 5; row.ly_do.push('AI: chữ trong ảnh khó đọc'); }
              if (r.nhay_cam) { pen += 40; row.ly_do.push('AI: có thể nhạy cảm — kiểm tra kỹ'); }
              row.diem = Math.max(0, row.diem - pen);
            });
          }

          const groups = findDuplicateGroups(hashes);
          const result: any = {
            nguon: input.bai_id
              ? { bai_id: input.bai_id, dong: input.dong }
              : input.zalo_id
              ? { zalo_id: input.zalo_id }
              : 'thu_vien',
            anh: rows,
            nhom_trung: groups.map((g) => g.map((i) => i + 1)),
            ...(ai_loi ? { ai_loi } : {}),
          };
          if (!change) return result;

          // ----- bỏ / xếp lại -----
          const n = items.length;
          const scoreOf = (i: number) => (rows[i].diem == null ? -1 : rows[i].diem);
          const drop = new Set<number>();
          if (input.bo_duoi != null) {
            for (let i = 0; i < n; i++) {
              if (rows[i].diem != null && rows[i].diem < input.bo_duoi) drop.add(i);
            }
            for (const g of groups) {
              const best = [...g].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
              g.forEach((i) => i !== best && drop.add(i));
            }
          }
          let keep = Array.from({ length: n }, (_, i) => i).filter((i) => !drop.has(i));
          const keptImages = keep.filter((i) => rows[i].diem != null);
          if (!keptImages.length) {
            const scored = Array.from({ length: n }, (_, i) => i).filter((i) => rows[i].diem != null);
            const best = scored.sort((a, b) => scoreOf(b) - scoreOf(a))[0];
            drop.delete(best);
            keep = Array.from({ length: n }, (_, i) => i).filter((i) => !drop.has(i));
          }
          if (input.xep_lai) {
            // ảnh chấm được xếp điểm cao → thấp; mục không chấm (video/lỗi) giữ ở cuối
            const scored = keep.filter((i) => rows[i].diem != null).sort((a, b) => scoreOf(b) - scoreOf(a));
            keep = [...scored, ...keep.filter((i) => rows[i].diem == null)];
          }
          const changed = drop.size > 0 || keep.some((v, k) => v !== k);
          result.da_sua = {
            bo: [...drop].sort((a, b) => a - b).map((i) => i + 1),
            thu_tu_moi: keep.map((i) => i + 1),
          };
          if (!changed) {
            result.da_sua.ghi_chu = 'Không có gì cần đổi.';
            return result;
          }
          if (postCtx) {
            const next = keep.map((i) => postImages[i]);
            await this.savePostImages(org, postCtx, new Map([[input.dong, next]]));
            result.da_sua.anh_trong_bai = next.map(anhView);
          } else if (zalo) {
            const saved = await this.zaloSave(
              input.zalo_id!,
              keep.map((i) => ({ origIndex: i, caption: zalo!.captions[i] || '' }))
            );
            result.da_sua.zalo = saved;
          }
          return result;
        },
      }),

      hub_anh_kiem_tra_kenh: hubTool({
        id: 'hub_anh_kiem_tra_kenh',
        title: 'Kiểm ảnh theo luật kênh',
        level: 'doc',
        writes: true,
        description: `Kiểm ảnh của một bài Hub theo giới hạn kênh của bài (số ảnh tối đa, tỉ lệ khung, cạnh tối thiểu, dung lượng) + lỗi media do chính provider báo. Luật trong bảng là BẢO THỦ (chặt hơn nền tảng một chút).
tu_sua: true → đệm nền mờ (hoặc cat_bo: true để cắt) cho đúng tỉ lệ, phóng to ảnh quá nhỏ, nén ảnh quá nặng thành media MỚI rồi thay vào bài (khoá "tạo nháp"; bài đã lên lịch cần "được đăng"). Thừa ảnh thì chỉ báo — tự chọn bỏ bằng hub_bai_anh / hub_anh_cham_diem.`,
        input: z.object({
          id: z.string().describe('id bài chính'),
          tu_sua: z.boolean().default(false),
          cat_bo: z.boolean().default(false).describe('Sửa tỉ lệ bằng cách cắt thay vì đệm nền mờ'),
        }),
        run: async (input, org) => {
          if (input.tu_sua) requireLevel(org, 'nhap', 'tự sửa ảnh');
          const ctx = input.tu_sua
            ? await this.editablePost(org, input.id)
            : { cur: await this.loadPost(org, input.id), first: null as any, type: 'draft' as const };
          const cur: any = ctx.cur;
          const first: any = cur.posts[0];
          const provider = first?.integration?.providerIdentifier;
          const rule = ruleFor(provider);

          let kenh_bao_loi: string | undefined;
          try {
            const [v] = await this._postsService.validatePosts(org.id, [
              {
                integration: { id: cur.integration },
                settings: cur.settings,
                value: cur.posts.map((p: any) => ({ content: p.content, image: p.image || [] })),
              },
            ]);
            if (v && v.errors !== true && v.errors) kenh_bao_loi = String(v.errors);
          } catch (e: any) {
            kenh_bao_loi = e?.message;
          }

          const changes = new Map<number, any[]>();
          const dong_ket_qua: any[] = [];
          for (const [dong, p] of (cur.posts as any[]).entries()) {
            const images: any[] = [...(p.image || [])];
            if (!images.length) continue;
            const anh: any[] = [];
            let lineChanged = false;
            const next = [...images];
            for (const [i, m] of images.entries()) {
              if (isVideo(m.path)) {
                anh.push({ vi_tri: i + 1, video: true, ghi_chu: 'video — không kiểm' });
                continue;
              }
              let buf: Buffer;
              let info: Awaited<ReturnType<typeof imageInfo>>;
              try {
                buf = await this.readPath(m.path);
                info = await imageInfo(buf);
              } catch (e: any) {
                anh.push({ vi_tri: i + 1, loi: e?.message || 'không đọc được' });
                continue;
              }
              const loi: string[] = [];
              const ops: ImageOp[] = [];
              const short = Math.min(info.width, info.height);
              let target: number | undefined;
              if (rule.ti_le_min && info.ratio < rule.ti_le_min - 0.01) target = rule.ti_le_min;
              if (rule.ti_le_max && info.ratio > rule.ti_le_max + 0.01) target = rule.ti_le_max;
              if (target) {
                loi.push(
                  `tỉ lệ ${info.ratio.toFixed(2)} ngoài khoảng ${rule.ti_le_min}–${rule.ti_le_max}`
                );
                ops.push(
                  input.cat_bo
                    ? { op: 'cat_ti_le', ti_le: target }
                    : { op: 'dem_ti_le', ti_le: target, nen: 'mo' }
                );
              }
              if (short < rule.canh_ngan_min) {
                loi.push(`nhỏ hơn ${rule.canh_ngan_min}px (cạnh ngắn ${short}px)`);
                const k = Math.ceil(rule.canh_ngan_min / Math.max(1, short));
                if (k <= 4) ops.unshift({ op: 'phong_to', he_so: (k <= 2 ? 2 : k === 3 ? 3 : 4) as 2 | 3 | 4 });
              }
              const kb = Math.round(info.bytes / 1024);
              if (kb > rule.toi_da_kb) loi.push(`nặng ${kb}KB > ${rule.toi_da_kb}KB`);
              const row: any = {
                vi_tri: i + 1,
                rong: info.width,
                cao: info.height,
                ti_le: Math.round(info.ratio * 100) / 100,
                dung_luong_kb: kb,
                dat: !loi.length,
                ...(loi.length ? { loi } : {}),
              };
              if (input.tu_sua && loi.length) {
                ops.push({ op: 'nen', toi_da_kb: Math.floor(rule.toi_da_kb * 0.9) });
                try {
                  const res = await editImage(buf, ops);
                  const media = await this.saveImage(org, res, `${baseName(m.name || m.path)}-${String(provider || 'kenh')}`);
                  next[i] = this.replaceEntry(m, media);
                  lineChanged = true;
                  row.da_sua = media;
                } catch (e: any) {
                  row.sua_loi = e?.message;
                }
              }
              anh.push(row);
            }
            if (lineChanged) changes.set(dong, next);
            dong_ket_qua.push({
              dong,
              so_anh: images.length,
              ...(images.length > rule.toi_da_anh
                ? { thua_anh: `${rule.ten} tối đa ${rule.toi_da_anh} ảnh — đang có ${images.length}` }
                : {}),
              anh,
            });
          }

          if (changes.size) {
            await this.savePostImages(org, ctx as any, changes);
          }
          return {
            kenh: provider,
            luat: { ...rule, nguon: rule === DEFAULT_RULE ? 'mặc định (kênh chưa có trong bảng)' : 'bảng bảo thủ của Hub' },
            ...(kenh_bao_loi ? { kenh_bao_loi } : {}),
            dong: dong_ket_qua,
            ...(input.tu_sua ? { da_cap_nhat_bai: changes.size > 0 } : {}),
          };
        },
      }),

      hub_video_thumbnail: hubTool({
        id: 'hub_video_thumbnail',
        title: 'Thumbnail cho video',
        level: 'nhap',
        description:
          'Cắt khung hình ở giây `giay` của một video trong thư viện thành ảnh MỚI (cần ffmpeg trên máy chủ) và (mặc định) gắn làm thumbnail của video. Máy chủ không có ffmpeg → dùng AI vẽ thumbnail 16:9 theo mo_ta (Gemini nếu có key, không thì OpenAI).',
        input: z.object({
          video: anhRef.describe('path hoặc id media của video'),
          giay: z.number().min(0).max(36000).default(1),
          gan_lam_thumbnail: z.boolean().default(true).describe('Gắn ảnh vào media video (cần video là id media)'),
          mo_ta: z.string().max(2000).optional().describe('Chỉ dùng khi không có ffmpeg: mô tả thumbnail để AI vẽ'),
        }),
        run: async (input, org) => {
          const ref = await this.resolveRef(org, input.video);
          let media: { id: string; path: string };
          let cach: string;
          if (await hasFfmpeg()) {
            const loc = this.locate(ref.path);
            const frame = await extractVideoFrame((loc.file || loc.url)!, input.giay);
            const jpeg = await toJpeg(frame, 1920, 90);
            const info = await imageInfo(jpeg);
            media = await this.saveImage(
              org,
              { buffer: jpeg, format: 'jpeg', width: info.width, height: info.height, bytes: jpeg.length, dat_dung_luong: true },
              `${baseName(ref.name)}-thumb`
            );
            cach = `ffmpeg — khung hình giây ${input.giay}`;
          } else {
            if (!input.mo_ta?.trim()) {
              throw new HubToolError(
                'Máy chủ không có ffmpeg nên không cắt được khung hình — truyền mo_ta để AI vẽ thumbnail.'
              );
            }
            media = await this._mediaService.generateYoutubeThumbnail(org, {
              engine: hasGeminiKey() ? 'gemini' : 'openai',
              prompt: input.mo_ta,
            });
            cach = 'AI vẽ (máy chủ không có ffmpeg)';
          }
          let da_gan = false;
          if (input.gan_lam_thumbnail && ref.id) {
            const rec = await this.mediaRecord(org, ref.id);
            await this._mediaService.saveMediaInformation(org.id, {
              id: rec.id,
              alt: rec.alt || '',
              thumbnail: media.path,
              thumbnailTimestamp: cach.startsWith('ffmpeg') ? Math.round(input.giay * 1000) : undefined,
            } as any);
            da_gan = true;
          }
          return {
            ok: true,
            cach,
            media,
            da_gan_thumbnail: da_gan,
            ...(input.gan_lam_thumbnail && !ref.id
              ? { ghi_chu: 'Truyền video bằng id media để tự gắn thumbnail.' }
              : {}),
          };
        },
      }),

      zalo_bai_anh: hubTool({
        id: 'zalo_bai_anh',
        title: 'Sắp xếp / bỏ / chèn ảnh bài chờ Zalo',
        level: 'nhap',
        description: `Sửa danh sách ảnh của một bài trong hàng chờ bot Zalo (zalo_hang_cho) theo số thứ tự (từ 1, theo danh sách GỐC): thu_tu, bo, anh_bia, chu_thich từng ảnh, chen ảnh từ thư viện Hub. Bài phải còn ít nhất 1 ảnh hoặc video. Ảnh bị bỏ bị xoá khỏi đĩa bot.`,
        input: z.object({
          id: z.string().describe('id bài trong hàng chờ bot'),
          ...listPlanFields,
          chen: z
            .array(
              z.object({
                vi_tri: z.number().int().min(1).optional().describe('Vị trí trong danh sách MỚI; bỏ trống = cuối'),
                anh: anhRef,
                chu_thich: z.string().max(1000).optional(),
              })
            )
            .max(10)
            .optional(),
          chu_thich: z
            .array(z.object({ vi_tri: z.number().int().min(1), chu_thich: z.string().max(1000) }))
            .optional()
            .describe('Chú thích theo số ảnh GỐC'),
        }),
        run: async (input, org) => {
          if (
            !input.thu_tu?.length &&
            !input.bo?.length &&
            input.anh_bia == null &&
            !input.chen?.length &&
            !input.chu_thich?.length
          ) {
            throw new HubToolError('Truyền ít nhất một trong: thu_tu, bo, anh_bia, chen, chu_thich.');
          }
          const p = await this.zaloPending(input.id);
          const entries: any[] = Array.from({ length: p.count }, (_, i) => ({
            origIndex: i,
            caption: p.captions[i] || '',
          }));
          for (const c of input.chu_thich || []) {
            if (!entries[c.vi_tri - 1]) {
              throw new HubToolError(`chu_thich: không có ảnh số ${c.vi_tri} (đang có ${p.count}).`);
            }
            entries[c.vi_tri - 1].caption = c.chu_thich;
          }
          const next = planOrder(p.count, input).map((i) => entries[i]);
          for (const c of input.chen || []) {
            const r = await this.loadRef(org, c.anh);
            const jpeg = await toJpeg(r.buffer, 2560, 88);
            const pos = c.vi_tri ? Math.min(c.vi_tri - 1, next.length) : next.length;
            next.splice(pos, 0, {
              newImage: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
              caption: c.chu_thich || '',
            });
          }
          const saved = await this.zaloSave(input.id, next);
          return { ok: true, id: input.id, ...saved };
        },
      }),

      zalo_bai_anh_sua: hubTool({
        id: 'zalo_bai_anh_sua',
        title: 'Sửa một ảnh của bài chờ Zalo',
        level: 'nhap',
        description:
          'Tải ảnh số vi_tri (từ 1) của bài chờ bot Zalo, áp thao tác như hub_anh_sua, rồi đặt lại ĐÚNG vị trí cũ (giữ chú thích). Ảnh cũ bị thay trên đĩa bot.',
        input: z.object({
          id: z.string().describe('id bài trong hàng chờ bot'),
          vi_tri: z.number().int().min(1),
          thao_tac: opsField,
        }),
        run: async (input, org) => {
          const p = await this.zaloPending(input.id);
          if (input.vi_tri > p.count) {
            throw new HubToolError(`Bài chỉ có ${p.count} ảnh.`);
          }
          const idx = input.vi_tri - 1;
          const buf = await this.zaloImage(input.id, idx);
          const ops = await this.resolveOps(org, input.thao_tac);
          const res = await editImage(buf, ops);
          const items = Array.from({ length: p.count }, (_, i) =>
            i === idx
              ? {
                  newImage: `data:image/${res.format};base64,${res.buffer.toString('base64')}`,
                  caption: p.captions[i] || '',
                }
              : { origIndex: i, caption: p.captions[i] || '' }
          );
          const saved = await this.zaloSave(input.id, items);
          return {
            ok: true,
            id: input.id,
            vi_tri: input.vi_tri,
            anh_moi: { rong: res.width, cao: res.height, dung_luong_kb: Math.round(res.bytes / 1024) },
            ...saved,
          };
        },
      }),
    };
  }
}

