import * as fs from 'fs';
import * as path from 'path';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

// ============================================================================
//  Lưu OAuth keys các kênh (FB/LinkedIn/GBP/Telegram...) NHẬP TỪ UI Settings.
//  - Ghi vào file .env gốc của repo NẾU CÓ (local dev — frontend cũng đọc được)
//  - LUÔN ghi thêm CONFIG_DIR/social-keys.env (Docker mount volume → key nhập
//    qua UI sống qua restart/rebuild container, không cần .env).
//  - File overrides được NẠP vào process.env ngay khi module load (main.ts của
//    backend + orchestrator import sớm) — env thật (compose/coolify) vẫn ưu tiên.
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

function envFilePath(): string | null {
  // backend chạy với cwd = apps/backend (dotenv -e ../../.env)
  const candidates = [
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Docker: không có .env — chỉ dùng file overrides bền bên dưới.
  return null;
}

// File overrides bền (định dạng .env đơn giản KEY="value").
const OVERRIDES_FILE = configPath('social-keys.env');

function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function upsertEnvText(content: string, key: string, value: string): string {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content)
    ? content.replace(re, line)
    : content + (content.endsWith('\n') || !content ? '' : '\n') + line + '\n';
}

// Nạp overrides vào process.env NGAY khi module load. Env thật (đặt từ
// compose/coolify/.env) ƯU TIÊN hơn — chỉ điền chỗ trống.
try {
  const saved = parseEnvText(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
  for (const [k, v] of Object.entries(saved)) {
    if (
      (SOCIAL_KEY_WHITELIST as readonly string[]).includes(k) &&
      !(process.env[k] || '').trim() &&
      v
    ) {
      process.env[k] = v;
    }
  }
} catch {
  /* chưa có file — bỏ qua */
}

// Cho main.ts import gọi tường minh (import module là đã nạp ở trên).
export function loadPersistedSocialKeys(): void {
  /* việc nạp diễn ra lúc import — hàm này chỉ để giữ import không bị tree-shake */
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
  if (file) {
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      content = '';
    }
  }
  let overrides = '';
  try {
    overrides = fs.readFileSync(OVERRIDES_FILE, 'utf8');
  } catch {
    overrides = '';
  }

  for (const [key, raw] of Object.entries(vars || {})) {
    if (!(SOCIAL_KEY_WHITELIST as readonly string[]).includes(key)) continue;
    const value = String(raw ?? '')
      .replace(/[\r\n"]/g, '')
      .trim();
    if (!value) continue; // không ghi đè bằng rỗng — muốn xoá thì sửa file tay

    if (file) content = upsertEnvText(content, key, value);
    overrides = upsertEnvText(overrides, key, value);

    process.env[key] = value; // hiệu lực NGAY cho backend
    saved.push(key);
  }

  if (saved.length) {
    try {
      if (file) fs.writeFileSync(file, content);
    } catch {
      /* ghi .env lỗi — file overrides bên dưới vẫn giữ key */
    }
    try {
      fs.writeFileSync(OVERRIDES_FILE, overrides);
    } catch {
      /* ghi file lỗi — env runtime vẫn hoạt động tới khi restart */
    }
  }
  return { ok: true, saved };
}
