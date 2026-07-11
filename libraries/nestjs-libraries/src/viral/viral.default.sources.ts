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
  type: string; // kol | school | group | news (school + kol = đối thủ)
}

export const VIRAL_DEFAULT_SOURCES: DefaultSource[] = [
  // ── KOL giáo dục (Facebook) ──
  { platform: 'facebook', type: 'kol', name: 'KOL · Nguyễn Phùng Phong', url: 'https://facebook.com/Hita.nguyenphungphong' },
  { platform: 'facebook', type: 'kol', name: 'KOL · Nguyễn Thị Lanh', url: 'https://facebook.com/cogiaonguyenthilanh' },
  { platform: 'facebook', type: 'kol', name: 'KOL · Trần Quốc Phúc', url: 'https://facebook.com/tranquocphuc.taovang' },
  { platform: 'facebook', type: 'kol', name: 'KOL · Trần Việt Quân (Sách Tinh Hoa)', url: 'https://facebook.com/tvqsachtinhhoa' },
  { platform: 'facebook', type: 'kol', name: 'KOL · Trần Việt Quân (Thầy)', url: 'https://facebook.com/thaytranvietquan' },
  // ── KOL giáo dục (TikTok) ──
  { platform: 'tiktok', type: 'kol', name: 'KOL · Nguyễn Phùng Phong', url: 'https://www.tiktok.com/@nguyenphungphong' },
  { platform: 'tiktok', type: 'kol', name: 'KOL · Nguyễn Thị Lanh', url: 'https://www.tiktok.com/@mrslanh' },
  { platform: 'tiktok', type: 'kol', name: 'KOL · Trần Quốc Phúc', url: 'https://www.tiktok.com/@tranquocphuc.taovang' },
  { platform: 'tiktok', type: 'kol', name: 'KOL · Trần Việt Quân', url: 'https://www.tiktok.com/@quantv_gnh' },
  // ── Trường đối thủ (Facebook) ──
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Vinschool', url: 'https://facebook.com/vinschool.vn' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · VAS Việt Úc', url: 'https://facebook.com/TruongQuocTeVietUc.VAS' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · FPT School', url: 'https://facebook.com/fschool.fpt.edu.vn' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Pathway Tuệ Đức', url: 'https://facebook.com/HethongtruongPathwayTueDuc' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Á Châu IPS (Bắc Trung Học)', url: 'https://facebook.com/BacTrungHoc' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Tiểu học Á Châu IPS', url: 'https://facebook.com/TieuHocQuocTeAChau.IPS' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · EMASI Vạn Phúc', url: 'https://facebook.com/EMASIVanPhuc' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Ngô Thời Nhiệm', url: 'https://facebook.com/ngothoinhiem.truong' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Ngô Thời Nhiệm THCS-THPT', url: 'https://facebook.com/tthngothoinhiem' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Royal School', url: 'https://facebook.com/Royalschool.vn' },
  { platform: 'facebook', type: 'school', name: 'Đối thủ · Bamboo School', url: 'https://facebook.com/Bamboo.Schoolhcm' },
  // ── Trường đối thủ (TikTok) ──
  { platform: 'tiktok', type: 'school', name: 'Đối thủ · Vinschool', url: 'https://www.tiktok.com/@vinschool.edu.vn' },
  { platform: 'tiktok', type: 'school', name: 'Đối thủ · VAS', url: 'https://www.tiktok.com/@vas.school' },
  { platform: 'tiktok', type: 'school', name: 'Đối thủ · Pathway Tuệ Đức', url: 'https://www.tiktok.com/@pathwaytueduc' },
  { platform: 'tiktok', type: 'school', name: 'Đối thủ · Quốc tế Á Châu', url: 'https://www.tiktok.com/@truongquocteachau' },
  // ── Group phụ huynh (VOICE — lời phụ huynh thật) ──
  { platform: 'facebook', type: 'group', name: 'Group · Hội REVIEW Mẫu Giáo Mầm Non Nhà Trẻ TPHCM', url: 'https://www.facebook.com/groups/337428867135889' },
  { platform: 'facebook', type: 'group', name: 'Group · REVIEW Trường Mầm Non và Tiểu Học TPHCM', url: 'https://www.facebook.com/groups/reviewmamnonhochiminh' },
  { platform: 'facebook', type: 'group', name: 'Group · Hội Phụ Huynh Nuôi Dạy Con MN-TH', url: 'https://www.facebook.com/groups/phuhuynhnuoidayconmamnontieuhoc' },
  // ── Google News — 10 từ khoá mặc định của n8n (TREND — free) ──
  { platform: 'gnews', type: 'news', name: 'giáo dục' },
  { platform: 'gnews', type: 'news', name: 'thi cử' },
  { platform: 'gnews', type: 'news', name: 'du học' },
  { platform: 'gnews', type: 'news', name: 'học sinh' },
  { platform: 'gnews', type: 'news', name: 'chương trình học' },
  { platform: 'gnews', type: 'news', name: 'tâm lý trẻ em' },
  { platform: 'gnews', type: 'news', name: 'nuôi dạy con' },
  { platform: 'gnews', type: 'news', name: 'tuyển sinh' },
  { platform: 'gnews', type: 'news', name: 'phụ huynh' },
  { platform: 'gnews', type: 'news', name: 'tư duy' },
];
