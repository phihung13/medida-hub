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
