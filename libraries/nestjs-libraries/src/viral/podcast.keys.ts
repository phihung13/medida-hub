import * as fs from 'fs';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

// Cấu hình KÊNH PODCAST (RSS → Spotify/Apple/YouTube Music) — bám Spotify
// Podcast Delivery Specification v1.9:
// - channel BẮT BUỘC: title / link / description / itunes:author / itunes:image
//   (ảnh VUÔNG 1:1, PNG/JPEG, càng nét càng tốt — khuyến nghị ≥1400px)
// - itunes:owner email: Spotify gửi MÃ XÁC MINH về email này lúc nộp feed
// - category theo danh mục Apple iTunes; language theo RFC 1766 ('vi')
// - spotify:countryOfOrigin: thị trường chính ('vn')
// Lưu file trong CONFIG_DIR (mount volume) để bền qua Docker restart.
const FILE = configPath('podcast-config.json');

export interface PodcastConfig {
  title: string;
  description: string;
  author: string;
  email: string;
  link: string;
  language: string;
  category: string;
  explicit: boolean;
  country: string;
}

const config: PodcastConfig = {
  title: '',
  description: '',
  author: '',
  email: '',
  link: 'https://truongvietanh.com',
  language: 'vi',
  category: 'Education',
  explicit: false,
  country: 'vn',
};

try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (typeof raw?.title === 'string') config.title = raw.title;
  if (typeof raw?.description === 'string') config.description = raw.description;
  if (typeof raw?.author === 'string') config.author = raw.author;
  if (typeof raw?.email === 'string') config.email = raw.email;
  if (typeof raw?.link === 'string' && raw.link) config.link = raw.link;
  if (typeof raw?.language === 'string' && raw.language)
    config.language = raw.language;
  if (typeof raw?.category === 'string' && raw.category)
    config.category = raw.category;
  if (typeof raw?.explicit === 'boolean') config.explicit = raw.explicit;
  if (typeof raw?.country === 'string' && raw.country)
    config.country = raw.country;
} catch {
  /* chưa có file — dùng mặc định */
}

export function getPodcastConfig(): PodcastConfig {
  return { ...config };
}

export function setPodcastConfig(patch: Partial<PodcastConfig>) {
  if (typeof patch.title === 'string') config.title = patch.title.trim().slice(0, 200);
  if (typeof patch.description === 'string')
    config.description = patch.description.trim().slice(0, 4000);
  if (typeof patch.author === 'string') config.author = patch.author.trim().slice(0, 120);
  if (typeof patch.email === 'string') config.email = patch.email.trim().slice(0, 160);
  if (typeof patch.link === 'string') config.link = patch.link.trim().slice(0, 300);
  if (typeof patch.language === 'string')
    config.language = patch.language.trim().slice(0, 10) || 'vi';
  if (typeof patch.category === 'string')
    config.category = patch.category.trim().slice(0, 60) || 'Education';
  if (typeof patch.explicit === 'boolean') config.explicit = patch.explicit;
  if (typeof patch.country === 'string')
    config.country = patch.country.trim().slice(0, 30) || 'vn';
  try {
    fs.writeFileSync(FILE, JSON.stringify(config));
  } catch {
    /* ghi lỗi — vẫn giữ trong RAM phiên này */
  }
}

// ── Ảnh bìa show (vuông 1:1) — lưu file trong CONFIG_DIR ──────────────────
export function coverPath(): string {
  return configPath('podcast-cover.img');
}
export function hasCover(): boolean {
  try {
    return fs.existsSync(coverPath()) && fs.statSync(coverPath()).size > 1000;
  } catch {
    return false;
  }
}
export function saveCover(buf: Buffer): void {
  fs.writeFileSync(coverPath(), buf);
}
export function deleteCover(): void {
  try {
    fs.unlinkSync(coverPath());
  } catch {
    /* chưa có file — coi như đã xoá */
  }
}
export function readCover(): { buf: Buffer; contentType: string } | null {
  try {
    const buf = fs.readFileSync(coverPath());
    if (buf.length < 4) return null;
    // sniff PNG/JPEG (spec chấp nhận TIFF/PNG/JPEG — UI chỉ cho up 2 loại này)
    const contentType =
      buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : 'image/jpeg';
    return { buf, contentType };
  } catch {
    return null;
  }
}

export function getPodcastStatus() {
  return {
    ...config,
    hasCover: hasCover(),
    // đủ điều kiện nộp Spotify: 4 trường bắt buộc + email xác minh + ảnh bìa
    ready: !!(
      config.title &&
      config.description &&
      config.author &&
      config.email &&
      hasCover()
    ),
  };
}
