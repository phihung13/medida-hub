// ============================================================================
// 8 chân dung khách hàng (persona) + rubric chấm điểm nội dung — chuyển thể
// từ luồng n8n "WF-Crawll-Duyet" (trước hiển thị ở Telegram, nay hiển thị web).
// Nguồn sự thật: file export n8n của trường; sửa ở đây khi chân dung thay đổi.
// ============================================================================

export interface ViralPersona {
  code: string;
  label: string;
  profile: string;
}

export const VIRAL_PERSONAS: ViralPersona[] = [
  {
    code: 'MN-HCM',
    label: 'Phụ huynh Mầm non TP.HCM',
    profile:
      'Con 2-5 tuổi học nhà trẻ/mẫu giáo tại TP.HCM. Quan tâm: ăn-ngủ, tập tự lập, an toàn, lần đầu xa mẹ, chuẩn bị vào lớp 1. Tâm lý: lo lắng, cần sự an tâm, thích hình ảnh con vui vẻ.',
  },
  {
    code: 'MN-CG',
    label: 'Phụ huynh Mầm non Cần Giuộc (Long An)',
    profile:
      'Con mầm non tại cơ sở MN Nhân Lễ, Cần Giuộc. Chỉ chọn nhóm này khi nội dung gắn yếu tố địa phương/ngoại thành; còn lại mặc định nhóm HCM.',
  },
  {
    code: 'MN-RG',
    label: 'Phụ huynh Mầm non Rạch Giá (Kiên Giang)',
    profile:
      'Con mầm non tại trường Quốc tế Mekong Xanh, Rạch Giá. Chỉ chọn khi nội dung gắn địa phương miền Tây; còn lại mặc định nhóm HCM.',
  },
  {
    code: 'TH-HCM',
    label: 'Phụ huynh Tiểu học TP.HCM',
    profile:
      'Con lớp 1-5 tại TP.HCM. Quan tâm: vào lớp 1, tập đọc-viết-toán, tiếng Anh tiểu học, con vui khi học, thói quen tự học. Tâm lý: muốn con nền tảng tốt mà không áp lực.',
  },
  {
    code: 'TH-CG',
    label: 'Phụ huynh Tiểu học Cần Giuộc (Long An)',
    profile:
      'Con tiểu học tại trường liên cấp Nhân Văn, Cần Giuộc. Chỉ chọn khi nội dung gắn địa phương; còn lại mặc định nhóm HCM.',
  },
  {
    code: 'TH-RG',
    label: 'Phụ huynh Tiểu học Rạch Giá (Kiên Giang)',
    profile:
      'Con tiểu học tại Rạch Giá. Chỉ chọn khi nội dung gắn địa phương miền Tây; còn lại mặc định nhóm HCM.',
  },
  {
    code: 'THCS-HCM',
    label: 'Phụ huynh THCS TP.HCM',
    profile:
      'Con lớp 6-9. Quan tâm: dậy thì, điện thoại/game, bạn bè, ôn thi vào lớp 10, tâm lý tuổi mới lớn. Tâm lý: sợ mất kết nối với con, cần lời khuyên thực dụng.',
  },
  {
    code: 'THPT-HCM',
    label: 'Phụ huynh THPT TP.HCM',
    profile:
      'Con lớp 10-12. Quan tâm: hướng nghiệp, đại học/du học, IELTS, áp lực thi cử, sức khoẻ tinh thần. Tâm lý: đầu tư mạnh cho tương lai con.',
  },
];

// Rubric 100 điểm — giữ nguyên tiêu chí + trọng số của luồng n8n.
export const VIRAL_RUBRIC = `RUBRIC CHẤM (tổng 100):
- Hook 3 giây (20): mở đầu có níu người đọc dừng lại không
- Clarity (15): rõ ràng, dễ hiểu, một thông điệp chính
- Brand Voice (15): đúng giọng "Vui Vẻ & Thực Dụng" của Trường Việt Anh
- Value/Insight (20): phụ huynh đọc xong được gì (mẹo, góc nhìn, dữ kiện)
- CTA (15): có lời kêu gọi tự nhiên (tham quan / inbox / để lại SĐT...)
- SEO/Hashtag (15): có 4-6 hashtag đúng chủ đề + từ khoá tìm kiếm
Chấm BẢN VIẾT LẠI (không chấm bài gốc). Chấm rộng rãi: bản viết tốt, đúng brand, đủ hook+CTA+hashtag → 90-100; ổn còn 1 điểm nhỏ → 80-89; tạm/ý tưởng gốc yếu → 60-79; dưới 50 chỉ khi nội dung thật sự không liên quan giáo dục/phụ huynh hoặc không thể tận dụng.`;

// Ngưỡng trạng thái: mặc định >=90 tự duyệt, <50 bỏ qua; caller truyền ngưỡng
// từ Cài đặt (autoApproveMin / autoSkipMax) để chỉnh được không cần deploy.
export const viralStatusForScore = (
  score: number | null | undefined,
  opts?: { approveMin?: number; skipMax?: number }
): 'approved' | 'pending' | 'skipped' => {
  if (typeof score !== 'number') return 'pending';
  if (score >= (opts?.approveMin ?? 90)) return 'approved';
  if (score < (opts?.skipMax ?? 50)) return 'skipped';
  return 'pending';
};
