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

  // Ảnh NGANG 16:9 cho thumbnail YouTube (OpenAI). Trả base64 (không prefix).
  async generateLandscapeImage(prompt: string) {
    const generate = (
      await openai.images.generate({
        prompt,
        model: 'chatgpt-image-latest',
        size: '1536x1024',
      })
    ).data[0];
    return generate.b64_json;
  }

  // ChatGPT "xem" video qua các KHUNG HÌNH trích ở trình duyệt → viết tiêu đề +
  // mô tả YouTube. OpenAI vision không nhận file mp4 trực tiếp nên nhận ảnh.
  async generateYoutubeContentFromImages(
    images: { base64: string; mediaType: string }[],
    context?: string
  ): Promise<{ title: string; description: string } | null> {
    const content: any[] = images.map((i) => ({
      type: 'image_url',
      image_url: { url: `data:${i.mediaType};base64,${i.base64}` },
    }));
    content.push({
      type: 'text',
      text: [
        `Đây là ${images.length} khung hình trích đều từ một video (theo thứ tự thời gian).`,
        'Suy luận nội dung video rồi viết cho YouTube (tiếng Việt):',
        '- "title": tiêu đề hấp dẫn, tối đa 100 ký tự.',
        '- "description": mô tả chi tiết, có hook mở đầu, các ý chính, và vài hashtag ở cuối.',
        context ? `Bối cảnh/gợi ý từ người dùng: ${context}` : '',
        'CHỈ trả JSON: {"title":"...","description":"..."}',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: VIET_ANH_SYSTEM },
        { role: 'user', content },
      ],
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });
    const text = res.choices?.[0]?.message?.content || '';
    const parsed = parseClaudeJson<{ title: string; description: string }>(text);
    if (!parsed) return null;
    return {
      title: String(parsed.title || '').slice(0, 100),
      description: String(parsed.description || ''),
    };
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
        variants?: { persona: string; text: string }[];
        reason: string;
        content_type?: string;
        podcast_score?: number;
      }[]
    | null
  > {
    // Nguyên tắc chọn nhóm — port NGUYÊN VĂN khối "A. NGUYEN TAC CHON NHOM"
    // của n8n (kèm A*: bản chính đúng 1 nhóm; variants chỉ là bản phụ tham khảo).
    const ROUTING = `NGUYÊN TẮC CHỌN NHÓM (BẮT BUỘC):
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
    const system =
      VIET_ANH_SYSTEM +
      '\n\n' +
      ROUTING +
      '\n\nNhiệm vụ: với TỪNG bài trong danh sách, làm 4 bước:\n' +
      '(A) Chọn ĐÚNG 1 nhóm chân dung phù hợp nhất theo NGUYÊN TẮC CHỌN NHÓM ở trên.\n' +
      '(B) VIẾT LẠI nội dung thành bài đăng cho nhóm đó: 2-4 câu, giọng "Vui Vẻ & Thực Dụng", kết bằng CTA tự nhiên + 4-6 hashtag. CẤM: định kiến vùng miền/giàu nghèo, tên trường đối thủ, sao chép nguyên văn bài gốc. THÊM "variants": nếu nội dung cũng hợp với các nhóm KHÁC CÙNG CẤP HỌC (vd chọn TH-HCM mà bài hợp cả TH-CG, TH-RG), viết TỐI ĐA 2 biến thể — mỗi biến thể 2-4 câu VIẾT RIÊNG đúng chân dung tâm lý nhóm đó (không đổi cấp học, không copy bản chính); không hợp nhóm nào khác → mảng rỗng.\n' +
      '(C) Chấm BẢN VIẾT LẠI theo rubric.\n' +
      '(D) GÁN LOẠI SẢN XUẤT phù hợp nhất: "content_type" ∈ ["blog","infographic","video"] (blog = chủ đề sâu cần giải thích; infographic = liệt kê/số liệu/mẹo nhìn nhanh; video = câu chuyện/cảm xúc/trình diễn). Kèm "podcast_score" 0-100: nội dung này ĐỌC THÀNH AUDIO có hay không (câu chuyện/tâm sự/lời khuyên nghe được → cao; bảng số liệu/so sánh nhìn mắt → thấp).\n\n' +
      `CÁC NHÓM CHÂN DUNG:\n${personasText}\n\n${rubric}\n\n` +
      'verdict ∈ ["xuất sắc - đăng ngay","đăng ngay","sửa nhẹ","sửa nhiều","bỏ qua"].\n' +
      'Trả JSON: mảng [{"i","persona","score","scores":{"hook","clarity","brand_voice","value","cta","seo"},"verdict","rewritten","variants":[{"persona","text"}],"reason","content_type","podcast_score"}] — đúng thứ tự "i" của đầu vào, đủ mọi phần tử.';
    const user = items
      .map(
        (it) =>
          `[${it.i}] (${it.platform}${it.shares ? ` · ${it.shares} share` : ''}${it.likes ? ` · ${it.likes} like` : ''})\nTiêu đề: ${it.title}\nNội dung: ${(it.content || '(chỉ có tiêu đề)').slice(0, 1800)}`
      )
      .join('\n\n---\n\n');
    return claudeJson(system, user, 8000);
  }

  // Làm giàu hồ sơ persona từ tín hiệu cào — port nguyên văn prompt node n8n
  // "[Prof] Aggregate" + "[Prof] Claude Update".
  async viralUpdatePersonas(blocks: string): Promise<
    | {
        profile_id: string;
        moi_quan_tam?: string;
        tam_ly?: string;
        hanh_vi?: string;
        insights?: string;
      }[]
    | null
  > {
    const sys = `Ban lam giau HO SO PERSONA phu huynh cua Truong Viet Anh tu du lieu crawl. Ho so duoc to chuc theo 5 truc: (1) van hoa nuoi day, (2) hoc van & muc tiep can thong tin, (3) kinh te & moi ban tam chi phi, (4) hanh vi quyet dinh, (5) noi dau theo cap hoc.

CACH DUNG 3 LOAI TIN HIEU:
- VOICE (loi than/thac mac that cua phu huynh trong group) = quy nhat -> cap nhat "tam_ly" (noi dau, noi so moi) va "moi_quan_tam". Trich duoc ca cach ho dung tu (de copywriter dung lai giong noi cua ho).
- TREND (bao chi) -> bo sung "moi_quan_tam" voi chu de dang nong ma nhom nay quan tam.
- WINNING (content share cao) -> cap nhat "insights": cong thuc/goc tiep can nao dang hieu qua voi nhom nay.

QUY TAC CHONG TROI (rat quan trong):
- "tam_ly" va "hanh_vi" la phan LOI cua persona: CHI bo sung khi tin hieu xuat hien LAP LAI hoac rat manh (engagement cao); KHONG viet lai toan bo, KHONG xoa dac diem cu.
- "moi_quan_tam": them chu de moi, gop chu de trung, loai chu de da nguoi (uu tien 6-10 chu de song dong nhat).
- "insights" = truong DONG: chung cat hieu biet MOI NHAT + dat gia nhat, toi da ~450 ky tu, uu tien tin hieu tuan nay, manh dan bo insight cu da het nong.
- TUYET DOI KHONG dua dia danh, dinh kien vung mien/giau ngheo vao bat ky truong nao. Persona phan biet bang tam ly - hoc van - kinh te - hanh vi.
- Moi truong toi da ~500 ky tu (tru insights ~450). Viet tieng Viet co dau.
- Nhom khong co tin hieu moi: giu nguyen ca 4 truong.

CHI tra JSON array: [{"profile_id","moi_quan_tam","tam_ly","hanh_vi","insights"}]. Khong markdown.`;
    return claudeJson(sys, `8 nhom persona va tin hieu hom nay:\n\n${blocks}`, 4000);
  }

  // BẢN TIN TUẦN cho trang Phát hiện: từ bài đã cào/chấm 7 ngày → tin nóng,
  // diễn biến thị trường/đối thủ, và TODO LIST hành động tuần này. Gửi về
  // Zalo/email sau mỗi lần cào theo lịch T2-4-6 + tổng kết CN.
  async viralWeeklyBrief(input: {
    trendText: string; // tin báo chí nổi bật (đã chấm điểm cao)
    winningText: string; // bài đối thủ/KOL share cao
    statsText: string; // số liệu 7 ngày (cào/duyệt/sản xuất/chờ duyệt)
  }): Promise<{
    summary: string;
    highlights: string[];
    market: string[];
    todos: { title: string; action: string }[];
  } | null> {
    const system =
      'Bạn là trợ lý chiến lược nội dung của Trường Việt Anh (K-12, TP.HCM). ' +
      'Từ dữ liệu cào 7 ngày (tin giáo dục nóng + bài đối thủ/KOL thắng + số liệu vận hành), viết BẢN TIN TUẦN NGẮN GỌN cho đội marketing:\n' +
      '- "summary": 2-3 câu nắm bắt tuần này có gì đáng chú ý nhất (nóng hổi, thiết thực, tiếng Việt tự nhiên).\n' +
      '- "highlights": 3-5 tin NÓNG nhất tuần (mỗi dòng: tin gì + vì sao phụ huynh quan tâm — ngắn, 1 câu/dòng).\n' +
      '- "market": 2-4 diễn biến thị trường/đối thủ đáng để ý (đối thủ đang đánh chủ đề gì, format nào đang thắng).\n' +
      '- "todos": 4-7 việc CỤ THỂ tuần này cho đội content (mỗi việc: "title" ngắn + "action" 1 câu làm gì — vd viết blog chủ đề X cho nhóm THPT, sản xuất podcast Y, bám sự kiện Z). Ưu tiên việc ăn theo tin nóng + lỗ hổng đối thủ chưa làm.\n' +
      'KHÔNG bịa số liệu, KHÔNG nhắc tên trường đối thủ trong todos (chỉ trong market). ' +
      'Trả CHỈ JSON: {"summary","highlights":[],"market":[],"todos":[{"title","action"}]}';
    const user =
      `TIN GIÁO DỤC NÓNG (7 ngày):\n${input.trendText || '(không có)'}\n\n` +
      `BÀI THẮNG CỦA ĐỐI THỦ/KOL:\n${input.winningText || '(không có)'}\n\n` +
      `SỐ LIỆU VẬN HÀNH:\n${input.statsText}`;
    return claudeJson(system, user, 3000);
  }

  // Mở rộng TỪ KHOÁ thành 6-7 truy vấn tìm tin cùng chủ đề (nguồn Google News)
  // — port node n8n "🔑 Mở rộng chủ đề".
  async viralExpandQueries(keyword: string): Promise<string[]> {
    const out = await claudeJson<string[]>(
      'Bạn sinh các TRUY VẤN tìm kiếm tin tức tiếng Việt để tìm bài CÙNG CHỦ ĐỀ với từ khóa cho trước. ' +
        'Trả JSON array string thuần, 6-7 truy vấn: gồm từ khóa gốc + các cách diễn đạt khác / đồng nghĩa / khía cạnh liên quan ' +
        '(để bắt bài title khác nhưng nội dung trùng chủ đề). KHÔNG markdown, KHÔNG giải thích.',
      'Từ khóa: ' + keyword,
      500
    );
    return Array.isArray(out)
      ? out.map((s) => String(s).trim()).filter(Boolean).slice(0, 7)
      : [];
  }

  // SẢN XUẤT (WF-SanXuat): viết bài BLOG chuẩn EEAT từ nội dung đã duyệt.
  // system/user dựng sẵn ở viral.produce.prompts.ts — service chỉ gọi model.
  async viralProduceBlog(
    system: string,
    user: string
  ): Promise<{
    title: string;
    slug: string;
    meta_description: string;
    tags: string[];
    body_html: string;
  } | null> {
    return claudeJson(system, user, 8000);
  }

  // SẢN XUẤT: viết kịch bản podcast (monologue, TTS đọc).
  async viralProducePodcast(
    system: string,
    user: string
  ): Promise<{ title: string; full_script: string; est_minutes: number } | null> {
    return claudeJson(system, user, 6000);
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
