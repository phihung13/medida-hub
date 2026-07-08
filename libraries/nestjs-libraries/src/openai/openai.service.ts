import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { shuffle } from 'lodash';

// ============================================================================
//  AI service — Social Hub
//  Caption/text sinh bằng CLAUDE (claude-sonnet-4-6) qua Anthropic API (fetch,
//  không cần thêm dependency). Sinh ẢNH vẫn dùng OpenAI (Claude không tạo ảnh).
//  Cần biến môi trường ANTHROPIC_API_KEY. Giữ nguyên tên class/hàm/định dạng
//  trả về để không ảnh hưởng nơi gọi.
// ============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});

// Đọc model LÚC GỌI — model chọn từ UI Settings (ANTHROPIC_MODEL) ăn ngay.
const CLAUDE_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Tone chung cho toàn hệ thống — truyền thông Trường Việt Anh.
const VIET_ANH_SYSTEM =
  'Bạn là chuyên viên truyền thông của Trường Việt Anh. ' +
  'Viết nội dung mạng xã hội bằng tiếng Việt, tự nhiên, ấm áp, đúng chuẩn mực giáo dục, ' +
  'phù hợp phụ huynh và học sinh. Không bịa thông tin không có trong dữ liệu đầu vào.';

// Gọi Claude, trả về text.
async function claudeText(
  system: string,
  user: string,
  maxTokens = 1024
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY chưa được cấu hình trong .env (cần cho AI caption).'
    );
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return (data.content || [])
    .map((c: any) => c.text || '')
    .join('')
    .trim();
}

// Gọi Claude yêu cầu JSON, tự bóc ```json fences nếu có, parse an toàn.
async function claudeJson<T = any>(
  system: string,
  user: string,
  maxTokens = 1500
): Promise<T | null> {
  const raw = await claudeText(
    system +
      '\n\nLUÔN trả về DUY NHẤT một JSON hợp lệ, KHÔNG kèm giải thích, KHÔNG kèm markdown.',
    user,
    maxTokens
  );
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // thử bóc đoạn JSON đầu tiên
    const s = cleaned.indexOf('{');
    const a = cleaned.indexOf('[');
    const start = a >= 0 && (a < s || s < 0) ? a : s;
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

// Gọi Claude với content blocks (vision: ảnh + text). blocks theo định dạng
// Anthropic Messages API: [{type:'image', source:{...}}, {type:'text', text}].
async function claudeVision(
  system: string,
  blocks: any[],
  maxTokens = 3000
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'Chưa có key Claude — vào Settings dán ANTHROPIC_API_KEY trước khi dùng AI đọc ảnh.'
    );
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: blocks }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return (data.content || [])
    .map((c: any) => c.text || '')
    .join('')
    .trim();
}

function parseClaudeJson<T = any>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const s = cleaned.indexOf('{');
    const a = cleaned.indexOf('[');
    const start = a >= 0 && (a < s || s < 0) ? a : s;
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

@Injectable()
export class OpenaiService {
  // Nút "bút phép thuật" trong composer: Claude ĐỌC các ảnh đã upload rồi viết
  // caption cho cả bài + chú thích riêng từng ảnh (cùng thứ tự ảnh gửi vào).
  async generateCaptionsForImages(
    images: { base64: string; mediaType: string }[],
    context?: string
  ): Promise<{ postCaption: string; imageCaptions: string[] } | null> {
    const system =
      VIET_ANH_SYSTEM +
      '\n\nLUÔN trả về DUY NHẤT một JSON hợp lệ, KHÔNG kèm giải thích, KHÔNG kèm markdown.';
    const blocks: any[] = images.map((i) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: i.mediaType,
        data: i.base64,
      },
    }));
    blocks.push({
      type: 'text',
      text:
        `Trên đây là ${images.length} ảnh (theo đúng thứ tự) sẽ đăng trong MỘT bài mạng xã hội.` +
        (context?.trim()
          ? `\nGhi chú/nội dung nháp của người đăng (tham khảo, ưu tiên ý này): """${context.trim()}"""`
          : '') +
        '\nViệc của bạn:' +
        '\n1. "postCaption": viết caption tiếng Việt cho CẢ bài — ấm áp, tự nhiên, 3-6 câu, có 1-2 emoji phù hợp, kết bằng 3-5 hashtag liên quan. Chỉ dựa trên những gì THẤY trong ảnh (và ghi chú nếu có), không bịa tên người/sự kiện.' +
        `\n2. "imageCaptions": mảng ĐÚNG ${images.length} phần tử, phần tử thứ i là chú thích ngắn (12-22 từ, 1 câu, không hashtag) cho ảnh thứ i, có mạch kể chuyện nối tiếp nhau.` +
        '\nTrả về JSON: {"postCaption": string, "imageCaptions": string[]}',
    });
    const raw = await claudeVision(system, blocks, 3000);
    const parsed = parseClaudeJson<{
      postCaption: string;
      imageCaptions: string[];
    }>(raw);
    if (!parsed || typeof parsed.postCaption !== 'string') {
      return null;
    }
    return {
      postCaption: parsed.postCaption.trim(),
      imageCaptions: Array.isArray(parsed.imageCaptions)
        ? parsed.imageCaptions.map((c) => String(c || '').trim())
        : [],
    };
  }

  // Sinh ảnh: vẫn dùng OpenAI (Claude không tạo ảnh). Cần OPENAI_API_KEY.
  async generateImage(prompt: string, isVertical = false) {
    const generate = (
      await openai.images.generate({
        prompt,
        model: 'chatgpt-image-latest',
        size: isVertical ? '1024x1536' : '1024x1024',
      })
    ).data[0];

    return generate.b64_json;
  }

  // Từ mô tả → prompt sinh ảnh (dùng Claude).
  async generatePromptForPicture(prompt: string) {
    const system =
      'Bạn là trợ lý tạo prompt sinh ảnh. Từ mô tả và phong cách, viết một prompt ' +
      'thật dài và chi tiết bằng tiếng Anh để bộ sinh ảnh dùng; nếu là ảnh thực tế ' +
      'hãy mô tả cả góc máy. Chỉ trả về nội dung prompt.';
    try {
      return await claudeText(system, `mô tả: ${prompt}`, 800);
    } catch {
      return '';
    }
  }

  // Chuyển một bài đăng → lời thoại tự nhiên (dùng Claude).
  async generateVoiceFromText(prompt: string) {
    const system =
      'Bạn chuyển một bài đăng mạng xã hội thành lời thoại giọng người tự nhiên. ' +
      'Không dùng dấu "-", thỉnh thoảng thêm "..." để tạo nhịp ngắt, nghe như người thật nói. ' +
      'Chỉ trả về lời thoại.';
    try {
      return await claudeText(system, `bài đăng: ${prompt}`, 800);
    } catch {
      return '';
    }
  }

  // Sinh caption/bài đăng từ nội dung — HÀM CHÍNH. Trả về Array<Array<{post}>>
  // để giữ nguyên hợp đồng với frontend.
  async generatePosts(content: string) {
    const user =
      `Từ nội dung dưới đây, hãy tạo:\n` +
      `- 5 caption ngắn khác nhau (mỗi caption là một bài đăng độc lập, có emoji hợp lý và 3-5 hashtag),\n` +
      `- 2 chuỗi bài (thread), mỗi thread gồm 2-4 bài ngắn.\n` +
      `Trả về JSON: {"variations": string[], "threads": string[][]}.\n\n` +
      `Nội dung:\n${content}`;

    const data = await claudeJson<{
      variations?: string[];
      threads?: string[][];
    }>(VIET_ANH_SYSTEM, user, 2000).catch(() => null);

    const result: Array<Array<{ post: string }>> = [];
    if (data) {
      for (const v of data.variations || []) {
        if (v && v.trim()) result.push([{ post: v.trim() }]);
      }
      for (const t of data.threads || []) {
        const thread = (t || [])
          .filter((p) => p && p.trim())
          .map((p) => ({ post: p.trim() }));
        if (thread.length) result.push(thread);
      }
    }
    // fallback: nếu Claude lỗi/không parse được, trả về chính nội dung làm 1 bài.
    if (result.length === 0 && content?.trim()) {
      result.push([{ post: content.trim() }]);
    }
    return shuffle(result);
  }

  // Trích nội dung bài viết từ text website rồi sinh bài đăng.
  async extractWebsiteText(content: string) {
    let article = content;
    try {
      article = await claudeText(
        'Bạn nhận toàn bộ text của một website và chỉ trích ra phần nội dung bài viết chính. Chỉ trả về nội dung bài viết.',
        content,
        2000
      );
    } catch {
      /* dùng nguyên content nếu lỗi */
    }
    return this.generatePosts(article || content);
  }

  // Tách một bài dài thành thread, mỗi bài tối đa `len` ký tự.
  async separatePosts(content: string, len: number) {
    const system =
      `Bạn tách một bài đăng mạng xã hội thành chuỗi (thread). Mỗi bài tối thiểu ${
        len - 10
      } và tối đa ${len} ký tự, giữ nguyên câu chữ, ngắt dòng hợp lý, tách theo ngữ cảnh.`;
    const data = await claudeJson<{ posts: string[] }>(
      system,
      `Trả về JSON {"posts": string[]}.\n\nBài:\n${content}`,
      2000
    ).catch(() => null);

    let posts: string[] = (data?.posts || []).filter(
      (p) => typeof p === 'string' && p.length
    );
    if (posts.length === 0) posts = [content];

    // Cắt ngắn những bài vượt quá độ dài.
    posts = await Promise.all(
      posts.map(async (post) => {
        if (post.length <= len) return post;
        try {
          const shorter = await claudeText(
            `Rút gọn bài đăng sau xuống tối đa ${len} ký tự, giữ nguyên câu chữ và ngắt dòng. Chỉ trả về nội dung.`,
            post,
            800
          );
          return shorter && shorter.length <= len ? shorter : post.slice(0, len);
        } catch {
          return post.slice(0, len);
        }
      })
    );

    return { posts };
  }

  // Tách text thành các slide (image prompt + voice text) cho video.
  async generateSlidesFromText(text: string) {
    const system =
      'Bạn nhận một đoạn text và tách thành các slide. Mỗi slide có một "imagePrompt" ' +
      '(tiếng Anh, nắm bắt tinh thần slide, có gradient tối phía trên, KHÔNG chứa chữ trong ảnh) ' +
      'và "voiceText" (lời đọc). Tạo 3-5 slide.';
    const data = await claudeJson<{
      slides: { imagePrompt: string; voiceText: string }[];
    }>(
      system,
      `Trả về JSON {"slides": [{"imagePrompt": string, "voiceText": string}]}.\n\nText:\n${text}`,
      2000
    ).catch(() => null);

    return data?.slides || [];
  }

  // ── Lò Bài Thắng ─────────────────────────────────────────────────────────
  // Đọc bài viral đưa vào (text/HTML trang/ảnh chụp màn hình) → metadata chuẩn.
  // Ảnh chụp thường CÓ SẴN số share/like — AI đọc và tự điền.
  async viralAnalyze(input: {
    text?: string;
    images?: { base64: string; mediaType: string }[];
    url?: string;
  }): Promise<{
    title: string;
    platform: string;
    level: string;
    sourceName: string;
    shares: number | null;
    likes: number | null;
    comments: number | null;
    views: number | null;
    content: string;
  } | null> {
    const system =
      'Bạn phân tích bài đăng mạng xã hội/báo cho trường học. Nhiệm vụ: rút metadata. ' +
      'platform ∈ ["facebook","instagram","tiktok","youtube","news"]. ' +
      'level = cấp học nội dung nhắm tới ∈ ["mn"(mầm non),"th"(tiểu học),"cs"(THCS),"pt"(THPT),"all"(chung)]. ' +
      'Số liệu (shares/likes/comments/views): đọc từ nội dung/ảnh nếu thấy (hiểu "1,2K"=1200, "3.4M"=3400000), không thấy để null. ' +
      'title: tiêu đề/câu hook chính (ngắn gọn). content: text chính của bài (tối đa 1500 ký tự). ' +
      'Trả JSON: {"title","platform","level","sourceName","shares","likes","comments","views","content"}';
    const userText = `${input.url ? `URL: ${input.url}\n` : ''}${
      input.text ? `NỘI DUNG:\n${input.text.slice(0, 12000)}` : ''
    }`;
    if (input.images?.length) {
      const blocks: any[] = input.images.slice(0, 4).map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      }));
      blocks.push({
        type: 'text',
        text:
          (userText || 'Ảnh chụp bài viral — đọc và rút metadata.') +
          '\n\nTrả về DUY NHẤT JSON.',
      });
      const raw = await claudeVision(
        system + '\nLUÔN trả về DUY NHẤT một JSON hợp lệ.',
        blocks,
        2000
      );
      try {
        return JSON.parse(
          raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
        );
      } catch {
        return null;
      }
    }
    return claudeJson(system, userText || 'Không có nội dung', 2000);
  }

  // Mổ công thức thắng: vì sao bài được share.
  async viralFormula(post: {
    title: string;
    content?: string | null;
    platform: string;
    shares?: number | null;
  }): Promise<{
    hook: string;
    structure: string;
    emotion: string;
    format: string;
    whyShared: string;
  } | null> {
    const system =
      'Bạn là chuyên gia phân tích nội dung viral giáo dục Việt Nam. Mổ xẻ VÌ SAO bài này được chia sẻ nhiều. ' +
      'Phân tích sắc, cụ thể, có thể áp dụng lại — không chung chung. Tiếng Việt. ' +
      'Trả JSON: {"hook": "câu mở đánh vào đâu", "structure": "cấu trúc bài theo trình tự", ' +
      '"emotion": "đòn cảm xúc khiến người ta share", "format": "định dạng trình bày", ' +
      '"whyShared": "chốt: người share nhận được danh tính/giá trị gì khi bấm share"}';
    return claudeJson(
      system,
      `Nền tảng: ${post.platform}${post.shares ? ` · ${post.shares} share` : ''}\nTiêu đề: ${post.title}\n\nNội dung:\n${(post.content || '(chỉ có tiêu đề)').slice(0, 8000)}`,
      1500
    );
  }

  // Sinh bài Việt Anh MỚI theo công thức thắng (không sao chép nội dung gốc).
  async viralClone(params: {
    formula: any;
    original: { title: string; platform: string };
    target: { channelName: string; platform: string; level: string };
  }): Promise<string> {
    const levelName =
      ({ mn: 'mầm non', th: 'tiểu học', cs: 'THCS', pt: 'THPT' } as any)[
        params.target.level
      ] || 'phụ huynh nói chung';
    const system =
      VIET_ANH_SYSTEM +
      ' Nhiệm vụ: viết BÀI MỚI cho kênh của trường theo CÔNG THỨC THẮNG được cung cấp. ' +
      'TUYỆT ĐỐI không sao chép nội dung bài gốc — chỉ tái sử dụng công thức (hook, cấu trúc, đòn cảm xúc, format). ' +
      'Nội dung phải về Trường Việt Anh / chủ đề giáo dục phù hợp cấp học. Chỉ trả về nội dung bài, không giải thích.';
    return claudeText(
      system,
      `CÔNG THỨC THẮNG (từ bài "${params.original.title}" trên ${params.original.platform}):\n${JSON.stringify(params.formula, null, 2)}\n\nViết bài mới cho: ${params.target.channelName} (${params.target.platform}), hướng tới phụ huynh ${levelName}.`,
      2000
    );
  }

  // Chấm điểm hàng loạt theo chân dung khách hàng (chuyển thể luồng n8n
  // WF-Crawll-Duyet: chọn đúng 1 nhóm → VIẾT LẠI cho nhóm đó → chấm bản viết lại).
  async viralScoreBatch(
    items: {
      i: number;
      title: string;
      content?: string | null;
      platform: string;
      shares?: number | null;
      likes?: number | null;
    }[],
    personasText: string,
    rubric: string
  ): Promise<
    | {
        i: number;
        persona: string;
        score: number;
        scores: Record<string, number>;
        verdict: string;
        rewritten: string;
        reason: string;
      }[]
    | null
  > {
    const system =
      VIET_ANH_SYSTEM +
      '\n\nNhiệm vụ: với TỪNG bài trong danh sách, làm 3 bước:\n' +
      '(A) Chọn ĐÚNG 1 nhóm chân dung phù hợp nhất (mã nhóm). Mặc định chọn nhóm HCM; chỉ chọn nhóm CG/RG khi nội dung gắn rõ địa phương đó. Không nhảy cấp học.\n' +
      '(B) VIẾT LẠI nội dung thành bài đăng cho nhóm đó: 2-4 câu, giọng "Vui Vẻ & Thực Dụng", kết bằng CTA tự nhiên + 4-6 hashtag. CẤM: định kiến vùng miền/giàu nghèo, tên trường đối thủ, sao chép nguyên văn bài gốc.\n' +
      '(C) Chấm BẢN VIẾT LẠI theo rubric.\n\n' +
      `CÁC NHÓM CHÂN DUNG:\n${personasText}\n\n${rubric}\n\n` +
      'verdict ∈ ["xuất sắc - đăng ngay","đăng ngay","sửa nhẹ","sửa nhiều","bỏ qua"].\n' +
      'Trả JSON: mảng [{"i","persona","score","scores":{"hook","clarity","brand_voice","value","cta","seo"},"verdict","rewritten","reason"}] — đúng thứ tự "i" của đầu vào, đủ mọi phần tử.';
    const user = items
      .map(
        (it) =>
          `[${it.i}] (${it.platform}${it.shares ? ` · ${it.shares} share` : ''}${it.likes ? ` · ${it.likes} like` : ''})\nTiêu đề: ${it.title}\nNội dung: ${(it.content || '(chỉ có tiêu đề)').slice(0, 1800)}`
      )
      .join('\n\n---\n\n');
    return claudeJson(system, user, 8000);
  }

  // "Bài của mình": viết lại BÀI TỐT HƠN bản trước (điểm cao hơn prevScore), cho
  // 1 chân dung, rồi chấm lại. Dùng khi clone một bài viral thành của mình.
  async viralRewriteAndScore(input: {
    title: string;
    content?: string | null;
    prevContent?: string | null;
    prevScore?: number | null;
    persona?: string | null;
    personasText: string;
    rubric: string;
  }): Promise<{
    persona: string;
    content: string;
    score: number;
    scores: Record<string, number>;
    verdict: string;
    reason: string;
  } | null> {
    const system =
      VIET_ANH_SYSTEM +
      '\n\nNhiệm vụ: tạo bài đăng "của trường" TỐT HƠN hẳn bản trước, cho 1 nhóm chân dung, rồi chấm điểm.\n' +
      '(A) Chọn 1 nhóm chân dung phù hợp nhất' +
      (input.persona ? ` (ưu tiên nhóm ${input.persona} nếu vẫn hợp)` : '') +
      '. Mặc định nhóm HCM; chỉ chọn CG/RG khi nội dung gắn rõ địa phương.\n' +
      '(B) VIẾT LẠI thành bài đăng 3-5 câu, giọng "Vui Vẻ & Thực Dụng", mở đầu hook mạnh, có insight/giá trị rõ, kết CTA tự nhiên + 5-7 hashtag. Phải HAY HƠN, sắc hơn, cụ thể hơn bản trước — KHÔNG lặp lại y hệt. CẤM: định kiến vùng miền/giàu nghèo, tên trường đối thủ, sao chép nguyên văn bài gốc.\n' +
      '(C) Chấm bản mới theo rubric. Mục tiêu điểm PHẢI cao hơn bản trước' +
      (typeof input.prevScore === 'number' ? ` (bản trước ${input.prevScore}/100)` : '') +
      '; nếu chưa hơn hãy viết lại cho tới khi hơn.\n\n' +
      `CÁC NHÓM CHÂN DUNG:\n${input.personasText}\n\n${input.rubric}\n\n` +
      'verdict ∈ ["xuất sắc - đăng ngay","đăng ngay","sửa nhẹ","sửa nhiều"].\n' +
      'Trả JSON: {"persona","content","score","scores":{"hook","clarity","brand_voice","value","cta","seo"},"verdict","reason"}';
    const user =
      `Tiêu đề gốc: ${input.title}\nNội dung gốc: ${(input.content || '(chỉ có tiêu đề)').slice(0, 2000)}` +
      (input.prevContent
        ? `\n\nBẢN TRƯỚC (phải viết HAY HƠN bản này):\n${input.prevContent.slice(0, 1500)}`
        : '');
    return claudeJson(system, user, 2500);
  }

  // Phân tích "bài chiến thắng" của 1 kênh FB → mô hình thắng + gợi ý content.
  async analyzeChannelWinners(
    channelName: string,
    posts: {
      message?: string;
      reactions?: number | null;
      comments?: number | null;
      shares?: number | null;
      clicks?: number | null;
      createdAt?: string;
    }[]
  ): Promise<{
    overview: string;
    patterns: { title: string; detail: string }[];
    recommendations: string[];
    contentIdeas: { title: string; hook: string }[];
    bestFormat: string;
  } | null> {
    const system =
      VIET_ANH_SYSTEM +
      '\n\nBạn là chuyên gia phân tích nội dung mạng xã hội trường học. Dựa trên các bài ĐÃ ĐĂNG của kênh (kèm số tương tác thật), hãy tìm ra CÔNG THỨC THẮNG của chính kênh này và gợi ý bài tiếp theo. Phân tích sắc, cụ thể, dựa trên dữ liệu — không nói chung chung.\n' +
      'Trả JSON: {\n' +
      '"overview": "2-3 câu tổng quan hiệu suất & điều gì đang hiệu quả nhất",\n' +
      '"patterns": [{"title":"tên mô hình thắng","detail":"vì sao thắng, dẫn chứng từ bài cụ thể"}] (3-5 mục),\n' +
      '"recommendations": ["việc nên làm tiếp theo, cụ thể"] (4-6 mục),\n' +
      '"contentIdeas": [{"title":"chủ đề bài mới nên đăng","hook":"câu mở đầu gợi ý"}] (3-5 ý, bám công thức thắng của kênh),\n' +
      '"bestFormat": "định dạng/kiểu bài hiệu quả nhất của kênh (ảnh khoảnh khắc, recap, tips, chứng thực...)"\n}';
    const user =
      `Kênh: ${channelName}\n\nCÁC BÀI (nội dung | 👍reactions 💬comments ↗shares 👆clicks | ngày):\n` +
      posts
        .map(
          (p) =>
            `- "${(p.message || '').slice(0, 220).replace(/\n/g, ' ')}" | ${p.reactions ?? '-'} ${p.comments ?? '-'} ${p.shares ?? 0} ${p.clicks ?? '-'} | ${(p.createdAt || '').slice(0, 10)}`
        )
        .join('\n');
    return claudeJson(system, user, 3000);
  }

  // AI phân tích video chiến thắng kiểu YOUTUBE: watch time, retention,
  // sub conversion, độ dài, tiêu đề, nhịp đăng — không dùng thước đo Facebook.
  async analyzeYoutubeWinners(
    channelName: string,
    videos: {
      title?: string;
      views?: number;
      watchMinutes?: number;
      avgViewDuration?: number;
      avgViewPercentage?: number;
      likes?: number;
      comments?: number;
      subscribersGained?: number;
      duration?: string | null;
      publishedAt?: string | null;
    }[]
  ): Promise<{
    overview: string;
    patterns: { title: string; detail: string }[];
    recommendations: string[];
    contentIdeas: { title: string; hook: string }[];
    bestFormat: string;
  } | null> {
    const system =
      VIET_ANH_SYSTEM +
      '\n\nBạn là chuyên gia phân tích kênh YOUTUBE trường học. Phân tích theo NGÔN NGỮ YOUTUBE: retention (% xem trung bình) quan trọng hơn views; watch time quyết định đề xuất; sub gained/video đo sức chuyển đổi; độ dài video và kiểu tiêu đề ảnh hưởng click. Tìm CÔNG THỨC THẮNG của chính kênh này từ số liệu thật — sắc, cụ thể, dẫn chứng video, không nói chung chung.\n' +
      'Trả JSON: {\n' +
      '"overview": "2-3 câu: hiệu suất tổng, video nào đang gánh kênh, vì sao (retention hay views)",\n' +
      '"patterns": [{"title":"mô hình thắng (vd: video ngắn <3 phút giữ chân >60%)","detail":"vì sao thắng, dẫn chứng video + số liệu cụ thể"}] (3-5 mục),\n' +
      '"recommendations": ["việc nên làm tiếp, cụ thể theo YouTube: độ dài, tiêu đề, thumbnail, nhịp đăng, 15 giây đầu"] (4-6 mục),\n' +
      '"contentIdeas": [{"title":"tiêu đề video mới nên làm (bám công thức thắng)","hook":"ý tưởng 15 giây mở đầu để giữ chân"}] (3-5 ý),\n' +
      '"bestFormat": "định dạng video hiệu quả nhất của kênh (độ dài + kiểu nội dung)"\n}';
    const user =
      `Kênh YouTube: ${channelName}\n\nCÁC VIDEO (tiêu đề | ▶views ⏱phút-xem 📈retention% 👍likes 💬comments +sub | độ dài ISO | ngày đăng):\n` +
      videos
        .map(
          (v) =>
            `- "${(v.title || '').slice(0, 150)}" | ${v.views ?? 0} ${v.watchMinutes ?? 0} ${(v.avgViewPercentage ?? 0).toFixed?.(1) ?? v.avgViewPercentage}% ${v.likes ?? 0} ${v.comments ?? 0} +${v.subscribersGained ?? 0} | ${v.duration || '-'} | ${(v.publishedAt || '').slice(0, 10)}`
        )
        .join('\n');
    return claudeJson(system, user, 3000);
  }

  // Trợ lý AI trả lời câu hỏi về hiệu suất kênh (có ngữ cảnh + lịch sử hội thoại).
  async answerAboutChannel(
    context: string,
    question: string,
    history: { role: string; content: string }[]
  ): Promise<string> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return 'Chưa cấu hình ANTHROPIC_API_KEY.';
    const system =
      VIET_ANH_SYSTEM +
      '\n\nBạn là trợ lý phân tích kênh mạng xã hội cho nhân viên truyền thông của trường. Trả lời NGẮN GỌN, thực dụng, dựa trên DỮ LIỆU kênh dưới đây. Nếu được hỏi viết bài, hãy viết bài đăng hoàn chỉnh đúng giọng trường. Nếu dữ liệu không đủ, nói rõ.\n\n=== DỮ LIỆU KÊNH ===\n' +
      context;
    const messages = [
      ...history.slice(-8).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 2000),
      })),
      { role: 'user', content: question.slice(0, 2000) },
    ];
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL(),
        max_tokens: 1200,
        system,
        messages,
      }),
    });
    if (!res.ok) return 'Lỗi gọi AI, thử lại.';
    const data: any = await res.json();
    return (data.content || []).map((c: any) => c.text || '').join('').trim();
  }
}
