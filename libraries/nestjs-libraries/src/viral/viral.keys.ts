import * as fs from 'fs';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

// Cấu hình "Lò Bài Thắng": token Apify (cào FB/IG/TikTok theo share — TRẢ PHÍ,
// tùy chọn), key YouTube Data (FREE — Google Cloud), và chu kỳ cào tự động (giờ).
// Lưu file để bền qua restart.
// File nằm trong CONFIG_DIR (Docker mount volume) — local mặc định = cwd cũ.
const FILE = configPath('viral-config.json');

interface ViralConfig {
  apifyToken: string;
  youtubeKey: string;
  crawlEveryHours: number; // 0 = tắt auto
}

const config: ViralConfig = {
  apifyToken: '',
  youtubeKey: '',
  crawlEveryHours: 12,
};

try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  config.apifyToken = typeof raw?.apifyToken === 'string' ? raw.apifyToken : '';
  config.youtubeKey = typeof raw?.youtubeKey === 'string' ? raw.youtubeKey : '';
  config.crawlEveryHours =
    typeof raw?.crawlEveryHours === 'number' ? raw.crawlEveryHours : 12;
} catch {
  /* chưa có file — mặc định */
}
// fallback env
if (!config.youtubeKey && (process.env.YOUTUBE_API_KEY || '').trim())
  config.youtubeKey = process.env.YOUTUBE_API_KEY!.trim();
if (!config.apifyToken && (process.env.APIFY_TOKEN || '').trim())
  config.apifyToken = process.env.APIFY_TOKEN!.trim();

export function getViralConfig() {
  return { ...config };
}
export function getViralStatus() {
  return {
    hasApify: !!config.apifyToken,
    apifyMasked: config.apifyToken ? config.apifyToken.slice(0, 8) + '…' : '',
    hasYoutube: !!config.youtubeKey,
    youtubeMasked: config.youtubeKey ? config.youtubeKey.slice(0, 8) + '…' : '',
    crawlEveryHours: config.crawlEveryHours,
  };
}
export function setViralConfig(patch: Partial<ViralConfig>) {
  if (typeof patch.apifyToken === 'string')
    config.apifyToken = patch.apifyToken.trim();
  if (typeof patch.youtubeKey === 'string')
    config.youtubeKey = patch.youtubeKey.trim();
  if (typeof patch.crawlEveryHours === 'number')
    config.crawlEveryHours = Math.max(0, Math.min(168, patch.crawlEveryHours));
  try {
    fs.writeFileSync(FILE, JSON.stringify(config));
  } catch {
    /* ghi file lỗi — vẫn giữ trong bộ nhớ phiên */
  }
}
