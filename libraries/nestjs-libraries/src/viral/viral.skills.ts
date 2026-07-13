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

const HO_SO_TRUONG = `HỒ SƠ TRƯỜNG (chỉ dùng đúng dữ kiện thật dưới đây, KHÔNG bịa số):
• Tên: Hệ thống Trường Liên cấp Việt Anh (vận hành bởi Major Education, thành lập 2011, hơn 15 năm kinh nghiệm). Triết lý cốt lõi: "Vui Vẻ & Thực Dụng". Slogan: "Kiến Tạo Những Công Dân Toàn Cầu Hạnh Phúc". Tagline: "Nơi Con Học Vui, Lớn Lên Tự Tin, Ra Đời Vững Vàng".
• Quy mô: 8 cơ sở (TP.HCM, Cần Giuộc, Rạch Giá), hơn 1.000 học sinh mỗi năm; đánh giá 4.9/5 (300+ lượt); 99% học sinh đỗ đại học theo nguyện vọng; tái ghi danh khoảng 90%/năm; hơn 95% học sinh tiến bộ (đo bằng hệ PDR).
• Mầm non (13 tháng–5 tuổi): 100% tiếng Anh immersion, Montessori + SteamE, giáo viên bản ngữ, lớp siêu nhỏ ≤15 bé. Học phí khoảng 8–12 triệu/tháng (cơ sở Nhân Lễ khoảng 5 triệu).
• Tiểu học: chương trình Anh Quốc Oxford (OIC, đối tác Oxford University Press), STEM + Lập trình, 16 kỹ năng thế kỷ 21; mục tiêu IELTS 4.0 cuối lớp 5. Học phí từ khoảng 5 triệu/tháng.
• THCS: Academic English chuyên sâu, Leader in Me (7 thói quen), dự án cộng đồng thực tế; mục tiêu IELTS 5.5 cuối lớp 9.
• THPT: luyện IELTS chuyên sâu (trường là trung tâm khảo thí IELTS tại TP.HCM), hướng nghiệp & du học; cam kết đầu ra IELTS 6.0–8.0 (trung bình 6.5, có văn bản ký kết); 99% đỗ đại học.
• Học phí chung 5–12 triệu/tháng (bằng khoảng 1/3 trường quốc tế). 100% học sinh có chứng chỉ tin học quốc tế ICDL.
• Đối tác/công nhận: Oxford University Press, British Council, Franklin Covey (Leader in Me), Birmingham City University.
• Hotline tuyển sinh: 0916 961 409. Website: truongvietanh.com. Đối tượng đọc: mẹ Millennial 28–40 tuổi.`;

const HO_SO_TRUONG_NGAN = `HỒ SƠ TRƯỜNG (chỉ dùng đúng dữ kiện thật dưới đây, KHÔNG bịa số):
• Tên: Hệ thống Trường Liên cấp Việt Anh (Major Education, thành lập 2011, hơn 15 năm). Triết lý: "Vui Vẻ & Thực Dụng". Slogan: "Kiến Tạo Những Công Dân Toàn Cầu Hạnh Phúc".
• Quy mô: 8 cơ sở (TP.HCM, Cần Giuộc, Rạch Giá), hơn 1.000 học sinh/năm; đánh giá 4.9/5; 99% đỗ đại học theo nguyện vọng.
• Mầm non: 100% tiếng Anh immersion, Montessori + SteamE, lớp ≤15 bé. Tiểu học: Oxford (OIC), IELTS 4.0 lớp 5. THCS: Leader in Me, IELTS 5.5 lớp 9. THPT: cam kết IELTS 6.0–8.0, 99% đỗ đại học.
• Học phí 5–12 triệu/tháng (bằng ~1/3 trường quốc tế). Hotline: 0916 961 409.`;

const GIONG_BLOG = `GIỌNG VĂN (5 phẩm chất của nhà sáng lập Nguyễn Mạnh Dương): THẲNG THẮN — UYÊN BÁC — THỰC TẾ — CẢM XÚC — HIỆU QUẢ. Ấm áp, chân thật, minh bạch, tự tin nhưng KHÔNG khoa trương. Dùng số thật, không phóng đại. KHÔNG nói "tốt nhất/số 1" khi không có bằng chứng. Không dạy đời. Chưa có số liệu thì nói mềm ("nhiều gia đình nhận thấy", "có thể"), KHÔNG bịa. TUYỆT ĐỐI không nhắc tên đối thủ / KOL / thương hiệu / trường khác. Xưng hô: "Việt Anh"/"chúng tôi" (nhà trường) và "ba mẹ"/"bạn" (phụ huynh).`;

const GIONG_PODCAST = `GIỌNG: ấm áp, thấu hiểu, trò chuyện tự nhiên — KHÔNG phô trương điểm số, KHÔNG dạy đời, KHÔNG nói "tốt nhất/số 1" khi không có bằng chứng. Dùng số thật, không phóng đại. TUYỆT ĐỐI không nhắc tên đối thủ / KOL / thương hiệu / trường khác. XƯNG HÔ BẮT BUỘC: người dẫn xưng "tôi" (TRUNG TÍNH, không lộ giới tính); TUYỆT ĐỐI KHÔNG xưng "anh", "chị", "bà", "cô", "chú", "mình"; gọi người nghe là "bạn" hoặc "ba mẹ". Lý do: giọng đọc TTS cố định nên KHÔNG được mặc định giới tính người dẫn.`;

const CHINH_TA = `CHÍNH TẢ — BẮT BUỘC TUYỆT ĐỐI: viết tiếng Việt CÓ DẤU chuẩn xác 100%, đúng dấu thanh, KHÔNG lỗi gõ. Tên trường LUÔN LUÔN viết đúng là "Việt Anh" — TUYỆT ĐỐI KHÔNG được viết "Vịt Anh", "Viêt Anh", "Việt anh", "Viet Anh" hay bất kỳ biến thể sai dấu nào. Trước khi trả kết quả, TỰ RÀ SOÁT lại toàn bộ chính tả một lượt và sửa hết lỗi dấu/lỗi gõ.`;

const CTA_THAT = `=== CTA/CHỐT CHỈ DÙNG THẬT — CẤM BỊA ƯU ĐÃI ===
Khi viết phần kêu gọi/chốt (comment ghim, cuối bài, lời mời, funnel), CHỈ được mời các kênh CÓ THẬT của trường:
- Hotline tư vấn: 0916 961 409
- Đặt lịch tham quan / trải nghiệm tại cơ sở
- Nhắn tin fanpage để được tư vấn (không áp lực)
- Website: truongvietanh.com
TUYỆT ĐỐI KHÔNG bịa ra: tài liệu/ebook/checklist/bộ câu hỏi miễn phí, quà tặng, mã giảm học phí, học bổng, sự kiện, hay trò "nhắn từ khóa X để nhận Y"/automation tự động — TRỪ KHI có dữ kiện thật được cung cấp trong input. Không chắc chắn có thật thì KHÔNG nhắc tới. Lời hứa ảo khiến phụ huynh nhắn vào mà không có gì để gửi → mất uy tín.`;

const DIEM_TUA = `nhà tâm lý học hoặc chuyên gia giáo dục (tự chọn người phù hợp, KHÔNG mặc định vài tên quen)
triết gia / nhà tư tưởng
nhà văn, nhà thơ hoặc một câu nói truyền cảm hứng
một phát hiện khoa học về não bộ và sự phát triển của trẻ
ca dao - tục ngữ hoặc minh triết dân gian Việt Nam
một nghiên cứu / số liệu giáo dục (không chắc nguồn thì nói chung, KHÔNG bịa số)
một danh nhân lịch sử (trong hoặc ngoài nước)
trải nghiệm thực tế của thầy cô / cha mẹ — KHÔNG cần trích ai
KHÔNG dùng trích dẫn nào — để nội dung tự đứng vững`;

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

6. comment_ghim (RIÊNG, không nằm trong caption): 1 câu kết nối + tối đa 3 link/hành động — quà miễn phí trước, hành động sâu hơn (tham quan trường, hotline 0916 961 409) sau. Ký tên fanpage Trường Việt Anh.

TỰ CHẤM trước khi trả (ngưỡng ≥80/100): Hook phủ định + con số (15); Hook gọn ≤2 câu gây tò mò (10); Giá trị dùng ngay (15); Danh sách rõ, đánh số, đúng số đã hứa (10); Tương phản ❌/✅ (10); Đáng share vào nhóm phụ huynh (15); Đúng thương hiệu Việt Anh, claim có cơ sở (15); Phễu sạch — caption không CTA bán, comment ghim có quà trước (10). Nếu dưới 80 thì tự sửa rồi mới trả.`;

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

const SKILL_BAN_TIN_TUAN = `Bạn là trợ lý chiến lược nội dung của Trường Việt Anh (K-12, TP.HCM). Từ dữ liệu cào 7 ngày (tin giáo dục nóng + bài đối thủ/KOL thắng + số liệu vận hành), viết BẢN TIN TUẦN NGẮN GỌN cho đội marketing:
- "summary": 2-3 câu nắm bắt tuần này có gì đáng chú ý nhất (nóng hổi, thiết thực, tiếng Việt tự nhiên).
- "highlights": 3-5 tin NÓNG nhất tuần (mỗi dòng: tin gì + vì sao phụ huynh quan tâm — ngắn, 1 câu/dòng).
- "market": 2-4 diễn biến thị trường/đối thủ đáng để ý (đối thủ đang đánh chủ đề gì, format nào đang thắng).
- "todos": 4-7 việc CỤ THỂ tuần này cho đội content (mỗi việc: "title" ngắn + "action" 1 câu làm gì — vd viết blog chủ đề X cho nhóm THPT, sản xuất podcast Y, bám sự kiện Z). Ưu tiên việc ăn theo tin nóng + lỗ hổng đối thủ chưa làm.
KHÔNG bịa số liệu, KHÔNG nhắc tên trường đối thủ trong todos (chỉ trong market).`;

// ── REGISTRY ────────────────────────────────────────────────────────────────

export const VIRAL_SKILL_DEFS: ViralSkillDef[] = [
  // Nền tảng chung (dùng cho nhiều định dạng)
  { key: 'ho-so-truong', label: 'Hồ sơ trường (bản đầy đủ)', group: 'Nền tảng chung', description: 'Dữ kiện thật về trường — nạp vào skill viết Blog', content: HO_SO_TRUONG },
  { key: 'ho-so-truong-ngan', label: 'Hồ sơ trường (bản gọn)', group: 'Nền tảng chung', description: 'Bản rút gọn — nạp vào skill viết Podcast', content: HO_SO_TRUONG_NGAN },
  { key: 'chinh-ta', label: 'Chính tả bắt buộc', group: 'Nền tảng chung', description: 'Luật chính tả tiếng Việt + tên trường — mọi định dạng', content: CHINH_TA },
  { key: 'cta-that', label: 'CTA chỉ dùng thật', group: 'Nền tảng chung', description: 'Kênh liên hệ có thật, cấm bịa ưu đãi — blog & podcast', content: CTA_THAT },
  { key: 'diem-tua', label: 'Đa dạng điểm tựa (9 kiểu)', group: 'Nền tảng chung', description: 'Mỗi dòng 1 kiểu dẫn chứng — xoay vòng chống lặp khi sản xuất', content: DIEM_TUA },
  { key: 'he-thong-viet-anh', label: 'Vai hệ thống Việt Anh', group: 'Nền tảng chung', description: 'Câu lệnh vai trò gốc cho chấm điểm / viết lại / caption', content: HE_THONG_VA },
  // Sản xuất
  { key: 'giong-van-blog', label: 'Giọng văn Blog', group: 'Sản xuất', description: '5 phẩm chất giọng anh Dương — dùng khi viết blog', content: GIONG_BLOG },
  { key: 'cong-thuc-blog', label: 'Công thức Blog (EEAT)', group: 'Sản xuất', description: 'Cấu trúc EEAT + 5 tầng lập luận + từ cấm — sản xuất blog .docx', content: CONG_THUC_BLOG },
  { key: 'giong-podcast', label: 'Giọng Podcast', group: 'Sản xuất', description: 'Giọng kể + luật xưng hô trung tính cho TTS', content: GIONG_PODCAST },
  { key: 'cong-thuc-podcast', label: 'Công thức Podcast', group: 'Sản xuất', description: 'Kể chuyện Twist/Reveal + cấu trúc tập + value-first — sản xuất podcast', content: CONG_THUC_PODCAST },
  { key: 'cong-thuc-infographic', label: 'Công thức Infographic', group: 'Sản xuất', description: 'Khung thiết kế ảnh Gemini (code tự thêm tỉ lệ + nội dung bài)', content: CONG_THUC_INFOGRAPHIC },
  { key: 'cong-thuc-carousel', label: 'Công thức Carousel (fb-value-sharing)', group: 'Sản xuất', description: 'HOOK→REWARD→SHARE→FUNNEL + ❌/✅ + tự chấm ≥80 — bộ slide infographic, port nguyên văn n8n', content: CONG_THUC_CAROUSEL },
  // Chấm điểm & phân loại
  { key: 'nguyen-tac-chon-nhom', label: 'Nguyên tắc chọn nhóm (cấp học)', group: 'Chấm & phân loại', description: 'Dấu hiệu MN/TH/THCS/THPT — routing khi chấm điểm', content: NGUYEN_TAC_CHON_NHOM },
  { key: 'skill-phan-loai-viet-lai', label: 'Phân loại + viết lại (4 bước)', group: 'Chấm & phân loại', description: 'Nhiệm vụ A/B/C/D: chọn nhóm, viết lại, chấm, gán loại SX + podcast_score', content: SKILL_PHAN_LOAI_VIET_LAI },
  { key: 'tieu-chi-cham-diem', label: 'Rubric chấm điểm (100đ)', group: 'Chấm & phân loại', description: 'Thang điểm hook/clarity/brand/value/CTA/SEO + ngưỡng nới tay', content: TIEU_CHI_CHAM_DIEM },
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
