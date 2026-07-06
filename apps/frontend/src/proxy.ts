import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import { jwtVerify } from 'jose';
import acceptLanguage from 'accept-language';
import {
  cookieName,
  headerName,
  languages,
} from '@gitroom/react/translation/i18n.config';
acceptLanguage.languages(languages);

// Bot Zalo (:8088) lộ ra ngoài qua proxy same-origin /botapi (next.config
// rewrite → 127.0.0.1:8088) và bot KHÔNG tự xác thực. Vì vậy /botapi PHẢI được
// gate bằng JWT THẬT (verify chữ ký), không phải "có cookie là qua". Cookie
// same-origin tự đi kèm mọi fetch/img nên không cần đổi client.
async function botApiGuard(request: NextRequest) {
  const token =
    request.cookies.get('auth')?.value || request.headers.get('auth') || '';
  if (!token || !process.env.JWT_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), {
      algorithms: ['HS256'],
    });
    return null; // hợp lệ → cho đi tiếp (Next rewrite sẽ proxy sang bot)
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

// This function can be marked `async` if using `await` inside
export async function proxy(request: NextRequest) {
  const nextUrl = request.nextUrl;

  // Gate /botapi TRƯỚC mọi thứ — verify JWT chữ ký, tuyệt đối không nhận
  // ?loggedAuth hay cookie giá trị bất kỳ.
  if (nextUrl.pathname.startsWith('/botapi')) {
    const blocked = await botApiGuard(request);
    if (blocked) return blocked;
    return NextResponse.next();
  }

  // Đã gom mọi trang đăng nhập về /login (bỏ /auth). Link/bookmark cũ /auth* →
  // /login* (giữ /forgot, /activate; còn lại về /login). API /auth/* KHÔNG bị
  // đụng (đi qua /hubapi, loại khỏi matcher).
  if (nextUrl.pathname === '/auth' || nextUrl.pathname.startsWith('/auth/')) {
    const sub = nextUrl.pathname.replace(
      /^\/auth\/(forgot|activate)/,
      '/login/$1'
    );
    const target = sub.startsWith('/login/') ? sub : '/login';
    return NextResponse.redirect(new URL(target + nextUrl.search, nextUrl.href));
  }

  const authCookie =
    request.cookies.get('auth') ||
    request.headers.get('auth') ||
    nextUrl.searchParams.get('loggedAuth');
  const lng = request.cookies.has(cookieName)
    ? acceptLanguage.get(request.cookies.get(cookieName).value)
    : acceptLanguage.get(
        request.headers.get('Accept-Language') ||
          request.headers.get('accept-language')
      );

  const requestHeaders = new Headers(request.headers);
  if (lng) {
    requestHeaders.set(headerName, lng);
  }

  const topResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (lng) {
    topResponse.headers.set(cookieName, lng);
  }

  if (nextUrl.pathname.startsWith('/modal/') && !authCookie) {
    return NextResponse.redirect(new URL(`/login/login-required`, nextUrl.href));
  }

  if (
    nextUrl.pathname.startsWith('/uploads/') ||
    nextUrl.pathname.startsWith('/p/') ||
    nextUrl.pathname.startsWith('/provider/') ||
    nextUrl.pathname.startsWith('/icons/')
  ) {
    return topResponse;
  }

  if (
    nextUrl.pathname.startsWith('/integrations/social/') &&
    nextUrl.href.indexOf('state=login') === -1
  ) {
    return topResponse;
  }

  // If the URL is logout, delete the cookie and redirect to login
  if (nextUrl.href.indexOf('/login/logout') > -1) {
    const response = NextResponse.redirect(
      new URL('/login', nextUrl.href)
    );
    response.cookies.set('auth', '', {
      path: '/',
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: false,
          }
        : {}),
      maxAge: -1,
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    });
    return response;
  }

  if (
    nextUrl.pathname.startsWith('/login/register') &&
    process.env.DISABLE_REGISTRATION === 'true'
  ) {
    return NextResponse.redirect(new URL('/login', nextUrl.href));
  }

  const org = nextUrl.searchParams.get('org');
  const url = new URL(nextUrl).search;
  if (!nextUrl.pathname.startsWith('/login') && !authCookie) {
    const providers = ['google', 'settings'];
    const findIndex = providers.find((p) => nextUrl.href.indexOf(p) > -1);
    const additional = !findIndex
      ? ''
      : (url.indexOf('?') > -1 ? '&' : '?') +
        `provider=${(findIndex === 'settings'
          ? process.env.POSTIZ_GENERIC_OAUTH
            ? 'generic'
            : 'github'
          : findIndex
        ).toUpperCase()}`;
    return NextResponse.redirect(
      new URL(`/login${url}${additional}`, nextUrl.href)
    );
  }

  // If the url is /login and the cookie exists, redirect to /
  if (nextUrl.pathname.startsWith('/login') && authCookie) {
    return NextResponse.redirect(new URL(`/${url}`, nextUrl.href));
  }
  if (nextUrl.pathname.startsWith('/login') && !authCookie) {
    if (org) {
      // Về thẳng /login (bỏ vòng qua "/" rồi bật lại /login) — đỡ lóe trang
      const redirect = NextResponse.redirect(new URL(`/login`, nextUrl.href));
      redirect.cookies.set('org', org, {
        ...(!process.env.NOT_SECURED
          ? {
              path: '/',
              secure: true,
              httpOnly: true,
              sameSite: false,
              domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
            }
          : {}),
        expires: new Date(Date.now() + 15 * 60 * 1000),
      });
      return redirect;
    }
    return topResponse;
  }
  try {
    if (org) {
      const { id } = await (
        await internalFetch('/user/join-org', {
          body: JSON.stringify({
            org,
          }),
          method: 'POST',
        })
      ).json();
      const redirect = NextResponse.redirect(
        new URL(`/?added=true`, nextUrl.href)
      );
      if (id) {
        redirect.cookies.set('showorg', id, {
          ...(!process.env.NOT_SECURED
            ? {
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: false,
                domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
              }
            : {}),
          expires: new Date(Date.now() + 15 * 60 * 1000),
        });
      }
      return redirect;
    }
    if (nextUrl.pathname === '/') {
      return NextResponse.redirect(
        new URL(
          !!process.env.IS_GENERAL ? '/launches' : `/analytics`,
          nextUrl.href
        )
      );
    }

    return topResponse;
  } catch (err) {
    console.log('err', err);
    return NextResponse.redirect(new URL('/login/logout', nextUrl.href));
  }
}

// See "Matching Paths" below to learn more
// - hubapi/ BỎ khỏi matcher: proxy same-origin sang backend (backend tự xác
//   thực; /hubapi/auth/login phải chạy được khi CHƯA có cookie).
// - botapi/ GIỮ trong matcher: nhờ check authCookie bên trên, chỉ người đã
//   đăng nhập mới gọi được bot qua tunnel (bot không có auth riêng).
// GIỮ botapi/ trong matcher để botApiGuard verify JWT. hubapi/ vẫn loại
// (backend tự xác thực, và /hubapi/auth/login phải chạy khi chưa có cookie).
export const config = {
  matcher: '/((?!api/|hubapi/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)',
};