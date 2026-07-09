// ============================================================================
//  Prompt SẢN XUẤT nội dung (port nguyên văn từ n8n WF-SanXuat-Manual):
//   • Blog  — giáo trình "mkt-blog-article-writer" (EEAT + 5 tầng lập luận)
//   • Podcast — phương pháp kể chuyện Twist/Reveal, viết cho TAI NGHE (TTS đọc)
//   • Infographic — khung tự do cho Gemini image (nano banana)
//  Mỗi bản sinh xoay vòng "điểm tựa" (evidence mode) theo hash id để chống lặp.
// ============================================================================

export interface ProduceInput {
  id: string; // để xoay evidence mode ổn định theo bài
  topic: string; // chủ đề (title bài nguồn)
  idea: string; // nội dung định hướng (aiContent/content đã duyệt)
  detail?: string; // góc tiếp cận (reason từ AI chấm)
  category?: string; // nhóm khách (persona)
  url?: string; // nguồn tham khảo
}

const EVIDENCE_MODES = [
  'nhà tâm lý học hoặc chuyên gia giáo dục (tự chọn người phù hợp, KHÔNG mặc định vài tên quen)',
  'triết gia / nhà tư tưởng',
  'nhà văn, nhà thơ hoặc một câu nói truyền cảm hứng',
  'một phát hiện khoa học về não bộ và sự phát triển của trẻ',
  'ca dao - tục ngữ hoặc minh triết dân gian Việt Nam',
  'một nghiên cứu / số liệu giáo dục (không chắc nguồn thì nói chung, KHÔNG bịa số)',
  'một danh nhân lịch sử (trong hoặc ngoài nước)',
  'trải nghiệm thực tế của thầy cô / cha mẹ — KHÔNG cần trích ai',
  'KHÔNG dùng trích dẫn nào — để nội dung tự đứng vững',
];

function hashSeed(s: string): number {
  let h = 0;
  s = String(s || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const evidenceMode = (id: string, fmt: string) =>
  EVIDENCE_MODES[hashSeed(`${id}|${fmt}`) % EVIDENCE_MODES.length];

// ── Hồ sơ trường (bản đầy đủ — blog) ────────────────────────────────────────
const HOSO_FULL = [
  'HỒ SƠ TRƯỜNG (chỉ dùng đúng dữ kiện thật dưới đây, KHÔNG bịa số):',
  '• Tên: Hệ thống Trường Liên cấp Việt Anh (vận hành bởi Major Education, thành lập 2011, hơn 15 năm kinh nghiệm). Triết lý cốt lõi: "Vui Vẻ & Thực Dụng". Slogan: "Kiến Tạo Những Công Dân Toàn Cầu Hạnh Phúc". Tagline: "Nơi Con Học Vui, Lớn Lên Tự Tin, Ra Đời Vững Vàng".',
  '• Quy mô: 8 cơ sở (TP.HCM, Cần Giuộc, Rạch Giá), hơn 1.000 học sinh mỗi năm; đánh giá 4.9/5 (300+ lượt); 99% học sinh đỗ đại học theo nguyện vọng; tái ghi danh khoảng 90%/năm; hơn 95% học sinh tiến bộ (đo bằng hệ PDR).',
  '• Mầm non (13 tháng–5 tuổi): 100% tiếng Anh immersion, Montessori + SteamE, giáo viên bản ngữ, lớp siêu nhỏ ≤15 bé. Học phí khoảng 8–12 triệu/tháng (cơ sở Nhân Lễ khoảng 5 triệu).',
  '• Tiểu học: chương trình Anh Quốc Oxford (OIC, đối tác Oxford University Press), STEM + Lập trình, 16 kỹ năng thế kỷ 21; mục tiêu IELTS 4.0 cuối lớp 5. Học phí từ khoảng 5 triệu/tháng.',
  '• THCS: Academic English chuyên sâu, Leader in Me (7 thói quen), dự án cộng đồng thực tế; mục tiêu IELTS 5.5 cuối lớp 9.',
  '• THPT: luyện IELTS chuyên sâu (trường là trung tâm khảo thí IELTS tại TP.HCM), hướng nghiệp & du học; cam kết đầu ra IELTS 6.0–8.0 (trung bình 6.5, có văn bản ký kết); 99% đỗ đại học.',
  '• Học phí chung 5–12 triệu/tháng (bằng khoảng 1/3 trường quốc tế). 100% học sinh có chứng chỉ tin học quốc tế ICDL.',
  '• Đối tác/công nhận: Oxford University Press, British Council, Franklin Covey (Leader in Me), Birmingham City University.',
  '• Hotline tuyển sinh: 0916 961 409. Website: truongvietanh.com. Đối tượng đọc: mẹ Millennial 28–40 tuổi.',
].join('\n');

// ── Hồ sơ trường (bản gọn — podcast) ────────────────────────────────────────
const HOSO_SHORT = [
  'HỒ SƠ TRƯỜNG (chỉ dùng đúng dữ kiện thật dưới đây, KHÔNG bịa số):',
  '• Tên: Hệ thống Trường Liên cấp Việt Anh (Major Education, thành lập 2011, hơn 15 năm). Triết lý: "Vui Vẻ & Thực Dụng". Slogan: "Kiến Tạo Những Công Dân Toàn Cầu Hạnh Phúc".',
  '• Quy mô: 8 cơ sở (TP.HCM, Cần Giuộc, Rạch Giá), hơn 1.000 học sinh/năm; đánh giá 4.9/5; 99% đỗ đại học theo nguyện vọng.',
  '• Mầm non: 100% tiếng Anh immersion, Montessori + SteamE, lớp ≤15 bé. Tiểu học: Oxford (OIC), IELTS 4.0 lớp 5. THCS: Leader in Me, IELTS 5.5 lớp 9. THPT: cam kết IELTS 6.0–8.0, 99% đỗ đại học.',
  '• Học phí 5–12 triệu/tháng (bằng ~1/3 trường quốc tế). Hotline: 0916 961 409.',
].join('\n');

const GIONG_BLOG =
  'GIỌNG VĂN (5 phẩm chất của nhà sáng lập Nguyễn Mạnh Dương): THẲNG THẮN — UYÊN BÁC — THỰC TẾ — CẢM XÚC — HIỆU QUẢ. Ấm áp, chân thật, minh bạch, tự tin nhưng KHÔNG khoa trương. Dùng số thật, không phóng đại. KHÔNG nói "tốt nhất/số 1" khi không có bằng chứng. Không dạy đời. Chưa có số liệu thì nói mềm ("nhiều gia đình nhận thấy", "có thể"), KHÔNG bịa. TUYỆT ĐỐI không nhắc tên đối thủ / KOL / thương hiệu / trường khác. Xưng hô: "Việt Anh"/"chúng tôi" (nhà trường) và "ba mẹ"/"bạn" (phụ huynh).';

const GIONG_POD =
  'GIỌNG: ấm áp, thấu hiểu, trò chuyện tự nhiên — KHÔNG phô trương điểm số, KHÔNG dạy đời, KHÔNG nói "tốt nhất/số 1" khi không có bằng chứng. Dùng số thật, không phóng đại. TUYỆT ĐỐI không nhắc tên đối thủ / KOL / thương hiệu / trường khác. XƯNG HÔ BẮT BUỘC: người dẫn xưng "tôi" (TRUNG TÍNH, không lộ giới tính); TUYỆT ĐỐI KHÔNG xưng "anh", "chị", "bà", "cô", "chú", "mình"; gọi người nghe là "bạn" hoặc "ba mẹ". Lý do: giọng đọc TTS cố định nên KHÔNG được mặc định giới tính người dẫn.';

const CHINHTA =
  'CHÍNH TẢ — BẮT BUỘC TUYỆT ĐỐI: viết tiếng Việt CÓ DẤU chuẩn xác 100%, đúng dấu thanh, KHÔNG lỗi gõ. Tên trường LUÔN LUÔN viết đúng là "Việt Anh" — TUYỆT ĐỐI KHÔNG được viết "Vịt Anh", "Viêt Anh", "Việt anh", "Viet Anh" hay bất kỳ biến thể sai dấu nào. Trước khi trả kết quả, TỰ RÀ SOÁT lại toàn bộ chính tả một lượt và sửa hết lỗi dấu/lỗi gõ.';

// Khối CTA chung: chỉ mời kênh CÓ THẬT, cấm bịa ưu đãi/tài liệu/sự kiện.
const CTA_THAT = `=== CTA/CHỐT CHỈ DÙNG THẬT — CẤM BỊA ƯU ĐÃI ===
Khi viết phần kêu gọi/chốt (comment ghim, cuối bài, lời mời, funnel), CHỈ được mời các kênh CÓ THẬT của trường:
- Hotline tư vấn: 0916 961 409
- Đặt lịch tham quan / trải nghiệm tại cơ sở
- Nhắn tin fanpage để được tư vấn (không áp lực)
- Website: truongvietanh.com
TUYỆT ĐỐI KHÔNG bịa ra: tài liệu/ebook/checklist/bộ câu hỏi miễn phí, quà tặng, mã giảm học phí, học bổng, sự kiện, hay trò "nhắn từ khóa X để nhận Y"/automation tự động — TRỪ KHI có dữ kiện thật được cung cấp trong input. Không chắc chắn có thật thì KHÔNG nhắc tới. Lời hứa ảo khiến phụ huynh nhắn vào mà không có gì để gửi → mất uy tín.`;

const diversityBlock = (evMode: string, tail: string) => `=== ĐA DẠNG ĐIỂM TỰA — CHỐNG LẶP (OVERFITTING) ===
Khi cần một điểm tựa/dẫn chứng để tăng sức nặng, LẦN NÀY ưu tiên theo kiểu: ${evMode}.
- Tự chọn nhân vật/câu/ý phù hợp nhất trong kiểu đó; KHÔNG bắt buộc, không hợp thì bỏ qua.
- TUYỆT ĐỐI tránh lặp lại vài cái tên quen (Carol Dweck, Stephen Covey, Angela Duckworth...); đa dạng tối đa.
- Mỗi nhân vật/câu chỉ nhắc 1 lần.
${tail}`;

// ── BLOG ────────────────────────────────────────────────────────────────────
const SKILL_BLOG = [
  'ÁP DỤNG PHƯƠNG PHÁP "mkt-blog-article-writer" (giáo trình viết blog SEO chuẩn EEAT của anh Dương). Bài blog này đăng lên website truongvietanh.com nên phải vừa lên top Google vừa giữ chân người đọc.',
  '',
  'CẤU TRÚC EEAT (bắt buộc):',
  '1. H1: chứa keyword chính + lợi ích + chạm cảm xúc (không tiêu đề chung chung).',
  '2. MỞ BÀI 100–150 từ: mở bằng 1 câu ngắn gây chú ý → gọi tên đúng nỗi đau thật của ba mẹ → hứa bài giải quyết được gì → tín hiệu uy tín (kinh nghiệm 15+ năm / số liệu thật của Việt Anh).',
  '3. THÂN BÀI: 6–9 tiêu đề H2, MỖI H2 là MỘT luận điểm rõ ràng (không chung chung), dài 200–350 từ, triển khai theo 5 TẦNG LẬP LUẬN:',
  '   (a) Gọi tên vấn đề thật — ngắn, cụ thể.',
  '   (b) Dẫn chứng phù hợp — theo mục ĐA DẠNG ĐIỂM TỰA bên dưới — chỉ khi phù hợp, không nhồi.',
  '   (c) Quan điểm & thực tế tại Việt Anh ("Tại Việt Anh, chúng tôi…", lồng bằng chứng thật từ hồ sơ trường).',
  '   (d) Một câu chuyện/ví dụ thực tế cụ thể (học sinh, lớp học, gia đình) — KHÔNG bịa tên thật, mô tả chung.',
  '   (e) Hành động cụ thể ba mẹ làm được ngay (không mơ hồ).',
  '4. Chèn 2–3 lần khối nhấn mạnh mở đầu bằng "Góc nhìn từ Việt Anh:" hoặc "Tại Việt Anh, chúng tôi thấy rằng:" (dạng đoạn <p><strong>...</strong></p>).',
  '5. Có ÍT NHẤT 1 bảng so sánh (HTML <table>) khi chủ đề cho phép (vd: cách làm cũ vs cách làm đúng, các lựa chọn).',
  '6. FAQ cuối bài: 5–7 câu hỏi ba mẹ THẬT SỰ hay hỏi (không phải câu marketing), mỗi câu 1 <h3> + câu trả lời <p>. Đặt dưới 1 <h2>Câu hỏi thường gặp</h2>.',
  '7. KẾT: lời mời nhẹ nhàng (đặt lịch tư vấn/tham quan, hotline 0916 961 409) — KHÔNG quảng cáo lố.',
  '',
  'NHỊP VĂN: xen kẽ câu ngắn (3–8 từ) → câu trung (15–20 từ) → câu ngắn. KHÔNG để 3 câu dài liên tiếp. Đoạn 3–4 dòng, không hơn.',
  'CÔNG THỨC TWIST/REVEAL cho mở bài và ít nhất 1 đoạn: hook cụ thể → chi tiết tạo cảm giác căng → câu lật ngược → insight tự hiện ra (không cần giải thích dài).',
  'SEO: keyword chính xuất hiện ở H1, mở bài, 1 H2, và kết; mật độ keyword tự nhiên ~1–1.5%. Độ dài 1500–2000 từ.',
  '',
  '5 NHÓM TỪ CẤM (tuyệt đối không dùng):',
  '• Sáo rỗng: xuất sắc, đỉnh cao, vượt trội, đột phá, thần kỳ, hoàn hảo.',
  '• Trang trọng giả: "Kính gửi quý phụ huynh", "Chúng tôi hân hạnh".',
  '• Marketing nhảm: "cơ hội vàng", "đừng bỏ lỡ", "ưu đãi có hạn".',
  '• Dạy đời: "Cha mẹ phải…", "Bạn nên…", "Hãy nhớ rằng…".',
  '• Mơ hồ: "rất", "vô cùng", "cực kỳ" khi không kèm số liệu/ví dụ.',
].join('\n');

export function buildBlogPrompt(r: ProduceInput): { system: string; user: string } {
  const evMode = evidenceMode(r.id, 'blog');
  let sys =
    'Bạn là chuyên gia content & SEO giáo dục cho Trường Việt Anh, viết theo giáo trình của nhà sáng lập Nguyễn Mạnh Dương.\n\n' +
    HOSO_FULL +
    '\n\n' +
    GIONG_BLOG +
    '\n\n' +
    CHINHTA +
    '\n\n' +
    SKILL_BLOG +
    '\n\nNHIỆM VỤ: từ nội dung định hướng (đã được duyệt & tối ưu cho nhóm khách), VIẾT thành 1 bài BLOG hoàn chỉnh bằng tiếng Việt theo ĐÚNG cấu trúc EEAT + 5 tầng lập luận ở trên, hữu ích thật sự cho phụ huynh, đúng giọng "Vui Vẻ & Thực Dụng". Bám đúng nỗi đau của nhóm khách được nêu.';
  sys += '\n\n' + diversityBlock(evMode, '- Tối đa 1-2 cho cả bài.');
  sys += '\n\n' + CTA_THAT;
  sys +=
    '\n\nTrả về CHỈ 1 JSON thuần (không kèm chữ nào khác, không bọc ```): {"title":"tiêu đề SEO chứa keyword + lợi ích","slug":"slug-khong-dau","meta_description":"<=160 ký tự, có keyword","tags":["..."],"body_html":"nội dung dạng HTML SẠCH: chỉ dùng h2,h3,p,ul,li,ol,strong,em,table,thead,tbody,tr,th,td — KHÔNG dùng html/head/body. Bao gồm cả phần FAQ và bảng so sánh."}';
  const user =
    'Chủ đề: ' + (r.topic || '') +
    '\nNội dung định hướng (đã tối ưu cho nhóm khách): ' + (r.idea || '') +
    '\nGóc tiếp cận: ' + (r.detail || '') +
    '\nNhóm khách: ' + (r.category || '') +
    '\nNguồn tham khảo: ' + (r.url || '');
  return { system: sys, user };
}

// ── PODCAST ─────────────────────────────────────────────────────────────────
const SKILL_POD = [
  'ÁP DỤNG PHƯƠNG PHÁP KỂ CHUYỆN của nhà sáng lập Nguyễn Mạnh Dương, chuyển thể cho AUDIO. Tập podcast này đăng lên YouTube nên phải GIỮ NGƯỜI NGHE từ giây đầu.',
  '',
  'CẤU TRÚC AUDIO (monologue 1 người dẫn, ~3–4 phút, 500–700 từ):',
  '1. HOOK 2–3 câu đầu theo công thức TWIST/REVEAL: một chi tiết/câu hỏi cụ thể chạm đúng nỗi lòng ba mẹ → tạo một chút căng → câu lật ngược khiến muốn nghe tiếp. KHÔNG mở bài chung chung kiểu "Xin chào quý vị và các bạn".',
  '2. THÂN: 2–3 ý chính, mỗi ý theo các tầng nhẹ — gọi tên vấn đề thật → một góc nhìn/dẫn chứng → một câu chuyện hoặc ví dụ phổ quát (không bịa tên) → một điều ba mẹ làm được ngay. Nhịp câu xen kẽ ngắn–dài. THÂN BÀI TUYỆT ĐỐI KHÔNG nhắc tên "Việt Anh"/tên trường.',
  '3. KẾT: một câu chốt ấm áp + CHỈ Ở ĐÂY mới nhắc "Việt Anh" đúng 1 lần + 1 lời mời rất nhẹ (tìm hiểu thêm / ghé thăm trải nghiệm) — KHÔNG đọc số điện thoại, KHÔNG đọc website, KHÔNG quảng cáo lố.',
  '',
  'VIẾT CHO TAI NGHE, KHÔNG CHO MẮT ĐỌC (vì TTS sẽ đọc):',
  '• Câu vừa phải, dễ đọc thành tiếng; tránh câu quá dài lê thê, tránh mệnh đề lồng nhau rối.',
  '• TUYỆT ĐỐI không dùng ký hiệu, gạch đầu dòng, emoji, dấu ngoặc đóng/mở phức tạp, URL, số thứ tự "1. 2. 3." trong lời đọc — viết liền mạch như nói.',
  '• Số liệu đọc được tự nhiên (vd "hơn một nghìn học sinh mỗi năm", "chín mươi chín phần trăm").',
  '• Giọng người thật, có nhịp thở, có chỗ ngừng tự nhiên bằng dấu chấm/phẩy.',
  '',
  '5 NHÓM TỪ CẤM (như blog): sáo rỗng (xuất sắc, đỉnh cao, vượt trội, đột phá); trang trọng giả; marketing nhảm (cơ hội vàng, đừng bỏ lỡ); dạy đời (Cha mẹ phải, Bạn nên); mơ hồ (rất, vô cùng không kèm dẫn chứng).',
].join('\n');

export function buildPodcastPrompt(r: ProduceInput): { system: string; user: string } {
  const evMode = evidenceMode(r.id, 'pod');
  let sys =
    'Bạn là biên tập viên podcast giáo dục cho Trường Việt Anh, viết theo phương pháp kể chuyện của nhà sáng lập Nguyễn Mạnh Dương.\n\n' +
    HOSO_SHORT +
    '\n\n' +
    GIONG_POD +
    '\n\n' +
    CHINHTA +
    '\n\n' +
    SKILL_POD +
    '\n\nNHIỆM VỤ: từ nội dung định hướng (đã được duyệt & tối ưu cho nhóm khách), viết lại thành 1 KỊCH BẢN podcast monologue HAY HƠN theo đúng cấu trúc audio ở trên, bằng tiếng Việt, để TTS đọc mượt. Bám đúng nỗi đau/mong muốn của nhóm khách.';
  sys += '\n\n' + diversityBlock(evMode, '- TỐI ĐA 1 điểm tựa cho CẢ TẬP.');
  sys += `\n\n=== CẤU TRÚC TẬP PODCAST (BẮT BUỘC, nằm trong full_script) ===
MỞ ĐẦU (~15-25 giây đầu):
- Lời chào: "Xin chào quý thính giả" (hoặc biến thể tự nhiên, ấm áp).
- 1 câu HOOK mở ngay để giữ người nghe: "Bạn có biết...", một con số bất ngờ, một câu hỏi chạm, hoặc tình huống quen thuộc.
- 1 câu giới thiệu hôm nay tôi sẽ nói về chủ đề gì.
KẾT THÚC (~15-20 giây cuối):
- Chốt thông điệp chính + 1 lời nhắn ấm/hành động nhẹ cho ba mẹ.
- Tạm biệt + hẹn gặp lại ở tập podcast sau (vd "Cảm ơn bạn đã lắng nghe, hẹn gặp lại ở tập tới nhé.").
Mở đầu & kết thúc nói tự nhiên như trò chuyện, KHÔNG sáo rỗng, KHÔNG như quảng cáo.`;
  sys += '\n\n' + CTA_THAT;
  sys += `\n\n=== PODCAST VALUE-FIRST + KHÔNG ĐỌC SỐ (BẮT BUỘC, GHI ĐÈ) ===
Tập này để TRAO GIÁ TRỊ THẬT cho ba mẹ như một người bạn chia sẻ, KHÔNG phải quảng cáo trường.
- THÂN BÀI: 100% giá trị (insight nuôi dạy con, câu chuyện, điều áp dụng được ngay). TUYỆT ĐỐI KHÔNG nhắc tên "Việt Anh"/"trường chúng tôi"/thành tích trong thân bài.
- CHỈ CÂU KẾT mới nhắc "Việt Anh" ĐÚNG 1 LẦN + 1 lời mời rất nhẹ. Không liệt kê thành tích, không nói "tốt nhất".
- TUYỆT ĐỐI KHÔNG đọc SỐ trong lời podcast: KHÔNG số điện thoại/hotline, KHÔNG dãy số dài, KHÔNG đọc địa chỉ website/URL. (TTS đọc số thành "tỉ, trăm, triệu, ngàn" nghe rất dở.) Muốn mời liên hệ thì chỉ nói chung "liên hệ Việt Anh để được tư vấn" hoặc "ghé thăm trường" — KHÔNG đọc số/đường link.
Ghi chú: ràng buộc "no số điện thoại" này CHỈ cho podcast (vì TTS đọc); khối CTA chung phía trên vẫn đúng cho blog/infographic.`;
  sys +=
    '\n\nTrả về CHỈ 1 JSON thuần (không kèm chữ nào khác, không bọc ```): {"title":"tên tập ngắn, hấp dẫn","full_script":"toàn bộ lời đọc liền mạch, văn bản thuần, KHÔNG ký hiệu/gạch đầu dòng","est_minutes":3}';
  const user =
    'Chủ đề: ' + (r.topic || '') +
    '\nNội dung định hướng (đã tối ưu cho nhóm khách): ' + (r.idea || '') +
    '\nGóc tiếp cận: ' + (r.detail || '') +
    '\nNhóm khách: ' + (r.category || '');
  return { system: sys, user };
}

// ── INFOGRAPHIC ─────────────────────────────────────────────────────────────
const RATIOS = [
  { n: '1:1', w: 1080, h: 1080 },
  { n: '4:5', w: 1080, h: 1350 },
  { n: '3:4', w: 1080, h: 1440 },
];

export function buildInfographicPrompt(r: ProduceInput): {
  prompt: string;
  ratio: string;
} {
  // xoay tỉ lệ ổn định theo bài (tránh Math.random để 2 lần retry ra cùng khung)
  const ra = RATIOS[hashSeed(`${r.id}|info`) % RATIOS.length];
  const L: string[] = [];
  L.push(
    'Thiết kế MỘT tấm infographic THẬT ĐẸP và sáng tạo, chất lượng như một designer chuyên nghiệp, đẳng cấp tạp chí.'
  );
  L.push(
    'Bạn được TOÀN QUYỀN sáng tạo: tự chọn phong cách, bảng màu, bố cục, kiểu chữ, hình minh hoạ, icon và hiệu ứng chiều sâu — miễn sao hài hoà, hiện đại, ấn tượng và dễ đọc. KHÔNG theo bất kỳ khuôn mẫu cứng nào.'
  );
  L.push('Khung bắt buộc (chỉ vậy thôi, còn lại tự do):');
  L.push('- Ngôn ngữ: TIẾNG VIỆT, dấu đầy đủ, chính tả chuẩn. Tên trường luôn viết đúng "Việt Anh".');
  L.push(
    `- Tỉ lệ khung ${ra.n} (khoảng ${ra.w}x${ra.h} px). Toàn bộ chữ và hình nằm gọn trong khung, không tràn, không bị cắt.`
  );
  L.push('- Có 1 tiêu đề chính nổi bật + 3 đến 5 ý chính ngắn gọn, súc tích, liếc qua là hiểu.');
  L.push('- Góc dưới có dòng chữ nhỏ: Trường Việt Anh · Vui Vẻ & Thực Dụng.');
  L.push('- Bám đúng nội dung dưới đây, không bịa số liệu, không nhắc đối thủ hay trường khác.');
  L.push('');
  L.push('NỘI DUNG:');
  L.push('Chủ đề: ' + (r.topic || '').slice(0, 200));
  L.push('Ý tưởng: ' + (r.idea || '').slice(0, 500));
  if (r.detail) L.push('Chi tiết/góc nhìn: ' + r.detail.slice(0, 500));
  if (r.category) L.push('Nhóm đối tượng: ' + r.category);
  return { prompt: L.join('\n'), ratio: ra.n };
}
