import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
//  Lưu OAuth keys các kênh (FB/LinkedIn/GBP/Telegram...) NHẬP TỪ UI Settings.
//  - Ghi vào file .env gốc của repo (bền qua restart, frontend cũng đọc được)
//  - Set luôn process.env → backend (generateAuthUrl các provider) ăn NGAY.
//  - Whitelist cứng: không cho ghi biến env tuỳ ý (an toàn).
// ============================================================================

export const SOCIAL_KEY_WHITELIST = [
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'GOOGLE_GMB_CLIENT_ID',
  'GOOGLE_GMB_CLIENT_SECRET',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'TELEGRAM_BOT_NAME',
  'TELEGRAM_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN_ID',
  'X_API_KEY',
  'X_API_SECRET',
  'TIKTOK_CLIENT_ID',
  'TIKTOK_CLIENT_SECRET',
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET',
  'PINTEREST_CLIENT_ID',
  'PINTEREST_CLIENT_SECRET',
  'THREADS_APP_ID',
  'THREADS_APP_SECRET',
  'SLACK_ID',
  'SLACK_SECRET',
  'SLACK_SIGNING_SECRET',
  'MASTODON_CLIENT_ID',
  'MASTODON_CLIENT_SECRET',
  'ZALO_APP_ID',
  'ZALO_APP_SECRET',
  'NEXT_PUBLIC_POLOTNO',
] as const;

function envFilePath(): string {
  // backend chạy với cwd = apps/backend (dotenv -e ../../.env)
  const candidates = [
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export type SocialKeyStatus = Record<string, { has: boolean; masked: string }>;

export function getSocialKeysStatus(): SocialKeyStatus {
  const out: SocialKeyStatus = {};
  for (const k of SOCIAL_KEY_WHITELIST) {
    const v = (process.env[k] || '').trim();
    out[k] = { has: !!v, masked: v ? v.slice(0, 6) + '…' : '' };
  }
  return out;
}

export function setSocialKeys(vars: Record<string, string>): {
  ok: boolean;
  saved: string[];
} {
  const saved: string[] = [];
  const file = envFilePath();
  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    content = '';
  }

  for (const [key, raw] of Object.entries(vars || {})) {
    if (!(SOCIAL_KEY_WHITELIST as readonly string[]).includes(key)) continue;
    const value = String(raw ?? '')
      .replace(/[\r\n"]/g, '')
      .trim();
    if (!value) continue; // không ghi đè bằng rỗng — muốn xoá thì sửa .env tay

    const line = `${key}="${value}"`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    content = re.test(content)
      ? content.replace(re, line)
      : content + (content.endsWith('\n') || !content ? '' : '\n') + line + '\n';

    process.env[key] = value; // hiệu lực NGAY cho backend
    saved.push(key);
  }

  if (saved.length) {
    try {
      fs.writeFileSync(file, content);
    } catch {
      /* ghi file lỗi — env runtime vẫn hoạt động tới khi restart */
    }
  }
  return { ok: true, saved };
}
