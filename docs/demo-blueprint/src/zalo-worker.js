// ============================================================================
//  BACKEND 2 — ZALO WORKER  (đóng vai tiến trình zca-js chạy nền)
// ----------------------------------------------------------------------------
//  Trong hệ thật: giữ session Zalo sống (zca-js), lắng nghe các nhóm Zalo, khi
//  có ảnh/video mới thì đẩy 1 job vào hàng đợi "zalo:ingest" cho Hub xử lý.
//  Tách riêng khỏi Hub vì session Zalo không chịu được restart/scale của Docker.
//
//  Ở demo, worker:
//   - Gửi heartbeat cho Hub mỗi 3s (để UI hiện đèn xanh/đỏ).
//   - Mở endpoint /simulate: mỗi lần gọi = "bắt được" 1 album ảnh giả từ 1 nhóm
//     Zalo rồi đẩy vào hàng đợi bền (thay cho việc Zalo thật gửi ảnh).
//  Worker KHÔNG cần Hub sống để đẩy job — nếu Hub tắt, job vẫn nằm trong hàng
//  đợi và được xử lý khi Hub bật lại (minh hoạ tính bền của kiến trúc).
// ============================================================================

import http from 'http';
import { pushJob } from './lib/store.js';
import { DEFAULT_GROUPS } from './lib/seed.js';

const PORT = 3002;
const HUB = 'http://localhost:3000';

let counter = 0;

// Ảnh giả: SVG data-URI (không cần mạng, hiển thị được ngay trên UI).
function fakePhoto(i) {
  const hue = (i * 47 + 20) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'>` +
    `<rect width='400' height='300' fill='hsl(${hue},65%,55%)'/>` +
    `<rect width='400' height='300' fill='hsl(${(hue + 40) % 360},70%,45%)' opacity='0.5'/>` +
    `<text x='50%' y='48%' font-family='Arial' font-size='26' fill='white' text-anchor='middle' font-weight='bold'>Ảnh từ Zalo</text>` +
    `<text x='50%' y='62%' font-family='Arial' font-size='18' fill='white' text-anchor='middle' opacity='0.9'>#${i}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

async function postHub(path, body) {
  try {
    await fetch(HUB + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return true;
  } catch {
    return false; // Hub đang tắt -> bỏ qua, không làm sập worker
  }
}

// Lấy danh sách nhóm đang BẬT từ Hub; nếu Hub tắt thì dùng seed.
async function enabledGroups() {
  try {
    const res = await fetch(HUB + '/api/groups');
    const data = await res.json();
    return data.groups.filter((g) => g.enabled);
  } catch {
    return DEFAULT_GROUPS.filter((g) => g.enabled);
  }
}

// "Bắt" một album ảnh từ một nhóm Zalo -> đẩy job vào hàng đợi bền.
async function simulateIngest(groupId) {
  const groups = await enabledGroups();
  if (groups.length === 0) {
    return { ok: false, error: 'Không có nhóm Zalo nào đang BẬT. Hãy bật ít nhất 1 nhóm.' };
  }
  const group = groups.find((g) => g.id === groupId) || groups[counter % groups.length];
  const count = 1 + (counter % 4); // 1..4 ảnh
  counter += 1;

  const job = {
    id: Date.now() + '_' + counter,
    groupId: group.id,
    groupName: group.name,
    type: count === 1 ? 'photo' : 'album',
    mediaUrls: Array.from({ length: count }, (_, i) => fakePhoto(counter * 10 + i)),
    capturedAt: Date.now(),
  };

  pushJob(job); // <-- ghi vào hàng đợi bền (worker độc lập với Hub)
  const msg = `📸 [Worker] Bắt được ${count} ảnh mới từ "${group.name}" → đẩy vào hàng đợi.`;
  console.log('[worker]', msg);
  await postHub('/api/activity', { msg });
  return { ok: true, job: { groupName: group.name, count } };
}

// ---- HTTP server nhỏ để UI gọi /simulate --------------------------------
const server = http.createServer(async (req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  const url = req.url.split('?')[0];

  if (url === '/simulate' && req.method === 'POST') {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', async () => {
      let body = {};
      try {
        body = data ? JSON.parse(data) : {};
      } catch {}
      const result = await simulateIngest(body.groupId);
      res.writeHead(result.ok ? 200 : 400, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify(result));
    });
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    return res.end(JSON.stringify({ ok: true, name: 'zalo-worker' }));
  }

  res.writeHead(404, cors);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n  🤖 ZALO WORKER (Backend 2) chạy tại http://localhost:${PORT}`);
  console.log(`  💓 Gửi heartbeat cho Hub mỗi 3s`);
  console.log(`  📥 Endpoint giả lập ingest: POST /simulate\n`);
});

// Heartbeat định kỳ -> Hub biết worker còn sống (đèn xanh trên UI).
setInterval(() => postHub('/api/worker/heartbeat', {}), 3000);
postHub('/api/worker/heartbeat', {});
postHub('/api/activity', { msg: '🟢 [Worker] Đã kết nối, giữ session Zalo (giả lập), sẵn sàng hứng media.' });
