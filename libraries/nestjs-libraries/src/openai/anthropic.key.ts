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

// ============================================================================
//  NHÀ CUNG CẤP TEXT cho AI viết bài (khối Phát hiện/Sản xuất) — Anthropic
//  (Claude) HOẶC OpenRouter (DeepSeek…). Chỉ đổi phần SINH TEXT qua claudeRaw;
//  VISION (đọc ảnh/video) + Copilot/Chat/Agent vẫn dùng Claude vì DeepSeek
//  không đọc ảnh và agent kém ổn. Cùng cơ chế lưu file bền CONFIG_DIR + env.
// ============================================================================
const PROVIDER_FILE = configPath('ai-text-provider.txt');
const OPENROUTER_KEY_FILE = configPath('openrouter-key.txt');
const OPENROUTER_MODEL_FILE = configPath('openrouter-model.txt');

export const AI_TEXT_PROVIDERS = ['anthropic', 'openrouter'] as const;
export type AiTextProvider = (typeof AI_TEXT_PROVIDERS)[number];

// Model DeepSeek phổ biến trên OpenRouter (id đúng slug OpenRouter).
export const OPENROUTER_MODELS = [
  'deepseek/deepseek-chat',
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-r1',
] as const;
export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-chat';

// Nạp từ file lúc module load (env thật vẫn ưu tiên nếu đã đặt).
try {
  if (!process.env.AI_TEXT_PROVIDER) {
    const p = fs.readFileSync(PROVIDER_FILE, 'utf8').trim();
    if (p) process.env.AI_TEXT_PROVIDER = p;
  }
} catch {
  /* chưa có file — mặc định anthropic */
}
try {
  if (!process.env.OPENROUTER_API_KEY) {
    const k = fs.readFileSync(OPENROUTER_KEY_FILE, 'utf8').trim();
    if (k) process.env.OPENROUTER_API_KEY = k;
  }
} catch {
  /* chưa có file */
}
try {
  if (!process.env.OPENROUTER_MODEL) {
    const m = fs.readFileSync(OPENROUTER_MODEL_FILE, 'utf8').trim();
    if (m) process.env.OPENROUTER_MODEL = m;
  }
} catch {
  /* chưa có file — dùng mặc định */
}

export function getTextProvider(): AiTextProvider {
  const p = (process.env.AI_TEXT_PROVIDER || 'anthropic').trim();
  return (AI_TEXT_PROVIDERS as readonly string[]).includes(p)
    ? (p as AiTextProvider)
    : 'anthropic';
}

export function setTextProvider(provider: string): void {
  const p = String(provider || '').trim();
  if (!(AI_TEXT_PROVIDERS as readonly string[]).includes(p)) return;
  process.env.AI_TEXT_PROVIDER = p;
  try {
    fs.writeFileSync(PROVIDER_FILE, p);
  } catch {
    /* ghi file lỗi — vẫn set env cho phiên hiện tại */
  }
}

export function getOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY || '';
}

export function setOpenRouterKey(key: string): void {
  process.env.OPENROUTER_API_KEY = key || '';
  try {
    fs.writeFileSync(OPENROUTER_KEY_FILE, key || '');
  } catch {
    /* ghi file lỗi — vẫn set env cho phiên hiện tại */
  }
}

export function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
}

export function setOpenRouterModel(model: string): void {
  const m = String(model || '').trim();
  if (!(OPENROUTER_MODELS as readonly string[]).includes(m)) return;
  process.env.OPENROUTER_MODEL = m;
  try {
    fs.writeFileSync(OPENROUTER_MODEL_FILE, m);
  } catch {
    /* ghi file lỗi — vẫn set env cho phiên hiện tại */
  }
}
