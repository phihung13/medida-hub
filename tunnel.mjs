// ============================================================================
//  Tunnel PUBLIC cho Việt Anh Media Hub — chạy:  node tunnel.mjs
//  (hoặc double-click start-tunnel.bat)
//
//  - Dùng Cloudflare Quick Tunnel: MIỄN PHÍ, không cần tài khoản, có HTTPS.
//  - Lần đầu tự tải cloudflared.exe CHÍNH CHỦ từ GitHub Cloudflare vào tools/.
//  - Mở tunnel tới frontend :4200 — backend/bot đi qua proxy same-origin
//    /hubapi + /botapi (đã cấu hình trong next.config.js) nên MỘT URL là đủ.
//  - URL đổi ngẫu nhiên mỗi lần chạy (in ra màn hình + lưu tunnel-url.txt).
//    Muốn URL cố định → dùng ngrok có tài khoản hoặc Cloudflare named tunnel.
// ============================================================================
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.join(root, 'tools');
const EXE = path.join(TOOLS, 'cloudflared.exe');
const DL_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const log = (m) => process.stdout.write(c(36, '[tunnel] ') + m + '\n');

// Frontend :4200 phải đang chạy (start-postiz.bat)
function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(1500, () => { s.destroy(); resolve(false); });
  });
}

if (!(await portBusy(4200))) {
  log(c(33, 'Frontend (:4200) chưa chạy — mở start-postiz.bat trước rồi chạy lại tunnel.'));
  process.exit(1);
}

// Tải cloudflared chính chủ (1 lần)
if (!fs.existsSync(EXE)) {
  log(`Chưa có cloudflared — đang tải bản chính chủ Cloudflare (~60MB, 1 lần duy nhất)`);
  log(`  nguồn: ${DL_URL}`);
  fs.mkdirSync(TOOLS, { recursive: true });
  const res = await fetch(DL_URL, { redirect: 'follow' });
  if (!res.ok) {
    log(c(31, `Tải thất bại (HTTP ${res.status}) — kiểm tra mạng rồi thử lại.`));
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(EXE, buf);
  log(`Đã tải xong: ${EXE} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

log('Đang mở tunnel public tới http://127.0.0.1:4200 ...');
const p = spawn(EXE, ['tunnel', '--url', 'http://127.0.0.1:4200', '--no-autoupdate'], {
  cwd: root,
});

let announced = false;
const scan = (d) => {
  const s = d.toString();
  const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !announced) {
    announced = true;
    fs.writeFileSync(path.join(root, 'tunnel-url.txt'), m[0] + '\n');
    process.stdout.write('\n');
    log(c(32, '════════════════════════════════════════════════════════'));
    log(c(32, `  🌍 TRUY CẬP TỪ XA:  ${m[0]}`));
    log(c(32, '════════════════════════════════════════════════════════'));
    log('Mở link trên từ BẤT KỲ đâu (4G/mạng khác) → đăng nhập như thường.');
    log('URL đổi mỗi lần chạy lại tunnel (đã lưu vào tunnel-url.txt).');
    log('Đóng cửa sổ này / Ctrl+C để TẮT truy cập từ xa.\n');
  }
  // log gọn: chỉ hiện dòng lỗi thật
  if (/error|failed/i.test(s) && !/failed to sufficiently increase/i.test(s)) {
    process.stdout.write(c(33, '[cloudflared] ') + s.trim().split('\n').pop() + '\n');
  }
};
p.stdout.on('data', scan);
p.stderr.on('data', scan);
p.on('exit', (code) => {
  log(c(33, `cloudflared thoát (mã ${code}).`));
  process.exit(code ?? 0);
});
process.on('SIGINT', () => p.kill());
process.on('SIGTERM', () => p.kill());
