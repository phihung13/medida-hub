// Đặc tả v2 (15/10/2026): TẠM DỪNG đến khi rubric dự báo share chạy ổn —
// ẨN, không xoá; bật lại được.
//   podcast-tts         : sản xuất Podcast (kịch bản + đọc mp3)
//   agent-chat          : trang Agent chat (/agents) — MCP /mcp KHÔNG bị ảnh hưởng
//   viet-lai-cham-diem  : agent "Viết lại + chấm điểm" (Bài của mình)
// Backend: biến môi trường HUB_PAUSED_FEATURES (danh sách cách nhau dấu phẩy;
// đặt "none" để bật lại tất cả). Frontend dùng danh sách mặc định dưới đây —
// bật lại trên giao diện = bỏ key khỏi mảng rồi build lại.
export const HUB_PAUSED_FEATURES_DEFAULT = [
  'podcast-tts',
  'agent-chat',
  'viet-lai-cham-diem',
] as const;

export type HubPausableFeature = (typeof HUB_PAUSED_FEATURES_DEFAULT)[number];

export const pausedFeatures = (envValue?: string | null): string[] => {
  const v = (envValue ?? '').trim();
  if (!v) return [...HUB_PAUSED_FEATURES_DEFAULT];
  if (v.toLowerCase() === 'none') return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

export const isFeaturePaused = (
  key: HubPausableFeature,
  envValue?: string | null
): boolean => pausedFeatures(envValue).includes(key);
