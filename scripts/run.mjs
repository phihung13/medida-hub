// ============================================================================
//  Việt Anh Media Hub — chạy bằng MỘT lệnh:  node scripts/run.mjs
//  (thường double-click start-postiz.bat ở gốc repo — đã kèm sẵn --tunnel)
//  - Tự bật hạ tầng Docker (Postgres, Redis, Temporal)
//  - Tự build backend/orchestrator/frontend nếu chưa có (không xóa tay .next/dist)
//  - Chạy backend(3000)+orchestrator(3002)+frontend(4200)+bot Zalo(8088), log gộp
//  - Ctrl+C tắt gọn cả cây tiến trình
//  Cờ:  --rebuild → build lại từ đầu (khi đổi code)
//        --tunnel  → mở kèm tunnel public (Cloudflare Quick Tunnel, in ra URL)
// ============================================================================
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Script nằm trong scripts/ → repo root là thư mục cha (độc lập với cwd).
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const isWin = process.platform === 'win32';
const REBUILD = process.argv.includes('--rebuild');
const TUNNEL = process.argv.includes('--tunnel');

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const log = (m) => process.stdout.write(c(36, '[hub] ') + m + '\n');

function runSync(label, cmd, args) {
  log(label);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) log(c(33, `(cảnh báo: "${label}" trả mã ${r.status})`));
  return r.status === 0;
}

// 0) Dọn tiến trình cũ còn giữ cổng (tránh EADDRINUSE khi khởi động lại khi bản
//    trước chưa tắt hẳn). CHỈ dọn cổng của 3 dịch vụ script này quản: 3000/3002/4200.
//    KHÔNG đụng 8088 (bot Zalo) — bot được tái dùng nếu đang chạy để khỏi quét lại QR.
function freePorts(ports) {
  if (!isWin) {
    for (const port of ports) {
      try { spawnSync('bash', ['-c', `lsof -ti tcp:${port} | xargs -r kill -9`], { stdio: 'ignore' }); } catch {}
    }
    return;
  }
  let out = '';
  try { out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || ''; } catch {}
  const pids = new Set();
  for (const line of out.split('\n')) {
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);      // Proto Local Foreign State PID
    const local = parts[1] || '';
    const pid = parts[parts.length - 1];
    const m = local.match(/:(\d+)$/);            // khớp cả 0.0.0.0:4200 lẫn [::]:4200
    if (m && ports.includes(Number(m[1])) && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    try { spawnSync('taskkill', ['/f', '/t', '/pid', pid], { stdio: 'ignore' }); } catch {}
  }
}
log('Dọn tiến trình cũ trên cổng 3000/3002/4200 (nếu còn sót từ lần trước)...');
if (isWin) { try { spawnSync('taskkill', ['/f', '/im', 'cloudflared.exe'], { stdio: 'ignore' }); } catch {} }
freePorts([3000, 3002, 4200]);

// 1) Hạ tầng Docker
runSync(
  'Bật hạ tầng Docker (Postgres, Redis, Temporal)...',
  'docker',
  ['compose', '-f', 'docker-compose.dev.yaml', 'up', '-d',
    'postiz-postgres', 'postiz-redis', 'temporal', 'temporal-postgresql', 'temporal-elasticsearch', 'temporal-ui']
);

// 2) Build nếu cần (hoặc --rebuild)
const beMain = path.join(root, 'apps/backend/dist/apps/backend/src/main.js');
// Orchestrator = Temporal WORKER chạy các bài lên lịch (đăng thật). BẮT BUỘC,
// thiếu nó thì bài duyệt xong nằm im trong hàng đợi, không bao giờ đăng.
const orchMain = path.join(
  root,
  'apps/orchestrator/dist/apps/orchestrator/src/main.js'
);
const feBuild = path.join(root, 'apps/frontend/.next/BUILD_ID');
if (REBUILD) {
  try { fs.rmSync(path.join(root, 'apps/frontend/.next'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(root, 'apps/backend/dist'), { recursive: true, force: true }); } catch {}
  log('Đã xoá build cũ (--rebuild).');
}
if (!fs.existsSync(beMain)) {
  runSync('Build backend (lần đầu, ~1-2 phút)...', 'corepack', ['pnpm', '--filter', './apps/backend', 'run', 'build']);
}
if (!fs.existsSync(orchMain)) {
  runSync('Build orchestrator (worker đăng bài, lần đầu ~1-2 phút)...', 'corepack', ['pnpm', '--filter', './apps/orchestrator', 'run', 'build']);
}
// Frontend chạy PRODUCTION build (next start): nhanh, ổn định, và truy cập được
// từ điện thoại/tablet trong LAN (dev mode chặn websocket HMR với host ≠ localhost
// → trang trắng trên thiết bị khác). Đổi code frontend → chạy `--rebuild`.
if (!fs.existsSync(feBuild)) {
  runSync('Build frontend (~5-10 phút, chỉ khi chưa có build)...', 'corepack', ['pnpm', '--filter', './apps/frontend', 'run', 'build:sentry']);
}

// 3) Chạy backend + frontend + bot Zalo trong CÙNG cửa sổ
const children = [];
function start(name, color, cmd, args, cwd = root, useShell = true) {
  const p = spawn(cmd, args, { cwd, shell: useShell });
  children.push(p);
  const prefix = c(color, `[${name}] `);
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) process.stdout.write(prefix + l + '\n');
    });
  };
  pipe(p.stdout);
  pipe(p.stderr);
  p.on('exit', (code) => process.stdout.write(prefix + c(33, `thoát (mã ${code})`) + '\n'));
  return p;
}

// Cổng đang bận? (bot Zalo có thể đã chạy sẵn từ start.bat riêng)
function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.setTimeout(1200, () => { s.destroy(); resolve(false); });
  });
}

log('Khởi động backend (3000) + frontend (4200)... (backend mất ~1-2 phút để sẵn sàng)');
start('backend', 35, 'corepack', ['pnpm', '--filter', './apps/backend', 'run', 'start']);
start('orchestrator', 34, 'corepack', ['pnpm', '--filter', './apps/orchestrator', 'run', 'start']);
start('frontend', 32, 'corepack', ['pnpm', '--filter', './apps/frontend', 'run', 'start']);

// 4) Bot Zalo (D:\Zalo bot group) — nguồn ảnh từ nhóm Zalo + dashboard :8088
const ZALO_DIR = 'D:\\Zalo bot group';
if (fs.existsSync(path.join(ZALO_DIR, 'src', 'service.mjs'))) {
  if (await portBusy(8088)) {
    log(c(33, 'Bot Zalo đã chạy sẵn (:8088) — dùng bản đang chạy, không khởi động thêm.'));
  } else {
    log('Khởi động bot Zalo (:8088)... Nếu cần quét QR đăng nhập Zalo → xem log [zalo] hoặc mở "D:\\Zalo bot group\\qr.png".');
    start('zalo', 33, process.execPath, ['--env-file=.env', 'src/service.mjs'], ZALO_DIR, false);
  }
} else {
  log(c(33, '(Không thấy bot Zalo ở D:\\Zalo bot group — bỏ qua phần Zalo)'));
}

// 5) Tunnel public (--tunnel): chờ frontend :4200 lên rồi mở Cloudflare Quick Tunnel.
// tunnel.mjs tự thoát nếu :4200 chưa nghe, nên phải đợi frontend trước.
if (TUNNEL) {
  (async () => {
    log('Sẽ mở tunnel public khi frontend (:4200) sẵn sàng...');
    for (let i = 0; i < 150; i++) {
      if (await portBusy(4200)) {
        start('tunnel', 36, process.execPath, [path.join(scriptsDir, 'tunnel.mjs')], root, false);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    log(c(33, 'Frontend không lên sau 5 phút — bỏ qua tunnel.'));
  })();
}

log(c(32, 'Đang chạy. Mở http://localhost:4200 — nhấn Ctrl+C để tắt.'));
setTimeout(() => {
  try {
    if (isWin) spawn('cmd', ['/c', 'start', '', 'http://localhost:4200'], { shell: false });
  } catch {}
}, 4000);

// Ctrl+C: tắt gọn cả cây tiến trình (Windows cần taskkill /T)
let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  log('Đang tắt backend + frontend...');
  for (const ch of children) {
    try {
      if (isWin && ch.pid) spawnSync('taskkill', ['/pid', String(ch.pid), '/f', '/t'], { stdio: 'ignore' });
      else ch.kill('SIGTERM');
    } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
