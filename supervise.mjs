// ============================================================================
//  Social Hub — WATCHDOG tự hồi sinh:  node supervise.mjs
//  - Bật Docker + backend(3000) + orchestrator(3002) + frontend(4200) + bot(8088)
//  - Bật tunnel Cloudflare (URL lưu tunnel-url.txt)
//  - VÒNG GIÁM SÁT mỗi 30s: cổng/tunnel nào chết → TỰ BẬT LẠI (mất mạng, crash…)
//  - Đặt start-hub.bat vào Startup của Windows → tự chạy khi đăng nhập máy.
//  Ctrl+C để dừng hẳn.
// ============================================================================
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const ZALO_DIR = 'D:\\Zalo bot group';
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const now = () => new Date().toLocaleTimeString('vi-VN');
const log = (m) => process.stdout.write(c(36, `[watchdog ${now()}] `) + m + '\n');

function portUp(port, host = '127.0.0.1') {
  return new Promise((res) => {
    const s = net.createConnection({ port, host });
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('error', () => res(false));
    s.setTimeout(1500, () => { s.destroy(); res(false); });
  });
}
async function httpOk(url, ms = 8000) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    const r = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    clearTimeout(t);
    return r.status > 0;
  } catch { return false; }
}

// bảng tiến trình con đang quản
const kids = {};
function start(key, color, cmd, argv, cwd = root) {
  const p = spawn(cmd, argv, { cwd, shell: true });
  kids[key] = p;
  const pre = c(color, `[${key}] `);
  const pipe = (st) => { let b = ''; st.on('data', (d) => { b += d; const L = b.split('\n'); b = L.pop(); for (const l of L) process.stdout.write(pre + l + '\n'); }); };
  pipe(p.stdout); pipe(p.stderr);
  p.on('exit', (code) => { log(c(33, `[${key}] thoát (mã ${code}) — watchdog sẽ bật lại`)); delete kids[key]; });
  return p;
}

// 1) Hạ tầng Docker (idempotent)
function ensureDocker() {
  const r = spawnSync('docker', ['info'], { shell: true, stdio: 'ignore' });
  if (r.status !== 0) {
    log('Docker chưa chạy — thử mở Docker Desktop…');
    if (isWin) spawnSync('cmd', ['/c', 'start', '', 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'], { shell: false });
    return false;
  }
  spawnSync('docker', ['compose', '-f', 'docker-compose.dev.yaml', 'up', '-d',
    'postiz-postgres', 'postiz-redis', 'temporal', 'temporal-postgresql', 'temporal-elasticsearch', 'temporal-ui'],
    { cwd: root, shell: true, stdio: 'ignore' });
  return true;
}

const svc = {
  backend: { port: 3000, run: () => start('backend', 35, 'corepack', ['pnpm', '--filter', './apps/backend', 'run', 'start']) },
  orchestrator: { port: 3002, run: () => start('orchestrator', 34, 'corepack', ['pnpm', '--filter', './apps/orchestrator', 'run', 'start']) },
  frontend: { port: 4200, run: () => start('frontend', 32, 'corepack', ['pnpm', '--filter', './apps/frontend', 'run', 'start']) },
  bot: { port: 8088, run: () => { if (fs.existsSync(path.join(ZALO_DIR, 'src', 'service.mjs'))) start('bot', 33, process.execPath, ['--env-file=.env', 'src/service.mjs'], ZALO_DIR); } },
};

// tunnel: quản riêng (cloudflared qua tunnel.mjs)
let tunnelProc = null;
let tunnelStartedAt = 0;
function startTunnel() {
  tunnelStartedAt = Date.now();
  tunnelProc = start('tunnel', 36, process.execPath, ['tunnel.mjs']);
}
async function tunnelAlive() {
  const url = (fs.existsSync(path.join(root, 'tunnel-url.txt')) && fs.readFileSync(path.join(root, 'tunnel-url.txt'), 'utf8').trim()) || '';
  if (!url) return false;
  return httpOk(url + '/login', 12000);
}

async function boot() {
  log('Khởi động Social Hub (watchdog)…');
  ensureDocker();
  // chờ Postgres 5432
  for (let i = 0; i < 40 && !(await portUp(5432)); i++) await new Promise((r) => setTimeout(r, 2000));
  for (const [k, s] of Object.entries(svc)) if (!(await portUp(s.port))) s.run();
  // tunnel: chỉ dựng mới nếu CHƯA có tunnel sống (tránh trùng + tránh đổi URL vô cớ)
  for (let i = 0; i < 40 && !(await portUp(4200)); i++) await new Promise((r) => setTimeout(r, 2000));
  if (await tunnelAlive()) log(c(32, 'Tunnel đang sống — giữ nguyên URL hiện tại.'));
  else startTunnel();
  log(c(32, 'Đã bật. Watchdog giám sát mỗi 30s.'));
}

let tick = 0;
async function watch() {
  tick++;
  // 1) app services
  for (const [k, s] of Object.entries(svc)) {
    if (!kids[k] && !(await portUp(s.port))) {
      log(c(33, `${k} chết → bật lại`));
      ensureDocker();
      s.run();
    }
  }
  // 2) tunnel — kiểm mỗi 2 vòng (60s), tránh restart dồn dập; chờ 30s sau khi start
  if (tick % 2 === 0 && Date.now() - tunnelStartedAt > 45000) {
    if (!(await tunnelAlive())) {
      log(c(33, 'Tunnel rớt (mất mạng?) → dựng lại tunnel'));
      try { if (isWin) spawnSync('taskkill', ['/f', '/im', 'cloudflared.exe'], { stdio: 'ignore' }); } catch {}
      if (tunnelProc) { try { tunnelProc.kill(); } catch {} }
      startTunnel();
    }
  }
}

let stopping = false;
function stopAll() {
  if (stopping) return; stopping = true;
  log('Đang dừng tất cả…');
  for (const p of [...Object.values(kids), tunnelProc]) {
    try { if (isWin && p?.pid) spawnSync('taskkill', ['/pid', String(p.pid), '/f', '/t'], { stdio: 'ignore' }); else p?.kill('SIGTERM'); } catch {}
  }
  try { if (isWin) spawnSync('taskkill', ['/f', '/im', 'cloudflared.exe'], { stdio: 'ignore' }); } catch {}
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

await boot();
setInterval(() => watch().catch((e) => log('watch lỗi: ' + e.message)), 30000);
