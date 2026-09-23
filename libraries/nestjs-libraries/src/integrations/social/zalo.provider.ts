import { createHash } from 'crypto';
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
import { ZaloDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zalo.dto';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

// ============================================================================
//  ZALO OA PROVIDER — đăng NGƯỢC từ Media Hub ra Zalo Official Account.
//
//  Hai loại nội dung, CÙNG endpoint article/create nhưng KHÁC body:
//   1. "Bài viết" (type: "normal") — text + ảnh, có cover.
//   2. "Video" — nội dung dạng Video của OA. Bắt buộc video_id + avatar.
//  Bài có video -> tự đi nhánh 2; không có video -> nhánh 1.
//
//  ⚠️ CẢ HAI ĐỀU BẤT ĐỒNG BỘ: article/create CHỈ trả về `token`, phải gọi
//  article/verify với token đó mới ra id bài thật. Bản cũ đọc thẳng
//  res.data.id — trường KHÔNG TỒN TẠI trong tài liệu Zalo.
//
//  ⚠️ Bản cũ còn sai schema: dùng type dạng SỐ (0/1) trong body, `desc` thay
//  vì `description`, `coverType/coverView/photo` thay vì
//  `cover_type/cover_view/photo_url`, thiếu hẳn `type: "normal"`, và lấy
//  `img.path` (đường dẫn TRÊN Ổ ĐĨA) làm URL gửi cho Zalo.
//
//  ⚠️ RÀNG BUỘC ZALO (tài liệu chính thức, không lách được bằng code):
//   - Ảnh dùng cho Article API: TỐI ĐA 1MB mỗi ảnh.
//   - Video: chỉ .mp4/.avi, tối đa 50MB, phải upload lấy video_id.
//   - Chỉ OA đã XÁC MINH mới dùng được Article API.
// ============================================================================

// PKCE S256: code_challenge = base64url(sha256(code_verifier))
function codeChallengeS256(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const OAUTH_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const OAUTH_PERMISSION_URL = 'https://oauth.zaloapp.com/v4/oa/permission';
const OPENAPI = 'https://openapi.zalo.me/v2.0';

// Đúng 2 định dạng Zalo nhận cho API upload video.
const VIDEO_RE = /\.(mp4|avi)(\?|$)/i;
// Định dạng video phổ biến nhưng Zalo KHÔNG nhận -> báo sớm cho người dùng.
const UNSUPPORTED_VIDEO_RE = /\.(mov|webm|mkv|flv|wmv|m4v|3gp)(\?|$)/i;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const isVideo = (m: any) => VIDEO_RE.test(m?.url || m?.path || '');

// updateMedia() gắn cứng type:'image' cho MỌI media (kể cả video), và đặt
// `path` = đường dẫn TRÊN Ổ ĐĨA khi file lưu nội bộ. Zalo cần URL công khai
// nên luôn ưu tiên `url`; `path` chỉ dùng được khi bản thân nó đã là http.
const publicUrl = (m: any): string => {
  const u = m?.url || m?.path || '';
  return /^https?:\/\//i.test(u) ? u : '';
};

@Rules(
  'Zalo OA supports two content types: an Article (text + photos with a cover) or a Video post. A post containing a video is published as a Video post and requires a thumbnail image. Zalo caps article images at 1MB each and videos at 50MB (.mp4/.avi only). Only one video per post.'
)
export class ZaloProvider extends SocialAbstract implements SocialProvider {
  identifier = 'zalo';
  name = 'Zalo OA';
  isBetweenSteps = false;
  // Zalo OA cấp quyền ở cấp OA (không dùng scope kiểu Facebook).
  scopes = [] as string[];
  editor = 'normal' as const;
  maxLength() {
    return 20000;
  }
  dto = ZaloDto;

  // Lấy thông tin OA (tên/avatar/oa_id) từ access_token.
  private async getOaInfo(
    accessToken: string
  ): Promise<{ id: string; name: string; avatar: string }> {
    const res = await (
      await fetch(`${OPENAPI}/oa/getoa`, {
        headers: { access_token: accessToken },
      })
    ).json();
    const data = res?.data || {};
    return {
      id: String(data.oa_id || ''),
      name: data.name || 'Zalo OA',
      avatar: data.avatar || '',
    };
  }

  async generateAuthUrl() {
    const state = makeId(7);
    const codeVerifier = makeId(43);
    const challenge = codeChallengeS256(codeVerifier);
    const redirect = encodeURIComponent(
      `${process.env.FRONTEND_URL}/integrations/social/zalo`
    );
    return {
      url:
        `${OAUTH_PERMISSION_URL}` +
        `?app_id=${process.env.ZALO_APP_ID}` +
        `&redirect_uri=${redirect}` +
        `&code_challenge=${challenge}` +
        `&state=${state}`,
      codeVerifier,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails> {
    const body = new URLSearchParams({
      code: params.code,
      app_id: process.env.ZALO_APP_ID!,
      grant_type: 'authorization_code',
      code_verifier: params.codeVerifier,
    });

    const token = await (
      await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: process.env.ZALO_APP_SECRET!,
        },
        body,
      })
    ).json();

    if (!token?.access_token) {
      throw new BadBody(
        'zalo',
        JSON.stringify(token),
        body as any,
        token?.error_description ||
          token?.message ||
          'Zalo authentication failed'
      );
    }

    const oa = await this.getOaInfo(token.access_token);

    return {
      id: oa.id || makeId(10),
      name: oa.name,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      // access_token sống ~1h (expires_in giây). Trừ hao 60s.
      expiresIn: Math.max((Number(token.expires_in) || 3600) - 60, 300),
      picture: oa.avatar,
      username: oa.id,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      app_id: process.env.ZALO_APP_ID!,
      grant_type: 'refresh_token',
    });

    const token = await (
      await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: process.env.ZALO_APP_SECRET!,
        },
        body,
      })
    ).json();

    if (!token?.access_token) {
      throw new BadBody(
        'zalo',
        JSON.stringify(token),
        body as any,
        token?.error_description ||
          token?.message ||
          'Zalo token refresh failed'
      );
    }

    const oa = await this.getOaInfo(token.access_token);

    return {
      id: oa.id,
      name: oa.name,
      accessToken: token.access_token,
      // Zalo XOAY refresh_token mỗi lần refresh — phải lưu bản mới.
      refreshToken: token.refresh_token || refreshToken,
      expiresIn: Math.max((Number(token.expires_in) || 3600) - 60, 300),
      picture: oa.avatar,
      username: oa.id,
    };
  }

  // Chặn NGAY LÚC LÊN LỊCH những thứ Zalo chắc chắn từ chối, thay vì để bài
  // chết im lặng lúc đăng thật.
  override async checkValidity(posts: Array<any[]>): Promise<string | true> {
    // Zalo OA không có khái niệm chuỗi bài/bình luận nối tiếp — post() chỉ
    // đăng được khối đầu. Trước đây các khối sau bị NUỐT IM LẶNG mà giao diện
    // vẫn báo thành công. Chặn ngay lúc lên lịch để không mất nội dung.
    if ((posts || []).length > 1) {
      return 'Zalo OA chỉ đăng được 1 khối nội dung cho mỗi bài — hãy gộp lại hoặc tách thành nhiều bài riêng.';
    }

    const media = posts?.[0] || [];

    if (media.some((m) => UNSUPPORTED_VIDEO_RE.test(m?.path || ''))) {
      return 'Zalo chỉ nhận video .mp4 hoặc .avi — hãy chuyển định dạng trước khi đăng.';
    }

    const videos = media.filter((m) => isVideo(m));
    const images = media.filter((m) => !isVideo(m));

    if (videos.length > 1) {
      return 'Một bài Zalo chỉ đăng được 1 video — hãy tách thành nhiều bài.';
    }

    // Bài dạng Video BẮT BUỘC có `avatar` (thumbnail) theo tài liệu Zalo.
    if (videos.length === 1 && images.length === 0) {
      return 'Bài video Zalo cần kèm 1 ảnh làm thumbnail — hãy đính thêm một ảnh.';
    }

    return true;
  }

  // Tải 1 video lên Zalo rồi CHỜ máy chủ convert xong mới trả video_id.
  private async uploadVideo(accessToken: string, url: string): Promise<string> {
    const file = await fetch(url);
    if (!file.ok) {
      throw new BadBody('zalo', url, '', 'Không tải được video từ Media Hub.');
    }
    const blob = await file.blob();
    if (blob.size > MAX_VIDEO_BYTES) {
      throw new BadBody(
        'zalo',
        String(blob.size),
        '',
        `Video ${(blob.size / 1024 / 1024).toFixed(
          1
        )}MB vượt trần 50MB của Zalo.`
      );
    }

    const form = new FormData();
    form.append('file', blob, url.split('/').pop() || 'video.mp4');

    const prepared = await (
      await fetch(`${OPENAPI}/article/upload_video/preparevideo`, {
        method: 'POST',
        headers: { access_token: accessToken },
        body: form,
      })
    ).json();

    const token = prepared?.data?.token;
    if (!token) {
      throw new BadBody(
        'zalo',
        JSON.stringify(prepared),
        '',
        prepared?.message || 'Zalo từ chối nhận video.'
      );
    }

    // status: 1 = xong & dùng được, 3 = đang xử lý, 2/4/5 = khoá/lỗi/đã xoá.
    // Convert video mất thời gian thật -> chờ tối đa 60 x 5s = 5 phút.
    for (let i = 0; i < 60; i++) {
      const verify = await (
        await fetch(`${OPENAPI}/article/upload_video/verify`, {
          headers: { access_token: accessToken, token },
        })
      ).json();

      const status = Number(verify?.data?.status);
      if (status === 1) {
        return String(verify.data.video_id);
      }
      if (status === 2 || status === 4 || status === 5) {
        throw new BadBody(
          'zalo',
          JSON.stringify(verify),
          '',
          verify?.data?.status_message || 'Zalo xử lý video thất bại.'
        );
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    throw new BadBody(
      'zalo',
      token,
      '',
      'Zalo xử lý video quá lâu (trên 5 phút) — thử lại với video nhẹ hơn.'
    );
  }

  // article/create chỉ trả `token`; id bài thật phải hỏi article/verify.
  private async waitForArticleId(
    accessToken: string,
    token: string
  ): Promise<string> {
    for (let i = 0; i < 30; i++) {
      const verify = await (
        await fetch(`${OPENAPI}/article/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: accessToken,
          },
          body: JSON.stringify({ token }),
        })
      ).json();

      if (verify?.data?.id) {
        return String(verify.data.id);
      }
      if (verify?.error && Number(verify.error) !== 0) {
        throw new BadBody(
          'zalo',
          JSON.stringify(verify),
          '',
          verify?.message || 'Zalo tạo bài thất bại.'
        );
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new BadBody(
      'zalo',
      token,
      '',
      'Zalo nhận bài nhưng chưa trả về id sau 60 giây.'
    );
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<ZaloDto>[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const message = firstPost?.message || '';
    const media = (firstPost?.media || []) as any[];
    const videos = media.filter((m) => isVideo(m) && publicUrl(m));
    const images = media.filter((m) => !isVideo(m) && publicUrl(m));

    const settings = firstPost?.settings || ({} as ZaloDto);
    // Trần thật của Zalo: title ≤150, author ≤50, description ≤300.
    const title = (
      settings.title ||
      message.split('\n').find((l) => l.trim()) ||
      'Bài viết'
    )
      .trim()
      .slice(0, 150);
    const author = (settings.author || '').trim().slice(0, 50);
    const description = message.replace(/\s+/g, ' ').trim().slice(0, 300);
    const comment = settings.allowComment === false ? 'hide' : 'show';

    let payload: any;

    if (videos.length) {
      // ---- Nội dung dạng VIDEO (lên mục Video của OA) ----
      const videoId = await this.uploadVideo(accessToken, publicUrl(videos[0]));
      payload = {
        title,
        description: description || title,
        status: 'show',
        video_id: videoId,
        // avatar = thumbnail, BẮT BUỘC. checkValidity đã ép phải có 1 ảnh.
        avatar: publicUrl(images[0]),
        comment,
      };
    } else {
      // ---- Nội dung dạng BÀI VIẾT (type: "normal") ----
      const body: any[] = [];
      if (message.trim()) {
        body.push({ type: 'text', content: message });
      }
      for (const img of images) {
        body.push({
          type: 'image',
          url: publicUrl(img),
          ...(img.alt ? { caption: img.alt } : {}),
        });
      }
      if (!body.length) {
        body.push({ type: 'text', content: title });
      }

      payload = {
        type: 'normal',
        title,
        // author bắt buộc — bỏ trống Zalo từ chối, nên lấy tạm tiêu đề.
        author: author || title.slice(0, 50),
        cover: images[0]
          ? {
              cover_type: 'photo',
              photo_url: publicUrl(images[0]),
              status: 'show',
            }
          : { cover_type: 'photo', photo_url: '', status: 'hide' },
        description: description || title,
        body,
        status: 'show',
        comment,
      };
    }

    const res = await (
      await this.fetch(
        `${OPENAPI}/article/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: accessToken,
          },
          body: JSON.stringify(payload),
        },
        'zalo article create'
      )
    ).json();

    // Zalo trả HTTP 200 kèm error != 0 khi lỗi logic → phải tự kiểm.
    if (res?.error && Number(res.error) !== 0) {
      throw new BadBody(
        'zalo',
        JSON.stringify(res),
        JSON.stringify(payload),
        // Lỗi hay gặp nhất là ảnh quá 1MB — nói thẳng để người dùng biết sửa.
        `${
          res?.message || 'Zalo tạo bài thất bại'
        } (lưu ý: Zalo giới hạn 1MB mỗi ảnh cho bài viết)`
      );
    }

    const token = res?.data?.token;
    if (!token) {
      throw new BadBody(
        'zalo',
        JSON.stringify(res),
        JSON.stringify(payload),
        'Zalo không trả về token tiến trình tạo bài.'
      );
    }

    const articleId = await this.waitForArticleId(accessToken, token);

    return [
      {
        id: firstPost.id,
        postId: articleId,
        releaseURL: '',
        status: 'success',
      },
    ];
  }
}
