import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { ZaloVideoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zalo-video.dto';

// ============================================================================
//  ZALO VIDEO — đăng video lên kênh Zalo Video (video.zalo.me).
//
//  Zalo KHÔNG có API công khai cho Zalo Video, nên Hub không tự đăng: Hub nhờ
//  bot (apps/zalo-bot) điều khiển trình duyệt bằng phiên đăng nhập đã lưu.
//  Không có OAuth — thêm kênh chỉ là bấm "Kết nối": Hub hỏi bot xem phiên còn
//  dùng được không và lấy tên/ảnh kênh thật.
//
//  CHỐNG ĐĂNG TRÙNG: Temporal cho mỗi lượt đăng tối đa 10 phút rồi TỰ THỬ LẠI
//  (tới 3 lần). Hub gửi việc cho bot với khoá = id bài; bot nhận lại cùng khoá
//  thì trả về ĐÚNG việc cũ. Mỗi lượt chỉ chờ ~8 phút:
//   - việc XONG           -> báo thành công
//   - việc THẤT BẠI THẬT  -> BadBody (nonRetryable) — không thử lại
//   - vẫn đang chạy       -> Error thường — Temporal thử lại, lượt sau gắn tiếp
//                            vào đúng việc này, KHÔNG đăng lần hai.
// ============================================================================

const BOT = () =>
  (process.env.ZALO_BOT_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');

const VIDEO_RE = /\.(mp4|mov)(\?|$)/i;
const ANY_VIDEO_RE = /\.(mp4|mov|avi|webm|mkv|m4v|3gp|flv|wmv)(\?|$)/i;
const WAIT_PER_ATTEMPT_MS = 8 * 60_000;
const POLL_MS = 10_000;

// updateMedia() đặt `path` = đường dẫn trên ổ đĩa với media lưu nội bộ; bot
// chạy ở container KHÁC nên phải dùng URL công khai.
const publicUrl = (m: any): string => {
  const u = m?.url || m?.path || '';
  return /^https?:\/\//i.test(u) ? u : '';
};

async function bot(method: 'GET' | 'POST', path: string, body?: any) {
  const token = process.env.HUB_BOT_TOKEN || '';
  let res: Response;
  try {
    res = await fetch(`${BOT()}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-hub-token': token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      error: `Không gọi được bot Zalo (${BOT()}): ${e?.cause?.code || e?.message || e}`,
    } as any;
  }
  const json: any = await res.json().catch(() => ({}));
  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      error:
        'Bot Zalo từ chối — kiểm tra HUB_BOT_TOKEN giống nhau ở Hub và bot (≥16 ký tự).',
    } as any;
  }
  return { status: res.status, ...json };
}

@Rules(
  'Zalo Video posts exactly ONE video (.mp4 or .mov, max 500MB) with a text description of up to 4000 characters. No images. One content block per post.'
)
export class ZaloVideoProvider extends SocialAbstract implements SocialProvider {
  identifier = 'zalo-video';
  name = 'Zalo Video';
  toolTip = 'Đăng video qua bot Zalo — cần tải phiên đăng nhập lên bot trước.';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  dto = ZaloVideoDto;
  maxLength() {
    return 4000;
  }

  // Không có trường nào để nhập: form thêm kênh chỉ còn nút "Kết nối" —
  // phiên đăng nhập nằm sẵn trên bot.
  async customFields(): Promise<
    {
      key: string;
      label: string;
      validation: string;
      type: 'text' | 'password';
    }[]
  > {
    return [];
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return { url: state, codeVerifier: makeId(10), state };
  }

  // Phiên đăng nhập do BOT giữ và tự làm mới (giữ ấm mỗi 6 tiếng) — Hub không
  // có token nào để làm mới.
  async refreshToken(): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async authenticate(): Promise<AuthTokenDetails | string> {
    const r: any = await bot('POST', '/api/zalovideo/channel');
    if (!r?.ok || !r?.channel?.id) {
      return (
        r?.error ||
        'Bot chưa có phiên Zalo Video — đăng nhập bằng `npm run zalovideo:login` rồi tải file phiên lên bot.'
      );
    }
    return {
      id: r.channel.id,
      name: r.channel.name,
      picture: r.channel.avatar,
      username: r.channel.name,
      // Không dùng để gọi Zalo — chỉ đánh dấu kênh do bot đăng hộ.
      accessToken: 'zalo-video-bot',
      refreshToken: '',
      // Rất dài: không để Postiz đòi "kết nối lại" theo hạn token.
      expiresIn: 100 * 365 * 24 * 3600,
    };
  }

  // Chặn NGAY LÚC LÊN LỊCH những thứ Zalo Video không nhận.
  override async checkValidity(posts: Array<any[]>): Promise<string | true> {
    if ((posts || []).length > 1) {
      return 'Zalo Video chỉ đăng 1 khối nội dung — hãy gộp lại hoặc tách thành nhiều bài.';
    }
    const media = posts?.[0] || [];
    const videos = media.filter((m) => ANY_VIDEO_RE.test(m?.path || ''));
    if (videos.length !== 1 || media.length !== 1) {
      return 'Bài Zalo Video cần đúng 1 video và không kèm ảnh.';
    }
    if (!VIDEO_RE.test(videos[0]?.path || '')) {
      return 'Zalo Video chỉ nhận video .mp4 hoặc .mov.';
    }
    return true;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<ZaloVideoDto>[]
  ): Promise<PostResponse[]> {
    const [first] = postDetails;
    const video = ((first?.media || []) as any[]).find(
      (m) => VIDEO_RE.test(m?.url || m?.path || '')
    );
    const videoUrl = publicUrl(video);
    if (!videoUrl) {
      throw new BadBody(
        'zalo-video',
        JSON.stringify(first?.media || []),
        '',
        'Bài Zalo Video cần 1 video (.mp4/.mov) có đường dẫn công khai.'
      );
    }

    // Khoá chống trùng = id bài. Lượt thử lại của Temporal gửi cùng khoá ->
    // bot trả đúng việc đang chạy/đã xong, không đăng lần hai.
    const key = `hub-${first.id}`;
    let r: any = await bot('POST', '/api/zalovideo/jobs', {
      key,
      videoUrl,
      description: first.message || '',
    });
    if (!r?.ok) {
      throw new BadBody('zalo-video', JSON.stringify(r), '', r?.error || 'Bot Zalo không nhận việc đăng.');
    }

    const deadline = Date.now() + WAIT_PER_ATTEMPT_MS;
    for (;;) {
      const job = r.job;
      if (job?.state === 'done') {
        return [
          {
            id: first.id,
            postId: key,
            // Chưa xác minh được định dạng URL công khai của kênh Zalo Video —
            // để trống còn hơn đưa một đường dẫn đoán mò có thể sai.
            releaseURL: '',
            status: 'success',
          },
        ];
      }
      if (job?.state === 'failed') {
        throw new BadBody('zalo-video', JSON.stringify(job), '', job.error || 'Đăng Zalo Video thất bại.');
      }
      if (Date.now() > deadline) {
        // Error THƯỜNG (không phải BadBody): để Temporal thử lại và gắn tiếp
        // vào đúng việc này theo khoá.
        throw new Error('Zalo Video: bot vẫn đang đăng video — sẽ kiểm tra lại ở lượt sau.');
      }
      await new Promise((res) => setTimeout(res, POLL_MS));
      r = await bot('GET', `/api/zalovideo/jobs/${encodeURIComponent(key)}`);
      if (!r?.ok && r?.status !== 404) {
        // Lỗi mạng tạm thời tới bot: thử lại vòng sau, không kết luận vội.
        r = { job: { state: 'running' } };
      } else if (r?.status === 404) {
        throw new BadBody('zalo-video', JSON.stringify(r), '', 'Bot không còn giữ việc đăng này (có thể bot vừa khởi động lại).');
      }
    }
  }
}
