import * as fs from 'fs';
import * as path from 'path';

// Lưu ANTHROPIC_API_KEY (nhập qua UI) vào file để bền qua restart, đồng thời
// set vào process.env để dùng ngay (không cần sửa .env tay).
const KEY_FILE = path.join(process.cwd(), 'anthropic-key.txt');

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
