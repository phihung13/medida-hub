import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ShareReportService } from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-report.service';
import { UsageService } from '@gitroom/nestjs-libraries/database/prisma/usage/usage.service';
import {
  HubToolGroup,
  HubToolMap,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Báo cáo tuần "ưu tiên share" (đặc tả v2) + đánh dấu blog đã lên website
//  (cột "đã đăng lên web" tách khỏi "sản xuất xong" trong báo cáo nội dung).
// ============================================================================

@Injectable()
export class HubReportTools implements HubToolGroup {
  constructor(
    private _report: ShareReportService,
    private _usage: UsageService
  ) {}

  tools(): HubToolMap {
    return {
      hub_bao_cao_tuan_share: hubTool({
        id: 'hub_bao_cao_tuan_share',
        title: 'Báo cáo tuần theo tỷ lệ share',
        level: 'doc',
        description:
          'Báo cáo tuần gửi anh Dương: top 5 / bottom 5 bài theo TỶ LỆ SHARE (share ÷ reach, đo sau 72 giờ) kèm điểm dự báo; tỷ lệ share theo định dạng, theo kênh, theo góc kể Bot Zalo (tổng share ÷ tổng reach); tỷ lệ bài qua ngưỡng rubric (Trao giá trị ≥ 90, Bot Zalo ≥ 80); Qlead (chờ nối Pancake); thời gian chờ duyệt trung vị (giờ, xấp xỉ). Mặc định 7 ngày gần nhất theo ngày đăng.',
        input: z.object({
          tu: z
            .string()
            .optional()
            .describe('Giờ ISO có múi giờ, vd 2026-10-17T00:00:00+07:00. Mặc định 7 ngày trước'),
          den: z.string().optional().describe('Giờ ISO, mặc định bây giờ'),
        }),
        run: async (input, org) => {
          const { from, to } = this._report.range(input.tu, input.den);
          return this._report.weekly(org.id, from, to);
        },
      }),

      hub_blog_da_len_web: hubTool({
        id: 'hub_blog_da_len_web',
        title: 'Đánh dấu blog đã đăng lên website',
        level: 'nhap',
        description:
          'Ghi link bài blog (sản phẩm Sản xuất → Blog) đã đăng lên website. Báo cáo nội dung tách "sản xuất xong" và "đã lên web" theo dấu này. Lấy id blog từ hub_viral_san_pham.',
        input: z.object({
          blog_id: z.string().describe('id sản phẩm blog'),
          url: z.string().describe('Link bài trên website, bắt đầu bằng https://'),
        }),
        run: async (input, org) =>
          this._usage.markBlogOnWeb(org.id, input.blog_id, input.url),
      }),
    };
  }
}
