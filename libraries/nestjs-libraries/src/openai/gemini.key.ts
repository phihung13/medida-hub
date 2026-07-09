import * as fs from 'fs';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

// Key Google AI Studio (Gemini) — nhập qua UI Settings. Dùng cho:
//   • "xem video native" viết tiêu đề + mô tả YouTube (Gemini File API)
//   • tạo thumbnail bằng "nano banana" (gemini-2.5-flash-image)
// Lưu file trong CONFIG_DIR để bền qua restart Docker, đồng thời set vào
// process.env.GEMINI_API_KEY để gemini.service dùng ngay.
const FILE = configPath('gemini-key.json');

interface GeminiConfig {
  key: string;
}

const config: GeminiConfig = { key: '' };

try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  config.key = typeof raw?.key === 'string' ? raw.key : '';
} catch {
  /* chưa có file — dùng mặc định */
}

// Lấy từ .env nếu có (GEMINI_API_KEY hoặc GOOGLE_AI_API_KEY).
if (!config.key) {
  const envKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    ''
  ).trim();
  if (envKey.length > 20) config.key = envKey;
}

function applyEnv() {
  if (config.key) process.env.GEMINI_API_KEY = config.key;
}
applyEnv();

export function getGeminiKey(): string {
  return config.key;
}

export function hasGeminiKey(): boolean {
  return !!config.key && config.key.trim().length > 20;
}

// Trạng thái cho UI — KHÔNG trả key thật, chỉ masked.
export function getGeminiStatus() {
  return {
    hasKey: hasGeminiKey(),
    masked: config.key ? config.key.slice(0, 6) + '…' : '',
  };
}

export function setGeminiKey(key: string): void {
  config.key = (key || '').trim();
  applyEnv();
  try {
    fs.writeFileSync(FILE, JSON.stringify(config));
  } catch {
    /* ghi file lỗi — vẫn giữ trong bộ nhớ phiên hiện tại */
  }
}
