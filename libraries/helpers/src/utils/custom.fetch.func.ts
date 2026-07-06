export interface Params {
  baseUrl: string;
  beforeRequest?: (url: string, options: RequestInit) => Promise<RequestInit>;
  afterRequest?: (
    url: string,
    options: RequestInit,
    response: Response
  ) => Promise<boolean>;
}

const isLocalHostname = (h: string) => h === 'localhost' || h === '127.0.0.1';

// Host "trong nhà": IP private (LAN), tên máy không có dấu chấm, *.local —
// các trường hợp thiết bị gọi THẲNG được vào cổng backend/bot của máy chủ.
const isLanHostname = (h: string) =>
  /^(10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+)$/.test(h) ||
  !h.includes('.') ||
  h.endsWith('.local');

// baseUrl cấu hình sẵn là http://localhost:3000. Tùy nơi đang mở trang:
// - localhost: giữ nguyên (máy chủ).
// - LAN (http://<IP>:4200): đổi host theo trang, GIỮ port → gọi thẳng :3000.
// - Public (tunnel cloudflare/ngrok...): KHÔNG có cổng 3000 công khai →
//   đi qua proxy same-origin /hubapi (Next rewrite → 127.0.0.1:3000).
export const resolveBaseUrl = (baseUrl: string) => {
  if (typeof window === 'undefined' || !baseUrl) {
    return baseUrl;
  }
  try {
    const u = new URL(baseUrl);
    if (!isLocalHostname(u.hostname)) {
      return baseUrl; // đã cấu hình URL prod thật — tôn trọng
    }
    const cur = window.location;
    if (isLocalHostname(cur.hostname)) {
      return baseUrl;
    }
    if (isLanHostname(cur.hostname)) {
      u.hostname = cur.hostname;
      return u.toString().replace(/\/$/, '');
    }
    return `${cur.origin}/hubapi`;
  } catch {
    /* baseUrl tương đối — giữ nguyên */
  }
  return baseUrl;
};
export const customFetch = (
  params: Params,
  auth?: string,
  showorg?: string,
  secured: boolean = true
) => {
  return async function newFetch(url: string, options: RequestInit = {}) {
    const loggedAuth =
      typeof window === 'undefined'
        ? undefined
        : new URL(window.location.href).searchParams.get('loggedAuth');
    const newRequestObject = await params?.beforeRequest?.(url, options);
    const authNonSecuredCookie =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find((p) => p.includes('auth='))
            ?.split('=')[1];

    const authNonSecuredOrg =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find((p) => p.includes('showorg='))
            ?.split('=')[1];

    const authNonSecuredImpersonate =
      typeof document === 'undefined'
        ? null
        : document.cookie
            .split(';')
            .find((p) => p.includes('impersonate='))
            ?.split('=')[1];

    const fetchRequest = await fetch(resolveBaseUrl(params.baseUrl) + url, {
      ...(secured ? { credentials: 'include' } : {}),
      ...(newRequestObject || options),
      headers: {
        ...(showorg
          ? { showorg }
          : authNonSecuredOrg
          ? { showorg: authNonSecuredOrg }
          : {}),
        ...(options.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        Accept: 'application/json',
        ...(loggedAuth ? { auth: loggedAuth } : {}),
        ...options?.headers,
        ...(auth
          ? { auth }
          : authNonSecuredCookie
          ? { auth: authNonSecuredCookie }
          : {}),
        ...(authNonSecuredImpersonate
          ? { impersonate: authNonSecuredImpersonate }
          : {}),
      },
      // @ts-ignore
      ...(!options.next && options.cache !== 'force-cache'
        ? { cache: options.cache || 'no-store' }
        : {}),
    });

    if (
      !params?.afterRequest ||
      (await params?.afterRequest?.(url, options, fetchRequest))
    ) {
      return fetchRequest;
    }

    // @ts-ignore
    return new Promise((res) => {}) as Response;
  };
};

export const fetchBackend = customFetch({
  get baseUrl() {
    return process.env.BACKEND_URL!;
  },
});
