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
  imageModel: string; // model tạo ảnh (nano banana) — đổi được trong UI Settings
}

// Mặc định Nano Banana Pro — render chữ tiếng Việt có dấu tốt nhất (infographic
// ít lỗi chính tả nhất). Đổi sang bản rẻ hơn trong Cài đặt nếu muốn tiết kiệm.
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image';

const config: GeminiConfig = { key: '', imageModel: '' };

try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  config.key = typeof raw?.key === 'string' ? raw.key : '';
  config.imageModel =
    typeof raw?.imageModel === 'string' ? raw.imageModel : '';
} catch {
  /* chưa có file — dùng mặc định */
}

// Model ảnh: file override → env GEMINI_IMAGE_MODEL → mặc định Pro.
if (!config.imageModel) {
  config.imageModel =
    (process.env.GEMINI_IMAGE_MODEL || '').trim() || DEFAULT_IMAGE_MODEL;
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

// Model tạo ảnh hiện dùng (config → env → mặc định Pro).
export function getGeminiImageModel(): string {
  return config.imageModel || DEFAULT_IMAGE_MODEL;
}

export function setGeminiImageModel(model: string): void {
  config.imageModel = (model || '').trim() || DEFAULT_IMAGE_MODEL;
  try {
    fs.writeFileSync(FILE, JSON.stringify(config));
  } catch {
    /* ghi file lỗi — vẫn giữ trong bộ nhớ phiên hiện tại */
  }
}

// Trạng thái cho UI — KHÔNG trả key thật, chỉ masked. Kèm model ảnh đang dùng.
export function getGeminiStatus() {
  return {
    hasKey: hasGeminiKey(),
    masked: config.key ? config.key.slice(0, 6) + '…' : '',
    imageModel: getGeminiImageModel(),
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
