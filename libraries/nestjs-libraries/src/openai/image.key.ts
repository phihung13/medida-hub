import * as fs from 'fs';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

// Cấu hình tạo ảnh AI (nhập qua UI Settings): chọn nhà cung cấp + key.
// Lưu file để bền qua restart, đồng thời set vào process.env để openai.service /
// fal.service dùng ngay. Hỗ trợ nhiều nhà cung cấp (không chỉ OpenAI).
// File nằm trong CONFIG_DIR (Docker mount volume) — local mặc định = cwd cũ.
const FILE = configPath('image-gen.json');

export type ImageProvider = 'openai' | 'fal';

interface ImageGenConfig {
  provider: ImageProvider;
  openaiKey: string;
  falKey: string;
}

const config: ImageGenConfig = { provider: 'openai', openaiKey: '', falKey: '' };

// Nạp cấu hình từ file (nếu có).
try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  config.provider = raw?.provider === 'fal' ? 'fal' : 'openai';
  config.openaiKey = typeof raw?.openaiKey === 'string' ? raw.openaiKey : '';
  config.falKey = typeof raw?.falKey === 'string' ? raw.falKey : '';
} catch {
  /* chưa có file — dùng mặc định */
}

// Nếu .env đã có key hợp lệ (không phải placeholder ngắn) thì lấy làm mặc định.
if (!config.openaiKey && (process.env.OPENAI_API_KEY || '').trim().length > 20) {
  config.openaiKey = process.env.OPENAI_API_KEY!.trim();
}
if (!config.falKey && (process.env.FAL_KEY || '').trim().length > 8) {
  config.falKey = process.env.FAL_KEY!.trim();
}

function applyEnv() {
  if (config.openaiKey) process.env.OPENAI_API_KEY = config.openaiKey;
  if (config.falKey) process.env.FAL_KEY = config.falKey;
}
applyEnv();

export function getImageProvider(): ImageProvider {
  return config.provider;
}

export function hasImageGenKey(): boolean {
  const key = config.provider === 'fal' ? config.falKey : config.openaiKey;
  return !!key && key.trim().length > 8;
}

// Trạng thái cho UI (KHÔNG trả key thật, chỉ masked).
export function getImageGenStatus() {
  const key = config.provider === 'fal' ? config.falKey : config.openaiKey;
  return {
    provider: config.provider,
    hasKey: hasImageGenKey(),
    masked: key ? key.slice(0, 6) + '…' : '',
  };
}

export function setImageGenConfig(provider: ImageProvider, key?: string): void {
  config.provider = provider === 'fal' ? 'fal' : 'openai';
  if (typeof key === 'string') {
    if (config.provider === 'fal') config.falKey = key.trim();
    else config.openaiKey = key.trim();
  }
  applyEnv();
  try {
    fs.writeFileSync(FILE, JSON.stringify(config));
  } catch {
    /* ghi file lỗi — vẫn giữ trong bộ nhớ phiên hiện tại */
  }
}
