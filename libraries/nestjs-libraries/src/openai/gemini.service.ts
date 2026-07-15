import { Injectable } from '@nestjs/common';
import {
  getGeminiKey,
  hasGeminiKey,
  getGeminiImageModel,
} from '@gitroom/nestjs-libraries/openai/gemini.key';

// ============================================================================
//  Gemini (Google AI Studio) — REST thuần, không cần SDK.
//   • generateImage: tạo ảnh bằng "nano banana" (gemini-2.5-flash-image) →
//     thumbnail YouTube.
//   • videoToYoutubeContent: XEM VIDEO native (Gemini hiểu cả chuyển động +
//     âm thanh) rồi viết tiêu đề + mô tả. Video được tải lên File API vì file
//     lớn không nhét inline được.
//  Chỉ Gemini trong các model ở đây xem được file video trực tiếp — ChatGPT/
//  Claude phải cắt khung hình.
// ============================================================================

const BASE = 'https://generativelanguage.googleapis.com';
const TEXT_MODEL = () => process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
// Model ảnh: đọc từ config (đổi được trong UI Settings) — mặc định Nano Banana
// Pro (gemini-3-pro-image), render chữ tiếng Việt tốt nhất.
const IMAGE_MODEL = () => getGeminiImageModel();

// Trần dung lượng video nạp vào bộ nhớ để upload (tránh OOM). Video lớn hơn →
// khuyên dùng engine "khung hình".
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tách khối JSON đầu tiên trong text model trả về (đôi khi bọc ```json).
function parseJson<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

@Injectable()
export class GeminiService {
  // ---- Tạo ảnh (nano banana) ---------------------------------------------
  // Trả base64 PNG (không kèm data: prefix) hoặc null nếu lỗi/không có key.
  // refImageB64: ảnh THAM CHIẾU (vd bìa carousel) — model nhìn để vẽ đồng bộ
  // phong cách cả bộ (như node "Gen slide thân" của n8n).
  async generateImage(
    prompt: string,
    refImageB64?: string
  ): Promise<string | null> {
    if (!hasGeminiKey()) {
      throw new Error('Chưa cấu hình Gemini API key (Cài đặt → Gemini).');
    }
    const key = getGeminiKey();
    const reqParts: any[] = [];
    if (refImageB64) {
      reqParts.push({ inlineData: { mimeType: 'image/png', data: refImageB64 } });
    }
    reqParts.push({ text: prompt });
    const res = await fetch(
      `${BASE}/v1beta/models/${IMAGE_MODEL()}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: reqParts }],
          // Ép trả ẢNH (khớp node "Gen ảnh" của n8n) — một số model image cần
          // khai rõ modality mới trả ảnh thay vì mô tả bằng chữ.
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini image lỗi (${res.status}): ${body.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p: any) => p?.inlineData?.data);
    return img?.inlineData?.data || null;
  }

  // ---- Xem video → tiêu đề + mô tả ---------------------------------------
  async videoToYoutubeContent(
    videoUrl: string,
    context?: string,
    system?: string
  ): Promise<{ title: string; description: string } | null> {
    if (!hasGeminiKey()) {
      throw new Error('Chưa cấu hình Gemini API key (Cài đặt → Gemini).');
    }
    const key = getGeminiKey();

    // 1. Tải video về Buffer (có trần dung lượng).
    const videoRes = await fetch(videoUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(300000),
    });
    if (!videoRes.ok) {
      throw new Error(`Không tải được video (HTTP ${videoRes.status}).`);
    }
    const mimeType = videoRes.headers.get('content-type') || 'video/mp4';
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    if (buffer.length > MAX_VIDEO_BYTES) {
      throw new Error(
        'Video quá lớn để Gemini xem trực tiếp (>200MB) — hãy dùng engine "khung hình" (ChatGPT).'
      );
    }

    // 2. Upload lên File API (resumable).
    const startRes = await fetch(
      `${BASE}/upload/v1beta/files?key=${key}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(buffer.length),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: 'youtube-source' } }),
      }
    );
    if (!startRes.ok) {
      const body = await startRes.text().catch(() => '');
      throw new Error(
        `Gemini upload (start) lỗi (${startRes.status}): ${body.slice(0, 200)}`
      );
    }
    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error('Gemini không trả upload URL.');

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'Content-Length': String(buffer.length),
      },
      body: buffer,
    });
    if (!uploadRes.ok) {
      const body = await uploadRes.text().catch(() => '');
      throw new Error(
        `Gemini upload lỗi (${uploadRes.status}): ${body.slice(0, 200)}`
      );
    }
    const uploaded: any = await uploadRes.json();
    let file = uploaded?.file;
    if (!file?.name || !file?.uri) throw new Error('Gemini upload không trả file.');

    // 3. Chờ video xử lý xong (state PROCESSING → ACTIVE). ~3 phút tối đa.
    let tries = 0;
    while (file.state !== 'ACTIVE' && tries < 60) {
      if (file.state === 'FAILED') {
        throw new Error('Gemini xử lý video thất bại.');
      }
      await sleep(3000);
      tries++;
      const poll = await fetch(`${BASE}/v1beta/${file.name}?key=${key}`);
      if (poll.ok) file = await poll.json();
    }
    if (file.state !== 'ACTIVE') {
      throw new Error('Gemini chưa xử lý xong video (quá thời gian chờ).');
    }

    // 4. Sinh nội dung.
    const prompt = [
      system || '',
      'Xem video trên và viết cho YouTube:',
      '- "title": tiêu đề hấp dẫn, tối đa 100 ký tự, tiếng Việt.',
      '- "description": mô tả chi tiết, có hook mở đầu, các ý chính, và vài hashtag ở cuối.',
      context ? `Bối cảnh/gợi ý từ người dùng: ${context}` : '',
      'CHỈ trả JSON: {"title": "...", "description": "..."} — không thêm chữ nào khác.',
    ]
      .filter(Boolean)
      .join('\n');

    const genRes = await fetch(
      `${BASE}/v1beta/models/${TEXT_MODEL()}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { fileData: { mimeType: file.mimeType || mimeType, fileUri: file.uri } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { temperature: 0.7 },
        }),
      }
    );
    if (!genRes.ok) {
      const body = await genRes.text().catch(() => '');
      throw new Error(
        `Gemini sinh nội dung lỗi (${genRes.status}): ${body.slice(0, 200)}`
      );
    }
    const genData: any = await genRes.json();
    const text =
      genData?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text || '')
        .join('') || '';
    const parsed = parseJson<{ title: string; description: string }>(text);
    if (!parsed) return null;
    return {
      title: String(parsed.title || '').slice(0, 100),
      description: String(parsed.description || ''),
    };
  }
}
