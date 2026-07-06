import * as fs from 'fs';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

// Lưu ANTHROPIC_API_KEY (nhập qua UI) vào file để bền qua restart, đồng thời
// set vào process.env để dùng ngay (không cần sửa .env tay).
// File nằm trong CONFIG_DIR (Docker mount volume) — local mặc định = cwd cũ.
const KEY_FILE = configPath('anthropic-key.txt');

// Nạp key từ file vào process.env lúc module load (nếu env chưa có).
// (File này được import ĐẦU TIÊN trong main.ts để env sẵn sàng trước khi các
//  module AI khởi tạo model.)
try {
  if (!process.env.ANTHROPIC_API_KEY) {
    const k = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (k) process.env.ANTHROPIC_API_KEY = k;
  }
} catch {
  /* chưa có file — bỏ qua */
}

export function getAnthropicKey(): string {
  return process.env.ANTHROPIC_API_KEY || '';
}

export function setAnthropicKey(key: string): void {
  process.env.ANTHROPIC_API_KEY = key || '';
  try {
    fs.writeFileSync(KEY_FILE, key || '');
  } catch {
    /* ghi file lỗi — vẫn set env cho phiên hiện tại */
  }
}

// ---- Model Claude (chọn từ UI Settings, dùng cho AI viết bài + Agent) -------
const MODEL_FILE = configPath('anthropic-model.txt');
export const ANTHROPIC_MODELS = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-8',
] as const;
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// Nạp model đã chọn từ file (env thật vẫn ưu tiên nếu đã đặt).
try {
  if (!process.env.ANTHROPIC_MODEL) {
    const m = fs.readFileSync(MODEL_FILE, 'utf8').trim();
    if (m) process.env.ANTHROPIC_MODEL = m;
  }
} catch {
  /* chưa có file — dùng mặc định */
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

export function setAnthropicModel(model: string): void {
  const m = String(model || '').trim();
  if (!(ANTHROPIC_MODELS as readonly string[]).includes(m)) return;
  process.env.ANTHROPIC_MODEL = m;
  try {
    fs.writeFileSync(MODEL_FILE, m);
  } catch {
    /* ghi file lỗi — vẫn set env cho phiên hiện tại */
  }
}
