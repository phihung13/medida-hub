import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { ShareStatsService } from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-stats.service';
import {
  HubToolGroup,
  HubToolMap,
  htmlToText,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Tỷ lệ share" (đặc tả v2, 15/10/2026): thước đo chính là
//  TỶ LỆ SHARE = share ÷ reach, đo sau 72 giờ, nằm cạnh ĐIỂM DỰ BÁO của người
//  chấm độc lập — để xếp top/bottom bài và đối chiếu rubric mỗi tháng.
// ============================================================================

@Injectable()
export class HubShareTools implements HubToolGroup {
  constructor(
    private _posts: PostsService,
    private _stats: ShareStatsService
  ) {}

  tools(): HubToolMap {
    return {
      hub_ty_le_share: hubTool({
        id: 'hub_ty_le_share',
        title: 'Tỷ lệ share và điểm dự báo từng bài',
        level: 'doc',
        description:
          'Liệt kê bài trong khoảng ngày (theo ngày tạo) kèm điểm dự báo rubric, kết luận, góc kể Bot Zalo, định dạng, reach, share, bình luận, lượt lưu (chỉ Instagram), lượt bấm link của trường (qua link chuyển hướng của Hub), lượt chia sẻ vào nhóm Zalo (Bot Zalo thấy link bài) và TỶ LỆ SHARE = share ÷ reach (đo sau 72 giờ; chưa đo = null). Sắp theo tỷ lệ share giảm dần; bài chưa đo xếp cuối.',
        input: z.object({
          tu_ngay: z.string().optional().describe('YYYY-MM-DD, mặc định 30 ngày trước'),
          den_ngay: z.string().optional().describe('YYYY-MM-DD, mặc định hôm nay'),
          chi_da_do: z.boolean().optional().describe('true = chỉ bài đã có số liệu share'),
          gioi_han: z.number().int().min(1).max(200).optional().describe('mặc định 50'),
        }),
        run: async (input, org) => {
          const to = input.den_ngay
            ? dayjs(input.den_ngay).endOf('day')
            : dayjs().endOf('day');
          const from = input.tu_ngay
            ? dayjs(input.tu_ngay).startOf('day')
            : to.subtract(30, 'day').startOf('day');
          let rows = await this._stats.listRange(
            org.id,
            from.toDate(),
            to.toDate()
          );
          if (input.chi_da_do) rows = rows.filter((r) => r.measuredAt);
          rows.sort(
            (a, b) => (b.shareRate ?? -1) - (a.shareRate ?? -1)
          );
          rows = rows.slice(0, input.gioi_han || 50);
          const brief = await this._posts.getPostsBrief(
            org.id,
            rows.map((r) => r.postId)
          );
          const byId = new Map(brief.map((p) => [p.id, p]));
          return {
            tu: from.format('YYYY-MM-DD'),
            den: to.format('YYYY-MM-DD'),
            so_bai: rows.length,
            bai: rows.map((r) => {
              const p = byId.get(r.postId);
              return {
                id: r.postId,
                kenh: p?.integration?.name,
                nen_tang: p?.integration?.providerIdentifier,
                ngay_dang: p?.publishDate
                  ? dayjs(p.publishDate).format('YYYY-MM-DD HH:mm')
                  : undefined,
                link: p?.releaseURL || undefined,
                trich: p ? htmlToText(p.content).slice(0, 160) : undefined,
                agent: r.agent || undefined,
                dinh_dang: r.format || undefined,
                loai_rubric: r.rubricType || undefined,
                diem_du_bao: r.forecastScore ?? null,
                ket_luan: r.verdict || undefined,
                goc_ke: r.goc || undefined,
                reach: r.reach ?? null,
                share: r.shares ?? null,
                binh_luan: r.comments ?? null,
                reaction: r.reactions ?? null,
                luu: r.saves ?? null,
                luot_bam_link: r.linkClicks ?? 0,
                luot_chia_se_vao_nhom_zalo: r.zaloShares ?? 0,
                ty_le_share:
                  r.shareRate != null
                    ? Math.round(r.shareRate * 10000) / 100 + '%'
                    : null,
                do_luc: r.measuredAt
                  ? dayjs(r.measuredAt).format('YYYY-MM-DD HH:mm')
                  : null,
                utm_campaign: r.utmCampaign || undefined,
              };
            }),
          };
        },
      }),
    };
  }
}
