import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import {
  HubToolError,
  HubToolGroup,
  HubToolMap,
  htmlToText,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Zalo": điều khiển bot Zalo (service zalo-bot trong compose) — y như
//  trang Zalo của Hub. Gọi bot qua mạng nội bộ ZALO_BOT_URL kèm bí mật chung
//  HUB_BOT_TOKEN (giống proxy /botapi), KHÔNG mở cổng bot ra ngoài.
//  Bot dùng chung cho cả Hub (một tài khoản Zalo), không tách theo tổ chức.
//
//  Đăng Zalo Video: tạo bài trên Lịch cho kênh Zalo Video (hub_bai_tao) — bot
//  tự đăng khi tới giờ; ở đây chỉ xem trạng thái phiên.
// ============================================================================

const botBase = () =>
  (process.env.ZALO_BOT_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');

const bot = async (
  path: string,
  init: { method?: 'GET' | 'POST'; body?: any } = {},
  timeoutMs = 60_000
) => {
  let res: Response;
  try {
    res = await fetch(botBase() + path, {
      method: init.method || 'GET',
      headers: {
        'content-type': 'application/json',
        ...(process.env.HUB_BOT_TOKEN
          ? { 'x-hub-token': process.env.HUB_BOT_TOKEN }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HubToolError(
      'Bot Zalo không phản hồi (bot đang tắt hoặc ZALO_BOT_URL sai).'
    );
  }
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (res.status === 401) {
    throw new HubToolError(
      'Bot Zalo từ chối — HUB_BOT_TOKEN của Hub và bot phải giống nhau.'
    );
  }
  if (!res.ok || data?.ok === false) {
    throw new HubToolError(data?.error || `Bot Zalo lỗi ${res.status}`);
  }
  return data;
};

const id = z.string().describe('id bài trong hàng chờ bot (zalo_hang_cho)');

const draftView = (d: any) => ({
  id: d.id,
  nhom: d.routeLabel,
  caption: d.caption,
  chu_thich_anh: d.imageCaptions?.length ? d.imageCaptions : undefined,
  so_anh: d.imageCount,
  so_video: d.videoCount,
  luc_gom: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
  hen_gio: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : undefined,
  duyet_theo_kenh: d.approvals,
  co_token_facebook: d.hasFbToken,
  so_google_business: d.gbpCount,
  da_day_sang_hub: d.pushedToHub,
});

@Injectable()
export class HubZaloTools implements HubToolGroup {
  tools(): HubToolMap {
    return {
      zalo_tong_quan: hubTool({
        id: 'zalo_tong_quan',
        title: 'Tổng quan bot Zalo',
        level: 'doc',
        description:
          'Bot Zalo có đang kết nối không, có tạm dừng không, số bài chờ duyệt, các nhóm đang nghe (thời gian chờ gom, kênh đích), các khoảng mất phiên gần đây.',
        input: z.object({}),
        run: async () => bot('/api/postiz/overview'),
      }),

      zalo_hang_cho: hubTool({
        id: 'zalo_hang_cho',
        title: 'Hàng chờ duyệt của bot Zalo',
        level: 'doc',
        description:
          'Các bài bot đã gom từ nhóm Zalo đang chờ duyệt: caption, số ảnh/video, trạng thái duyệt từng kênh (facebook / gbp), hẹn giờ, đã đẩy sang Hub chưa.',
        input: z.object({}),
        run: async () => {
          const list = (await bot('/api/postiz/pending')) as any[];
          return { so_bai: list.length, bai: list.map(draftView) };
        },
      }),

      zalo_da_dang: hubTool({
        id: 'zalo_da_dang',
        title: 'Lịch sử bài bot đã đăng',
        level: 'doc',
        description:
          'Bài bot đã đăng thẳng Facebook / Google Business (mới nhất trước): link, đăng công khai hay nháp Facebook.',
        input: z.object({ so_luong: z.number().int().min(1).max(100).default(30) }),
        run: async (input) => {
          const list = ((await bot('/api/posted')) as any[]).slice(
            0,
            input.so_luong
          );
          return list.map((d) => ({
            id: d.id,
            nhom: d.routeLabel,
            caption: htmlToText(d.caption).slice(0, 500),
            luc_dang: d.postedAt ? new Date(d.postedAt).toISOString() : undefined,
            cong_khai: d.published,
            dang_mot_phan: d.partial || undefined,
            link: d.links,
            duyet_theo_kenh: d.approvals,
          }));
        },
      }),

      zalo_dang_gom: hubTool({
        id: 'zalo_dang_gom',
        title: 'Phiên gom đang chạy',
        level: 'doc',
        description:
          'Theo từng nhóm: bot đang chờ / đang gom ảnh / đang xử lý, đã nhận bao nhiêu ảnh-video-tin, còn bao lâu thì tự chốt.',
        input: z.object({}),
        run: async () => bot('/api/postiz/live'),
      }),

      zalo_nhom: hubTool({
        id: 'zalo_nhom',
        title: 'Nhóm Zalo của tài khoản bot',
        level: 'doc',
        openWorld: true,
        description: 'Mọi nhóm Zalo tài khoản bot đang ở (threadId, tên, số thành viên).',
        input: z.object({ lam_moi: z.boolean().default(false) }),
        run: async (input) =>
          bot(`/api/postiz/groups${input.lam_moi ? '?force=1' : ''}`),
      }),

      zalo_ban_be: hubTool({
        id: 'zalo_ban_be',
        title: 'Danh bạ bạn bè của bot',
        level: 'doc',
        openWorld: true,
        description: 'Bạn bè của tài khoản bot (threadId, tên) — để chọn người nhận tin.',
        input: z.object({}),
        run: async () => bot('/api/postiz/contacts'),
      }),

      zalo_nhat_ky: hubTool({
        id: 'zalo_nhat_ky',
        title: 'Nhật ký bot Zalo',
        level: 'doc',
        description: 'Nhật ký gần đây của bot (mới → cũ): gom, đẩy, đăng, lỗi.',
        input: z.object({ so_dong: z.number().int().min(1).max(80).default(40) }),
        run: async (input) =>
          ((await bot('/api/postiz/logs')) as any[])
            .slice(0, input.so_dong)
            .map((l) => ({
              luc: l.t ? new Date(l.t).toISOString() : undefined,
              dong: l.line,
            })),
      }),

      zalo_video_trang_thai: hubTool({
        id: 'zalo_video_trang_thai',
        title: 'Trạng thái Zalo Video',
        level: 'doc',
        description:
          'Phiên đăng nhập Zalo Video của bot còn sống không, việc đăng gần đây. Muốn đăng video: tạo bài trên Lịch cho kênh Zalo Video bằng hub_bai_tao.',
        input: z.object({}),
        run: async () => bot('/api/zalovideo/status'),
      }),

      zalo_bai_sua: hubTool({
        id: 'zalo_bai_sua',
        title: 'Sửa caption bài chờ duyệt',
        level: 'nhap',
        description: 'Sửa caption và/hoặc chú thích từng ảnh của một bài trong hàng chờ bot.',
        input: z.object({
          id,
          caption: z.string().optional(),
          chu_thich_anh: z.array(z.string()).optional(),
        }),
        run: async (input) => {
          if (input.caption == null && !input.chu_thich_anh) {
            throw new HubToolError('Truyền caption hoặc chu_thich_anh.');
          }
          const d = await bot(`/api/postiz/pending/${encodeURIComponent(input.id)}/save`, {
            method: 'POST',
            body: {
              ...(input.caption != null ? { caption: input.caption } : {}),
              ...(input.chu_thich_anh ? { imageCaptions: input.chu_thich_anh } : {}),
            },
          });
          return { ok: true, caption: d?.caption };
        },
      }),

      zalo_bai_viet_lai_ai: hubTool({
        id: 'zalo_bai_viet_lai_ai',
        title: 'AI viết lại caption (xem trước)',
        level: 'nhap',
        openWorld: true,
        description:
          'AI của bot viết lại caption theo văn mẫu của nhóm. CHỈ trả bản xem trước — muốn dùng thì gọi zalo_bai_sua với caption mới.',
        input: z.object({
          id,
          caption: z.string().optional().describe('Bỏ trống = caption hiện tại'),
        }),
        run: async (input) =>
          bot(
            `/api/postiz/pending/${encodeURIComponent(input.id)}/rewrite`,
            { method: 'POST', body: input.caption != null ? { caption: input.caption } : {} },
            120_000
          ),
      }),

      zalo_bai_tai_lai_chan_bai: hubTool({
        id: 'zalo_bai_tai_lai_chan_bai',
        title: 'Áp lại chân bài mới nhất',
        level: 'nhap',
        description: 'Thay chân bài trong caption bằng chân bài mới nhất đã cài cho nhóm.',
        input: z.object({ id }),
        run: async (input) => {
          const d = await bot(
            `/api/pending/${encodeURIComponent(input.id)}/reload-footer`,
            { method: 'POST', body: {} }
          );
          return { ok: true, caption: d?.caption };
        },
      }),

      zalo_bai_day_sang_hub: hubTool({
        id: 'zalo_bai_day_sang_hub',
        title: 'Đẩy bài sang Lịch Hub (nháp)',
        level: 'nhap',
        description:
          'Đẩy một bài trong hàng chờ bot sang Lịch Media Hub thành BẢN NHÁP (kèm toàn bộ ảnh/video) để soạn & đăng đa kênh ở Hub.',
        input: z.object({ id }),
        run: async (input) =>
          bot(
            `/api/postiz/pending/${encodeURIComponent(input.id)}/push-hub`,
            { method: 'POST', body: {} },
            180_000
          ),
      }),

      zalo_chot_phien: hubTool({
        id: 'zalo_chot_phien',
        title: 'Chốt phiên gom ngay',
        level: 'nhap',
        description:
          'Chốt ngay phiên gom ảnh đang chạy của một nhóm (không chờ hết thời gian im lặng) → bot xử lý thành bài.',
        input: z.object({ threadId: z.string().describe('threadId nhóm (zalo_dang_gom)') }),
        run: async (input) =>
          bot('/api/postiz/live/close', {
            method: 'POST',
            body: { threadId: input.threadId },
          }),
      }),

      zalo_bai_huy_hen: hubTool({
        id: 'zalo_bai_huy_hen',
        title: 'Huỷ hẹn giờ đăng',
        level: 'nhap',
        description: 'Huỷ hẹn giờ đăng Facebook của một bài trong hàng chờ (bài vẫn chờ duyệt).',
        input: z.object({ id }),
        run: async (input) => {
          await bot(`/api/pending/${encodeURIComponent(input.id)}/unschedule`, {
            method: 'POST',
            body: {},
          });
          return { ok: true };
        },
      }),

      zalo_bai_duyet_facebook: hubTool({
        id: 'zalo_bai_duyet_facebook',
        title: 'Duyệt đăng Facebook',
        level: 'dang',
        openWorld: true,
        description:
          'ĐĂNG THẬT bài trong hàng chờ lên Fanpage gắn với nhóm. cong_khai=false: chỉ lưu thành bài nháp trên Facebook (chưa ai thấy).',
        input: z.object({ id, cong_khai: z.boolean().default(true) }),
        run: async (input) =>
          bot(
            `/api/postiz/pending/${encodeURIComponent(input.id)}/approve`,
            { method: 'POST', body: { published: input.cong_khai } },
            180_000
          ),
      }),

      zalo_bai_duyet_google: hubTool({
        id: 'zalo_bai_duyet_google',
        title: 'Duyệt đăng Google Business',
        level: 'dang',
        openWorld: true,
        description: 'ĐĂNG THẬT bài lên các hồ sơ Google Business gắn với nhóm.',
        input: z.object({ id }),
        run: async (input) =>
          bot(
            `/api/pending/${encodeURIComponent(input.id)}/approve/gbp`,
            { method: 'POST', body: {} },
            180_000
          ),
      }),

      zalo_bai_hen_gio: hubTool({
        id: 'zalo_bai_hen_gio',
        title: 'Hẹn giờ đăng Facebook',
        level: 'dang',
        description:
          'Hẹn giờ bot TỰ ĐĂNG bài lên Fanpage. cong_khai=false: tới giờ chỉ lưu nháp Facebook.',
        input: z.object({
          id,
          gio_dang: z.string().describe('ISO 8601, phải ở tương lai'),
          cong_khai: z.boolean().default(true),
        }),
        run: async (input) => {
          const at = dayjs(input.gio_dang);
          if (!at.isValid()) throw new HubToolError('Giờ không hợp lệ.');
          await bot(`/api/pending/${encodeURIComponent(input.id)}/schedule`, {
            method: 'POST',
            body: { at: at.valueOf(), published: input.cong_khai },
          });
          return { ok: true, gio_dang: at.toISOString() };
        },
      }),

      zalo_da_dang_cong_khai: hubTool({
        id: 'zalo_da_dang_cong_khai',
        title: 'Công khai bài nháp Facebook',
        level: 'dang',
        openWorld: true,
        description:
          'Chuyển một bài bot đã đăng dạng NHÁP Facebook (zalo_da_dang, cong_khai=false) thành công khai.',
        input: z.object({ id: z.string().describe('id trong zalo_da_dang') }),
        run: async (input) =>
          bot(
            `/api/posted/${encodeURIComponent(input.id)}/publish`,
            { method: 'POST', body: {} },
            120_000
          ),
      }),

      zalo_bai_bo_kenh: hubTool({
        id: 'zalo_bai_bo_kenh',
        title: 'Bỏ một kênh của bài',
        level: 'dang',
        description:
          'Không đăng bài này lên một kênh (facebook hoặc gbp) — kênh còn lại vẫn chờ duyệt.',
        input: z.object({ id, kenh: z.enum(['facebook', 'gbp']) }),
        run: async (input) =>
          bot(
            `/api/pending/${encodeURIComponent(input.id)}/reject/${input.kenh}`,
            { method: 'POST', body: {} }
          ),
      }),

      zalo_bai_bo: hubTool({
        id: 'zalo_bai_bo',
        title: 'Bỏ bài khỏi hàng chờ',
        level: 'dang',
        destructive: true,
        description:
          'Bỏ hẳn một bài khỏi hàng chờ bot (xoá cả ảnh đã gom). Bản nháp đã đẩy sang Lịch Hub không bị xoá.',
        input: z.object({ id }),
        run: async (input) =>
          bot(`/api/postiz/pending/${encodeURIComponent(input.id)}/reject`, {
            method: 'POST',
            body: {},
          }),
      }),

      zalo_tam_dung: hubTool({
        id: 'zalo_tam_dung',
        title: 'Tạm dừng / chạy lại bot',
        level: 'dang',
        description:
          'Tạm dừng bot (không gom bài mới từ nhóm) hoặc cho chạy lại.',
        input: z.object({ tam_dung: z.boolean() }),
        run: async (input) =>
          bot('/api/postiz/settings', {
            method: 'POST',
            body: { paused: input.tam_dung },
          }),
      }),

      zalo_nhom_cau_hinh: hubTool({
        id: 'zalo_nhom_cau_hinh',
        title: 'Bật/tắt nghe nhóm, đổi kênh đích',
        level: 'dang',
        description:
          'Bật/tắt nghe một nhóm Zalo, hoặc đổi kênh Media Hub nhận bài của nhóm (kenh = "" → kênh mặc định). Nhóm chưa cài thì được tạo mới.',
        input: z.object({
          threadId: z.string(),
          ten: z.string().optional(),
          dang_nghe: z.boolean().optional(),
          kenh: z.string().optional().describe('id kênh Media Hub, "" = mặc định'),
        }),
        run: async (input) => {
          if (input.dang_nghe === undefined && input.kenh === undefined) {
            throw new HubToolError('Truyền dang_nghe hoặc kenh.');
          }
          return bot('/api/postiz/routes', {
            method: 'POST',
            body: {
              threadId: input.threadId,
              name: input.ten,
              ...(input.dang_nghe !== undefined ? { enabled: input.dang_nghe } : {}),
              ...(input.kenh !== undefined ? { integrationId: input.kenh } : {}),
            },
          });
        },
      }),

      zalo_gui_tin: hubTool({
        id: 'zalo_gui_tin',
        title: 'Gửi tin nhắn Zalo',
        level: 'dang',
        openWorld: true,
        description:
          'GỬI THẬT một tin nhắn văn bản từ tài khoản bot tới một nhóm hoặc một người (bạn bè). Tin dài tự chia nhiều phần.',
        input: z.object({
          threadId: z.string().describe('threadId nhóm (zalo_nhom) hoặc người (zalo_ban_be)'),
          noi_dung: z.string().min(1).max(20000),
          loai: z.enum(['group', 'user']).default('group'),
        }),
        run: async (input) =>
          bot(
            '/api/postiz/send',
            {
              method: 'POST',
              body: {
                threadId: input.threadId,
                text: input.noi_dung,
                threadType: input.loai,
              },
            },
            120_000
          ),
      }),
    };
  }
}
