// Chạy CẢ HAI backend bằng một lệnh: `node dev.js` (hoặc `npm start`).
// Gộp log của 2 tiến trình vào một cửa sổ, tự mở trình duyệt.

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function run(name, file, color) {
  const p = spawn(node, [join(__dirname, 'src', file)], { cwd: __dirname });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach((l) => process.stdout.write(prefix + l + '\n'));
    });
  };
  pipe(p.stdout);
  pipe(p.stderr);
  p.on('exit', (code) => process.stdout.write(prefix + `thoát (code ${code})\n`));
  return p;
}

console.log('\n=== Việt Anh Media Hub — Demo (2 backend + 1 UI) ===\n');
const hub = run('hub', 'hub-api.js', '36'); // cyan
const worker = run('worker', 'zalo-worker.js', '32'); // green

// Mở trình duyệt sau khi Hub kịp khởi động
setTimeout(() => {
  const url = 'http://localhost:3000';
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { shell: false });
    else if (process.platform === 'darwin') spawn('open', [url]);
    else spawn('xdg-open', [url]);
  } catch {}
  console.log(`\n  ▶ Mở UI: ${url}\n`);
}, 1500);

// Tắt gọn cả 2 khi Ctrl+C
process.on('SIGINT', () => {
  hub.kill();
  worker.kill();
  process.exit(0);
});
