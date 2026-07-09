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
  // 0 = tắt auto · 6/12/24/72 = mỗi N giờ · 246 = lịch T2-4-6 19h VN (như n8n,
  // kèm bản tin tuần + todo list gửi Zalo/email sau mỗi lần cào)
  crawlEveryHours: number;
  // Sản xuất podcast (MiniMax TTS) — key + GroupId lấy ở minimax.io
  minimaxKey: string;
  minimaxGroupId: string;
  // Nhóm Zalo nhận bản tin tuần/tổng kết CN (threadId; rỗng = không gửi Zalo)
  reportZaloThreadId: string;
}

const config: ViralConfig = {
  apifyToken: '',
  youtubeKey: '',
  crawlEveryHours: 12,
  minimaxKey: '',
  minimaxGroupId: '',
  reportZaloThreadId: '',
};

try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  config.apifyToken = typeof raw?.apifyToken === 'string' ? raw.apifyToken : '';
  config.youtubeKey = typeof raw?.youtubeKey === 'string' ? raw.youtubeKey : '';
  config.crawlEveryHours =
    typeof raw?.crawlEveryHours === 'number' ? raw.crawlEveryHours : 12;
  config.minimaxKey = typeof raw?.minimaxKey === 'string' ? raw.minimaxKey : '';
  config.minimaxGroupId =
    typeof raw?.minimaxGroupId === 'string' ? raw.minimaxGroupId : '';
  config.reportZaloThreadId =
    typeof raw?.reportZaloThreadId === 'string' ? raw.reportZaloThreadId : '';
} catch {
  /* chưa có file — mặc định */
}
// fallback env
if (!config.youtubeKey && (process.env.YOUTUBE_API_KEY || '').trim())
  config.youtubeKey = process.env.YOUTUBE_API_KEY!.trim();
if (!config.apifyToken && (process.env.APIFY_TOKEN || '').trim())
  config.apifyToken = process.env.APIFY_TOKEN!.trim();
if (!config.minimaxKey && (process.env.MINIMAX_API_KEY || '').trim())
  config.minimaxKey = process.env.MINIMAX_API_KEY!.trim();
if (!config.minimaxGroupId && (process.env.MINIMAX_GROUP_ID || '').trim())
  config.minimaxGroupId = process.env.MINIMAX_GROUP_ID!.trim();

export function getViralConfig() {
  return { ...config };
}
// Nhạc nền podcast — file mp3 user upload, sống trong CONFIG_DIR (bền Docker).
export function bgmPath(): string {
  return configPath('viral-bgm.mp3');
}
export function hasBgm(): boolean {
  try {
    return fs.existsSync(bgmPath()) && fs.statSync(bgmPath()).size > 1000;
  } catch {
    return false;
  }
}
export function saveBgm(buf: Buffer): void {
  fs.writeFileSync(bgmPath(), buf);
}
export function deleteBgm(): void {
  try {
    fs.unlinkSync(bgmPath());
  } catch {
    /* chưa có file — coi như đã xoá */
  }
}

export function getViralStatus() {
  return {
    hasApify: !!config.apifyToken,
    apifyMasked: config.apifyToken ? config.apifyToken.slice(0, 8) + '…' : '',
    hasYoutube: !!config.youtubeKey,
    youtubeMasked: config.youtubeKey ? config.youtubeKey.slice(0, 8) + '…' : '',
    crawlEveryHours: config.crawlEveryHours,
    hasMinimax: !!(config.minimaxKey && config.minimaxGroupId),
    minimaxMasked: config.minimaxKey ? config.minimaxKey.slice(0, 8) + '…' : '',
    minimaxGroupId: config.minimaxGroupId,
    hasBgm: hasBgm(),
    reportZaloThreadId: config.reportZaloThreadId,
  };
}
export function setViralConfig(patch: Partial<ViralConfig>) {
  if (typeof patch.apifyToken === 'string')
    config.apifyToken = patch.apifyToken.trim();
  if (typeof patch.youtubeKey === 'string')
    config.youtubeKey = patch.youtubeKey.trim();
  if (typeof patch.minimaxKey === 'string')
    config.minimaxKey = patch.minimaxKey.trim();
  if (typeof patch.minimaxGroupId === 'string')
    config.minimaxGroupId = patch.minimaxGroupId.trim();
  if (typeof patch.reportZaloThreadId === 'string')
    config.reportZaloThreadId = patch.reportZaloThreadId.trim();
  if (typeof patch.crawlEveryHours === 'number')
    config.crawlEveryHours = Math.max(0, Math.min(168, patch.crawlEveryHours));
  try {
    fs.writeFileSync(FILE, JSON.stringify(config));
  } catch {
    /* ghi file lỗi — vẫn giữ trong bộ nhớ phiên */
  }
}
