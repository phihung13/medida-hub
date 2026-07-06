import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// ============================================================================
// Proxy /botapi → bot Zalo, chạy LÚC RUNTIME (thay rewrite cũ trong next.config
// vốn bị đóng băng vào routes-manifest lúc build — xem bài học media 404).
// - Địa chỉ bot đọc từ env ZALO_BOT_URL mỗi request: local = 127.0.0.1:8088,
//   Docker/VPS = http://zalo-bot:8088 (mạng nội bộ compose, không cần domain).
// - Auth 2 lớp: (1) verify JWT đăng nhập Hub (cookie/header 'auth') y hệt
//   botApiGuard trong proxy.ts; (2) gắn bí mật chung HUB_BOT_TOKEN để bot
//   nhận request này như một phiên dashboard (bot từ chối nếu token lệch).
// ============================================================================

const botBase = () =>
  (process.env.ZALO_BOT_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');

async function verifyHubJwt(request: NextRequest) {
  const token =
    request.cookies.get('auth')?.value || request.headers.get('auth') || '';
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), {
      algorithms: ['HS256'],
    });
    return true;
  } catch {
    return false;
  }
}

// Header chỉ có ý nghĩa giữa client↔proxy, không được chuyển tiếp nguyên si.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'proxy-authenticate',
  'proxy-authorization',
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  if (!(await verifyHubJwt(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { path } = await context.params;
  const url =
    botBase() + '/' + (path ?? []).join('/') + (request.nextUrl.search || '');

  const headers = new Headers();
  // Chỉ chuyển các header bot thật sự cần (body JSON, ảnh/video có Range).
  for (const h of ['content-type', 'accept', 'range', 'if-none-match', 'if-modified-since']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (process.env.HUB_BOT_TOKEN) {
    headers.set('x-hub-token', process.env.HUB_BOT_TOKEN);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      // @ts-ignore — Node fetch yêu cầu duplex khi body là stream
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual',
      cache: 'no-store',
      // Đăng FB / đẩy media có thể chạy hơn 1 phút
      signal: AbortSignal.timeout(180000),
    });
  } catch {
    return NextResponse.json(
      { error: 'Bot Zalo không phản hồi (kiểm tra ZALO_BOT_URL / bot đang chạy)' },
      { status: 502 }
    );
  }

  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k)) out.set(k, v);
  });
  // fetch của Node tự giải nén gzip → bỏ cặp header nén kẻo sai độ dài.
  if (out.has('content-encoding')) {
    out.delete('content-encoding');
    out.delete('content-length');
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;

export const dynamic = 'force-dynamic';
