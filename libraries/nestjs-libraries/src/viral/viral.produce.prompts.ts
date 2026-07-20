// ============================================================================
//  Prompt SẢN XUẤT nội dung (blog / podcast / infographic) — port từ n8n
//  WF-SanXuat. Từ đợt 4, phần "tri thức" (hồ sơ trường, giọng văn, công thức,
//  điểm tựa...) đọc ĐỘNG từ kho skill (viral.skills.ts — user chỉnh trên tab
//  🧪 Công thức AI, ăn ngay không cần restart). Phần GIAO KÈO JSON + ghép nối
//  giữ trong code để chỉnh skill không làm vỡ parser.
// ============================================================================

import {
  getSkill,
  getEvidenceModes,
} from '@gitroom/nestjs-libraries/viral/viral.skills';

export interface ProduceInput {
  id: string; // để xoay evidence mode ổn định theo bài
  topic: string; // chủ đề (title bài nguồn)
  idea: string; // nội dung định hướng (aiContent/content đã duyệt)
  detail?: string; // góc tiếp cận (reason từ AI chấm)
  category?: string; // nhóm khách (persona)
  url?: string; // nguồn tham khảo
}

function hashSeed(s: string): number {
  let h = 0;
  s = String(s || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const evidenceMode = (id: string, fmt: string) => {
  const modes = getEvidenceModes();
  return modes[hashSeed(`${id}|${fmt}`) % modes.length];
};

const diversityBlock = (evMode: string, tail: string) => `=== ĐA DẠNG ĐIỂM TỰA — CHỐNG LẶP (OVERFITTING) ===
Khi cần một điểm tựa/dẫn chứng để tăng sức nặng, LẦN NÀY ưu tiên theo kiểu: ${evMode}.
- Tự chọn nhân vật/câu/ý phù hợp nhất trong kiểu đó; KHÔNG bắt buộc, không hợp thì bỏ qua.
- TUYỆT ĐỐI tránh lặp lại vài cái tên quen (Carol Dweck, Stephen Covey, Angela Duckworth...); đa dạng tối đa.
- Mỗi nhân vật/câu chỉ nhắc 1 lần.
${tail}`;

// ── BLOG ────────────────────────────────────────────────────────────────────
export function buildBlogPrompt(r: ProduceInput): { system: string; user: string } {
  const evMode = evidenceMode(r.id, 'blog');
  let sys =
    'Bạn là chuyên gia content & SEO giáo dục cho Trường Việt Anh, viết theo giáo trình của nhà sáng lập Nguyễn Mạnh Dương.\n\n' +
    getSkill('ho-so-truong') +
    '\n\n' +
    getSkill('giong-van-blog') +
    '\n\n' +
    getSkill('chinh-ta') +
    '\n\n' +
    getSkill('cong-thuc-blog') +
    '\n\nNHIỆM VỤ: từ nội dung định hướng (đã được duyệt & tối ưu cho nhóm khách), VIẾT thành 1 bài BLOG hoàn chỉnh bằng tiếng Việt theo ĐÚNG công thức ở trên, hữu ích thật sự cho phụ huynh, đúng giọng "Vui Vẻ & Thực Dụng". Bám đúng nỗi đau của nhóm khách được nêu.';
  sys += '\n\n' + diversityBlock(evMode, '- Tối đa 1-2 cho cả bài.');
  sys += '\n\n' + getSkill('cta-that');
  sys +=
    '\n\nTRẢ VỀ theo 5 khối, mỗi nhãn trên MỘT DÒNG RIÊNG, nội dung ngay dòng dưới (KHÔNG dùng JSON, KHÔNG bọc ```):\n' +
    '[[TITLE]]\ntiêu đề SEO chứa keyword + lợi ích\n' +
    '[[SLUG]]\nslug-khong-dau\n' +
    '[[META]]\nmeta description <=160 ký tự, có keyword\n' +
    '[[TAGS]]\ntag1, tag2, tag3 (ngăn bằng dấu phẩy)\n' +
    '[[BODY]]\nnội dung dạng HTML SẠCH: chỉ dùng h2,h3,p,ul,li,ol,strong,em,table,thead,tbody,tr,th,td — KHÔNG dùng html/head/body. Bao gồm cả phần FAQ và bảng so sánh. Viết HTML tự nhiên, thoải mái dùng dấu nháy trong thẻ.';
  const user =
    'Chủ đề: ' + (r.topic || '') +
    '\nNội dung định hướng (đã tối ưu cho nhóm khách): ' + (r.idea || '') +
    '\nGóc tiếp cận: ' + (r.detail || '') +
    '\nNhóm khách: ' + (r.category || '') +
    '\nNguồn tham khảo: ' + (r.url || '');
  return { system: sys, user };
}

// ── PODCAST ─────────────────────────────────────────────────────────────────
export function buildPodcastPrompt(r: ProduceInput): { system: string; user: string } {
  const evMode = evidenceMode(r.id, 'pod');
  let sys =
    'Bạn là biên tập viên podcast giáo dục cho Trường Việt Anh, viết theo phương pháp kể chuyện của nhà sáng lập Nguyễn Mạnh Dương.\n\n' +
    getSkill('ho-so-truong-ngan') +
    '\n\n' +
    getSkill('giong-podcast') +
    '\n\n' +
    getSkill('chinh-ta') +
    '\n\n' +
    getSkill('cong-thuc-podcast') +
    '\n\nNHIỆM VỤ: từ nội dung định hướng (đã được duyệt & tối ưu cho nhóm khách), viết lại thành 1 KỊCH BẢN podcast monologue HAY HƠN theo đúng công thức ở trên, bằng tiếng Việt, để TTS đọc mượt. Bám đúng nỗi đau/mong muốn của nhóm khách.';
  sys += '\n\n' + diversityBlock(evMode, '- TỐI ĐA 1 điểm tựa cho CẢ TẬP.');
  sys += '\n\n' + getSkill('cta-that');
  sys +=
    '\n\nTRẢ VỀ theo 4 khối, mỗi nhãn trên MỘT DÒNG RIÊNG, nội dung ngay dòng dưới (KHÔNG dùng JSON, KHÔNG bọc ```):\n' +
    '[[TITLE]]\ntên tập ngắn, hấp dẫn\n' +
    '[[MINUTES]]\nsố phút ước lượng (chỉ con số, vd 3)\n' +
    '[[SCRIPT]]\ntoàn bộ lời đọc liền mạch, văn bản thuần, KHÔNG ký hiệu/gạch đầu dòng\n' +
    '[[CLIMAX]]\n1 câu trích NGUYÊN VĂN từ SCRIPT ở đoạn cao trào cảm xúc nhất (nhạc nền sẽ dâng lên đúng chỗ câu này)';
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

// ── BỘ CAROUSEL INFOGRAPHIC (như n8n: 1 bìa + slide thân, đồng bộ phong cách) ─
// B1: Claude soạn BỘ SLIDE (json) → B2: Gemini vẽ BÌA → B3: vẽ từng slide thân
// kèm ảnh bìa làm mẫu. Prompt ảnh port từ node "🧩 Tách slide" của WF-SanXuat.
export function buildCarouselPrompt(r: ProduceInput): {
  system: string;
  user: string;
} {
  const evMode = evidenceMode(r.id, 'info');
  const MAX_SLIDES = 15;
  // Port ĐỦ Ý ĐỒ node "Soạn truyện" của n8n WF-SanXuat (bản user đã siết mạnh
  // chính tả, chạy thật ít lỗi): hồ sơ trường + CHÍNH TẢ + skill fb-value-sharing
  // (kèm GIỌNG) + chia NHIỀU slide cho thoáng chữ (ít chữ/slide = ít lỗi render)
  // + style tự chọn đa dạng + CTA thật + điểm tựa xoay vòng.
  let sys =
    getSkill('ho-so-truong-ngan') +
    '\n\n' +
    getSkill('chinh-ta') +
    '\n\n' +
    getSkill('cong-thuc-carousel') +
    '\n\nBạn là content creator giáo dục cho Trường Việt Anh (hệ thống K-12, triết lý Vui Vẻ & Thực Dụng, đối tượng mẹ Millennial 28-40 tuổi).' +
    '\nNHIỆM VỤ: từ NỘI DUNG GỐC (đã duyệt & tối ưu cho nhóm khách), soạn nội dung cho các SLIDE INFOGRAPHIC theo đúng công thức fb-value-sharing ở trên. Cấu trúc: 1 THẺ BÌA (hook phủ định số đông + con số) → các THẺ NỘI DUNG (đánh số, ❌/✅ khi hợp) → 1 THẺ KẾT (tóm tắt + nhắc lưu/gửi).' +
    '\nMỖI SLIDE chỉ 1 Ý rõ ràng, súc tích nhưng có chiều sâu. Đây là INFOGRAPHIC CÓ HÌNH VẼ: chữ VỪA ĐỦ làm rõ ý, chừa chỗ cho HÌNH MINH HOẠ. KHÔNG đặc kín chữ làm mất hình.' +
    '\nNếu nội dung nhiều ý: ƯU TIÊN CHIA THÊM SLIDE (mỗi slide 1 ý cho thoáng), KHÔNG dồn hết vào ít slide. Số slide TỰ QUYẾT, tối đa ' + MAX_SLIDES + ' slide.' +
    '\nMỗi slide: heading = tiêu đề NGẮN/mạnh; body = vài câu súc tích HOẶC cặp ❌/✅ HOẶC 2-4 ý ngắn (KHÔNG phải đoạn văn dày đặc).' +
    '\nViết SÚC TÍCH hơn một chút: giảm khoảng 10-20% lượng chữ trên mỗi slide so với mức thông thường — cắt từ thừa, bỏ ý lặp, gọn câu lại — nhưng VẪN giữ đủ ý và phong cách hiện tại (vẫn được có câu/giải thích ngắn). Mục tiêu: bớt chữ vừa phải để giảm lỗi chính tả khi render, KHÔNG làm slide trống trải hay cụt ý. Ưu tiên mỗi chữ đúng chính tả tiếng Việt có dấu.' +
    '\nstyle: TỰ CHỌN 1 phong cách infographic ĐẸP & hợp chủ đề (ĐỪNG mặc định kiểu phẳng mỗi lần) — ví dụ: Tối giản hiện đại / Minh hoạ hoạt hình / Corporate flat / Timeline / 3D... Mô tả CHI TIẾT phong cách (tông màu, font, kiểu minh hoạ, bố cục) bằng tiếng Việt để ÁP DỤNG Y HỆT cho TẤT CẢ slide — ĐỒNG NHẤT cả bộ.';
  sys += '\n\n' + getSkill('cta-that');
  sys += '\n\n' + diversityBlock(evMode, '- Tối đa 1 điểm tựa cho CẢ BỘ.');
  sys +=
    '\n\nTrả về CHỈ 1 JSON thuần (không kèm chữ nào khác, không bọc ```): ' +
    '{"title":"tên bộ ngắn gọn","style":"mô tả CHI TIẾT phong cách đồng bộ cả bộ: tông màu + font + kiểu minh hoạ + bố cục","fb_caption":"caption đăng kèm album theo mục 5 của công thức: giọng gần gũi, KHÔNG CTA bán hàng, kết 3-5 hashtag","slides":[{"role":"cover","heading":"...","body":"..."},{"role":"body","heading":"...","body":"..."},{"role":"cta","heading":"...","body":"..."}]}. ' +
    'Mọi chữ tiếng Việt trong title/heading/body/fb_caption phải ĐÚNG CHÍNH TẢ CÓ DẤU.';
  const user =
    'Chủ đề: ' + (r.topic || '') +
    '\nNội dung gốc (đã tối ưu cho nhóm khách): ' + (r.idea || '') +
    '\nGóc tiếp cận: ' + (r.detail || '') +
    '\nNhóm KH: ' + (r.category || '');
  return { system: sys, user };
}

// Prompt vẽ 1 slide (Gemini) — nạp từ skill 'cong-thuc-ve-slide' (sửa được trong
// Công thức AI); code chỉ thay các placeholder bằng giá trị thật của slide.
// Dùng hàm thay-thế (không phải chuỗi) để nội dung chứa ký tự '$' không bị hiểu
// nhầm thành pattern của String.replace.
export function carouselSlidePrompt(
  s: { role?: string; heading?: string; body?: string },
  idx: number,
  total: number,
  style: string
): string {
  const role = s.role || (idx === 1 ? 'cover' : 'body');
  const coverNote =
    idx === 1
      ? ' Đây là trang BÌA: hook mạnh nhất, ấn tượng, tiêu đề lớn nổi bật.'
      : ' ĐÍNH KÈM là ảnh BÌA của bộ — thiết kế slide này ĐỒNG BỘ hoàn toàn với bìa (màu, font, phong cách đồ hoạ).';
  const vars: Record<string, string> = {
    IDX: String(idx),
    TOTAL: String(total),
    ROLE: role,
    STYLE: style || '',
    COVER_NOTE: coverNote,
    HEADING: String(s.heading || ''),
    BODY: String(s.body || ''),
  };
  return getSkill('cong-thuc-ve-slide').replace(
    /\{(IDX|TOTAL|ROLE|STYLE|COVER_NOTE|HEADING|BODY)\}/g,
    (_m, k) => vars[k] ?? ''
  );
}

export function buildInfographicPrompt(r: ProduceInput): {
  prompt: string;
  ratio: string;
} {
  // xoay tỉ lệ ổn định theo bài (tránh Math.random để 2 lần retry ra cùng khung)
  const ra = RATIOS[hashSeed(`${r.id}|info`) % RATIOS.length];
  const L: string[] = [];
  L.push(getSkill('cong-thuc-infographic'));
  L.push(
    `- Tỉ lệ khung ${ra.n} (khoảng ${ra.w}x${ra.h} px). Toàn bộ chữ và hình nằm gọn trong khung, không tràn, không bị cắt.`
  );
  L.push('');
  L.push('NỘI DUNG:');
  L.push('Chủ đề: ' + (r.topic || '').slice(0, 200));
  L.push('Ý tưởng: ' + (r.idea || '').slice(0, 500));
  if (r.detail) L.push('Chi tiết/góc nhìn: ' + r.detail.slice(0, 500));
  if (r.category) L.push('Nhóm đối tượng: ' + r.category);
  return { prompt: L.join('\n'), ratio: ra.n };
}
