// src/caption.mjs — viết caption Facebook: Claude vừa ĐỌC ghi chú giáo viên vừa NHÌN ảnh đã chọn.
// Model claude-sonnet-4-6 (vision). Lỗi/tắt AI -> fallback dùng nguyên text giáo viên.
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

export function hasApiKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function toThumb(input, size = 512) {
  return sharp(input).rotate().resize(size, size, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
}

/** Gộp các đoạn text giáo viên gõ thành 1 khối (bỏ rỗng, bỏ trùng liền kề). */
/**
 * Mã cảm xúc/sticker của Zalo (`/-heart`, `/-strong`…): Zalo hiện thành icon,
 * nhưng Facebook KHÔNG hiểu — đăng lên hiện nguyên chữ "/-heart" giữa câu, rất
 * xấu. Cô giáo gõ trong nhóm Zalo nên mã này lọt vào ghi chú, rồi lọt tiếp vào
 * caption qua CẢ 2 đường: AI chép lại, và fallback dùng nguyên text.
 * Mã quen thuộc -> đổi thành emoji thật (giữ đúng ý cô giáo); mã lạ -> bỏ hẳn.
 */
const ZALO_EMOTICONS = {
  "/-heart": "❤️",
  "/-strong": "👍",
  "/-weak": "👎",
  "/-ok": "👌",
  "/-bye": "👋",
  "/-rose": "🌹",
  "/-clap": "👏",
  "/-pray": "🙏",
  "/-cake": "🎂",
  "/-gift": "🎁",
  "/-coffee": "☕",
};

export function stripZaloEmoticons(s) {
  let out = String(s || "");
  for (const [code, emoji] of Object.entries(ZALO_EMOTICONS)) {
    out = out.split(code).join(emoji);
  }
  // Mã lạ còn sót (/-xxx) -> bỏ, đừng để chữ thô lọt lên Facebook.
  return out.replace(/\/-[a-z]{2,15}\b/gi, "").replace(/[ \t]{2,}/g, " ");
}

export function combineTexts(texts = []) {
  const lines = [];
  for (const t of texts) {
    const s = (typeof t === "string" ? t : t && t.text) || "";
    // Dọn mã Zalo NGAY Ở ĐÂY: đây là cửa duy nhất mọi text nhóm Zalo đi qua
    // (ghi chú cho AI lẫn caption fallback) -> chặn 1 chỗ, khỏi sót đường nào.
    const v = stripZaloEmoticons(s).trim();
    if (v && v !== lines[lines.length - 1]) lines.push(v);
  }
  return lines.join("\n");
}

/** Fallback khi không có AI: dùng nguyên ghi chú giáo viên. */
export function fallbackCaption(texts = []) {
  return combineTexts(texts);
}

// Đặc tả v2 (15/10/2026) — prompt Bot Zalo "ưu tiên share". ${capHoc} theo cấu hình từng nhóm.
export const buildSystem = (capHoc) => [
  `Bạn viết bài cho fanpage của Trường Việt Anh, kể lại một khoảnh khắc THẬT trong lớp ${capHoc} cho phụ huynh.`,
  "Mục tiêu duy nhất: ba mẹ có con trong ảnh muốn CHIA SẺ bài này (vì tự hào về con), và ba mẹ khác đọc xong thấy được con học thế nào ở Việt Anh.",
  "LUÔN viết tiếng Việt CÓ DẤU đầy đủ, đúng chính tả. Tên trường luôn là \"Việt Anh\".",
  "Chỉ viết điều THẤY RÕ trong ảnh hoặc có trong ghi chú giáo viên. Ghi chú giáo viên là nguồn đúng nhất.",
  "Tranh, sản phẩm của trẻ thường trừu tượng: KHÔNG đoán là con gì, vật gì nếu không thấy rõ. Thà viết ít còn hơn viết sai.",
  "KHÔNG nêu họ tên học sinh, KHÔNG nêu chi tiết giúp nhận diện một em cụ thể ngoài ảnh.",
  "Giọng chân thật, cụ thể, không sến, không khoa trương. Cấm: xuất sắc, đỉnh cao, tuyệt vời, rạng rỡ, thiên thần nhỏ, lột xác, phép màu, hành trang, cơ hội vàng, nhất, số 1.",
  "Xưng hô: Mầm non và Tiểu học gọi học sinh là \"các con\"; THCS và THPT gọi là \"các bạn\" hoặc \"học sinh lớp …\". Gọi người đọc là \"ba mẹ\".",
  "KHÔNG markdown, KHÔNG viết hoa cả câu. Tối đa 2 emoji cho cả bài.",
  "KHÔNG kêu gọi tuyển sinh, KHÔNG \"thả tim / theo dõi fanpage / inbox\". KHÔNG nhắc đây là AI.",
  "Nếu có HƯỚNG DẪN RIÊNG của Trang, theo hướng dẫn đó về giọng và xưng hô — nhưng KHÔNG được bỏ các quy tắc SỰ THẬT và quy tắc không kêu gọi tuyển sinh trong thân bài.",
].join(" ");

// Mặc định cho các hàm không biết cấp học (viết lại, chú thích video...).
const SYSTEM = buildSystem("mầm non");

// 5 góc kể — code xoay vòng theo hashSeed(batchId). B và C chỉ khi ghi chú có dữ liệu tương ứng; không thì lùi về A.
export const GOC_KE = {
  A: "KHOẢNH KHẮC NHỎ: kể đúng 1 hành động cụ thể nhất thấy trong ảnh, như người đứng cạnh kể lại.",
  B: "TRƯỚC – SAU: điều các con/các bạn trước đây chưa làm được và hôm nay đã làm được (CHỈ dùng khi ghi chú giáo viên có nêu).",
  C: "MỘT CÂU NÓI: mở bằng câu nói thật của học sinh hoặc thầy cô trong ghi chú, rồi kể bối cảnh (CHỈ khi ghi chú có câu nói).",
  D: "VÌ SAO LÀM HOẠT ĐỘNG NÀY: hoạt động rèn điều gì cho con — CHỈ lấy từ ghi chú, không tự suy diễn lợi ích.",
  E: "NHÌN TỪ CHỖ NGỒI CỦA CON: kể lại buổi học qua góc nhìn của một học sinh (không nêu tên), giữ đúng điều thấy được.",
};

export function hashSeed(s) {
  let h = 2166136261;
  for (const ch of String(s || "")) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Ghi chú có nói "trước – sau" (tiến bộ) / có câu nói trích dẫn không.
const hasBeforeAfter = (note) =>
  /(trước đây|trước kia|lúc đầu|ban đầu|lần đầu|đã biết|đã có thể|tiến bộ|bây giờ đã|giờ đã|hôm nay đã|chưa (biết|dám|làm))/i.test(note);
const hasQuote = (note) => /["“”«»]|nói:|bảo:|hỏi:|kể:/i.test(note);

export function chooseGoc(seedKey, noteText = "") {
  const keys = Object.keys(GOC_KE);
  const goc = keys[hashSeed(seedKey) % keys.length];
  const note = String(noteText || "");
  if (goc === "B" && !hasBeforeAfter(note)) return "A";
  if (goc === "C" && !hasQuote(note)) return "A";
  if (goc === "D" && !note.trim()) return "A"; // D chỉ lấy từ ghi chú
  return goc;
}

/**
 * Dọn thứ Facebook KHÔNG hiểu ra khỏi caption: ký tự markdown (**, *, __) và
 * mã sticker Zalo (/-heart…) — AI đôi khi chép lại mã Zalo từ ghi chú gốc nên
 * phải lọc CẢ đầu ra, không chỉ đầu vào ở combineTexts().
 */
export function stripMarkdown(s) {
  return stripZaloEmoticons(String(s || ""))
    .replace(/\*+/g, "")
    .replace(/__+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ===== Ráp caption theo THỨ TỰ: thân bài → chân bài (hotline/địa chỉ) → hashtag (dưới cùng) =====

/** Ghép 3 phần thành 1 caption, mỗi phần cách nhau 1 dòng trống. Bỏ phần rỗng. */
export function assembleCaption(body, footer, hashtags) {
  return [String(body || "").trimEnd(), String(footer || "").trim(), String(hashtags || "").trim()]
    .filter(Boolean).join("\n\n");
}

/** Bóc phần đuôi (hashtag rồi tới chân bài) ra khỏi caption -> còn lại THÂN BÀI. */
export function stripCaptionTail(caption, footer, hashtags) {
  let s = String(caption || "");
  const tags = String(hashtags || "").trim();
  if (tags && s.trimEnd().endsWith(tags)) s = s.trimEnd().slice(0, -tags.length).trimEnd();
  const f = String(footer || "").trim();
  if (f && s.trimEnd().endsWith(f)) s = s.trimEnd().slice(0, -f.length).trimEnd();
  return s;
}

/** Đổi chân bài/hashtag ở đuôi caption (giữ nguyên thân bài, kể cả khi đã sửa tay). */
export function reapplyTail(caption, oldFooter, oldHashtags, newFooter, newHashtags) {
  return assembleCaption(stripCaptionTail(caption, oldFooter, oldHashtags), newFooter, newHashtags);
}

const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

/** Chuẩn hoá mảng hashtag từ AI -> chuỗi "#a #b ..." sạch (không dấu, không cách, không trùng). */
export function formatHashtags(arr, count = 5) {
  const seen = new Set();
  const out = [];
  for (const raw of arr || []) {
    let t = stripDiacritics(String(raw || "").trim()).replace(/\s+/g, "");
    t = "#" + t.replace(/^#+/, "").replace(/[^A-Za-z0-9_]/g, "");
    const key = t.toLowerCase();
    if (t.length > 1 && !seen.has(key)) { seen.add(key); out.push(t); }
    if (out.length >= count) break;
  }
  return out.join(" ");
}

/** Hashtag từ tên riêng (cơ sở...): bỏ dấu, CamelCase. "Mầm non Nhân Lễ" -> "#MamNonNhanLe". */
export function toHashtag(name) {
  const words = stripDiacritics(String(name || "")).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return "#" + words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

export const BRAND_HASHTAG = "#TruongVietAnh";

/**
 * Đặc tả v2: đúng 3 hashtag — #TruongVietAnh, tên cơ sở (coSo), 1 theo chủ đề bài.
 * Chưa cấu hình cơ sở -> 2 hashtag chủ đề. Trả chuỗi "#a #b #c"; lỗi AI -> phần cố định.
 * KHÔNG dùng SYSTEM (SYSTEM ép viết CÓ DẤU — hashtag lại cần KHÔNG dấu).
 */
export async function generateHashtags(context, { guide = "", count = 3, coSo = "", log = () => {} } = {}) {
  const fixed = [BRAND_HASHTAG, toHashtag(coSo)].filter(Boolean);
  const topicCount = Math.max(0, count - fixed.length);
  const src = String(context || "").trim();
  if (!hasApiKey() || !src || !topicCount) return formatHashtags(fixed, count);
  try {
    const client = new Anthropic();
    const instruction = [
      `Đọc bài đăng Facebook dưới đây rồi tạo đúng ${topicCount} hashtag bám CHỦ ĐỀ hoạt động trong bài (không phải tên trường, không phải tên cơ sở).`,
      guide ? ("ĐỊNH HƯỚNG CỦA TRANG:\n" + String(guide).slice(0, 1200)) : "",
      "Bài đăng:\n" + src.slice(0, 2000),
      [
        "Quy tắc:",
        "- Mỗi hashtag KHÔNG dấu cách, viết CamelCase (VD: #HocQuaChoi, #KyNangTuPhucVu).",
        "- BỎ dấu tiếng Việt trong hashtag.",
        `- KHÔNG dùng ${fixed.join(", ")} (hệ thống tự thêm). KHÔNG emoji.`,
      ].join("\n"),
      `Trả về JSON {"hashtags":[...]} đúng ${topicCount} phần tử, mỗi phần tử bắt đầu bằng #.`,
    ].filter(Boolean).join("\n\n");
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 200,
      output_config: { format: { type: "json_schema", schema: { type: "object", properties: { hashtags: { type: "array", items: { type: "string" } } }, required: ["hashtags"], additionalProperties: false } } },
      messages: [{ role: "user", content: instruction }],
    });
    if (resp.stop_reason === "refusal") return formatHashtags(fixed, count);
    const txt = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let arr = [];
    try { arr = JSON.parse(txt).hashtags || []; } catch { arr = []; }
    return formatHashtags([...fixed, ...arr], count);
  } catch (e) { log(`generateHashtags lỗi: ${e.message}`); return formatHashtags(fixed, count); }
}

/** Gửi 1 bộ ảnh + chỉ dẫn cho Claude vision -> text. null nếu lỗi/từ chối. */
async function askVision(buffers, instruction, { maxTokens = 400, log = () => {} } = {}) {
  if (!hasApiKey() || !buffers.length) return null;
  try {
    const thumbs = await Promise.all(buffers.map((b) => toThumb(b)));
    const content = thumbs.map((t) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: t.toString("base64") } }));
    content.push({ type: "text", text: instruction });
    const client = new Anthropic();
    const resp = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: "user", content }] });
    if (resp.stop_reason === "refusal") return null;
    const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return text ? stripMarkdown(text) : null;
  } catch (e) { log(`askVision lỗi: ${e.message}`); return null; }
}

/** Viết LẠI 1 caption cho hấp dẫn hơn (giữ thông tin chính + giữ nguyên khối liên hệ cuối bài). null nếu lỗi/tắt AI. */
export async function rewriteCaption(text, { guide = "", styleGuide = "", log = () => {} } = {}) {
  const src = String(text || "").trim();
  const hint = String(guide || styleGuide || "").trim(); // guide mới; styleGuide cũ để tương thích
  if (!hasApiKey() || !src) return null;
  try {
    const client = new Anthropic();
    const instruction = [
      "Viết LẠI đoạn caption Facebook dưới đây cho HẤP DẪN, mượt mà, thu hút phụ huynh hơn — nhưng GIỮ nguyên các sự việc/thông tin chính, KHÔNG bịa thêm chi tiết không có trong bản gốc.",
      "Nếu CUỐI bài có khối liên hệ (hotline, địa chỉ, Google Maps) và/hoặc hashtag thì GIỮ NGUYÊN toàn bộ phần đuôi đó, chỉ viết lại phần THÂN BÀI phía trên.",
      hint ? ("ÁP DỤNG HƯỚNG DẪN RIÊNG của Trang khi viết lại (phong cách, cách xưng hô, chương trình/campaign, lead magnet). Đây là CHỈ THỊ, không phải bài để chép:\n" + hint.slice(0, 1500)) : "",
      "Caption gốc:\n" + src,
      "Chỉ trả về CAPTION mới, không giải thích, không tiền tố.",
    ].filter(Boolean).join("\n\n");
    const resp = await client.messages.create({ model: MODEL, max_tokens: 800, system: SYSTEM, messages: [{ role: "user", content: instruction }] });
    if (resp.stop_reason === "refusal") return null;
    const out = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return out ? stripMarkdown(out) : null;
  } catch (e) { log(`rewriteCaption lỗi: ${e.message}`); return null; }
}

const PER_IMAGE_INSTRUCTION =
  "Viết 1 câu caption NGẮN (tối đa ~20 từ) tiếng Việt có dấu, mô tả khoảnh khắc của bé trong ảnh này, ấm áp tự nhiên. " +
  "KHÔNG bịa chi tiết không thấy. Chỉ trả về đúng 1 câu, không emoji thừa, không tiền tố.";

/** Caption riêng cho 1 ẢNH. opts.note = bối cảnh hoạt động (ghi chú cô giáo). */
export async function captionOneImage(buffer, opts = {}) {
  const note = (opts.note || "").trim();
  const instr = note
    ? `Bối cảnh hoạt động hôm nay (giáo viên cung cấp, đáng tin): """${note}"""\n\n${PER_IMAGE_INSTRUCTION}\nCó thể dùng bối cảnh trên cho phù hợp, nhưng vẫn KHÔNG khẳng định chi tiết bức vẽ nếu không nhìn rõ.`
    : PER_IMAGE_INSTRUCTION;
  const r = await askVision([buffer], instr, { maxTokens: 200, log: opts.log });
  return r || "";
}

/**
 * Caption CẢ BỘ ảnh trong 1 lần gọi -> mỗi ảnh 1 câu KHÁC NHAU, có MẠCH chuyện, bám từng ảnh.
 * @param {Buffer[]} buffers theo đúng thứ tự
 * @returns {Promise<string[]>} cùng độ dài, đúng thứ tự (phần tử "" nếu không có AI)
 */
export async function captionImageSet(buffers, opts = {}) {
  const n = buffers.length;
  if (!hasApiKey() || !n) return buffers.map(() => "");
  const note = (opts.note || "").trim();
  try {
    const thumbs = await Promise.all(buffers.map((b) => toThumb(b)));
    const content = [];
    thumbs.forEach((t, i) => {
      content.push({ type: "text", text: `Ảnh ${i + 1}:` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: t.toString("base64") } });
    });
    content.push({
      type: "text",
      text:
        `Trên là ${n} ảnh theo đúng thứ tự của cùng một buổi hoạt động.` +
        (note ? `\n\nBối cảnh (giáo viên cung cấp, đáng tin):\n"""${note}"""` : "") +
        `\n\nViết cho MỖI ảnh MỘT câu caption tiếng Việt có dấu (khoảng 12–22 từ). Yêu cầu BẮT BUỘC:` +
        `\n1) Mỗi caption KHÁC HẲN nhau — KHÔNG lặp lại cụm từ ("tự hào khoe", "nụ cười rạng rỡ", "tác phẩm sáng tạo"...). Mỗi câu một cách diễn đạt riêng.` +
        `\n2) Cả bộ tạo thành MỘT MẠCH như kể lại buổi học theo diễn biến (chuẩn bị → bắt tay vào làm → chăm chú/hợp tác → hoàn thiện → khoe thành quả), bám đúng điều THẤY ở từng ảnh.` +
        `\n3) Tối ưu RIÊNG cho từng ảnh: tả đúng việc bé đang làm hoặc biểu cảm trong CHÍNH ảnh đó (số lượng bé, hành động, khoảnh khắc).` +
        `\n4) KHÔNG khẳng định bức vẽ là con/vật gì nếu không nhìn rõ; chỉ dùng ngữ cảnh giáo viên cho an toàn.` +
        `\n5) KHÔNG markdown, không đánh số đầu câu, không emoji quá nhiều (tối đa 1/câu).` +
        (opts.openLine ? `\n6) Câu của ẢNH 1 KHÔNG được lặp lại dòng mở của thân bài: """${opts.openLine}"""` : "") +
        `\nTrả về JSON {"captions": [...]} đúng ${n} phần tử, theo thứ tự ảnh.`,
    });
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 2000, system: buildSystem(opts.capHoc || "mầm non"),
      output_config: { format: { type: "json_schema", schema: { type: "object", properties: { captions: { type: "array", items: { type: "string" } } }, required: ["captions"], additionalProperties: false } } },
      messages: [{ role: "user", content }],
    });
    if (resp.stop_reason === "refusal") return buffers.map(() => "");
    const txt = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let arr = [];
    try { arr = (JSON.parse(txt).captions || []).map((s) => stripMarkdown(s)); } catch { arr = []; }
    while (arr.length < n) arr.push("");
    return arr.slice(0, n);
  } catch (e) { opts.log?.(`captionImageSet lỗi: ${e.message}`); return buffers.map(() => ""); }
}

/**
 * Caption cho 1 VIDEO dựa trên các KHUNG HÌNH trích ra (Claude không đọc file video trực tiếp).
 * @param {Buffer[]} frameBuffers
 */
export async function captionFromFrames(frameBuffers, opts = {}) {
  const instr =
    `Đây là ${frameBuffers.length} khung hình trích từ MỘT video hoạt động của bé. ` +
    "Dựa vào các khung, viết 1-2 câu caption tiếng Việt có dấu mô tả nội dung video, ấm áp tự nhiên. " +
    "KHÔNG bịa. Chỉ trả về caption, không tiền tố.";
  const r = await askVision(frameBuffers, instr, { maxTokens: 300, log: opts.log });
  return r || "";
}

/**
 * Viết caption từ ảnh + ghi chú (đặc tả v2: 60–120 từ, tối đa 3 ảnh, 5 góc kể xoay vòng).
 * @param {object} batch  { items: [{buffer,kind,posterUrl,...}], texts: [{text}] }
 * @param {object} o  { log, maxImages, disableAI, guide, capHoc, seedKey }
 * @returns {Promise<{caption:string, source:"ai"|"fallback", goc:string|null}>}
 */
export async function writeCaption(batch, o = {}) {
  const texts = batch?.texts || [];
  const noteText = combineTexts(texts);
  const guide = (o.guide ?? o.styleGuide ?? "").toString().trim(); // HƯỚNG DẪN viết của Trang (chỉ thị, không phải bài mẫu)
  const capHoc = String(o.capHoc || "mầm non");
  const maxImages = o.maxImages || 3;
  // Góc kể do CODE chọn (không để AI tự chọn) -> so được tỷ lệ share theo góc.
  const goc = chooseGoc(o.seedKey || noteText || String(Date.now()), noteText);

  // gom buffer ảnh (chỉ ảnh; video bỏ qua phần nhìn)
  const imageItems = (batch?.items || []).filter((it) => it.kind === "image" && it.buffer).slice(0, maxImages);

  if (o.disableAI || !hasApiKey() || imageItems.length === 0) {
    return { caption: fallbackCaption(texts), source: "fallback", goc: null };
  }

  try {
    const thumbs = await Promise.all(imageItems.map((it) => toThumb(it.buffer)));
    const content = [];
    thumbs.forEach((t) => content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: t.toString("base64") } }));
    const core =
      `Đây là ${thumbs.length} ảnh (tối đa 3) của lớp ${capHoc} hôm nay.` +
      (noteText ? `\n\nGHI CHÚ GIÁO VIÊN (nguồn đúng nhất, bám theo):\n"""${noteText}"""` : "\n\n(Không có ghi chú: chỉ tả điều thấy chắc chắn.)") +
      `\n\nGÓC KỂ LẦN NÀY: ${GOC_KE[goc]}`;
    const recipe =
      `\n\nVIẾT 1 bài 60–120 từ theo đúng thứ tự:` +
      `\n1) Dòng mở ≤ 15 từ chứa CHI TIẾT CỤ THỂ NHẤT (một hành động, một con số, một câu nói). KHÔNG mở bằng "Ba mẹ ơi", "Hôm nay", "Cùng xem".` +
      `\n2) 2–4 câu kể theo góc kể trên. Mỗi câu chứa ít nhất một chi tiết nhìn thấy hoặc có trong ghi chú.` +
      `\n3) Câu cuối dạng: "Tối nay ba mẹ thử hỏi con: …?" — một câu hỏi mở, cụ thể, gắn đúng hoạt động hôm nay, để con kể lại ở nhà.` +
      `\n\nTỰ KIỂM trước khi trả: (a) thay tên trường khác vào bài có còn đúng không? Nếu còn đúng → viết lại cho cụ thể hơn. (b) có chi tiết nào không thấy trong ảnh/ghi chú không? Có → xoá.` +
      `\n\nChỉ trả về THÂN BÀI, không giải thích. Hệ thống tự chèn chân bài và hashtag.`;
    content.push({
      type: "text",
      text: guide
        ? core +
          `\n\n=== HƯỚNG DẪN RIÊNG CỦA TRANG (chỉ thị về giọng, xưng hô — KHÔNG phải bài mẫu để chép) ===\n${guide}\n=== HẾT HƯỚNG DẪN ===` +
          recipe
        : core + recipe,
    });

    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: buildSystem(capHoc),
      messages: [{ role: "user", content }],
    });

    if (resp.stop_reason === "refusal") {
      o.log?.("caption: AI từ chối -> fallback");
      return { caption: fallbackCaption(texts), source: "fallback", goc: null };
    }
    const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!text) return { caption: fallbackCaption(texts), source: "fallback", goc: null };
    return { caption: stripMarkdown(text), source: "ai", goc };
  } catch (e) {
    o.log?.(`caption lỗi (${e.message}) -> fallback dùng nguyên text`);
    return { caption: fallbackCaption(texts), source: "fallback", goc: null };
  }
}
