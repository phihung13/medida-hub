// ============================================================================
//  KHO SKILL (công thức AI) của trang Phát hiện — mỗi skill là 1 file markdown
//  user CHỈNH ĐƯỢC trên UI (tab "🧪 Công thức AI"), như harness riêng cho từng
//  việc: viết blog, kịch bản podcast, vẽ infographic, chấm điểm, phân loại,
//  viết lại, bản tin tuần...
//  - MẶC ĐỊNH: nguyên văn prompt port từ 2 workflow n8n (đang chạy tốt).
//  - OVERRIDE: file CONFIG_DIR/viral-skills/<key>.md (bền qua Docker restart)
//    — có file là dùng file, xoá file là về mặc định.
//  - Prompt builder đọc skill LÚC GỌI (đổi trên UI ăn ngay, không cần restart).
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

export interface ViralSkillDef {
  key: string;
  label: string;
  group: string; // Nhóm hiển thị trên UI
  description: string; // 1 dòng: skill này được dùng ở đâu
  content: string; // nội dung MẶC ĐỊNH
}

const DIR = () => {
  const d = configPath('viral-skills');
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {
    /* không tạo được — đọc sẽ rơi về mặc định */
  }
  return d;
};
const fileOf = (key: string) => path.join(DIR(), `${key}.md`);

// ── NỘI DUNG MẶC ĐỊNH (nguyên văn từ code/n8n) ─────────────────────────────

const HO_SO_TRUONG = `HỒ SƠ TRƯỜNG — v2 (chốt 15/10/2026). Chỉ dùng đúng dữ kiện dưới đây. Không có ở đây = KHÔNG nói.

NHẬN DIỆN
• Hệ thống Trường Việt Anh, vận hành bởi Major Education, thành lập 2011 tại TP.HCM.
• 6 cơ sở đang hoạt động (TP.HCM 3 · Tây Ninh 2 · An Giang 1), gồm 8 trường. Chỉ nói "8 trường" khi có giải thích kèm.
  - TP.HCM: Mầm non Việt Anh Gò Vấp (573 Lê Đức Thọ); Liên cấp Việt Anh Gò Vấp lớp 1–12 (160/72 Phan Huy Ích); Liên cấp Việt Anh Bình Tân lớp 1–12 (Số 7, Đường 38A, P. Tân Tạo).
  - Tây Ninh (Long Hậu): Mầm non Nhân Lễ; Mầm non & Tiểu học Thái Sơn.
  - An Giang (Rạch Giá): Mầm non & Tiểu học Mekong Xanh.
• Nhận học sinh từ 12 tháng đến 18 tuổi. Hơn 1.000 học sinh mỗi năm. Tỷ lệ tái ghi danh trung bình 85–95% mỗi năm.
• Từ năm học 2026–2027: AI-Powered School — mọi lớp 1–12 học 30 tiết AI/năm. Mục tiêu: con làm chủ AI, không lệ thuộc AI.
• Thần chú: "Vui vẻ và Thực dụng". Tagline: "Kiến Tạo Những Công Dân Toàn Cầu Hạnh Phúc". Tagline website: "Nơi Con Học Vui, Lớn Lên Tự Tin, Ra Đời Vững Vàng".

TRIẾT LÝ & CÁCH ĐO
• 5 giá trị cốt lõi: Tôn trọng và tự trọng, Trách nhiệm, Tài giỏi, Chính trực, Yêu thương.
• 16 kỹ năng thế kỷ 21 theo WEF.
• 4 lĩnh vực: Kiến thức (cái đầu), Kỹ năng lãnh đạo (đôi tay), Phẩm chất (trái tim), Sức khoẻ (cơ thể). Đo chính thức 3 lần/năm; mỗi học sinh đánh giá trên sự tiến bộ của chính mình. Trên 90% học sinh tiến bộ.
• Trụ cột học thuật: HighScope, Responsive Classroom, Leader in Me (Franklin Covey), GDPT 2018.
• PDR là nhịp rà soát hằng tuần: Mầm non = Plan–Do–Recall; Tiểu học trở lên = Plan–Do–Review.

TỪNG CẤP
• Mầm non (mọi cơ sở): sĩ số 10–24 bé/lớp tuỳ độ tuổi; tỷ lệ bé/cô luôn dưới 8.
• Mầm non Việt Anh Gò Vấp: 100% tiếng Anh immersion, giáo viên bản ngữ, Montessori + SteamE.
• Mầm non Long Hậu & Mekong Xanh: học tiếng Anh với giáo viên bản ngữ, KHÔNG phải 100% tiếng Anh.
• Tiểu học: tích hợp Oxford International Curriculum (Oxford University Press đã kiểm định), STEM + lập trình; mục tiêu IELTS 4.0 cuối lớp 5. Sĩ số: Thái Sơn 24–34, Mekong Xanh 20–28 học sinh/lớp.
• THCS: Academic English, Leader in Me, dự án cộng đồng; mục tiêu IELTS 5.5 cuối lớp 9.
• THPT: Lộ trình tiếng Anh của trường đảm bảo giúp học sinh có thể đạt IELTS 6.0+ trước khi tốt nghiệp THPT. Bảo hành IELTS 6.0+ ghi trong hợp đồng: chưa đạt, trường kèm miễn phí đến khi đạt. 100% học sinh THPT có chứng chỉ tin học quốc tế ICDL. Có hướng nghiệp & du học.
• Hai cơ sở liên cấp TP.HCM: sĩ số 24, phòng học 64–72 m²; nội trú nhận từ lớp 6.

KẾT QUẢ (dùng đúng câu chữ)
• "100% học sinh tốt nghiệp THPT và được tiếp nhận vào đại học."
• "100% học sinh tốt nghiệp đạt điểm IELTS được chuyển đổi thành điểm 10 môn Tiếng Anh kỳ thi tốt nghiệp THPT."
• "Top 15 toàn cầu cuộc thi Leader in Me 2023."
• "30% học sinh du học" (KHÔNG gọi là học bổng du học).
• "120 giải thưởng các loại năm 2025–2026" (là số GIẢI, không phải số học sinh).
• Các kết quả THPT chỉ nói khi bài nói về THPT hoặc toàn hệ thống; KHÔNG đặt vào bài chỉ về Mầm non/Tiểu học.

TIẾNG ANH
• Nổi tiếng tại TP.HCM ở mảng tiếng Anh từ khi thành lập (slogan sáng lập: "Đào tạo học sinh giỏi chuyên Anh").
• 10+ giáo viên bản ngữ (Anh, Mỹ, Úc, Canada, Nam Phi).
• Đã tập huấn giáo viên tiếng Anh cho hơn 100 trường khác tại TP.HCM.

HỌC PHÍ — luôn nói "từ khoảng", theo tháng, là mức sàn
• MN Việt Anh Gò Vấp 10 triệu · MN Nhân Lễ 3,39 triệu · MN & TH Thái Sơn 2,99 triệu · MN & TH Mekong Xanh từ 3,39 triệu (chương trình International cao hơn) · Tiểu học Việt Anh 10 triệu · THCS 12 triệu · THPT 13 triệu.
• Nội trú (VAGV, VABT, từ lớp 6): khoảng 2,5–3,5 triệu/tháng tiền chỗ ở, chưa gồm ăn.

CAM KẾT & ƯU ĐÃI CÓ THẬT
• Cam kết Giá trị 4 Tuần: học sinh mới, sau 4 tuần nếu chưa như kỳ vọng → hoàn 100% học phí (đi học tối thiểu 18/20 ngày; không hoàn bảo hiểm, dã ngoại, tiền ăn, đồng phục, dịch vụ đã dùng; xử lý trong 7 ngày làm việc).
• Early Bird đóng trước nhiều năm: giảm đến 46%, khoá giá năm đầu.
• Anh chị em ruột: con thứ hai giảm 50%, con thứ ba giảm 25%.

LIÊN HỆ — chọn đúng khu vực
• TP.HCM: 0916 961 409 · Zalo OA · truongvietanh.com
• Long Hậu (Nhân Lễ, Thái Sơn): 0902 095 956
• Mekong Xanh (Rạch Giá): 0346 455 455
• Tham quan 7 ngày/tuần, 7:00–19:00, ưu tiên ngày trong tuần.

TUYỆT ĐỐI KHÔNG NÓI
• Số sao / số lượt đánh giá Google.
• "99% vào đại học" (đã thay bằng câu ở mục Kết quả).
• "Cam kết đầu ra IELTS 6.0–8.0", "trung bình 6.5".
• British Council, Birmingham City University, Buckinghamshire.
• "8 cơ sở" · "trung tâm khảo thí IELTS" · "bằng 1/3 trường quốc tế" · "liên cấp duy nhất" · "lần đầu tại TP.HCM".
• "nhất / duy nhất / tốt nhất / số 1" khi không có văn bản chứng nhận.
• 4 lĩnh vực kiểu cũ "Kiến thức · Kỹ năng · Tiếng Anh · Thể chất".
• Chi tiết hỗ trợ học phí của bất kỳ gia đình cụ thể nào.
• "gia đình trí thức trung lưu" · "Play-Discover-Reflect" · "cơ sở Tân Phú / Bình Chánh" · tên trường khác.`;

const HO_SO_TRUONG_NGAN = `HỒ SƠ TRƯỜNG (gọn, v2 15/10/2026) — chỉ dùng dữ kiện dưới đây, KHÔNG bịa số.
• Hệ thống Trường Việt Anh (Major Education), thành lập 2011; 6 cơ sở tại TP.HCM, Tây Ninh, An Giang; nhận học sinh 12 tháng–18 tuổi; hơn 1.000 học sinh/năm. AI-Powered School: 30 tiết AI/năm lớp 1–12.
• Triết lý "Vui vẻ và Thực dụng". Phát triển 4 lĩnh vực Kiến thức, Kỹ năng lãnh đạo, Phẩm chất, Sức khoẻ — đo 3 lần/năm; trên 90% học sinh tiến bộ.
• Mầm non: tỷ lệ bé/cô dưới 8. Tiểu học: Oxford International Curriculum. THPT: lộ trình đảm bảo giúp học sinh có thể đạt IELTS 6.0+ trước khi tốt nghiệp, bảo hành ghi trong hợp đồng; 100% học sinh THPT có ICDL.
• 100% học sinh tốt nghiệp THPT và được tiếp nhận vào đại học; 30% du học.
• Cam kết Giá trị 4 Tuần: chưa như kỳ vọng sau 4 tuần → hoàn 100% học phí.
• KHÔNG nói: số sao Google, "99%", "cam kết IELTS 6.0–8.0", British Council, "8 cơ sở", "nhất/số 1", tên trường khác.`;

const GIONG_BLOG = `GIỌNG VĂN (5 phẩm chất của nhà sáng lập Nguyễn Mạnh Dương): THẲNG THẮN — UYÊN BÁC — THỰC TẾ — CẢM XÚC — HIỆU QUẢ. Ấm áp, chân thật, minh bạch, tự tin nhưng KHÔNG khoa trương. Dùng số thật, không phóng đại. KHÔNG nói "tốt nhất/số 1" khi không có bằng chứng. Không dạy đời. Chưa có số liệu thì nói mềm ("nhiều gia đình nhận thấy", "có thể"), KHÔNG bịa. TUYỆT ĐỐI không nhắc tên đối thủ / KOL / thương hiệu / trường khác. Xưng hô: "Việt Anh"/"chúng tôi" (nhà trường) và "ba mẹ"/"bạn" (phụ huynh).`;

const GIONG_PODCAST = `GIỌNG: ấm áp, thấu hiểu, trò chuyện tự nhiên — KHÔNG phô trương điểm số, KHÔNG dạy đời, KHÔNG nói "tốt nhất/số 1" khi không có bằng chứng. Dùng số thật, không phóng đại. TUYỆT ĐỐI không nhắc tên đối thủ / KOL / thương hiệu / trường khác. XƯNG HÔ BẮT BUỘC: người dẫn xưng "tôi" (TRUNG TÍNH, không lộ giới tính); TUYỆT ĐỐI KHÔNG xưng "anh", "chị", "bà", "cô", "chú", "mình"; gọi người nghe là "bạn" hoặc "ba mẹ". Lý do: giọng đọc TTS cố định nên KHÔNG được mặc định giới tính người dẫn.`;

const CHINH_TA = `CHÍNH TẢ — BẮT BUỘC TUYỆT ĐỐI: viết tiếng Việt CÓ DẤU chuẩn xác 100%, đúng dấu thanh, KHÔNG lỗi gõ. Tên trường LUÔN LUÔN viết đúng là "Việt Anh" — TUYỆT ĐỐI KHÔNG được viết "Vịt Anh", "Viêt Anh", "Việt anh", "Viet Anh" hay bất kỳ biến thể sai dấu nào. Trước khi trả kết quả, TỰ RÀ SOÁT lại toàn bộ chính tả một lượt và sửa hết lỗi dấu/lỗi gõ.`;

const CTA_THAT = `=== CTA / CHỐT CHỈ DÙNG THẬT — CẤM BỊA (v2, 15/10/2026) ===
LIÊN HỆ (chọn đúng khu vực của kênh/bài):
• TP.HCM 0916 961 409 · Long Hậu (Nhân Lễ, Thái Sơn) 0902 095 956 · Mekong Xanh 0346 455 455 · Zalo OA · đặt lịch tham quan.

LỜI MỜI NHẸ CÓ THẬT (đặt ở BÌNH LUẬN GHIM; caption carousel KHÔNG chứa link):
• Bản đồ Khôn Lớn — nguyenmanhduong.com/ban-do-khon-lon — xem mức phát triển 4 lĩnh vực và môi trường phát triển của con. Dùng cho con từ 3 tuổi đến THPT; KHÔNG dùng cho con dưới 3 tuổi.
• Quiz trình độ tiếng Anh — truongvietanh.com/quiz — ước lượng trình độ CEFR từ Pre-A1 đến B2.
• Hướng nghiệp — huongnghiep.bandohoctap.com — cho học sinh từ lớp 8 trở lên.

GHÉP THEO CẤP:
• Mầm non: tham quan; quiz tiếng Anh (bé lớn); Bản đồ Khôn Lớn (từ 3 tuổi).
• Tiểu học và lớp 6–7: Bản đồ Khôn Lớn; quiz tiếng Anh.
• Lớp 8–12: Hướng nghiệp; Bản đồ Khôn Lớn; quiz tiếng Anh.

ƯU ĐÃI (CHỈ nhắc khi bài nói về tuyển sinh/học phí):
• Cam kết Giá trị 4 Tuần · Early Bird đến 46% · ưu đãi anh chị em ruột.

CẤM: chương trình 66 ngày (chưa ra mắt), ebook, checklist, quà tặng, mã giảm, sự kiện, hay "nhắn từ khoá X nhận Y" — trừ khi input cung cấp dữ kiện thật.`;

const DIEM_TUA = `nhà tâm lý học hoặc chuyên gia giáo dục (tự chọn người phù hợp, KHÔNG mặc định vài tên quen)
triết gia / nhà tư tưởng
nhà văn, nhà thơ hoặc một câu nói truyền cảm hứng
một phát hiện khoa học về não bộ và sự phát triển của trẻ
ca dao - tục ngữ hoặc minh triết dân gian Việt Nam
một nghiên cứu / số liệu giáo dục (không chắc nguồn thì nói chung, KHÔNG bịa số)
một danh nhân lịch sử (trong hoặc ngoài nước)
một câu chuyện thật từ THƯ VIỆN CÂU CHUYỆN (chọn theo cấp học và nỗi lo, theo skill thu-vien-cau-chuyen)
KHÔNG dùng trích dẫn nào — để nội dung tự đứng vững`;

const THU_VIEN_CAU_CHUYEN = `THƯ VIỆN CÂU CHUYỆN THẬT — quy tắc dùng cho mọi agent (v1, 15/10/2026)

1. CHỈ dùng dòng có đồng ý = "Có" và KHÔNG thuộc danh sách loại trừ:
   dòng 46 (chi tiết học phí) · dòng 76–79 (chưa kiểm) · dòng có ghi chú "cần kiểm".
2. CHỌN câu chuyện khi: cấp học khớp người đọc VÀ "Nỗi lo chính" khớp chủ đề bài.
   Tôn trọng cột "Khi nào KHÔNG nên gửi".
3. ĐƯỢC dùng: tóm tắt (viết lại bằng lời mình), "Câu nói hay" (trích nguyên văn, nói rõ ai nói:
   "mẹ một bạn lớp 3", "một học sinh lớp 11 nội trú"), link video.
4. KHÔNG chép cột "Lời dẫn gợi ý". KHÔNG thêm chi tiết ngoài sheet.
   Lời phụ huynh là lời phụ huynh, KHÔNG biến thành cam kết của trường
   (vd "nói như tiếng mẹ đẻ" chỉ được trích trong ngoặc, không viết thành tuyên bố).
5. Tên: chỉ dùng tên đã có trong tiêu đề video công khai; không thêm họ, không thêm lớp nếu tiêu đề không có.
6. Mỗi bài tối đa 1 câu chuyện; cùng một câu chuyện không dùng lại trong 30 ngày.`;

const CONG_THUC_BLOG = `ÁP DỤNG PHƯƠNG PHÁP "mkt-blog-article-writer" (giáo trình viết blog SEO chuẩn EEAT của anh Dương). Bài blog này đăng lên website truongvietanh.com nên phải vừa lên top Google vừa giữ chân người đọc.

CẤU TRÚC EEAT (bắt buộc):
1. H1: chứa keyword chính + lợi ích + chạm cảm xúc (không tiêu đề chung chung).
2. MỞ BÀI 100–150 từ: mở bằng 1 câu ngắn gây chú ý → gọi tên đúng nỗi đau thật của ba mẹ → hứa bài giải quyết được gì → tín hiệu uy tín (kinh nghiệm 15+ năm / số liệu thật của Việt Anh).
3. THÂN BÀI: 6–9 tiêu đề H2, MỖI H2 là MỘT luận điểm rõ ràng (không chung chung), dài 200–350 từ, triển khai theo 5 TẦNG LẬP LUẬN:
   (a) Gọi tên vấn đề thật — ngắn, cụ thể.
   (b) Dẫn chứng phù hợp — theo mục ĐA DẠNG ĐIỂM TỰA — chỉ khi phù hợp, không nhồi.
   (c) Quan điểm & thực tế tại Việt Anh ("Tại Việt Anh, chúng tôi…", lồng bằng chứng thật từ hồ sơ trường).
   (d) Một câu chuyện/ví dụ thực tế cụ thể (học sinh, lớp học, gia đình) — KHÔNG bịa tên thật, mô tả chung.
   (e) Hành động cụ thể ba mẹ làm được ngay (không mơ hồ).
4. Chèn 2–3 lần khối nhấn mạnh mở đầu bằng "Góc nhìn từ Việt Anh:" hoặc "Tại Việt Anh, chúng tôi thấy rằng:" (dạng đoạn <p><strong>...</strong></p>).
5. Có ÍT NHẤT 1 bảng so sánh (HTML <table>) khi chủ đề cho phép (vd: cách làm cũ vs cách làm đúng, các lựa chọn).
6. FAQ cuối bài: 5–7 câu hỏi ba mẹ THẬT SỰ hay hỏi (không phải câu marketing), mỗi câu 1 <h3> + câu trả lời <p>. Đặt dưới 1 <h2>Câu hỏi thường gặp</h2>.
7. KẾT: lời mời nhẹ nhàng (đặt lịch tư vấn/tham quan, hotline 0916 961 409) — KHÔNG quảng cáo lố.

NHỊP VĂN: xen kẽ câu ngắn (3–8 từ) → câu trung (15–20 từ) → câu ngắn. KHÔNG để 3 câu dài liên tiếp. Đoạn 3–4 dòng, không hơn.
CÔNG THỨC TWIST/REVEAL cho mở bài và ít nhất 1 đoạn: hook cụ thể → chi tiết tạo cảm giác căng → câu lật ngược → insight tự hiện ra (không cần giải thích dài).
SEO: keyword chính xuất hiện ở H1, mở bài, 1 H2, và kết; mật độ keyword tự nhiên ~1–1.5%. Độ dài 1500–2000 từ.

5 NHÓM TỪ CẤM (tuyệt đối không dùng):
• Sáo rỗng: xuất sắc, đỉnh cao, vượt trội, đột phá, thần kỳ, hoàn hảo.
• Trang trọng giả: "Kính gửi quý phụ huynh", "Chúng tôi hân hạnh".
• Marketing nhảm: "cơ hội vàng", "đừng bỏ lỡ", "ưu đãi có hạn".
• Dạy đời: "Cha mẹ phải…", "Bạn nên…", "Hãy nhớ rằng…".
• Mơ hồ: "rất", "vô cùng", "cực kỳ" khi không kèm số liệu/ví dụ.`;

const CONG_THUC_PODCAST = `ÁP DỤNG PHƯƠNG PHÁP KỂ CHUYỆN của nhà sáng lập Nguyễn Mạnh Dương, chuyển thể cho AUDIO. Tập podcast này đăng lên YouTube nên phải GIỮ NGƯỜI NGHE từ giây đầu.

CẤU TRÚC AUDIO (monologue 1 người dẫn, ~3–4 phút, 500–700 từ):
1. HOOK 2–3 câu đầu theo công thức TWIST/REVEAL: một chi tiết/câu hỏi cụ thể chạm đúng nỗi lòng ba mẹ → tạo một chút căng → câu lật ngược khiến muốn nghe tiếp. KHÔNG mở bài chung chung kiểu "Xin chào quý vị và các bạn".
2. THÂN: 2–3 ý chính, mỗi ý theo các tầng nhẹ — gọi tên vấn đề thật → một góc nhìn/dẫn chứng → một câu chuyện hoặc ví dụ phổ quát (không bịa tên) → một điều ba mẹ làm được ngay. Nhịp câu xen kẽ ngắn–dài. THÂN BÀI TUYỆT ĐỐI KHÔNG nhắc tên "Việt Anh"/tên trường.
3. KẾT: một câu chốt ấm áp + CHỈ Ở ĐÂY mới nhắc "Việt Anh" đúng 1 lần + 1 lời mời rất nhẹ (tìm hiểu thêm / ghé thăm trải nghiệm) — KHÔNG đọc số điện thoại, KHÔNG đọc website, KHÔNG quảng cáo lố.

VIẾT CHO TAI NGHE, KHÔNG CHO MẮT ĐỌC (vì TTS sẽ đọc):
• Câu vừa phải, dễ đọc thành tiếng; tránh câu quá dài lê thê, tránh mệnh đề lồng nhau rối.
• TUYỆT ĐỐI không dùng ký hiệu, gạch đầu dòng, emoji, dấu ngoặc đóng/mở phức tạp, URL, số thứ tự "1. 2. 3." trong lời đọc — viết liền mạch như nói.
• Số liệu đọc được tự nhiên (vd "hơn một nghìn học sinh mỗi năm", "chín mươi chín phần trăm").
• Giọng người thật, có nhịp thở, có chỗ ngừng tự nhiên bằng dấu chấm/phẩy.
• TUYỆT ĐỐI KHÔNG viết tắt BẤT KỲ cụm từ nào trong SCRIPT — TTS đọc tách từng chữ cái nghe rất sai (vd "THPT" bị đọc thành "tê hát pê tê" thay vì "trung học phổ thông"). Luôn viết ra chữ ĐẦY ĐỦ: "THPT" → "trung học phổ thông"; "THCS" → "trung học cơ sở"; "TH" → "tiểu học"; "MN" → "mầm non"; "TP.HCM" → "thành phố Hồ Chí Minh"; "GDPT" → "giáo dục phổ thông". Áp dụng ĐÚNG quy tắc này (viết đầy đủ, không viết tắt) cho MỌI chữ viết tắt khác xuất hiện trong nội dung định hướng, kể cả chữ không có trong danh sách trên.
• Từ/thuật ngữ/tên riêng tiếng Anh (vd IELTS, STEM, TOEFL, Oxford, Montessori, K-12, ICDL...) — TTS tiếng Việt đọc sai vì đánh vần theo kiểu tiếng Việt. Viết lại thành cách ĐỌC tự nhiên mà người Việt vẫn nói khi trò chuyện (phiên âm gần đúng bằng chữ Việt, có gạch nối), ví dụ: "IELTS" → "ai-eo", "STEM" → "xì-tem", "TOEFL" → "tô-phồ". Nếu không chắc cách đọc đúng của một tên riêng, MÔ TẢ bằng tiếng Việt thay vì giữ nguyên chữ tiếng Anh (vd thay "chương trình Leader in Me" bằng "chương trình rèn bảy thói quen lãnh đạo").
• TRƯỚC KHI TRẢ KẾT QUẢ: đọc thầm lại toàn bộ SCRIPT đúng như người dẫn chương trình sẽ đọc thành tiếng, tìm MỌI cụm chữ IN HOA liên tiếp (viết tắt) hoặc chữ/cụm từ tiếng Anh còn sót lại — sửa hết theo 2 quy tắc trên rồi mới trả kết quả. Không được để sót dù chỉ một chữ viết tắt hay một từ tiếng Anh chưa phiên âm.

5 NHÓM TỪ CẤM (như blog): sáo rỗng (xuất sắc, đỉnh cao, vượt trội, đột phá); trang trọng giả; marketing nhảm (cơ hội vàng, đừng bỏ lỡ); dạy đời (Cha mẹ phải, Bạn nên); mơ hồ (rất, vô cùng không kèm dẫn chứng).

=== CẤU TRÚC TẬP PODCAST (BẮT BUỘC, nằm trong full_script) ===
MỞ ĐẦU (~15-25 giây đầu):
- Lời chào: "Xin chào quý thính giả" (hoặc biến thể tự nhiên, ấm áp).
- 1 câu HOOK mở ngay để giữ người nghe: "Bạn có biết...", một con số bất ngờ, một câu hỏi chạm, hoặc tình huống quen thuộc.
- 1 câu giới thiệu hôm nay tôi sẽ nói về chủ đề gì.
KẾT THÚC (~15-20 giây cuối):
- Chốt thông điệp chính + 1 lời nhắn ấm/hành động nhẹ cho ba mẹ.
- Tạm biệt + hẹn gặp lại ở tập podcast sau (vd "Cảm ơn bạn đã lắng nghe, hẹn gặp lại ở tập tới nhé.").
Mở đầu & kết thúc nói tự nhiên như trò chuyện, KHÔNG sáo rỗng, KHÔNG như quảng cáo.

=== PODCAST VALUE-FIRST + KHÔNG ĐỌC SỐ (BẮT BUỘC, GHI ĐÈ) ===
Tập này để TRAO GIÁ TRỊ THẬT cho ba mẹ như một người bạn chia sẻ, KHÔNG phải quảng cáo trường.
- THÂN BÀI: 100% giá trị (insight nuôi dạy con, câu chuyện, điều áp dụng được ngay). TUYỆT ĐỐI KHÔNG nhắc tên "Việt Anh"/"trường chúng tôi"/thành tích trong thân bài.
- CHỈ CÂU KẾT mới nhắc "Việt Anh" ĐÚNG 1 LẦN + 1 lời mời rất nhẹ. Không liệt kê thành tích, không nói "tốt nhất".
- TUYỆT ĐỐI KHÔNG đọc SỐ trong lời podcast: KHÔNG số điện thoại/hotline, KHÔNG dãy số dài, KHÔNG đọc địa chỉ website/URL. (TTS đọc số thành "tỉ, trăm, triệu, ngàn" nghe rất dở.) Muốn mời liên hệ thì chỉ nói chung "liên hệ Việt Anh để được tư vấn" hoặc "ghé thăm trường" — KHÔNG đọc số/đường link.`;

const CONG_THUC_INFOGRAPHIC = `Thiết kế MỘT tấm infographic THẬT ĐẸP và sáng tạo, chất lượng như một designer chuyên nghiệp, đẳng cấp tạp chí.
Bạn được TOÀN QUYỀN sáng tạo: tự chọn phong cách, bảng màu, bố cục, kiểu chữ, hình minh hoạ, icon và hiệu ứng chiều sâu — miễn sao hài hoà, hiện đại, ấn tượng và dễ đọc. KHÔNG theo bất kỳ khuôn mẫu cứng nào.
Khung bắt buộc (chỉ vậy thôi, còn lại tự do):
- Ngôn ngữ: TIẾNG VIỆT, dấu đầy đủ, chính tả chuẩn. Tên trường luôn viết đúng "Việt Anh".
- Có 1 tiêu đề chính nổi bật + 3 đến 5 ý chính ngắn gọn, súc tích, liếc qua là hiểu.
- Góc dưới có dòng chữ nhỏ: Trường Việt Anh · Vui Vẻ & Thực Dụng.
- Bám đúng nội dung được cung cấp, không bịa số liệu, không nhắc đối thủ hay trường khác.`;

// Công thức BỘ CAROUSEL — port NGUYÊN VĂN từ node "Soạn truyện" của n8n
// WF-SanXuat (skill fb-value-sharing): đây là bản đã siết mạnh chính tả và
// cho kết quả ít lỗi nhất — đừng rút gọn khi chỉnh sửa.
const CONG_THUC_CAROUSEL = `GIỌNG: ấm áp, chân thật, thực tế (số thật, không phóng đại), tôn trọng phụ huynh, KHÔNG dạy đời, KHÔNG nói "tốt nhất/số 1" khi không có bằng chứng, không nhắc đối thủ.

ÁP DỤNG PHƯƠNG PHÁP "fb-value-sharing" (công thức bài chia sẻ giá trị viral cho fanpage). Bộ ảnh infographic này đăng lên Facebook các fanpage Việt Anh. ĐÍCH ĐẾN: ba mẹ đọc xong phải muốn LƯU LẠI và GỬI cho nhóm phụ huynh lớp con — không chỉ khen hay.

CÔNG THỨC: HOOK → REWARD → SHARE → FUNNEL.

1. THẺ BÌA = HOOK (quyết định 80% thành bại): phủ định cách làm của số đông + lời hứa có CON SỐ cụ thể. Chọn 1 trong 4 khung:
   • Phủ định số đông: "Phần lớn ba mẹ vẫn chỉ… [X]. [N] điều sau giúp con… [kết quả]".
   • Cấm trực diện: "Đừng nói/làm kiểu A, B, C. [N] cách thay thế giúp con…".
   • Lật ngộ nhận: "Nhiều người nghĩ [X]. Thực ra không phải vậy…".
   • Cảm thán + kết quả (dùng tiết kiệm, tránh giật tít rỗng).
   Con số PHẢI có cơ sở thật — đây là thương hiệu giáo dục, phóng đại vô căn cứ phá uy tín hơn là kéo share.

2. CÁC THẺ NỘI DUNG = REWARD (giá trị dùng ngay): danh sách ĐÁNH SỐ, 5–7 mục (tài nguyên/danh sách có thể nhiều hơn). Mỗi thẻ 1 mục độc lập, dùng được ngay trong 24h không cần nghĩ thêm.
   • Khi dạy "cách nói/cách làm": dùng cấu trúc TƯƠNG PHẢN ❌/✅ — cho ba mẹ thấy chính câu họ đang nói (❌) rồi câu thay thế nguyên văn (✅). Tự nhận ra "đúng là mình đang làm vậy" = niềm tin tức thì.
   • Mỗi mục: tối đa 1 câu giải thích "tại sao", còn lại là "làm thế nào" (câu nói nguyên văn / bước cụ thể).
   • KHÔNG lời khuyên chung chung kiểu "hãy kiên nhẫn với con" — không ai lưu lại.

3. SHARE TRIGGER: tự kiểm — bài có đáng để 1 phụ huynh gửi vào nhóm Zalo lớp con không? Đáng khi (a) trúng nỗi đau chung cả nhóm, (b) có thứ "lưu lại dùng sau" (checklist, bảng, danh sách tra cứu).

4. THẺ KẾT: tóm tắt nhanh + nhắc "Lưu lại & gửi cho ba mẹ cần" + nhắc xem phần đọc thêm.

5. fb_caption = phần FUNNEL trong caption: giọng gần gũi, KHÔNG chứa CTA bán hàng/tuyển sinh (một dòng "inbox cho trường" giữa bài giết lượt share). Kết bằng 3–5 hashtag.

TỰ CHẤM trước khi trả (ngưỡng ≥80/100): Hook phủ định + con số (15); Hook gọn ≤2 câu gây tò mò (10); Giá trị dùng ngay (15); Danh sách rõ, đánh số, đúng số đã hứa (10); Tương phản ❌/✅ (10); Đáng share vào nhóm phụ huynh (15); Đúng thương hiệu Việt Anh, claim có cơ sở (15); Phễu sạch — caption không CTA bán hàng (10). Nếu dưới 80 thì tự sửa rồi mới trả.`;

const HE_THONG_VA = `Bạn là chuyên viên truyền thông của Trường Việt Anh. Viết nội dung mạng xã hội bằng tiếng Việt, tự nhiên, ấm áp, đúng chuẩn mực giáo dục, phù hợp phụ huynh và học sinh. Không bịa thông tin không có trong dữ liệu đầu vào.`;

const NGUYEN_TAC_CHON_NHOM = `NGUYÊN TẮC CHỌN NHÓM (BẮT BUỘC):
- Mã nhóm = CẤP HỌC x CƠ SỞ. Phần "CƠ SỞ" (HCM/CG/RG) CHỈ là mã định tuyến nội bộ (quyết định content đăng lên kênh nào) — KHÔNG phải căn cứ để viết nội dung.
- Mã cấp: mầm non → MN-*; tiểu học → TH-*; THCS → THCS-HCM; THPT → THPT-HCM.
- CHỌN ĐÚNG 1 CẤP theo DẤU HIỆU của bài (đọc kỹ độ tuổi/lớp để không nhầm cấp liền kề):
  + MẦM NON (2-5 tuổi, nhà trẻ/mẫu giáo): ăn-ngủ, tập tự lập, lần đầu xa mẹ, đi học khóc, biếng ăn, Montessori/immersion mầm non, chuẩn bị vào lớp 1.
  + TIỂU HỌC (lớp 1-5): vào lớp 1, tập đọc/tập viết/làm toán, nền tảng tiểu học, tiếng Anh tiểu học, bài tập về nhà tiểu học.
  + THCS = CẤP 2 (lớp 6-9): tuyển sinh lớp 6, dậy thì, điện thoại/game, bạn bè tuổi teen, ôn thi vào lớp 10, tâm lý tuổi mới lớn.
  + THPT (lớp 10-12): thi/tuyển sinh vào lớp 10, thi tốt nghiệp THPT, hướng nghiệp, chọn ngành, đại học/du học, luyện thi/IELTS, áp lực thi cử. Tin thuần về đại học → gắn THPT theo góc hướng nghiệp sau lớp 12 (trường chỉ có tới THPT).
- Bài RÕ 1 CẤP (có dấu hiệu đặc trưng ở trên) → BẮT BUỘC chọn đúng cấp đó. TUYỆT ĐỐI KHÔNG nhảy cấp: nội dung lớp 10/THPT KHÔNG gắn mầm non hay tiểu học; nội dung dậy thì/cấp 2 KHÔNG gắn tiểu học; và ngược lại.
- Bài PHỔ QUÁT (không gắn cấp nào cụ thể — vd nuôi dạy con nói chung, đồng hành cùng con, cảm xúc/tâm lý gia đình, dùng công nghệ/AI trong học tập, triết lý giáo dục): chọn cấp hợp nhất, KHÔNG bị coi là sai. Vẫn CHỈ 1 nhóm chính.
- MẶC ĐỊNH chọn cơ sở chính là HCM. Chỉ thu hẹp về CG hoặc RG khi bài THẬT SỰ nói về Cần Giuộc/Long An hoặc Rạch Giá.`;

const SKILL_PHAN_LOAI_VIET_LAI = `Nhiệm vụ: với TỪNG bài trong danh sách, làm 4 bước:
(A) Chọn ĐÚNG 1 nhóm chân dung phù hợp nhất theo NGUYÊN TẮC CHỌN NHÓM ở trên.
(B) VIẾT LẠI nội dung thành bài đăng cho nhóm đó: 2-4 câu, giọng "Vui Vẻ & Thực Dụng", kết bằng CTA tự nhiên + 4-6 hashtag. CẤM: định kiến vùng miền/giàu nghèo, tên trường đối thủ, sao chép nguyên văn bài gốc. THÊM "variants": nếu nội dung cũng hợp với các nhóm KHÁC CÙNG CẤP HỌC (vd chọn TH-HCM mà bài hợp cả TH-CG, TH-RG), viết TỐI ĐA 2 biến thể — mỗi biến thể 2-4 câu VIẾT RIÊNG đúng chân dung tâm lý nhóm đó (không đổi cấp học, không copy bản chính); không hợp nhóm nào khác → mảng rỗng.
(C) Chấm BẢN VIẾT LẠI theo rubric.
(D) GÁN LOẠI SẢN XUẤT phù hợp nhất: "content_type" ∈ ["blog","infographic","video"] (blog = chủ đề sâu cần giải thích; infographic = liệt kê/số liệu/mẹo nhìn nhanh; video = câu chuyện/cảm xúc/trình diễn). Kèm "podcast_score" 0-100: nội dung này ĐỌC THÀNH AUDIO có hay không (câu chuyện/tâm sự/lời khuyên nghe được → cao; bảng số liệu/so sánh nhìn mắt → thấp).`;

const TIEU_CHI_CHAM_DIEM = `RUBRIC CHẤM (tổng 100):
- Hook 3 giây (20): mở đầu có níu người đọc dừng lại không
- Clarity (15): rõ ràng, dễ hiểu, một thông điệp chính
- Brand Voice (15): đúng giọng "Vui Vẻ & Thực Dụng" của Trường Việt Anh
- Value/Insight (20): phụ huynh đọc xong được gì (mẹo, góc nhìn, dữ kiện)
- CTA (15): có lời kêu gọi tự nhiên (tham quan / inbox / để lại SĐT...)
- SEO/Hashtag (15): có 4-6 hashtag đúng chủ đề + từ khoá tìm kiếm
Chấm BẢN VIẾT LẠI (không chấm bài gốc). Chấm rộng rãi: bản viết tốt, đúng brand, đủ hook+CTA+hashtag → 90-100; ổn còn 1 điểm nhỏ → 80-89; tạm/ý tưởng gốc yếu → 60-79; dưới 50 chỉ khi nội dung thật sự không liên quan giáo dục/phụ huynh hoặc không thể tận dụng.`;

// Đặc tả v2 (15/10/2026): RUBRIC DỰ BÁO SHARE — dùng cho NGƯỜI CHẤM ĐỘC LẬP
// (share.judge.ts, temperature 0, lệnh gọi riêng). Nguyên văn bản đã chốt.
const RUBRIC_DU_BAO_SHARE = `RUBRIC DỰ BÁO SHARE — Trường Việt Anh (v2, 15/10/2026)

Bạn là người chấm ĐỘC LẬP. Bạn KHÔNG viết bài này và KHÔNG sửa bài.
Chấm khắt khe. Điểm 18/20 trở lên chỉ dành cho bài bạn tin nằm trong top 20% fanpage giáo dục Việt Nam.
Với MỖI tiêu chí: trích nguyên văn đoạn trong bài làm bằng chứng, rồi mới cho điểm.
Không tìm được bằng chứng = 0 điểm cho tiêu chí đó.

BƯỚC 1 — CỔNG LOẠI (trượt 1 cổng = verdict "loại", không chấm tiếp)
G1. Có dữ kiện/số liệu KHÔNG có trong HỒ SƠ TRƯỜNG, thư viện câu chuyện hoặc ghi chú giáo viên.
G2. Lộ tên đầy đủ học sinh, hoặc ảnh/miêu tả có nguy cơ về an toàn, riêng tư trẻ em.
G3. Dùng "nhất / duy nhất / tốt nhất / số 1", hoặc nhắc trường khác.
G4. Sai tên "Việt Anh", hoặc sai chính tả tiếng Việt có dấu.
G5. Hứa ưu đãi, quà, tài liệu không có trong danh sách CTA thật.

BƯỚC 2 — CHẤM 7 TIÊU CHÍ
Trọng số: [GT] = Trao giá trị (carousel, bài founder, blog trích) · [UGC] = khoảnh khắc lớp học (Bot Zalo)

1. DANH TÍNH NGƯỜI SHARE — [GT] 20 · [UGC] 25
   Share bài này giúp người share trông tốt hơn (hiểu biết, tâm lý, tự hào về con).
   Đủ điểm: nói rõ được người share "được gì". Nửa điểm: có nhưng mờ. 0: không ai được gì.
2. GIÁ TRỊ DÙNG NGAY — [GT] 20 · [UGC] 5
   Có thứ làm được trong 24h hoặc đáng lưu lại (câu nói nguyên văn, bước cụ thể, checklist, bảng).
   0 điểm nếu chỉ là lời khuyên chung ("hãy kiên nhẫn với con").
3. HOOK DỪNG TAY — [GT] 15 · [UGC] 15
   Dòng đầu / thẻ bìa có chi tiết cụ thể, con số có cơ sở, hoặc lật một ngộ nhận.
   0 điểm nếu mở bằng câu chung ("Ba mẹ ơi, hôm nay các con…").
4. CẢM XÚC KÍCH HOẠT — [GT] 10 · [UGC] 15
   Gây tự hào, bật cười, ngạc nhiên, hoặc lo lắng-có-lối-ra. "Ấm áp, vui vẻ" chung chung = tối đa 3 điểm.
5. KHOẢNH KHẮC / BẰNG CHỨNG CỤ THỂ — [GT] 15 · [UGC] 25
   Có ít nhất 1 chi tiết chỉ Việt Anh có: hành động thật, câu nói thật, tiến bộ thật, câu chuyện từ thư viện.
   0 điểm nếu bài thay tên trường khác vào vẫn đúng.
6. NGƯỜI NHẬN RÕ RÀNG — [GT] 10 · [UGC] 10
   Đọc xong biết ngay gửi cho ai (nhóm Zalo lớp, vợ/chồng, ông bà).
7. MA SÁT SHARE THẤP — [GT] 10 · [UGC] 5
   Thân bài KHÔNG có CTA tuyển sinh, hotline, "inbox ngay"; không giọng quảng cáo. CTA nếu có chỉ nằm ở bình luận ghim.

BƯỚC 3 — KẾT LUẬN
[GT]: ≥ 90 "đăng" · 75–89 "sửa 1 lần" (ghi đúng 1 việc cần sửa quan trọng nhất), chấm lại; vẫn < 90 thì "bỏ" · < 75 "bỏ".
[UGC]: qua đủ 5 cổng và ≥ 80 "đăng" · < 80 "bỏ".
KHÔNG so với điểm bản trước. KHÔNG yêu cầu viết lại đến khi tăng điểm.

TRẢ VỀ JSON:
{"gates":{"G1":bool,"G2":bool,"G3":bool,"G4":bool,"G5":bool},"type":"GT|UGC",
 "scores":{"identity":n,"value":n,"hook":n,"emotion":n,"proof":n,"recipient":n,"friction":n},
 "evidence":{"identity":"trích...", ...},
 "total":n,"verdict":"đăng|sửa 1 lần|bỏ|loại","one_fix":"..."}`;

// LEAD MAGNET — "mồi câu" đổi lấy thông tin liên hệ của phụ huynh. Với MỖI
// content, AI chấm CẢ 5 loại mồi (không chỉ chọn 1) để đội nội dung nhìn được
// xếp hạng: loại nào hợp chủ đề này nhất, loại nào không nên làm.
const SKILL_LEAD_MAGNET = `Bạn là chuyên gia phễu tuyển sinh của Trường Việt Anh. Với nội dung được đưa, hãy đề xuất LEAD MAGNET (tài nguyên miễn phí đổi lấy SĐT/Zalo của phụ huynh) nên làm kèm content đó.

5 LOẠI LEAD MAGNET (chấm ĐỦ CẢ 5, không bỏ loại nào):
- "ebook": cẩm nang PDF 10-30 trang, đọc sâu, giải thích cặn kẽ một vấn đề lớn.
- "checklist": bảng kiểm / danh sách 1 trang, in ra dán tủ lạnh, dùng ngay trong 24h.
- "app": mini app / công cụ web tương tác (máy tính học phí, trắc nghiệm chọn cấp, lịch ôn thi tự sinh, tra cứu tuyến xe...).
- "template": biểu mẫu / kịch bản mẫu điền vào là xong (thời khoá biểu, mẫu câu nói với con, mẫu đơn, bảng theo dõi).
- "quiz": bài test có CHẤM ĐIỂM và trả kết quả cá nhân hoá (đánh giá mức sẵn sàng vào lớp 1, đo mức căng thẳng tuổi teen...).

CHẤM MỖI LOẠI 0-100 theo 6 tiêu chí (tổng 100):
- Trúng nỗi đau (25): tài nguyên này có giải đúng nỗi lo mà content vừa khơi ra không.
- Giá trị dùng ngay (20): ba mẹ nhận xong dùng được trong 24h, không phải học thêm gì.
- Đủ chất liệu (15): dữ kiện/số liệu/góc nhìn TRONG chính content này đã đủ để làm ra tài nguyên đó chưa (thiếu chất liệu → phải bịa → điểm thấp).
- Hợp hành vi nhóm chân dung (15): nhóm phụ huynh đã chọn có sẵn lòng để lại SĐT/Zalo để đổi lấy thứ này không.
- Chi phí sản xuất (15): đội nội dung 1-2 người của trường làm được trong bao lâu. Làm nhanh → điểm cao; "app" tốn kém hơn hẳn nên chỉ được điểm cao khi thật sự XỨNG ĐÁNG.
- Dẫn tới tuyển sinh (10): sau khi ba mẹ nhận, có mở được đường tư vấn/mời tham quan trường một cách tự nhiên không.

VỚI MỖI LOẠI trả: "type", "score" (0-100), "title" (TÊN tài nguyên cụ thể, hấp dẫn, tiếng Việt — không nói chung chung kiểu "Ebook về giáo dục"), "why" (1 câu vì sao điểm cao/thấp), "effort" ∈ ["thấp","trung bình","cao"].
RIÊNG LOẠI ĐIỂM CAO NHẤT trả thêm: "outline" (3-5 gạch đầu dòng nội dung chính) và "cta" (1 câu mời phụ huynh để lại SĐT/Zalo để nhận — giọng ấm áp, không ép).

LUẬT: xếp mảng theo "score" GIẢM DẦN. Không tài nguyên nào được hứa điều trường không làm được, không bịa số liệu, không cam kết kết quả học tập. Nếu content quá mỏng (chỉ là tin tức thời sự, không có gì để ba mẹ mang về dùng) thì cho ĐIỂM THẤP CẢ 5 loại — thà nói thật là chưa nên làm mồi câu.`;

const SKILL_MO_CONG_THUC = `Bạn là chuyên gia phân tích nội dung viral giáo dục Việt Nam. Mổ xẻ VÌ SAO bài này được chia sẻ nhiều. Phân tích sắc, cụ thể, có thể áp dụng lại — không chung chung. Tiếng Việt.`;

const SKILL_TONG_HOP_CHU_DE = `Bạn nhận NHIỀU bài từ NHIỀU NGUỒN KHÁC NHAU cùng nói về MỘT chủ đề/sự kiện. Nhiệm vụ: chưng cất tất cả thành MỘT "content gốc" duy nhất mà đội nội dung có thể hack lại — rồi chọn nhóm chân dung, viết bản đăng cho Trường Việt Anh, và chấm điểm.

BƯỚC 1 — TỔNG HỢP (khách quan, không bịa; chỉ dùng dữ kiện có trong các bài):
- "label": tên chủ đề ngắn gọn (6-12 từ), gọi đúng bản chất sự kiện/vấn đề.
- "angle": 1-2 câu nói bản chất chủ đề này là gì và vì sao đang được nhiều nguồn nói tới.
- "agreedFacts": 3-6 điều mà NHIỀU nguồn cùng khẳng định (điểm đồng thuận = đáng tin nhất).
- "keyNumbers": các số liệu/mốc quan trọng xuất hiện (ghi kèm ngữ cảnh; KHÔNG bịa số không có trong bài).
- "quotes": 0-3 câu trích đáng giá (lời chuyên gia/phụ huynh/người trong cuộc) nếu có trong bài.
- "uniqueAngles": 2-4 góc nhìn LẠ mà chỉ một vài nguồn nêu (chỗ để làm nội dung khác biệt).
- "hook": 1 câu mở có sức níu, chạm đúng nỗi quan tâm của phụ huynh.
- "whyItMatters": 1-2 câu vì sao phụ huynh Trường Việt Anh nên quan tâm.

BƯỚC 2 — CHỌN NHÓM: theo NGUYÊN TẮC CHỌN NHÓM ở trên, chọn ĐÚNG 1 nhóm chân dung phù hợp nhất.

BƯỚC 3 — VIẾT BẢN ĐĂNG ("rewritten"): bài đăng mạng xã hội của Trường Việt Anh cho nhóm đã chọn — 2-4 câu, giọng "Vui Vẻ & Thực Dụng", dựa trên content tổng hợp (KHÔNG sao chép nguyên văn nguồn nào), kết bằng CTA tự nhiên + 4-6 hashtag. Không nhắc tên trường/đối thủ khác.

BƯỚC 4 — CHẤM "rewritten" theo rubric + gán "content_type" (blog/infographic/video) và "podcast_score" (0-100).`;

const SKILL_BAN_TIN_TUAN = `Bạn là trợ lý chiến lược nội dung của Trường Việt Anh (K-12, TP.HCM). Viết BẢN TIN TUẦN cho đội marketing từ dữ liệu cào 7 ngày.

TRỌNG TÂM (quan trọng nhất, tuân thủ tuyệt đối): bản tin này nói về MẠNG XÃ HỘI — Facebook (fanpage đối thủ, KOL, HỘI NHÓM phụ huynh), TikTok, YouTube. Người đọc KHÔNG tự cào được Facebook nên trông cậy hoàn toàn vào bản tin để biết trên MXH đang bàn gì.
- ~85% dung lượng dành cho MXH. Tin báo chí CHỈ ~15%, gói gọn trong "press".
- TUYỆT ĐỐI KHÔNG kể lể tin báo trong "themes", "market" hay "summary". Tin báo chỉ được nhắc ở đó khi nó ĐANG được bàn tán trên MXH, và phải nói rõ nó nóng tới mức nào trên MXH (share/like/comment).

ĐƠN VỊ PHÂN TÍCH LÀ CHỦ ĐỀ (1 content = NHIỀU bài), không phải từng bài lẻ. Dữ liệu đã gom cụm sẵn — hãy dùng đúng cụm đó, đừng tự tách nhỏ ra thành từng bài.

CHỈ SỐ: luôn kèm số thật lấy từ dữ liệu. SHARE là chỉ số quan trọng nhất — share càng cao chủ đề càng nổi bật, hãy xếp và nhấn theo share TRƯỚC, rồi mới tới like, comment, view. Ghi dạng "340 share · 1.2k like · 87 comment".

Các mục phải viết:
- "summary": 3-4 câu — tuần này TRÊN MXH đang nóng chuyện gì, ai đang dẫn dắt, phụ huynh đang lo/quan tâm điều gì. Nêu 1-2 con số share tiêu biểu.
- "themes": 5-8 CHỦ ĐỀ nóng nhất trên MXH, xếp theo tổng share giảm dần. MỖI DÒNG phải đủ: tên chủ đề — số bài trong cụm · tổng share (+ like/comment/view nếu có) · AI đang đẩy (tên fanpage/KOL/hội nhóm, kèm số bài của họ) · bài mạnh nhất và số share của nó · một câu vì sao phụ huynh quan tâm. Nếu Trường Việt Anh chưa có nội dung về chủ đề đó thì nói rõ "ta chưa có bài".
- "market": 5-8 dòng điểm danh TỪNG đối thủ/KOL/hội nhóm: họ đăng bao nhiêu bài, tổng share, đang tập trung vào chủ đề nào, format nào đang thắng (video/ảnh/bài dài/poll). Chỉ ra rõ KHE HỞ: chủ đề nào họ đánh mạnh mà ta chưa làm, hoặc chủ đề nóng mà chưa ai đánh.
- "press": 2-4 dòng tin báo chí đáng chú ý (mỗi dòng 1 câu). Ngắn thôi — đây là phần phụ.
- "todos": 5-7 việc CỤ THỂ tuần này cho đội content (mỗi việc: "title" ngắn + "action" 1 câu làm gì). Ưu tiên bám chủ đề đang nóng trên MXH và khe hở đối thủ bỏ trống. Nêu rõ nên đăng kênh nào (Facebook/TikTok/YouTube/blog).

KHÔNG bịa số liệu — chỉ dùng số có trong dữ liệu; chủ đề nào thiếu số thì bỏ trống chứ đừng đoán. KHÔNG nhắc tên trường đối thủ trong "todos" (chỉ trong "market"). Viết tiếng Việt tự nhiên, ngắn gọn, mỗi dòng 1 ý.`;

// Prompt VẼ 1 SLIDE gửi cho Gemini (node "Tách slide" của n8n). Đây là thứ quyết
// định ẢNH trông thế nào + chữ render ra sao. Dạng TEMPLATE — code thay các
// placeholder trong ngoặc nhọn bằng giá trị thật của từng slide:
//   {IDX} {TOTAL} {ROLE} {STYLE} {COVER_NOTE} {HEADING} {BODY}
// Sửa thoải mái nhưng GIỮ các placeholder cần dùng (xoá {HEADING}/{BODY} thì
// slide sẽ thiếu nội dung). {STYLE} = mô tả phong cách chung do B1 tự chọn cho
// cả bộ; {COVER_NOTE} = ghi chú riêng cho trang bìa / trang đồng bộ với bìa.
const CONG_THUC_VE_SLIDE = `Thiết kế slide {IDX}/{TOTAL} ({ROLE}) của MỘT bộ carousel infographic giáo dục. PHONG CÁCH CHUNG (BẮT BUỘC giống hệt cả bộ để ĐỒNG BỘ: cùng tông màu, cùng font, cùng kiểu bố cục): {STYLE}. Ảnh VUÔNG 1:1 (1080x1080) cho bài đăng Facebook, là INFOGRAPHIC ĐẸP có hình minh hoạ (KHÔNG dùng ảnh chụp người/cảnh thật). Chữ TIẾNG VIỆT có dấu, rõ ràng, đúng chính tả. Ở góc dưới để TÊN THƯƠNG HIỆU dạng CHỮ "Trường Việt Anh" (chữ có dấu, gọn) — RIÊNG tên thương hiệu này KHÔNG kèm logo/icon/biểu tượng/emblem, chỉ là CHỮ; các phần khác VẪN có hình minh hoạ.{COVER_NOTE} NỘI DUNG: tiêu đề "{HEADING}". Ý chính: "{BODY}". Đây là INFOGRAPHIC CÓ HÌNH: phải CÂN BẰNG giữa HÌNH MINH HOẠ/icon sáng tạo và CHỮ. Chữ VỪA ĐỦ làm rõ ý (rõ nét, đủ lớn, đúng chính tả), KHÔNG nhồi chữ, KHÔNG để chữ lấp kín làm mất hình. Viết SÚC TÍCH hơn một chút: giảm khoảng 10-20% lượng chữ trên ảnh so với mức thông thường (cắt từ thừa, bỏ ý lặp, gọn câu lại) nhưng VẪN giữ đủ ý; bớt chữ vừa phải để giảm lỗi chính tả khi render, KHÔNG làm ảnh trống trải hay cụt ý. Mỗi chữ phải đúng chính tả tiếng Việt có dấu. Nếu ý nhiều phần thì dùng ICON + cụm từ ngắn / gạch đầu dòng gọn thay vì viết cả đoạn. Ưu tiên TRỰC QUAN, đẹp, hiểu được trong 3 giây.`;

// ── REGISTRY ────────────────────────────────────────────────────────────────

export const VIRAL_SKILL_DEFS: ViralSkillDef[] = [
  // Nền tảng chung (dùng cho nhiều định dạng)
  { key: 'ho-so-truong', label: 'Hồ sơ trường (bản đầy đủ)', group: 'Nền tảng chung', description: 'Dữ kiện thật về trường — nạp vào skill viết Blog', content: HO_SO_TRUONG },
  { key: 'ho-so-truong-ngan', label: 'Hồ sơ trường (bản gọn)', group: 'Nền tảng chung', description: 'Bản rút gọn — nạp vào skill viết Podcast', content: HO_SO_TRUONG_NGAN },
  { key: 'chinh-ta', label: 'Chính tả bắt buộc', group: 'Nền tảng chung', description: 'Luật chính tả tiếng Việt + tên trường — mọi định dạng', content: CHINH_TA },
  { key: 'cta-that', label: 'CTA chỉ dùng thật', group: 'Nền tảng chung', description: 'Kênh liên hệ có thật, cấm bịa ưu đãi — blog & podcast', content: CTA_THAT },
  { key: 'diem-tua', label: 'Đa dạng điểm tựa (9 kiểu)', group: 'Nền tảng chung', description: 'Mỗi dòng 1 kiểu dẫn chứng — xoay vòng chống lặp khi sản xuất', content: DIEM_TUA },
  { key: 'thu-vien-cau-chuyen', label: 'Thư viện câu chuyện thật', group: 'Nền tảng chung', description: 'Quy tắc dùng câu chuyện từ sheet Testimonials — điểm tựa cho carousel & blog', content: THU_VIEN_CAU_CHUYEN },
  { key: 'he-thong-viet-anh', label: 'Vai hệ thống Việt Anh', group: 'Nền tảng chung', description: 'Câu lệnh vai trò gốc cho chấm điểm / viết lại / caption', content: HE_THONG_VA },
  // Sản xuất
  { key: 'giong-van-blog', label: 'Giọng văn Blog', group: 'Sản xuất', description: '5 phẩm chất giọng anh Dương — dùng khi viết blog', content: GIONG_BLOG },
  { key: 'cong-thuc-blog', label: 'Công thức Blog (EEAT)', group: 'Sản xuất', description: 'Cấu trúc EEAT + 5 tầng lập luận + từ cấm — sản xuất blog .docx', content: CONG_THUC_BLOG },
  { key: 'giong-podcast', label: 'Giọng Podcast', group: 'Sản xuất', description: 'Giọng kể + luật xưng hô trung tính cho TTS', content: GIONG_PODCAST },
  { key: 'cong-thuc-podcast', label: 'Công thức Podcast', group: 'Sản xuất', description: 'Kể chuyện Twist/Reveal + cấu trúc tập + value-first — sản xuất podcast', content: CONG_THUC_PODCAST },
  { key: 'cong-thuc-infographic', label: 'Công thức Infographic', group: 'Sản xuất', description: 'Khung thiết kế ảnh Gemini (code tự thêm tỉ lệ + nội dung bài)', content: CONG_THUC_INFOGRAPHIC },
  { key: 'cong-thuc-carousel', label: 'Công thức Carousel (fb-value-sharing)', group: 'Sản xuất', description: 'HOOK→REWARD→SHARE + ❌/✅ + tự chấm ≥80 — bộ slide infographic, port từ n8n', content: CONG_THUC_CAROUSEL },
  { key: 'cong-thuc-ve-slide', label: 'Công thức vẽ slide Carousel (ảnh Gemini)', group: 'Sản xuất', description: 'Prompt gửi Gemini vẽ TỪNG slide (1:1, có hình, chữ vừa đủ). Template — giữ placeholder {STYLE}/{HEADING}/{BODY}/{IDX}/{TOTAL}/{ROLE}/{COVER_NOTE}', content: CONG_THUC_VE_SLIDE },
  // Chấm điểm & phân loại
  { key: 'nguyen-tac-chon-nhom', label: 'Nguyên tắc chọn nhóm (cấp học)', group: 'Chấm & phân loại', description: 'Dấu hiệu MN/TH/THCS/THPT — routing khi chấm điểm', content: NGUYEN_TAC_CHON_NHOM },
  { key: 'skill-phan-loai-viet-lai', label: 'Phân loại + viết lại (4 bước)', group: 'Chấm & phân loại', description: 'Nhiệm vụ A/B/C/D: chọn nhóm, viết lại, chấm, gán loại SX + podcast_score', content: SKILL_PHAN_LOAI_VIET_LAI },
  { key: 'rubric-du-bao-share', label: 'Rubric dự báo share (v2)', group: 'Chấm & phân loại', description: 'Người chấm độc lập: 5 cổng loại + 7 tiêu chí, ngưỡng 90 (Bot Zalo 80) — chấm bài của trường trước khi đăng', content: RUBRIC_DU_BAO_SHARE },
  // Đặc tả v2: rubric cũ CHỈ còn dùng để LỌC bài nguồn cào (bài của trang khác,
  // chưa phải bài của trường — chấm bằng rubric share sẽ trượt cổng G4 hết).
  // Giữ key để không vỡ UI/bản tuỳ chỉnh cũ.
  { key: 'tieu-chi-cham-diem', label: '(cũ) Rubric lọc bài nguồn cào', group: 'Chấm & phân loại', description: 'Chỉ dùng để lọc bài viral cào về; bài của trường chấm bằng "Rubric dự báo share (v2)"', content: TIEU_CHI_CHAM_DIEM },
  { key: 'skill-lead-magnet', label: 'Gợi ý Lead magnet (5 loại, có xếp hạng)', group: 'Chấm & phân loại', description: 'Chấm ebook/checklist/app/template/quiz cho từng content — loại nào nên làm nhất', content: SKILL_LEAD_MAGNET },
  { key: 'skill-mo-cong-thuc', label: 'Mổ công thức viral', group: 'Chấm & phân loại', description: 'Vai phân tích vì sao bài được share (nút Mổ công thức)', content: SKILL_MO_CONG_THUC },
  { key: 'skill-tong-hop-chu-de', label: 'Tổng hợp chủ đề (nhiều nguồn → 1 content)', group: 'Chấm & phân loại', description: 'Gom nhiều nguồn cùng chủ đề thành 1 content gốc + chọn nhóm + viết + chấm', content: SKILL_TONG_HOP_CHU_DE },
  // Báo cáo
  { key: 'skill-ban-tin-tuan', label: 'Bản tin tuần + todo list', group: 'Báo cáo', description: 'Khung tổng hợp tuần gửi Zalo/email (T2-4-6 + CN)', content: SKILL_BAN_TIN_TUAN },
];

const DEF_BY_KEY = new Map(VIRAL_SKILL_DEFS.map((d) => [d.key, d]));

// ── API đọc/ghi ─────────────────────────────────────────────────────────────

// Nội dung skill LÚC GỌI: file override → không có thì mặc định.
export function getSkill(key: string): string {
  const def = DEF_BY_KEY.get(key);
  try {
    const raw = fs.readFileSync(fileOf(key), 'utf8');
    if (raw && raw.trim()) return raw;
  } catch {
    /* chưa có override */
  }
  return def?.content || '';
}

export function isSkillCustom(key: string): boolean {
  try {
    return fs.existsSync(fileOf(key)) && fs.statSync(fileOf(key)).size > 0;
  } catch {
    return false;
  }
}

export function setSkill(key: string, content: string): boolean {
  if (!DEF_BY_KEY.has(key)) return false;
  fs.writeFileSync(fileOf(key), String(content ?? ''), 'utf8');
  return true;
}

// Xoá override → quay về bản mặc định trong code.
export function resetSkill(key: string): boolean {
  if (!DEF_BY_KEY.has(key)) return false;
  try {
    fs.unlinkSync(fileOf(key));
  } catch {
    /* chưa có file — coi như đã reset */
  }
  return true;
}

// THU HỒI override MỘT LẦN cho 1 skill khi bản mặc định trong code thay đổi
// về CHẤT (không chỉ sửa câu chữ). Lý do: getSkill() ưu tiên file override
// trong CONFIG_DIR, nên bản tuỳ chỉnh cũ trên VPS sẽ ĐÈ bản mặc định mới và
// người dùng tưởng deploy không ăn.
//   - chạy ĐÚNG 1 LẦN mỗi tag: đánh dấu bằng file .reset-<tag> cạnh đó, nên
//     restart container nhiều lần cũng không thu hồi lại bản user vừa sửa;
//   - KHÔNG xoá trắng: đổi tên thành <key>.md.bak-<tag> để còn đường lấy lại.
export function retireSkillOverride(key: string, tag: string): boolean {
  if (!DEF_BY_KEY.has(key)) return false;
  const marker = path.join(DIR(), `.reset-${key}-${tag}`);
  try {
    if (fs.existsSync(marker)) return false; // đã thu hồi trước đó
  } catch {
    return false;
  }
  let moved = false;
  try {
    const src = fileOf(key);
    if (fs.existsSync(src) && fs.statSync(src).size > 0) {
      fs.renameSync(src, `${src}.bak-${tag}`);
      moved = true;
    }
  } catch {
    /* không đổi tên được — vẫn ghi marker để khỏi thử lại mỗi lần khởi động */
  }
  try {
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
  } catch {
    /* không ghi được marker — lần sau thử lại, không sao */
  }
  return moved;
}

export function listSkills() {
  return VIRAL_SKILL_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    group: d.group,
    description: d.description,
    isCustom: isSkillCustom(d.key),
    content: getSkill(d.key),
    defaultLength: d.content.length,
  }));
}

// Điểm tựa: mỗi dòng không rỗng = 1 kiểu (xoay vòng theo hash bài).
export function getEvidenceModes(): string[] {
  const lines = getSkill('diem-tua')
    .split('\n')
    .map((s) => s.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean);
  return lines.length ? lines : [DIEM_TUA.split('\n')[0]];
}
