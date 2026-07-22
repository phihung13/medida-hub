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

// ── GỢI Ý KÊNH ĐĂNG BLOG (hệ sinh thái 4 website) ────────────────────────────
// Sau khi sản xuất 1 bài blog, chấm xem NÊN ĐĂNG Ở TRANG NÀO để dễ viral + lên
// hạng, không giẫm chân nhau. Quyết định bằng "câu hỏi kiểm tra" của từng trang.
// Chạy ở 1 lượt gọi RIÊNG, có try/catch — lỗi thì bỏ gợi ý, KHÔNG làm hỏng bài.
export const ECOSYSTEM_SITES = [
  'truongvietanh.com',
  'nguyenmanhduong.com',
  'schoolfeast.com',
  'singablemum.com',
] as const;
export type EcosystemSite = (typeof ECOSYSTEM_SITES)[number];

const SITE_ROUTING_RUBRIC = `HỆ SINH THÁI 4 WEBSITE — mục tiêu: mỗi dạng bài đăng ĐÚNG TRANG để dễ viral, lên hạng tìm kiếm nhanh, KHÔNG tự cạnh tranh từ khóa của nhau. Quyết định bằng CÂU HỎI KIỂM TRA của từng trang — bài thuộc trang nào phải trả lời "Có" với câu hỏi trang đó.

1) truongvietanh.com — "Phụ huynh có gõ câu này lên Google không?"
   Kiến thức chuẩn/khách quan: học thuật & phương pháp giáo dục (Montessori, IELTS, GDPT 2018...), hướng dẫn theo mùa (chọn trường, điểm chuẩn lớp 10, chuyển cấp — đăng trước mùa 4–6 tuần), checklist / so sánh trung lập / FAQ (dễ lên Featured Snippet). Vai: cỗ máy SEO kéo phụ huynh vào phễu tuyển sinh.
   KHÔNG hợp: bài quan điểm gây tranh cãi, PR lộ liễu, so sánh nêu tên trường khác.

2) nguyenmanhduong.com — "Bài này có cần chữ 'tôi' mới hay không?"
   Quan điểm / trải nghiệm cá nhân của nhà sáng lập, bài "nói ngược" số đông có căn cứ, phản ứng sự kiện giáo dục nóng (trong 48h), chân dung / câu chuyện con người (liều lượng thấp). Vai: xây niềm tin founder, viral qua Facebook.
   KHÔNG hợp: bài hướng dẫn khô kiểu SEO không có chữ "tôi".

3) schoolfeast.com — "HR / chủ doanh nghiệp có quan tâm không?"
   An toàn thực phẩm, quy trình bếp, kiểm thực 3 bước, dinh dưỡng dân văn phòng, chi phí suất ăn, guide cho HR, newsjacking vụ ngộ độc (viết kiểu "bài học rút ra", tuyệt đối không hả hê). Vai: B2B suất ăn, kéo khách doanh nghiệp.
   KHÔNG hợp: nội dung nuôi dạy con, tuyển sinh (lạc tệp B2B).

4) singablemum.com — "Mẹ có con 0–6 tuổi có thấy chính mình trong đó không?"
   Giáo dục sớm 0–6 tuổi, mốc phát triển theo tháng tuổi, bài hát / ngôn ngữ / cảm xúc cho bé, tâm sự đồng cảm hành trình làm mẹ. Vai: nuôi tệp mẹ bỉm từ đầu phễu.
   KHÔNG hợp: nội dung tuyển sinh, học thuật cấp 2–3.

VÙNG GIAO NHAU (nuôi dạy con là chủ đề cả nhà cùng chạm): cùng chủ đề nhưng phải KHÁC góc nhìn + KHÁC từ khóa chính để không tự cạnh tranh thứ hạng. Nếu bài chạm nhiều trang, chọn TRANG HỢP NHẤT theo câu hỏi kiểm tra; nếu bài đang viết giọng nhà trường (khách quan) nhưng nội dung hợp trang khác hơn, hãy nêu điều đó ở angle_note kèm gợi ý biến tấu.`;

// Chấm gợi ý kênh cho 1 bài blog ĐÃ CÓ (từ tiêu đề + meta + trích thân bài).
export function buildSiteRoutingPrompt(x: {
  topic?: string;
  idea?: string;
  title?: string;
  meta_description?: string;
  tags?: string[] | string;
  category?: string;
}): { system: string; user: string } {
  const system =
    'Bạn là biên tập trưởng của hệ sinh thái 4 website dưới đây. Nhiệm vụ: đọc 1 bài blog đã sản xuất và quyết định NÊN ĐĂNG Ở TRANG NÀO cho hiệu quả nhất (dễ viral + lên hạng, không giẫm chân nhau). Chấm theo NỘI DUNG/CHỦ ĐỀ bài, độc lập với giọng văn đã viết.\n\n' +
    SITE_ROUTING_RUBRIC +
    '\n\nTRẢ VỀ DUY NHẤT 1 JSON:\n' +
    '{"site":"<đúng 1 trong: ' +
    ECOSYSTEM_SITES.join(' / ') +
    '>","why":"<1 câu NGẮN tiếng Việt: khớp câu hỏi kiểm tra nào + thế mạnh (SEO / viral / B2B)>","angle_note":"<tùy chọn: cảnh báo lệch tệp hoặc gợi ý biến tấu cho trang khác; để chuỗi rỗng nếu không cần>"}';
  const tags = Array.isArray(x.tags) ? x.tags.join(', ') : x.tags || '';
  const user =
    'Tiêu đề: ' + (x.title || x.topic || '') +
    '\nMeta description: ' + (x.meta_description || '') +
    '\nTags: ' + tags +
    '\nChủ đề gốc: ' + (x.topic || '') +
    '\nNhóm khách (persona): ' + (x.category || '') +
    '\nTrích nội dung: ' + String(x.idea || '').slice(0, 1500);
  return { system, user };
}

// Chấm gợi ý KÊNH FACEBOOK cho 1 bộ infographic. Khác blog (chọn 1 trang cho
// SEO khỏi cạnh tranh) — social ĐĂNG CHÉO nhiều kênh vô tư, nên cho chọn NHIỀU.
// Chỉ chấm trong danh sách kênh FB đang kết nối; không hợp kênh nào thì để rỗng.
export function buildChannelRoutingPrompt(
  x: { topic?: string; title?: string; caption?: string; category?: string },
  channels: { id: string; name: string }[]
): { system: string; user: string } {
  const list = channels
    .map((c) => `- id=${c.id} · tên: ${c.name}`)
    .join('\n');
  const system =
    'Bạn là biên tập trưởng mảng mạng xã hội của hệ sinh thái giáo dục dưới đây. Nhiệm vụ: đọc 1 bộ ảnh (infographic/carousel) đã sản xuất và chọn NÊN ĐĂNG LÊN (những) KÊNH FACEBOOK NÀO trong danh sách kênh đang kết nối cho đúng tệp khán giả.\n\n' +
    SITE_ROUTING_RUBRIC +
    '\n\nNGUYÊN TẮC CHỌN KÊNH FACEBOOK:\n' +
    '- Khớp NỘI DUNG bộ ảnh với tệp khán giả của từng kênh (đoán qua TÊN kênh + khung 4 thương hiệu ở trên: Trường Việt Anh = phụ huynh/tuyển sinh · Nguyễn Mạnh Dương = quan điểm founder · School Feast = HR/suất ăn B2B · Singable Mum = mẹ bỉm 0–6 tuổi).\n' +
    '- ĐĂNG CHÉO thoải mái: 1 bộ ảnh có thể hợp NHIỀU kênh (khác blog — social không lo cạnh tranh SEO). Chọn TẤT CẢ kênh thật sự hợp tệp; đừng gán bừa kênh lệch tệp.\n' +
    '- CHỈ được chọn trong danh sách id bên dưới; KHÔNG bịa id. Không kênh nào hợp thì trả picks rỗng.\n\n' +
    'DANH SÁCH KÊNH FACEBOOK ĐANG KẾT NỐI:\n' +
    (list || '(chưa có kênh Facebook nào)') +
    '\n\nTRẢ VỀ DUY NHẤT 1 JSON:\n' +
    '{"picks":[{"id":"<đúng 1 id trong danh sách>","why":"<1 câu NGẮN vì sao hợp kênh này>"}],"note":"<tùy chọn: lưu ý chung, để rỗng nếu không cần>"}';
  const user =
    'Tiêu đề bộ ảnh: ' + (x.title || x.topic || '') +
    '\nChủ đề gốc: ' + (x.topic || '') +
    '\nNhóm khách (persona): ' + (x.category || '') +
    '\nCaption đăng kèm: ' + String(x.caption || '').slice(0, 800);
  return { system, user };
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
