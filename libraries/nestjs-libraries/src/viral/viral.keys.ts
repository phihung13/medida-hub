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
  // GOM CỤM THEO CHỦ ĐỀ:
  // Cách gom: 'ai' = Claude đọc cả mẻ cào rồi gom (mặc định, cửa sổ = mỗi lần
  // cào) · 'embeddings' = vector cosine (gom xuyên nhiều lần cào, 14 ngày).
  clusterMode: 'ai' | 'embeddings';
  // Số bài/nguồn tối thiểu chung 1 content để nổi lên duyệt. Mặc định 2.
  convergenceMin: number;
  // Ngưỡng độ giống cosine để gộp bài vào cùng chủ đề (0..1) — chỉ dùng khi
  // clusterMode='embeddings'. Cao = chặt hơn.
  clusterThreshold: number;
  // PHỄU TỰ ĐỘNG (quy trình 90/70/3): điểm >= autoApproveMin → tự duyệt ·
  // điểm < autoSkipMax → tự bỏ · ở giữa → viết lại tối đa rewriteMaxRounds vòng
  // (giữ bản tốt hơn), vẫn chưa đạt thì nằm chờ người duyệt.
  autoApproveMin: number;
  autoSkipMax: number;
  rewriteMaxRounds: number;
  // Duyệt (tự động hoặc tay) → tự sản xuất định dạng AI đề xuất.
  autoProduce: boolean;
  // ⏸ DỪNG SẢN XUẤT: bật = KHÔNG tự duyệt (mọi content dừng ở Chờ duyệt dù
  // điểm cao đến mấy) và KHÔNG tự sản xuất (kể cả khi duyệt tay). Bỏ vẫn tự bỏ.
  productionPaused: boolean;
  // GỬI BẢN TIN QUA ZALO: danh sách người nhận (bạn bè/nhóm/SĐT đã tra),
  // toggle tự gửi sau mỗi bản tin, và giờ gửi (-1 = ngay khi có bản tin,
  // 0-23 = gom lại gửi vào đúng giờ đó trong ngày).
  reportRecipients: { threadId: string; type: 'user' | 'group'; name: string }[];
  reportAutoSend: boolean;
  reportSendHour: number;
}

const config: ViralConfig = {
  apifyToken: '',
  youtubeKey: '',
  crawlEveryHours: 12,
  minimaxKey: '',
  minimaxGroupId: '',
  reportZaloThreadId: '',
  clusterMode: 'ai',
  convergenceMin: 2,
  clusterThreshold: 0.5,
  autoApproveMin: 90,
  autoSkipMax: 70,
  rewriteMaxRounds: 3,
  autoProduce: true,
  productionPaused: false,
  reportRecipients: [],
  reportAutoSend: true,
  reportSendHour: -1,
};

// Làm sạch danh sách người nhận bản tin (dùng cả lúc load file lẫn lúc set).
function sanitizeRecipients(v: any): ViralConfig['reportRecipients'] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r: any) => ({
      threadId: String(r?.threadId || '').trim().slice(0, 60),
      type: r?.type === 'user' ? ('user' as const) : ('group' as const),
      name: String(r?.name || '').trim().slice(0, 80) || 'Không tên',
    }))
    .filter((r) => r.threadId)
    .slice(0, 30);
}

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
  config.clusterMode = raw?.clusterMode === 'embeddings' ? 'embeddings' : 'ai';
  config.convergenceMin =
    typeof raw?.convergenceMin === 'number' ? raw.convergenceMin : 2;
  config.clusterThreshold =
    typeof raw?.clusterThreshold === 'number' ? raw.clusterThreshold : 0.5;
  config.autoApproveMin =
    typeof raw?.autoApproveMin === 'number' ? raw.autoApproveMin : 90;
  config.autoSkipMax =
    typeof raw?.autoSkipMax === 'number' ? raw.autoSkipMax : 70;
  config.rewriteMaxRounds =
    typeof raw?.rewriteMaxRounds === 'number' ? raw.rewriteMaxRounds : 3;
  config.autoProduce =
    typeof raw?.autoProduce === 'boolean' ? raw.autoProduce : true;
  config.productionPaused =
    typeof raw?.productionPaused === 'boolean' ? raw.productionPaused : false;
  config.reportRecipients = sanitizeRecipients(raw?.reportRecipients);
  config.reportAutoSend =
    typeof raw?.reportAutoSend === 'boolean' ? raw.reportAutoSend : true;
  config.reportSendHour =
    typeof raw?.reportSendHour === 'number' ? raw.reportSendHour : -1;
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
    clusterMode: config.clusterMode,
    convergenceMin: config.convergenceMin,
    clusterThreshold: config.clusterThreshold,
    autoApproveMin: config.autoApproveMin,
    autoSkipMax: config.autoSkipMax,
    rewriteMaxRounds: config.rewriteMaxRounds,
    autoProduce: config.autoProduce,
    productionPaused: config.productionPaused,
    reportRecipients: config.reportRecipients,
    reportAutoSend: config.reportAutoSend,
    reportSendHour: config.reportSendHour,
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
  if (patch.clusterMode === 'ai' || patch.clusterMode === 'embeddings')
    config.clusterMode = patch.clusterMode;
  if (typeof patch.convergenceMin === 'number')
    config.convergenceMin = Math.max(1, Math.min(20, Math.round(patch.convergenceMin)));
  if (typeof patch.clusterThreshold === 'number')
    config.clusterThreshold = Math.max(0.2, Math.min(0.95, patch.clusterThreshold));
  if (typeof patch.autoApproveMin === 'number')
    config.autoApproveMin = Math.max(50, Math.min(100, Math.round(patch.autoApproveMin)));
  if (typeof patch.autoSkipMax === 'number')
    config.autoSkipMax = Math.max(0, Math.min(85, Math.round(patch.autoSkipMax)));
  // ngưỡng bỏ phải thấp hơn ngưỡng duyệt — kẹp lại nếu người dùng nhập ngược
  if (config.autoSkipMax >= config.autoApproveMin)
    config.autoSkipMax = Math.max(0, config.autoApproveMin - 5);
  if (typeof patch.rewriteMaxRounds === 'number')
    config.rewriteMaxRounds = Math.max(0, Math.min(5, Math.round(patch.rewriteMaxRounds)));
  if (typeof patch.autoProduce === 'boolean') config.autoProduce = patch.autoProduce;
  if (typeof patch.productionPaused === 'boolean')
    config.productionPaused = patch.productionPaused;
  if (patch.reportRecipients !== undefined)
    config.reportRecipients = sanitizeRecipients(patch.reportRecipients);
  if (typeof patch.reportAutoSend === 'boolean')
    config.reportAutoSend = patch.reportAutoSend;
  if (typeof patch.reportSendHour === 'number')
    config.reportSendHour = Math.max(-1, Math.min(23, Math.round(patch.reportSendHour)));
  try {
    fs.writeFileSync(FILE, JSON.stringify(config));
  } catch {
    /* ghi file lỗi — vẫn giữ trong bộ nhớ phiên */
  }
}
