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
//  ZALO OA PROVIDER — đăng bài NGƯỢC từ Media Hub ra Zalo Official Account.
//
//  Luồng: OAuth v4 (oauth.zaloapp.com) → access_token(1h)+refresh_token(3 tháng)
//  → đăng bằng Article API (openapi.zalo.me/v2.0/article/create).
//
//  ⚠️ RÀNG BUỘC ZALO (không lách được bằng code):
//   - Chỉ OA đã XÁC MINH (verified) mới dùng được Article API.
//   - Cần đăng ký Zalo App (developers.zalo.me) lấy App ID + Secret Key,
//     gắn OA vào app, khai Callback URL = <FRONTEND_URL>/integrations/social/zalo.
//   - Ảnh/video trong bài dùng URL công khai (media của Hub đã có URL public).
//     v1 hỗ trợ TEXT + ẢNH; video cần bước upload lấy video_id (để sau).
//
//  Body Article dựng theo cấu trúc v2.0 (type số: 0=text, 1=image). Nếu Zalo
//  đổi field, xem message lỗi trả về (đã log nguyên response) rồi tinh chỉnh.
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

@Rules(
  'Zalo OA posts are published as an Article on the Official Account. A post can be text only or text with photos. The first line becomes the article title.'
)
export class ZaloProvider extends SocialAbstract implements SocialProvider {
  identifier = 'zalo';
  name = 'Zalo OA';
  isBetweenSteps = false;
  // Zalo OA cấp quyền ở cấp OA (không dùng scope kiểu Facebook).
  scopes = [] as string[];
  editor = 'normal' as const;
  // Bài viết Zalo có thể dài; giới hạn thoáng.
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
        token?.error_description || token?.message || 'Zalo authentication failed'
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
        token?.error_description || token?.message || 'Zalo token refresh failed'
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

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<ZaloDto>[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const message = firstPost?.message || '';
    const media = firstPost?.media || [];
    const images = media.filter((m) => m.type === 'image');

    // Dựng body bài viết: đoạn text (nếu có) + từng ảnh.
    const articleBody: any[] = [];
    if (message.trim()) {
      articleBody.push({ type: 0, content: message });
    }
    for (const img of images) {
      articleBody.push({
        type: 1,
        url: img.path,
        ...(img.alt ? { caption: img.alt } : {}),
      });
    }
    // Article cần tối thiểu 1 đoạn nội dung.
    if (!articleBody.length) {
      articleBody.push({ type: 0, content: ' ' });
    }

    const title =
      firstPost?.settings?.title ||
      message.split('\n')[0]?.slice(0, 100) ||
      'Bài viết';
    const author = firstPost?.settings?.author || '';

    const payload: any = {
      title,
      author,
      desc: message.replace(/\s+/g, ' ').trim().slice(0, 200),
      body: articleBody,
      status: 'show',
    };
    // Ảnh đầu làm ảnh bìa (cover) nếu có.
    if (images[0]) {
      payload.cover = {
        coverType: 0, // 0 = photo
        coverView: 3, // 3 = vuông
        photo: images[0].path,
        status: 'show',
      };
    }

    // access_token truyền cả query lẫn header cho chắc (v2.0 openapi).
    const res = await (
      await this.fetch(
        `${OPENAPI}/article/create?access_token=${encodeURIComponent(
          accessToken
        )}`,
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
        res?.message || 'Zalo article create failed'
      );
    }

    const articleId = String(res?.data?.id || res?.data?.token || '');
    return [
      {
        id: firstPost.id,
        postId: articleId,
        releaseURL: res?.data?.url || res?.data?.article_url || '',
        status: 'success',
      },
    ];
  }
}
