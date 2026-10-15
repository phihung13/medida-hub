import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ViralService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.service';
import { ViralGroupService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral-group.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import {
  getViralStatus,
  setViralConfig,
} from '@gitroom/nestjs-libraries/viral/viral.keys';
import {
  listSkills,
  resetSkill,
  setSkill,
} from '@gitroom/nestjs-libraries/viral/viral.skills';
import {
  getPodcastStatus,
  setPodcastConfig,
} from '@gitroom/nestjs-libraries/viral/podcast.keys';
import {
  HubOrg,
  HubToolError,
  HubToolGroup,
  HubToolMap,
  htmlToText,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Viral (mở rộng)": phần còn lại của trang /viral mà hub.viral.tools
//  chưa phủ — bản tin tuần, cấu hình cào/bản tin, chấm điểm lại, dọn nguồn,
//  mồi câu (lead magnet), công thức bài, gợi ý kênh / docx / RSS podcast cho
//  sản phẩm, kho công thức AI (skill), cấu hình show podcast, dọn lưu trữ,
//  xoá bài / kỳ cào group Facebook.
//
//  Thao tác app chỉ cho QUẢN TRỊ VIÊN tổ chức (assertCanModerate) → khoá
//  "được đăng"; thao tác app chỉ cho QUẢN TRỊ HỆ THỐNG (isSuperAdmin: cấu hình,
//  skill, podcast) → khoá "được đăng" + người tạo khoá phải là quản trị hệ thống.
//  KHÔNG bao giờ đọc/ghi khoá bí mật (Apify, YouTube, MiniMax) qua MCP.
// ============================================================================

// Cắt văn bản dài thành nhiều đoạn ≤ 1400 ký tự (trimDeep cắt chuỗi > 1500).
const chunkText = (text: string, max = 1400): string[] => {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/\n/)) {
    const piece = cur ? `${cur}\n${para}` : para;
    if (piece.length <= max) {
      cur = piece;
      continue;
    }
    if (cur) out.push(cur);
    let rest = para;
    while (rest.length > max) {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    cur = rest;
  }
  if (cur) out.push(cur);
  return out;
};

// Bỏ các trường "…Masked" (vài ký tự đầu của khoá bí mật) khỏi trạng thái.
const viralStatusSafe = () => {
  const s: Record<string, any> = { ...getViralStatus() };
  for (const k of Object.keys(s)) if (/masked$/i.test(k)) delete s[k];
  return s;
};

@Injectable()
export class HubViralExtraTools implements HubToolGroup {
  constructor(
    private _viralService: ViralService,
    private _groupService: ViralGroupService,
    private _usersService: UsersService
  ) {}

  // Mirror `user.isSuperAdmin` của controller: khoá MCP phải do quản trị hệ
  // thống tạo. API key tổ chức / OAuth không biết người dùng → chặn (fail-closed).
  private async requireSuperAdmin(org: HubOrg, what: string) {
    const user = org.mcpUserId
      ? await this._usersService.getUserById(org.mcpUserId).catch(() => null)
      : null;
    if (!(user as any)?.isSuperAdmin) {
      throw new HubToolError(
        `${what} chỉ quản trị hệ thống làm được — cần khoá MCP riêng do quản trị hệ thống tạo (Cài đặt → Kết nối agent MCP).`
      );
    }
  }

  tools(): HubToolMap {
    return {
      // ── BẢN TIN TUẦN ─────────────────────────────────────────────────────
      hub_viral_ban_tin_xoa: hubTool({
        id: 'hub_viral_ban_tin_xoa',
        title: 'Xoá bản tin viral',
        level: 'dang',
        destructive: true,
        description: 'Xoá hẳn một bản tin tuần (id lấy từ hub_viral_ban_tin).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          await this._viralService.deleteReport(org.id, input.id);
          return { ok: true };
        },
      }),

      hub_viral_ban_tin_gui_zalo: hubTool({
        id: 'hub_viral_ban_tin_gui_zalo',
        title: 'Gửi bản tin qua Zalo',
        level: 'dang',
        openWorld: true,
        description:
          'GỬI THẬT một bản tin đã có qua Zalo tới danh sách người nhận đã lưu trong cấu hình (hub_viral_cau_hinh → reportRecipients).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const res = await this._viralService.sendReportZalo(org.id, input.id);
          if (!res) throw new HubToolError('Không tìm thấy bản tin.');
          if (!res.sent && !res.failed) {
            throw new HubToolError(
              'Chưa cấu hình người nhận — sửa reportRecipients bằng hub_viral_cau_hinh_sua.'
            );
          }
          return { ok: true, da_gui: res.sent, loi: res.failed };
        },
      }),

      hub_viral_ban_tin_tao_ngay: hubTool({
        id: 'hub_viral_ban_tin_tao_ngay',
        title: 'Tạo & gửi bản tin tuần ngay',
        level: 'dang',
        openWorld: true,
        description:
          'Tạo bản tin tuần NGAY (không đợi lịch), lưu vào tab Bản tin và GỬI THẬT tới các kênh nhận bản tin đã cấu hình. Mất vài phút (AI).',
        input: z.object({}),
        run: async (_i, org) =>
          this._viralService.sendWeeklyReport(org.id, 'manual'),
      }),

      // ── CẤU HÌNH CÀO / CHẤM / BẢN TIN ───────────────────────────────────
      hub_viral_cau_hinh: hubTool({
        id: 'hub_viral_cau_hinh',
        title: 'Cấu hình viral',
        level: 'doc',
        description:
          'Cấu hình trang Viral: chu kỳ cào (giờ), cách gom cụm, ngưỡng tự duyệt / tự bỏ, tự sản xuất, phanh tạm dừng duyệt/sản xuất, người nhận + giờ gửi bản tin, giọng đọc podcast. Chỉ báo có/không có khoá API (không lộ khoá).',
        input: z.object({}),
        run: async () => viralStatusSafe(),
      }),

      hub_viral_cau_hinh_sua: hubTool({
        id: 'hub_viral_cau_hinh_sua',
        title: 'Sửa cấu hình viral',
        level: 'dang',
        description:
          'Đổi cấu hình trang Viral (chỉ truyền trường muốn đổi). Chỉ quản trị hệ thống. Khoá API (Apify/YouTube/MiniMax) KHÔNG đổi được qua MCP — vào Cài đặt trong app. Mở phanh sản xuất (tam_dung_san_xuat=false) thì Hub tự sản xuất bù các chủ đề đã duyệt.',
        input: z.object({
          chu_ky_cao_gio: z.number().min(0).max(168).optional().describe('crawlEveryHours, 0 = tắt cào theo lịch'),
          gom_cum: z.enum(['ai', 'embeddings']).optional().describe('clusterMode'),
          so_nguon_toi_thieu: z.number().optional().describe('convergenceMin — số nguồn tối thiểu để thành chủ đề'),
          nguong_gom_cum: z.number().optional().describe('clusterThreshold'),
          tu_duyet_tu_diem: z.number().optional().describe('autoApproveMin'),
          tu_bo_duoi_diem: z.number().optional().describe('autoSkipMax'),
          so_vong_viet_lai: z.number().optional().describe('rewriteMaxRounds'),
          tu_san_xuat: z.boolean().optional().describe('autoProduce'),
          tam_dung_duyet: z.boolean().optional().describe('pauseApprove'),
          tam_dung_san_xuat: z.boolean().optional().describe('pauseProduce'),
          ban_tin_tu_gui: z.boolean().optional().describe('reportAutoSend'),
          ban_tin_gio_gui: z.number().int().min(0).max(23).optional().describe('reportSendHour'),
          ban_tin_nguoi_nhan: z
            .array(
              z.object({
                threadId: z.string(),
                type: z.enum(['user', 'group', 'email']),
                name: z.string(),
              })
            )
            .max(50)
            .optional()
            .describe('reportRecipients — THAY TOÀN BỘ danh sách (threadId Zalo hoặc email)'),
          ban_tin_nhom_zalo: z.string().optional().describe('reportZaloThreadId (cũ)'),
          giong_doc: z.string().optional().describe('minimaxVoiceId'),
          model_giong: z.string().optional().describe('minimaxModel'),
          toc_do_doc: z.number().min(0.5).max(2).optional().describe('minimaxSpeed'),
        }),
        run: async (input, org) => {
          await this.requireSuperAdmin(org, 'Đổi cấu hình viral');
          const map: Record<string, string> = {
            chu_ky_cao_gio: 'crawlEveryHours',
            gom_cum: 'clusterMode',
            so_nguon_toi_thieu: 'convergenceMin',
            nguong_gom_cum: 'clusterThreshold',
            tu_duyet_tu_diem: 'autoApproveMin',
            tu_bo_duoi_diem: 'autoSkipMax',
            so_vong_viet_lai: 'rewriteMaxRounds',
            tu_san_xuat: 'autoProduce',
            tam_dung_duyet: 'pauseApprove',
            tam_dung_san_xuat: 'pauseProduce',
            ban_tin_tu_gui: 'reportAutoSend',
            ban_tin_gio_gui: 'reportSendHour',
            ban_tin_nguoi_nhan: 'reportRecipients',
            ban_tin_nhom_zalo: 'reportZaloThreadId',
            giong_doc: 'minimaxVoiceId',
            model_giong: 'minimaxModel',
            toc_do_doc: 'minimaxSpeed',
          };
          const patch: Record<string, any> = {};
          for (const [k, v] of Object.entries(input)) {
            if (v !== undefined && map[k]) patch[map[k]] = v;
          }
          if (!Object.keys(patch).length) {
            throw new HubToolError('Chưa truyền trường nào để đổi.');
          }
          const produceWasPaused = getViralStatus().pauseProduce;
          setViralConfig(patch as any);
          let san_xuat_bu: any;
          if (produceWasPaused && patch.pauseProduce === false) {
            san_xuat_bu = await this._viralService
              .produceApprovedBacklog(org.id)
              .catch(() => null);
          }
          return { ok: true, cau_hinh: viralStatusSafe(), san_xuat_bu };
        },
      }),

      hub_viral_cham_diem: hubTool({
        id: 'hub_viral_cham_diem',
        title: 'AI chấm điểm bài chưa có điểm',
        level: 'nhap',
        openWorld: true,
        description:
          'Cho AI chấm điểm các bài viral chưa có điểm (tối đa 60 bài/lần) — như nút "Chấm điểm AI".',
        input: z.object({}),
        run: async (_i, org) => ({
          da_cham: await this._viralService.scoreUnscored(org.id),
        }),
      }),

      // ── NGUỒN ────────────────────────────────────────────────────────────
      hub_viral_nguon_loai: hubTool({
        id: 'hub_viral_nguon_loai',
        title: 'Đổi loại nguồn',
        level: 'dang',
        description:
          'Đổi loại một nguồn theo dõi: kol | school | group | news | other (school + kol = đối thủ, tính vào mục "động tĩnh đối thủ" của bản tin).',
        input: z.object({
          id: z.string(),
          loai: z.enum(['kol', 'school', 'group', 'news', 'other']),
        }),
        run: async (input, org) => {
          await this._viralService.setSourceType(org.id, input.id, input.loai);
          return { ok: true };
        },
      }),

      hub_viral_nguon_don_dep: hubTool({
        id: 'hub_viral_nguon_don_dep',
        title: 'Dọn nguồn theo dõi',
        level: 'dang',
        destructive: true,
        description:
          'Dọn nguồn 1 nút: xoá nguồn trùng, tự phân loại, bật tự cào cho báo/từ khoá, TẮT tự cào nguồn Facebook.',
        input: z.object({}),
        run: async (_i, org) => this._viralService.cleanupSources(org.id),
      }),

      hub_viral_nguon_nhap_mac_dinh: hubTool({
        id: 'hub_viral_nguon_nhap_mac_dinh',
        title: 'Nhập bộ nguồn mặc định',
        level: 'dang',
        description:
          'Thêm bộ nguồn mặc định (KOL / đối thủ / group + 10 từ khoá Google News), bỏ qua nguồn đã có.',
        input: z.object({}),
        run: async (_i, org) => ({
          da_them: await this._viralService.importDefaultSources(org.id),
        }),
      }),

      // ── MỒI CÂU / CÔNG THỨC ─────────────────────────────────────────────
      hub_viral_moi_cau: hubTool({
        id: 'hub_viral_moi_cau',
        title: 'Gợi ý mồi câu (lead magnet)',
        level: 'nhap',
        openWorld: true,
        description:
          'AI chấm 5 loại mồi câu (ebook / checklist / app / template / quiz) cho một chủ đề hoặc một bài viral rồi xếp hạng; kết quả lưu vào thẻ.',
        input: z.object({
          id: z.string(),
          nguon: z.enum(['topic', 'post']).default('topic').describe('id là chủ đề hay bài viral'),
        }),
        run: async (input, org) =>
          this._viralService.suggestLeadMagnets(org.id, input.id, input.nguon),
      }),

      hub_viral_cong_thuc: hubTool({
        id: 'hub_viral_cong_thuc',
        title: 'Mổ công thức bài viral',
        level: 'nhap',
        openWorld: true,
        description:
          'AI mổ công thức của một bài viral (hook, cấu trúc, cảm xúc, lời kêu gọi…). Đã mổ rồi thì trả bản đã lưu.',
        input: z.object({ id: z.string().describe('id bài viral (hub_viral_bai)') }),
        run: async (input, org) => {
          const res: any = await this._viralService.formula(org.id, input.id);
          if (!res) throw new HubToolError('Không tìm thấy bài.');
          if (!res.formula) throw new HubToolError('AI chưa mổ được công thức — thử lại.');
          return { cong_thuc: res.formula, bai_id: input.id };
        },
      }),

      // ── SẢN PHẨM ─────────────────────────────────────────────────────────
      hub_viral_san_pham_goi_y_kenh: hubTool({
        id: 'hub_viral_san_pham_goi_y_kenh',
        title: 'Gợi ý kênh cho sản phẩm',
        level: 'nhap',
        openWorld: true,
        description:
          'AI gợi ý kênh đăng cho một sản phẩm đã sản xuất xong (blog → website; infographic → kênh Facebook…). Dùng cho sản phẩm cũ chưa có gợi ý.',
        input: z.object({ id: z.string() }),
        run: async (input, org) =>
          this._viralService.suggestForProduct(org.id, input.id),
      }),

      hub_viral_san_pham_blog: hubTool({
        id: 'hub_viral_san_pham_blog',
        title: 'Nội dung blog của sản phẩm',
        level: 'doc',
        description:
          'Toàn văn một sản phẩm blog đã xong (chia đoạn). File .docx chỉ tải được trong app (Viral → Sản phẩm → tải Word) — route trả base64 cần đăng nhập nên không có link tải trực tiếp.',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const docx = await this._viralService.productDocx(org.id, input.id);
          if (!docx) {
            throw new HubToolError('Sản phẩm không phải blog hoặc chưa xong.');
          }
          const p: any = ((await this._viralService.listProducts(org.id)) as any[]).find(
            (x) => x.id === input.id
          );
          let meta: any = {};
          try {
            meta = JSON.parse(p?.meta || '{}');
          } catch {
            meta = {};
          }
          return {
            id: input.id,
            tieu_de: p?.title || p?.topic,
            mo_ta_meta: meta.meta_description || undefined,
            slug: meta.slug || undefined,
            the: Array.isArray(meta.tags) ? meta.tags : undefined,
            ten_file_docx: docx.fileName,
            noi_dung_doan: chunkText(htmlToText(p?.textContent || '')),
          };
        },
      }),

      hub_viral_san_pham_rss: hubTool({
        id: 'hub_viral_san_pham_rss',
        title: 'Phát hành / gỡ podcast khỏi feed RSS',
        level: 'dang',
        openWorld: true,
        description:
          'Đưa một sản phẩm podcast đã xong lên feed RSS công khai (Spotify… tự lấy) hoặc gỡ xuống (bat=false). Có thể kèm tiêu đề / mô tả tập.',
        input: z.object({
          id: z.string(),
          bat: z.boolean(),
          tieu_de: z.string().max(300).optional(),
          mo_ta: z.string().max(4000).optional(),
        }),
        run: async (input, org) =>
          this._viralService.setProductRss(org.id, input.id, {
            on: input.bat,
            title: input.tieu_de,
            description: input.mo_ta,
          }),
      }),

      // ── KHO CÔNG THỨC AI (SKILL) ────────────────────────────────────────
      hub_viral_skill: hubTool({
        id: 'hub_viral_skill',
        title: 'Kho công thức AI (skill)',
        level: 'doc',
        description:
          'Các công thức AI (prompt) trang Viral đang dùng: khoá, nhãn, nhóm, đã sửa so với mặc định chưa. Truyền key để đọc TOÀN VĂN một công thức.',
        input: z.object({ key: z.string().optional() }),
        run: async (input) => {
          const all = listSkills();
          if (input.key) {
            const s = all.find((x) => x.key === input.key);
            if (!s) throw new HubToolError('Không có công thức này.');
            return { ...s, content: undefined, noi_dung_doan: chunkText(s.content || '') };
          }
          return all.map((s) => ({
            key: s.key,
            nhan: s.label,
            nhom: s.group,
            mo_ta: s.description,
            da_sua: s.isCustom,
            do_dai: (s.content || '').length,
          }));
        },
      }),

      hub_viral_skill_sua: hubTool({
        id: 'hub_viral_skill_sua',
        title: 'Sửa / đặt lại công thức AI',
        level: 'dang',
        destructive: true,
        description:
          'Ghi đè toàn văn một công thức AI (có tác dụng ngay với mọi lần AI chạy sau), hoặc dat_lai=true để về bản mặc định. Chỉ quản trị hệ thống.',
        input: z.object({
          key: z.string(),
          noi_dung: z.string().max(60000).optional(),
          dat_lai: z.boolean().optional(),
        }),
        run: async (input, org) => {
          await this.requireSuperAdmin(org, 'Sửa công thức AI');
          if (input.dat_lai) {
            if (!resetSkill(input.key)) throw new HubToolError('Không có công thức này.');
            return { ok: true, da_dat_lai: input.key };
          }
          if (typeof input.noi_dung !== 'string' || !input.noi_dung.trim()) {
            throw new HubToolError('Truyền noi_dung (toàn văn mới) hoặc dat_lai=true.');
          }
          if (!setSkill(input.key, input.noi_dung)) {
            throw new HubToolError('Không có công thức này.');
          }
          return { ok: true, key: input.key };
        },
      }),

      // ── SHOW PODCAST (feed RSS) ─────────────────────────────────────────
      hub_viral_podcast_cau_hinh: hubTool({
        id: 'hub_viral_podcast_cau_hinh',
        title: 'Cấu hình show podcast',
        level: 'doc',
        description:
          'Thông tin show podcast trên feed RSS (tên, mô tả, tác giả, email, ngôn ngữ, chuyên mục…), đã đủ điều kiện nộp Spotify chưa, link feed để dán vào Spotify.',
        input: z.object({}),
        run: async () => {
          const base = (
            process.env.NEXT_PUBLIC_BACKEND_URL ||
            `${process.env.FRONTEND_URL || ''}/api`
          ).replace(/\/$/, '');
          return {
            ...getPodcastStatus(),
            feedUrl: `${base}/public/podcast/feed.xml`,
            coverUrl: `${base}/public/podcast/cover`,
          };
        },
      }),

      hub_viral_podcast_cau_hinh_sua: hubTool({
        id: 'hub_viral_podcast_cau_hinh_sua',
        title: 'Sửa cấu hình show podcast',
        level: 'dang',
        openWorld: true,
        description:
          'Đổi thông tin show podcast trên feed RSS công khai (chỉ truyền trường muốn đổi). Ảnh bìa chỉ đổi được trong app. Chỉ quản trị hệ thống.',
        input: z.object({
          title: z.string().max(300).optional(),
          description: z.string().max(4000).optional(),
          author: z.string().max(200).optional(),
          email: z.string().email().optional(),
          link: z.string().url().optional(),
          language: z.string().max(10).optional(),
          category: z.string().max(100).optional(),
          explicit: z.boolean().optional(),
          country: z.string().max(5).optional(),
        }),
        run: async (input, org) => {
          await this.requireSuperAdmin(org, 'Đổi cấu hình podcast');
          const patch = Object.fromEntries(
            Object.entries(input).filter(([, v]) => v !== undefined)
          );
          if (!Object.keys(patch).length) {
            throw new HubToolError('Chưa truyền trường nào để đổi.');
          }
          setPodcastConfig(patch);
          return { ok: true, ...getPodcastStatus() };
        },
      }),

      // ── DỌN DẸP ──────────────────────────────────────────────────────────
      hub_viral_xoa_han: hubTool({
        id: 'hub_viral_xoa_han',
        title: 'Xoá hẳn bài / chủ đề viral',
        level: 'dang',
        destructive: true,
        description:
          'Xoá HẲN khỏi cơ sở dữ liệu (không khôi phục được) tối đa 300 bài viral hoặc chủ đề. Xoá mềm thì dùng hub_viral_bai_duyet / hub_viral_chu_de_duyet.',
        input: z.object({
          ids: z.array(z.string()).min(1).max(300),
          loai: z.enum(['post', 'topic']),
        }),
        run: async (input, org) => {
          if (input.loai === 'topic') {
            await this._viralService.bulkTopicStatus(org.id, input.ids, 'hard-delete');
          } else {
            await this._viralService.hardDelete(org.id, input.ids);
          }
          return { ok: true, so_luong: input.ids.length };
        },
      }),

      hub_viral_luu_tru_don_sach: hubTool({
        id: 'hub_viral_luu_tru_don_sach',
        title: 'Dọn sạch Lưu trữ viral',
        level: 'dang',
        destructive: true,
        description:
          'Xoá HẲN toàn bộ Lưu trữ (mọi bài + chủ đề đã bỏ qua hoặc đã xoá mềm) khỏi cơ sở dữ liệu. Không khôi phục được — chỉ gọi khi người dùng nói rõ.',
        input: z.object({
          xac_nhan: z.literal(true).describe('Phải truyền true'),
        }),
        run: async (_i, org) => {
          const r: any = await this._viralService.hardDeleteArchive(org.id);
          return { ok: true, da_xoa: r?.count ?? 0 };
        },
      }),

      // ── GROUP FACEBOOK ───────────────────────────────────────────────────
      hub_group_fb_bai_xoa: hubTool({
        id: 'hub_group_fb_bai_xoa',
        title: 'Xoá bài group Facebook',
        level: 'dang',
        destructive: true,
        description: 'Xoá một bài đã cào từ group Facebook (id lấy từ hub_group_fb_bai).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          await this._groupService.deletePost(org.id, input.id);
          return { ok: true };
        },
      }),

      hub_group_fb_ky_xoa: hubTool({
        id: 'hub_group_fb_ky_xoa',
        title: 'Xoá kỳ cào group Facebook',
        level: 'dang',
        destructive: true,
        description:
          'Xoá một kỳ cào group Facebook (id kỳ lấy từ hub_group_fb_tong_quan → ky_cao).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          await this._groupService.deleteBatch(org.id, input.id);
          return { ok: true };
        },
      }),
    };
  }
}

