import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import {
  HubToolError,
  HubToolGroup,
  HubToolMap,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Số liệu & Media": số liệu kênh, bài nổi bật, AI phân tích kênh,
//  thư viện media, AI viết caption từ ảnh, AI viết tiêu đề/mô tả YouTube.
//  (Tải media từ link: uploadFromUrlTool; tạo ảnh/video AI: generateImageTool,
//  generateVideoTool — công cụ gốc, đã có sẵn trong cùng máy chủ MCP.)
// ============================================================================

const days = z
  .number()
  .int()
  .min(7)
  .max(90)
  .default(30)
  .describe('Số ngày gần nhất (7 / 30 / 90)');

@Injectable()
export class HubInsightsTools implements HubToolGroup {
  constructor(
    private _integrationService: IntegrationService,
    private _mediaService: MediaService
  ) {}

  tools(): HubToolMap {
    return {
      hub_so_lieu_tong_quan: hubTool({
        id: 'hub_so_lieu_tong_quan',
        title: 'Số liệu tổng quan mọi kênh',
        level: 'doc',
        openWorld: true,
        description:
          'Tổng quan số liệu (lượt xem, tương tác, người theo dõi…) của mọi kênh mạng xã hội đang bật trong N ngày.',
        input: z.object({ so_ngay: days }),
        run: async (input, org) =>
          this._integrationService.getAnalyticsOverview(
            org,
            String(input.so_ngay)
          ),
      }),

      hub_so_lieu_kenh: hubTool({
        id: 'hub_so_lieu_kenh',
        title: 'Số liệu một kênh',
        level: 'doc',
        openWorld: true,
        description: 'Số liệu theo ngày của một kênh trong N ngày.',
        input: z.object({ kenh: z.string(), so_ngay: days }),
        run: async (input, org) =>
          this._integrationService.checkAnalytics(
            org,
            input.kenh,
            String(input.so_ngay)
          ),
      }),

      hub_bai_noi_bat: hubTool({
        id: 'hub_bai_noi_bat',
        title: 'Bài nổi bật của kênh',
        level: 'doc',
        openWorld: true,
        description:
          'Bài có tương tác cao nhất của kênh trong N ngày (kể cả bài đăng ngoài Hub). Kênh YouTube: kèm top video.',
        input: z.object({ kenh: z.string(), so_ngay: days }),
        run: async (input, org) => {
          const integration = await this._integrationService.getIntegrationById(
            org.id,
            input.kenh
          );
          if (!integration) throw new HubToolError('Không tìm thấy kênh.');
          const posts = await this._integrationService.getTopPosts(
            org,
            input.kenh,
            input.so_ngay
          );
          const videos = integration.providerIdentifier.startsWith('youtube')
            ? await this._integrationService
                .getTopVideos(org, input.kenh, input.so_ngay)
                .catch(() => null)
            : undefined;
          return { bai: posts, video: videos };
        },
      }),

      hub_phan_tich_kenh: hubTool({
        id: 'hub_phan_tich_kenh',
        title: 'AI phân tích bài thắng của kênh',
        level: 'nhap',
        openWorld: true,
        description:
          'AI đọc các bài nổi bật của kênh, rút ra vì sao thắng và gợi ý hướng content tiếp theo (tốn lượt AI).',
        input: z.object({ kenh: z.string() }),
        run: async (input, org) => {
          const res = await this._integrationService.getWinningAnalysis(
            org,
            input.kenh
          );
          if (!res) throw new HubToolError('Không tìm thấy kênh.');
          return res;
        },
      }),

      hub_hoi_ve_kenh: hubTool({
        id: 'hub_hoi_ve_kenh',
        title: 'Hỏi AI về một kênh',
        level: 'nhap',
        openWorld: true,
        description:
          'Hỏi trợ lý phân tích của Hub một câu về kênh (vd "giờ nào đăng tốt nhất?"). Trợ lý đọc số liệu thật của kênh để trả lời.',
        input: z.object({
          kenh: z.string(),
          cau_hoi: z.string().min(1).max(2000),
        }),
        run: async (input, org) =>
          this._integrationService.askAboutChannel(
            org,
            input.kenh,
            input.cau_hoi,
            []
          ),
      }),

      hub_media_danh_sach: hubTool({
        id: 'hub_media_danh_sach',
        title: 'Thư viện media',
        level: 'doc',
        description:
          'Ảnh/video trong thư viện Hub (mới nhất trước). Dùng path làm media khi tạo/sửa bài.',
        input: z.object({
          trang: z.number().int().min(1).default(1),
          tim: z.string().optional().describe('Tìm theo tên file'),
        }),
        run: async (input, org) => {
          const res: any = await this._mediaService.getMedia(
            org.id,
            input.trang,
            input.tim
          );
          return {
            so_trang: res?.pages,
            media: (res?.results || []).map((m: any) => ({
              id: m.id,
              ten: m.name,
              path: m.path,
              thumbnail: m.thumbnail || undefined,
              alt: m.alt || undefined,
            })),
          };
        },
      }),

      hub_media_xoa: hubTool({
        id: 'hub_media_xoa',
        title: 'Xoá media khỏi thư viện',
        level: 'dang',
        destructive: true,
        description:
          'Xoá một ảnh/video khỏi thư viện Hub (bài đã dùng media này vẫn giữ link).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          await this._mediaService.deleteMedia(org.id, input.id);
          return { ok: true };
        },
      }),

      hub_ai_caption: hubTool({
        id: 'hub_ai_caption',
        title: 'AI viết caption từ ảnh',
        level: 'nhap',
        openWorld: true,
        description:
          '"Bút phép thuật": AI nhìn các ảnh trong thư viện và viết caption cho bài + chú thích từng ảnh. Không tự lưu — dùng kết quả để tạo/sửa bài.',
        input: z.object({
          media_ids: z.array(z.string()).min(1).max(20),
          y_chinh: z
            .string()
            .optional()
            .describe('Ý người đăng / bản nháp đang có để AI bám theo'),
        }),
        run: async (input, org) =>
          this._mediaService.generateAiCaptions(org, {
            mediaIds: input.media_ids,
            context: input.y_chinh,
          }),
      }),

      hub_ai_youtube: hubTool({
        id: 'hub_ai_youtube',
        title: 'AI viết tiêu đề & mô tả YouTube',
        level: 'nhap',
        openWorld: true,
        description:
          'Gemini xem video (đường dẫn video trong thư viện Hub) rồi viết tiêu đề + mô tả YouTube. Không tự lưu.',
        input: z.object({
          video_path: z.string().describe('path của video trong thư viện Hub'),
          y_chinh: z.string().optional(),
        }),
        run: async (input, org) =>
          this._mediaService.generateYoutubeContent(org, {
            engine: 'gemini',
            videoPath: input.video_path,
            context: input.y_chinh,
          }),
      }),
    };
  }
}
