// Kênh chỉ nhận VIDEO (không ảnh). Trình soạn dựa vào đây để chặn ảnh ngay lúc
// đính kèm và ẩn các công cụ chỉ dành cho ảnh (Design Media, AI ảnh, khung lưới
// nhiều ảnh) — thay vì để người dùng đính ảnh rồi mới bị từ chối lúc lên lịch.
export const VIDEO_ONLY_PROVIDERS = ['zalo-video'];

export const isVideoOnlyProvider = (identifier?: string) =>
  VIDEO_ONLY_PROVIDERS.includes(identifier || '');

export const isVideoPath = (path?: string) =>
  /\.(mp4|mov)(\?|$)/i.test(path || '');
