// ============================================================================
//  Bộ nguồn theo dõi MẶC ĐỊNH — port từ Google Sheet "Sources" của workflow
//  n8n WF-Crawll-Duyet (KOL giáo dục, trường đối thủ, group phụ huynh) + 10 từ
//  khoá Google News mặc định của node "🌐 Cào News".
//  Chỉ lấy dòng active=TRUE trong sheet. FB/TikTok cần token Apify mới cào được
//  (auto=false — user bật khi sẵn sàng); gnews cào FREE.
// ============================================================================

export interface DefaultSource {
  platform: string; // facebook | tiktok | gnews
  name: string;
  url?: string;
}

export const VIRAL_DEFAULT_SOURCES: DefaultSource[] = [
  // ── KOL giáo dục (Facebook) ──
  { platform: 'facebook', name: 'KOL · Nguyễn Phùng Phong', url: 'https://facebook.com/Hita.nguyenphungphong' },
  { platform: 'facebook', name: 'KOL · Nguyễn Thị Lanh', url: 'https://facebook.com/cogiaonguyenthilanh' },
  { platform: 'facebook', name: 'KOL · Trần Quốc Phúc', url: 'https://facebook.com/tranquocphuc.taovang' },
  { platform: 'facebook', name: 'KOL · Trần Việt Quân (Sách Tinh Hoa)', url: 'https://facebook.com/tvqsachtinhhoa' },
  { platform: 'facebook', name: 'KOL · Trần Việt Quân (Thầy)', url: 'https://facebook.com/thaytranvietquan' },
  // ── KOL giáo dục (TikTok) ──
  { platform: 'tiktok', name: 'KOL · Nguyễn Phùng Phong', url: 'https://www.tiktok.com/@nguyenphungphong' },
  { platform: 'tiktok', name: 'KOL · Nguyễn Thị Lanh', url: 'https://www.tiktok.com/@mrslanh' },
  { platform: 'tiktok', name: 'KOL · Trần Quốc Phúc', url: 'https://www.tiktok.com/@tranquocphuc.taovang' },
  { platform: 'tiktok', name: 'KOL · Trần Việt Quân', url: 'https://www.tiktok.com/@quantv_gnh' },
  // ── Trường đối thủ (Facebook) ──
  { platform: 'facebook', name: 'Đối thủ · Vinschool', url: 'https://facebook.com/vinschool.vn' },
  { platform: 'facebook', name: 'Đối thủ · VAS Việt Úc', url: 'https://facebook.com/TruongQuocTeVietUc.VAS' },
  { platform: 'facebook', name: 'Đối thủ · FPT School', url: 'https://facebook.com/fschool.fpt.edu.vn' },
  { platform: 'facebook', name: 'Đối thủ · Pathway Tuệ Đức', url: 'https://facebook.com/HethongtruongPathwayTueDuc' },
  { platform: 'facebook', name: 'Đối thủ · Á Châu IPS (Bắc Trung Học)', url: 'https://facebook.com/BacTrungHoc' },
  { platform: 'facebook', name: 'Đối thủ · Tiểu học Á Châu IPS', url: 'https://facebook.com/TieuHocQuocTeAChau.IPS' },
  { platform: 'facebook', name: 'Đối thủ · EMASI Vạn Phúc', url: 'https://facebook.com/EMASIVanPhuc' },
  { platform: 'facebook', name: 'Đối thủ · Ngô Thời Nhiệm', url: 'https://facebook.com/ngothoinhiem.truong' },
  { platform: 'facebook', name: 'Đối thủ · Ngô Thời Nhiệm THCS-THPT', url: 'https://facebook.com/tthngothoinhiem' },
  { platform: 'facebook', name: 'Đối thủ · Royal School', url: 'https://facebook.com/Royalschool.vn' },
  { platform: 'facebook', name: 'Đối thủ · Bamboo School', url: 'https://facebook.com/Bamboo.Schoolhcm' },
  // ── Trường đối thủ (TikTok) ──
  { platform: 'tiktok', name: 'Đối thủ · Vinschool', url: 'https://www.tiktok.com/@vinschool.edu.vn' },
  { platform: 'tiktok', name: 'Đối thủ · VAS', url: 'https://www.tiktok.com/@vas.school' },
  { platform: 'tiktok', name: 'Đối thủ · Pathway Tuệ Đức', url: 'https://www.tiktok.com/@pathwaytueduc' },
  { platform: 'tiktok', name: 'Đối thủ · Quốc tế Á Châu', url: 'https://www.tiktok.com/@truongquocteachau' },
  // ── Group phụ huynh (VOICE — lời phụ huynh thật) ──
  { platform: 'facebook', name: 'Group · Hội REVIEW Mẫu Giáo Mầm Non Nhà Trẻ TPHCM', url: 'https://www.facebook.com/groups/337428867135889' },
  { platform: 'facebook', name: 'Group · REVIEW Trường Mầm Non và Tiểu Học TPHCM', url: 'https://www.facebook.com/groups/reviewmamnonhochiminh' },
  { platform: 'facebook', name: 'Group · Hội Phụ Huynh Nuôi Dạy Con MN-TH', url: 'https://www.facebook.com/groups/phuhuynhnuoidayconmamnontieuhoc' },
  // ── Google News — 10 từ khoá mặc định của n8n (TREND — free) ──
  { platform: 'gnews', name: 'giáo dục' },
  { platform: 'gnews', name: 'thi cử' },
  { platform: 'gnews', name: 'du học' },
  { platform: 'gnews', name: 'học sinh' },
  { platform: 'gnews', name: 'chương trình học' },
  { platform: 'gnews', name: 'tâm lý trẻ em' },
  { platform: 'gnews', name: 'nuôi dạy con' },
  { platform: 'gnews', name: 'tuyển sinh' },
  { platform: 'gnews', name: 'phụ huynh' },
  { platform: 'gnews', name: 'tư duy' },
];
