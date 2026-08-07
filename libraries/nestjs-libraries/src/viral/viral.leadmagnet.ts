// ============================================================================
//  LEAD MAGNET — "mồi câu" đổi lấy SĐT/Zalo của phụ huynh, gợi ý kèm mỗi
//  content ở trang Phát hiện. AI chấm CẢ 5 loại (ebook/checklist/app/…) rồi xếp
//  hạng, đội nội dung nhìn phát biết nên làm cái nào cho content đó.
//
//  Lưu ở đâu: KHÔNG thêm cột DB — nhét vào JSON `scoreDetail` của ViralTopic /
//  ViralPost (khoá "lead_magnets"). Content chấm trước khi có tính năng này thì
//  thiếu khoá đó; bấm nút "Gợi ý mồi câu" trên thẻ để chấm bù (không chấm lại
//  điểm content).
// ============================================================================

export const LEAD_MAGNET_TYPES = [
  'ebook',
  'checklist',
  'app',
  'template',
  'quiz',
] as const;

export type LeadMagnetType = (typeof LEAD_MAGNET_TYPES)[number];

export interface ViralLeadMagnet {
  type: LeadMagnetType;
  score: number; // 0-100 — độ NÊN LÀM mồi này cho content đó
  title: string; // tên tài nguyên cụ thể
  why: string; // 1 câu lý do điểm cao/thấp
  effort?: string; // thấp | trung bình | cao
  outline?: string[]; // chỉ loại đứng đầu mới có
  cta?: string; // câu mời để lại SĐT/Zalo (loại đứng đầu)
}

// AI hay gọi loại bằng tên tự nhiên ("mini app", "e-book", "biểu mẫu") thay vì
// đúng mã. Quy hết về 5 mã chuẩn — sai tên mà vứt cả bảng thì người dùng bấm
// nút chỉ thấy "chưa gợi ý được".
const TYPE_ALIASES: Record<string, string> = {
  'e-book': 'ebook',
  'e book': 'ebook',
  book: 'ebook',
  pdf: 'ebook',
  guide: 'ebook',
  'cẩm nang': 'ebook',
  'sách': 'ebook',
  'check list': 'checklist',
  'bảng kiểm': 'checklist',
  'danh sách': 'checklist',
  'mini app': 'app',
  miniapp: 'app',
  'mini-app': 'app',
  tool: 'app',
  'công cụ': 'app',
  calculator: 'app',
  webapp: 'app',
  'web app': 'app',
  'biểu mẫu': 'template',
  form: 'template',
  'mẫu': 'template',
  worksheet: 'template',
  test: 'quiz',
  'trắc nghiệm': 'quiz',
  'bài test': 'quiz',
  assessment: 'quiz',
};

const canonType = (raw: string) => {
  const k = raw.trim().toLowerCase().replace(/_/g, ' ');
  if ((LEAD_MAGNET_TYPES as readonly string[]).includes(k)) return k;
  return TYPE_ALIASES[k] || '';
};

const clampScore = (n: any) =>
  Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

const str = (v: any, max: number) => String(v ?? '').trim().slice(0, max);

// Chuẩn hoá thứ AI trả về: bỏ loại lạ, gộp trùng (giữ điểm cao hơn), cắt độ
// dài, xếp theo điểm giảm dần. Trả mảng rỗng nếu không có gì dùng được.
export const normalizeLeadMagnets = (raw: any): ViralLeadMagnet[] => {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const byType = new Map<string, ViralLeadMagnet>();
  for (const it of list) {
    const type = canonType(str(it?.type, 40));
    if (!type) continue;
    const item: ViralLeadMagnet = {
      type: type as LeadMagnetType,
      score: clampScore(it?.score),
      title: str(it?.title, 160),
      why: str(it?.why, 400),
      effort: str(it?.effort, 20) || undefined,
      outline: Array.isArray(it?.outline)
        ? it.outline
            .map((o: any) => str(o, 200))
            .filter(Boolean)
            .slice(0, 6)
        : undefined,
      cta: str(it?.cta, 300) || undefined,
    };
    const prev = byType.get(type);
    if (!prev || item.score > prev.score) byType.set(type, item);
  }
  return [...byType.values()].sort((a, b) => b.score - a.score);
};
