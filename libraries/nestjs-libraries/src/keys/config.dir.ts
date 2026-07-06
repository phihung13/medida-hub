import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
//  Thư mục chứa key/cấu hình NHẬP QUA UI (anthropic-key.txt, image-gen.json,
//  viral-config.json, social-keys.env…).
//  - Local: mặc định = cwd (apps/backend) — giữ nguyên hành vi cũ, file cũ
//    vẫn được đọc.
//  - Docker/VPS: đặt env CONFIG_DIR=/config và mount volume vào đó → key nhập
//    qua UI SỐNG QUA restart/rebuild container (không cần nhập key vào .env).
// ============================================================================

export function configDir(): string {
  const dir = (process.env.CONFIG_DIR || '').trim() || process.cwd();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* không tạo được — dùng như cũ, ghi file sẽ tự báo lỗi */
  }
  return dir;
}

export function configPath(name: string): string {
  return path.join(configDir(), name);
}
