import { resolveBaseUrl } from '@gitroom/helpers/utils/custom.fetch.func';

// Cắt N khung hình đều nhau từ một video (chạy TRONG TRÌNH DUYỆT bằng
// <video> + <canvas>) để gửi cho ChatGPT "đọc". Không cần ffmpeg server.
// Video nạp qua proxy /public/stream (crossOrigin=anonymous) để canvas không bị
// "tainted". Trả mảng data URL JPEG (đã thu nhỏ để payload gọn).
const MAX_DIM = 768;

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    video.addEventListener('seeked', done, { once: true });
    // Nếu 'seeked' không bắn (một số codec) — vẫn tiếp tục sau 4s.
    setTimeout(done, 4000);
    try {
      video.currentTime = time;
    } catch {
      resolve();
    }
  });
}

export async function extractVideoFrames(
  backendUrl: string,
  mediaPath: string,
  count = 6
): Promise<string[]> {
  const src =
    resolveBaseUrl(backendUrl) +
    '/public/stream?url=' +
    encodeURIComponent(mediaPath);

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.src = src;

  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener(
      'error',
      () => reject(new Error('Không tải được video (kiểm tra định dạng/CORS).')),
      { once: true }
    );
    setTimeout(() => reject(new Error('Hết thời gian tải video.')), 60000);
  });

  const duration = video.duration;
  if (!duration || !isFinite(duration)) {
    throw new Error('Không đọc được thời lượng video.');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas.');

  const frames: string[] = [];
  for (let i = 1; i <= count; i++) {
    const t = (duration * i) / (count + 1);
    await seekTo(video, t);
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL('image/jpeg', 0.7));
  }

  video.removeAttribute('src');
  video.load();
  return frames;
}
