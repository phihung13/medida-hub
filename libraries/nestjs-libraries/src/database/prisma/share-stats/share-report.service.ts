import { Injectable } from '@nestjs/common';
import {
  SharePostRow,
  ShareReportRepository,
} from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-report.repository';

// ============================================================================
//  Báo cáo tuần theo đặc tả v2 "ưu tiên share" (gửi anh Dương chiều thứ Sáu):
//   - top 5 / bottom 5 bài theo tỷ lệ share (kèm điểm dự báo)
//   - tỷ lệ share theo định dạng, theo kênh, theo góc kể Bot Zalo
//   - tỷ lệ bài qua ngưỡng rubric (Trao giá trị ≥ 90, Bot Zalo ≥ 80)
//   - Qlead từ nội dung tự nhiên (chờ nối Pancake)
//   - thời gian chờ duyệt trung vị
//  Tỷ lệ share = share ÷ reach, chỉ tính bài đã đo (measuredAt có giá trị).
//  Tỷ lệ theo nhóm = tổng share ÷ tổng reach (không lấy trung bình các tỷ lệ).
// ============================================================================

const THRESHOLD: Record<string, number> = { GT: 90, UGC: 80 };
const GOC_TEN: Record<string, string> = {
  A: 'Khoảnh khắc nhỏ',
  B: 'Trước – sau',
  C: 'Một câu nói',
  D: 'Vì sao làm hoạt động này',
  E: 'Nhìn từ chỗ ngồi của con',
};

const pct = (x: number | null) =>
  x == null ? null : Math.round(x * 10000) / 100;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

@Injectable()
export class ShareReportService {
  constructor(private _repo: ShareReportRepository) {}

  /** tu/den ISO (tuỳ chọn) → khoảng; mặc định 7 ngày gần nhất, tối đa 31. */
  range(tu?: string, den?: string) {
    const to = den && Number.isFinite(Date.parse(den)) ? new Date(den) : new Date();
    let from =
      tu && Number.isFinite(Date.parse(tu))
        ? new Date(tu)
        : new Date(to.getTime() - 7 * 24 * 3600_000);
    if (from >= to) from = new Date(to.getTime() - 7 * 24 * 3600_000);
    if (to.getTime() - from.getTime() > 31 * 24 * 3600_000)
      from = new Date(to.getTime() - 31 * 24 * 3600_000);
    return { from, to };
  }

  async weekly(orgId: string, from: Date, to: Date) {
    const [posts, scored] = await Promise.all([
      this._repo.publishedInRange(orgId, from, to),
      this._repo.scoredInRange(orgId, from, to),
    ]);

    const measured = posts.filter(
      (p) => p.measuredAt && p.reach && p.reach > 0 && p.shares != null
    );
    const rate = (p: SharePostRow) => (p.shares || 0) / (p.reach || 1);
    const view = (p: SharePostRow) => ({
      bai_id: p.postId,
      kenh: p.kenh,
      ten_kenh: p.ten_kenh,
      dang_luc: p.publishDate,
      trich: p.noi_dung,
      link: p.link,
      dinh_dang: p.format || p.loai,
      goc_ke: p.goc,
      reach: p.reach,
      share: p.shares,
      binh_luan: p.comments,
      ty_le_share_phan_tram: pct(rate(p)),
      diem_du_bao: p.forecastScore,
    });
    const sorted = [...measured].sort((a, b) => rate(b) - rate(a));

    const groupBy = (keyOf: (p: SharePostRow) => string | null) => {
      const g = new Map<string, { bai: number; reach: number; share: number }>();
      for (const p of measured) {
        const k = keyOf(p);
        if (!k) continue;
        const v = g.get(k) || { bai: 0, reach: 0, share: 0 };
        v.bai++;
        v.reach += p.reach || 0;
        v.share += p.shares || 0;
        g.set(k, v);
      }
      return [...g.entries()]
        .map(([k, v]) => ({
          nhom: k,
          so_bai: v.bai,
          reach: v.reach,
          share: v.share,
          ty_le_share_phan_tram: pct(v.reach ? v.share / v.reach : null),
        }))
        .sort((a, b) => (b.ty_le_share_phan_tram || 0) - (a.ty_le_share_phan_tram || 0));
    };

    const pass = (type: string) => {
      const list = scored.filter((s) => (s.rubricType || '') === type);
      const ok = list.filter((s) =>
        s.verdict
          ? s.verdict === 'đăng'
          : (s.forecastScore || 0) >= THRESHOLD[type]
      );
      return {
        nguong: THRESHOLD[type],
        so_bai_cham: list.length,
        so_qua_nguong: ok.length,
        ty_le_qua_nguong_phan_tram: list.length
          ? Math.round((ok.length * 10000) / list.length) / 100
          : null,
      };
    };

    // Chờ duyệt: chưa có nhật ký lúc bấm duyệt, nên lấy xấp xỉ từ lúc agent
    // làm ra nháp đến lúc đăng — chỉ bài do agent làm ra (người tự soạn không
    // qua hàng chờ).
    const waits = posts
      .filter((p) => p.agent && p.agent !== 'thu-cong')
      .map((p) => (p.publishDate.getTime() - p.createdAt.getTime()) / 3600_000)
      .filter((h) => h >= 0);
    const med = median(waits);

    return {
      tu: from.toISOString(),
      den: to.toISOString(),
      so_bai_da_dang: posts.length,
      so_bai_da_do_share: measured.length,
      ghi_chu_do:
        'Tỷ lệ share = share ÷ reach, đo sau 72 giờ. Bài đăng chưa đủ 72 giờ hoặc chưa đo không vào top/bottom.',
      top_5: sorted.slice(0, 5).map(view),
      bottom_5: sorted.slice(-5).reverse().map(view),
      theo_dinh_dang: groupBy((p) => p.format || p.loai),
      theo_kenh: groupBy((p) => p.kenh),
      theo_goc_ke_bot_zalo: groupBy((p) =>
        p.agent === 'zalo-bot' && p.goc ? `${p.goc} — ${GOC_TEN[p.goc] || p.goc}` : null
      ),
      qua_nguong: { trao_gia_tri: pass('GT'), bot_zalo: pass('UGC') },
      qlead_tu_noi_dung_tu_nhien: null as number | null,
      ghi_chu_qlead: 'Chờ nối Pancake (UTM → Qlead).',
      cho_duyet_trung_vi_gio: med == null ? null : Math.round(med * 10) / 10,
      ghi_chu_cho_duyet:
        'Xấp xỉ: từ lúc agent làm ra nháp đến lúc đăng (Hub chưa ghi lúc bấm duyệt). Chỉ tính bài do agent làm ra.',
      so_bai_tinh_cho_duyet: waits.length,
    };
  }
}
