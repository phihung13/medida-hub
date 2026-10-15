import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  HubOrg,
  HubToolError,
  HubToolGroup,
  HubToolMap,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';
import { bot } from '@gitroom/nestjs-libraries/chat/hub/hub.zalo.client';

// ============================================================================
//  Nhóm "Zalo (quản trị)": phần cấu hình bot Zalo mà hub.zalo.tools chưa có —
//  cấu hình từng nhóm (routes.json của bot: kênh đích, thời gian gom, văn mẫu,
//  CHÂN BÀI…), chế độ duyệt, kết nối lại Zalo, lấy lại tin bị lỡ, tải lại chân
//  bài / đăng nháp lại bài đã đăng, danh sách kênh Zalo Video.
//
//  Sửa nhóm: đọc NGUYÊN routes.json (GET /api/routes) → chỉ đổi đúng nhóm cần
//  sửa → ghi lại cả file (POST /api/routes) — y như trang Nhóm Zalo của Hub,
//  các nhóm khác giữ nguyên. Bot tự áp chân bài mới vào bài CHỜ DUYỆT của nhóm.
//
//  Chân bài: Hub chèn chân bài của KÊNH đích lúc đăng (Cài đặt kênh → Chân
//  bài); chân bài riêng của nhóm (captionFooter) là kiểu cũ của bot, trang Nhóm
//  Zalo của Hub đang xoá nó mỗi lần lưu. Vì vậy công cụ chân bài cho chọn rõ
//  ghi vào đâu.
// ============================================================================

const threadId = z.string().describe('threadId nhóm Zalo (zalo_nhom_cai_dat / zalo_tong_quan)');
const MIN = 60_000;

const routeChannels = (r: any): string[] =>
  Array.isArray(r?.postizIntegrationIds) && r.postizIntegrationIds.length
    ? r.postizIntegrationIds.map(String).filter(Boolean)
    : r?.postizIntegrationId
    ? [String(r.postizIntegrationId)]
    : [];

const routeView = (r: any, defaults: any = {}) => ({
  threadId: String(r.threadId),
  ten: r.label || String(r.threadId),
  muc: r.folder || undefined,
  dang_nghe: r.enabled !== false,
  kenh_hub: routeChannels(r),
  gom_khi_im_lang_phut: Math.round(Number(r.debounceMs ?? defaults.debounceMs ?? 600000) / MIN),
  toi_da_moi_bai_phut: Math.round(Number(r.maxWaitMs ?? defaults.maxWaitMs ?? 1800000) / MIN),
  tu_them_hashtag: r.autoHashtags !== false,
  loc_anh: r.curateImages !== false,
  chan_bai_nhom: r.captionFooter || '',
  comment_dau: r.comment || undefined,
  van_mau: (r.writeGuide ?? r.styleSample ?? '') || undefined,
  chi_nhan_tu: Array.isArray(r.allowSenders) && r.allowSenders.length ? r.allowSenders : undefined,
});

@Injectable()
export class HubZaloAdminTools implements HubToolGroup {
  constructor(private _integrationService: IntegrationService) {}

  private async readRoutes() {
    const file = await bot('/api/routes');
    const routes: any[] = Array.isArray(file?.routes) ? file.routes : [];
    return { file: { ...file, routes }, routes };
  }

  // Đổi đúng 1 nhóm rồi ghi lại NGUYÊN file (các nhóm khác giữ nguyên).
  private async patchRoute(id: string, fn: (r: any) => void) {
    const { file, routes } = await this.readRoutes();
    const r = routes.find((x) => String(x.threadId) === String(id));
    if (!r) {
      throw new HubToolError(
        'Nhóm này chưa được cài — bật nghe bằng zalo_nhom_cau_hinh trước.'
      );
    }
    fn(r);
    const res = await bot('/api/routes', { method: 'POST', body: file }, 30_000);
    return { route: r, defaults: file.defaults || {}, res };
  }

  private async channelFooters(org: HubOrg, ids: string[]) {
    return Promise.all(
      ids.map(async (id) => {
        const it: any = await this._integrationService
          .getIntegrationById(org.id, id)
          .catch(() => null);
        return it
          ? { id, ten: it.name, chan_bai_kenh: it.postFooter || '' }
          : { id, loi: 'Không thấy kênh trong tổ chức này' };
      })
    );
  }

  private async defaultChannel(): Promise<string> {
    const st = await bot('/api/postiz/status').catch(() => null);
    return String(st?.integrationId || '');
  }

  tools(): HubToolMap {
    return {
      // ── CẤU HÌNH NHÓM ────────────────────────────────────────────────────
      zalo_nhom_cai_dat: hubTool({
        id: 'zalo_nhom_cai_dat',
        title: 'Cấu hình các nhóm Zalo của bot',
        level: 'doc',
        description:
          'Cấu hình từng nhóm bot đang cài: tên, mục, đang nghe, kênh Media Hub đích, thời gian gom (phút), tự thêm hashtag, lọc ảnh, chân bài nhóm, comment đầu, văn mẫu AI, chỉ nhận ảnh từ ai. Truyền threadId để xem một nhóm.',
        input: z.object({ threadId: threadId.optional() }),
        run: async (input) => {
          const { file, routes } = await this.readRoutes();
          const list = routes
            .filter((r) => !input.threadId || String(r.threadId) === String(input.threadId))
            .map((r) => routeView(r, file.defaults || {}));
          if (input.threadId && !list.length) {
            throw new HubToolError('Nhóm này chưa được cài.');
          }
          return { so_nhom: list.length, nhom: list };
        },
      }),

      zalo_nhom_sua: hubTool({
        id: 'zalo_nhom_sua',
        title: 'Sửa cấu hình một nhóm Zalo',
        level: 'dang',
        description:
          'Đổi các tuỳ chọn của MỘT nhóm đã cài (chỉ truyền trường muốn đổi; nhóm khác không bị đụng): tên, mục, bật/tắt nghe, danh sách kênh Media Hub đích (THAY toàn bộ), thời gian gom, hashtag, lọc ảnh, comment đầu, văn mẫu AI, người được gửi ảnh. Chân bài: dùng zalo_chan_bai_nhom_sua.',
        input: z.object({
          threadId,
          ten: z.string().min(1).max(200).optional(),
          muc: z.string().max(100).optional().describe('"" = bỏ mục'),
          dang_nghe: z.boolean().optional(),
          kenh_hub: z.array(z.string()).max(20).optional().describe('id kênh Media Hub, [] = kênh mặc định của bot'),
          gom_khi_im_lang_phut: z.number().min(1).max(240).optional(),
          toi_da_moi_bai_phut: z.number().min(1).max(1440).optional(),
          tu_them_hashtag: z.boolean().optional(),
          loc_anh: z.boolean().optional(),
          comment_dau: z.string().max(2000).optional(),
          van_mau: z.string().max(20000).optional().describe('Hướng dẫn / văn mẫu cho AI viết caption'),
          chi_nhan_tu: z.array(z.string()).max(100).optional().describe('id người gửi được nhận ảnh, [] = mọi người'),
        }),
        run: async (input, org) => {
          const keys = Object.keys(input).filter(
            (k) => k !== 'threadId' && (input as any)[k] !== undefined
          );
          if (!keys.length) throw new HubToolError('Chưa truyền trường nào để đổi.');
          if (input.kenh_hub?.length) {
            for (const c of await this.channelFooters(org, input.kenh_hub)) {
              if ((c as any).loi) throw new HubToolError(`Kênh ${c.id}: ${(c as any).loi}`);
            }
          }
          const { route, defaults } = await this.patchRoute(input.threadId, (r) => {
            if (input.ten !== undefined) r.label = input.ten;
            if (input.muc !== undefined) r.folder = input.muc;
            if (input.dang_nghe !== undefined) r.enabled = input.dang_nghe;
            if (input.kenh_hub !== undefined) {
              r.postizIntegrationIds = input.kenh_hub;
              r.postizIntegrationId = input.kenh_hub[0] || '';
            }
            if (input.gom_khi_im_lang_phut !== undefined) {
              r.debounceMs = Math.round(input.gom_khi_im_lang_phut * MIN);
            }
            if (input.toi_da_moi_bai_phut !== undefined) {
              r.maxWaitMs = Math.round(input.toi_da_moi_bai_phut * MIN);
            }
            // "Tối đa mỗi bài" không nhỏ hơn "gom khi im lặng" (như trang Hub)
            const deb = Number(r.debounceMs ?? defaults.debounceMs ?? 600000);
            const max = Number(r.maxWaitMs ?? defaults.maxWaitMs ?? 1800000);
            if (max < deb) r.maxWaitMs = deb;
            if (input.tu_them_hashtag !== undefined) r.autoHashtags = input.tu_them_hashtag;
            if (input.loc_anh !== undefined) r.curateImages = input.loc_anh;
            if (input.comment_dau !== undefined) r.comment = input.comment_dau;
            if (input.van_mau !== undefined) {
              r.writeGuide = input.van_mau;
              delete r.styleSample;
            }
            if (input.chi_nhan_tu !== undefined) r.allowSenders = input.chi_nhan_tu;
          });
          return { ok: true, nhom: routeView(route, defaults) };
        },
      }),

      // ── CHÂN BÀI ─────────────────────────────────────────────────────────
      zalo_chan_bai_nhom: hubTool({
        id: 'zalo_chan_bai_nhom',
        title: 'Xem chân bài của nhóm Zalo',
        level: 'doc',
        description:
          'Chân bài áp cho bài từ một nhóm Zalo: chân bài riêng của nhóm (bot chèn vào caption bài chờ duyệt của bot) và chân bài của từng KÊNH Media Hub đích (Hub chèn lúc đăng bài đẩy sang Lịch).',
        input: z.object({ threadId }),
        run: async (input, org) => {
          const { routes } = await this.readRoutes();
          const r = routes.find((x) => String(x.threadId) === String(input.threadId));
          if (!r) throw new HubToolError('Nhóm này chưa được cài.');
          const ids = routeChannels(r);
          const kenh = ids.length ? ids : [await this.defaultChannel()].filter(Boolean);
          return {
            threadId: String(r.threadId),
            ten: r.label || String(r.threadId),
            chan_bai_nhom: r.captionFooter || '',
            kenh_dich_la_mac_dinh: !ids.length,
            kenh_hub: await this.channelFooters(org, kenh),
          };
        },
      }),

      zalo_chan_bai_nhom_sua: hubTool({
        id: 'zalo_chan_bai_nhom_sua',
        title: 'Đặt chân bài cho nhóm Zalo',
        level: 'dang',
        description:
          'Đặt chân bài ("" = bỏ) cho bài từ một nhóm Zalo. noi_ap_dung="nhom": ghi chân bài riêng của nhóm trong bot — bot tự cập nhật caption mọi bài CHỜ DUYỆT của nhóm; lưu ý trang Nhóm Zalo của Hub hiện xoá chân bài nhóm mỗi lần lưu. noi_ap_dung="kenh": ghi chân bài của các KÊNH Media Hub đích của nhóm — áp cho MỌI bài của kênh đó (kể cả bài không đến từ nhóm này), Hub chèn lúc đăng.',
        input: z.object({
          threadId,
          chan_bai: z.string().max(3000),
          noi_ap_dung: z.enum(['nhom', 'kenh']),
        }),
        run: async (input, org) => {
          const footer = input.chan_bai.trim();
          if (input.noi_ap_dung === 'nhom') {
            const { res } = await this.patchRoute(input.threadId, (r) => {
              r.captionFooter = footer;
            });
            return {
              ok: true,
              chan_bai_nhom: footer,
              bai_cho_duyet_da_cap_nhat: res?.footerUpdated ?? 0,
            };
          }
          const { routes } = await this.readRoutes();
          const r = routes.find((x) => String(x.threadId) === String(input.threadId));
          if (!r) throw new HubToolError('Nhóm này chưa được cài.');
          const ids = routeChannels(r);
          const kenh = ids.length ? ids : [await this.defaultChannel()].filter(Boolean);
          if (!kenh.length) throw new HubToolError('Nhóm chưa có kênh Media Hub đích.');
          const out: any[] = [];
          for (const id of kenh) {
            const ok = await this._integrationService
              .updatePostFooter(org.id, id, footer)
              .catch(() => null);
            out.push({ id, ok: !!ok });
          }
          return { ok: out.every((x) => x.ok), chan_bai_kenh: footer, kenh: out };
        },
      }),

      // ── CÀI ĐẶT BOT ──────────────────────────────────────────────────────
      zalo_cai_dat_bot: hubTool({
        id: 'zalo_cai_dat_bot',
        title: 'Cài đặt bot Zalo',
        level: 'doc',
        description:
          'Cài đặt chung của bot: tạm dừng (paused — đổi bằng zalo_tam_dung), cờ approval (bot hiện không dùng), trạng thái kết nối Zalo, số bài chờ duyệt, tài khoản Zalo đang đăng nhập.',
        input: z.object({}),
        run: async () => {
          const [st, zs] = await Promise.all([
            bot('/api/status'),
            bot('/api/zalo/status').catch(() => null),
          ]);
          return {
            cai_dat: st?.settings,
            zalo_ket_noi: !!st?.zaloConnected,
            dang_dang_nhap_lai: !!st?.zaloRelogging,
            so_bai_cho_duyet: st?.pendingCount,
            tai_khoan_zalo: zs?.ownId || undefined,
            co_qr_cho_quet: zs?.qr || undefined,
          };
        },
      }),

      zalo_ket_noi_lai: hubTool({
        id: 'zalo_ket_noi_lai',
        title: 'Kết nối lại Zalo',
        level: 'dang',
        openWorld: true,
        description:
          'Yêu cầu bot kết nối lại tài khoản Zalo (khi mất phiên / không nhận tin). Chạy nền — xem lại bằng zalo_tong_quan sau ít giây.',
        input: z.object({}),
        run: async () =>
          bot('/api/postiz/zalo/reconnect', { method: 'POST', body: {} }),
      }),

      // ── LẤY LẠI TIN BỊ LỠ ────────────────────────────────────────────────
      zalo_lay_lai_tin_xem: hubTool({
        id: 'zalo_lay_lai_tin_xem',
        title: 'Xem trước tin bị lỡ',
        level: 'doc',
        openWorld: true,
        description:
          'Đọc lịch sử các nhóm đang nghe trong một khoảng thời gian (vd khoảng mất phiên ở zalo_tong_quan → gaps) và chia thành các đợt ảnh như lúc nhận trực tiếp. Mỗi đợt có id, cờ seenLive (bot đã nhận), recovered (đã lấy lại), maybeDup (có thể trùng). Không tạo gì.',
        input: z.object({
          tu: z.string().describe('ISO 8601'),
          den: z.string().describe('ISO 8601'),
        }),
        run: async (input) => {
          const from = dayjs(input.tu);
          const to = dayjs(input.den);
          if (!from.isValid() || !to.isValid() || !to.isAfter(from)) {
            throw new HubToolError('Khoảng thời gian không hợp lệ.');
          }
          const r = await bot(
            '/api/zalo/recover/preview',
            { method: 'POST', body: { from: from.valueOf(), to: to.valueOf() } },
            180_000
          );
          return { nhom: r?.groups || [] };
        },
      }),

      zalo_lay_lai_tin_chay: hubTool({
        id: 'zalo_lay_lai_tin_chay',
        title: 'Tạo bản nháp từ tin bị lỡ',
        level: 'nhap',
        openWorld: true,
        description:
          'Tạo bài chờ duyệt cho các đợt ảnh đã chọn (id từ zalo_lay_lai_tin_xem, cùng khoảng thời gian). Nên bỏ đợt seenLive / recovered / maybeDup. Chạy nền — tiến độ ở zalo_nhat_ky.',
        input: z.object({
          tu: z.string(),
          den: z.string(),
          ids: z.array(z.string()).min(1).max(200),
        }),
        run: async (input) => {
          const from = dayjs(input.tu);
          const to = dayjs(input.den);
          if (!from.isValid() || !to.isValid() || !to.isAfter(from)) {
            throw new HubToolError('Khoảng thời gian không hợp lệ.');
          }
          return bot(
            '/api/zalo/recover/run',
            {
              method: 'POST',
              body: { from: from.valueOf(), to: to.valueOf(), ids: input.ids },
            },
            180_000
          );
        },
      }),

      // ── BÀI ĐÃ ĐĂNG ──────────────────────────────────────────────────────
      zalo_da_dang_tai_lai_chan_bai: hubTool({
        id: 'zalo_da_dang_tai_lai_chan_bai',
        title: 'Áp lại chân bài cho bài đã đăng',
        level: 'nhap',
        description:
          'Thay chân bài trong caption ĐÃ LƯU của một bài bot đã đăng bằng chân bài nhóm mới nhất. KHÔNG sửa bài trên Facebook.',
        input: z.object({ id: z.string().describe('id trong zalo_da_dang') }),
        run: async (input) => {
          const d = await bot(
            `/api/posted/${encodeURIComponent(input.id)}/reload-footer`,
            { method: 'POST', body: {} }
          );
          return { ok: true, caption: d?.caption };
        },
      }),

      zalo_da_dang_nhap_lai: hubTool({
        id: 'zalo_da_dang_nhap_lai',
        title: 'Đăng nháp lại bài đã đăng',
        level: 'nhap',
        description:
          'Tạo BÀI CHỜ DUYỆT MỚI từ một bài bot đã đăng (giữ ảnh/video, chân bài mới nhất) để duyệt đăng lại. Không đăng gì.',
        input: z.object({ id: z.string().describe('id trong zalo_da_dang') }),
        run: async (input) =>
          bot(`/api/posted/${encodeURIComponent(input.id)}/redraft`, {
            method: 'POST',
            body: {},
          }),
      }),

      // ── ZALO VIDEO ───────────────────────────────────────────────────────
      zalo_video_kenh: hubTool({
        id: 'zalo_video_kenh',
        title: 'Kênh Zalo Video của tài khoản',
        level: 'doc',
        openWorld: true,
        description:
          'Mọi kênh Zalo Video (mỗi OA một kênh) mà phiên Zalo Video của bot đang quản lý. lam_moi=true bỏ qua bộ nhớ 5 phút. Muốn đăng video: tạo bài trên Lịch cho kênh Zalo Video.',
        input: z.object({ lam_moi: z.boolean().default(false) }),
        run: async (input) =>
          bot(
            '/api/zalovideo/channels',
            { method: 'POST', body: { fresh: input.lam_moi } },
            120_000
          ),
      }),
    };
  }
}
