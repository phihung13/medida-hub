import { HubToolError } from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// Gọi bot Zalo (service zalo-bot trong compose) qua mạng nội bộ ZALO_BOT_URL
// kèm bí mật chung HUB_BOT_TOKEN (giống proxy /botapi), KHÔNG mở cổng bot ra ngoài.
// Dùng chung cho mọi nhóm công cụ MCP đụng tới bot.

export const botBase = () =>
  (process.env.ZALO_BOT_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');

const botHeaders = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...(process.env.HUB_BOT_TOKEN
    ? { 'x-hub-token': process.env.HUB_BOT_TOKEN }
    : {}),
});

export const bot = async (
  path: string,
  init: { method?: 'GET' | 'POST'; body?: any } = {},
  timeoutMs = 60_000
) => {
  let res: Response;
  try {
    res = await fetch(botBase() + path, {
      method: init.method || 'GET',
      headers: botHeaders(),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HubToolError(
      'Bot Zalo không phản hồi (bot đang tắt hoặc ZALO_BOT_URL sai).'
    );
  }
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (res.status === 401) {
    throw new HubToolError(
      'Bot Zalo từ chối — HUB_BOT_TOKEN của Hub và bot phải giống nhau.'
    );
  }
  if (!res.ok || data?.ok === false) {
    throw new HubToolError(data?.error || `Bot Zalo lỗi ${res.status}`);
  }
  return data;
};

// Tải file nhị phân từ bot (vd ảnh bài chờ: /api/postiz/draft-image/:id/:idx).
export const botBinary = async (path: string, timeoutMs = 60_000) => {
  let res: Response;
  try {
    res = await fetch(botBase() + path, {
      headers: botHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HubToolError(
      'Bot Zalo không phản hồi (bot đang tắt hoặc ZALO_BOT_URL sai).'
    );
  }
  if (res.status === 404) throw new HubToolError('Bot không có file này.');
  if (!res.ok) throw new HubToolError(`Bot Zalo lỗi ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};
