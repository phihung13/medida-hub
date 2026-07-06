// ============================================================================
//  BACKEND 1 — HUB API  (đóng vai Postiz)
// ----------------------------------------------------------------------------
//  - Consumer: đọc job từ hàng đợi bền -> sinh caption (Claude/mock) -> tạo bản
//    nháp chờ duyệt. Đây là phần "nặng" trong kiến trúc thật (tải media, MinIO,
//    Claude, createDraft), ở demo rút gọn nhưng giữ đúng luồng.
//  - REST API cho UI: trạng thái, nhóm, bản nháp, duyệt/từ chối.
//  - Phục vụ luôn UI tĩnh trong /public (một giao diện cho cả 2 backend).
// ============================================================================

import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { loadState, saveState, readQueue, resetAll } from './lib/store.js';
import { generateCaption } from './lib/caption.js';
import { CHANNELS, channelName } from './lib/seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = 3000;
const WORKER_TIMEOUT_MS = 8000; // quá lâu không heartbeat -> coi như worker chết

let state = loadState();

// ---- Nhật ký hoạt động (feed trên UI) ----------------------------------
function log(msg, actor = 'hub') {
  const entry = { t: Date.now(), actor, msg };
  state.activity.unshift(entry);
  state.activity = state.activity.slice(0, 60);
  saveState(state);
  console.log(`[hub] ${msg}`);
}

function findGroup(id) {
  return state.groups.find((g) => g.id === id);
}

// ============================================================================
//  CONSUMER — vòng lặp rút job khỏi hàng đợi bền
// ============================================================================
async function consumeLoop() {
  try {
    const jobs = readQueue();
    while (state.consumerOffset < jobs.length) {
      const job = jobs[state.consumerOffset];
      const group = findGroup(job.groupId) || {
        id: job.groupId,
        name: job.groupName,
        tone: 'gần gũi',
        channels: [],
      };
      const caption = await generateCaption(job, group);
      const draft = {
        id: 'd_' + job.id,
        jobId: job.id,
        groupId: group.id,
        groupName: group.name,
        emoji: group.emoji || '📷',
        type: job.type,
        mediaUrls: job.mediaUrls,
        channels: group.channels,
        caption: caption.text,
        captionSource: caption.source, // 'claude' | 'mock'
        captionNote: caption.note || null,
        status: 'pending', // pending -> approved -> posting -> posted | rejected
        createdAt: Date.now(),
      };
      state.drafts.unshift(draft);
      state.consumerOffset += 1;
      const src = caption.source === 'claude' ? 'Claude' : 'mock';
      log(
        `📥 Nhận job từ "${group.name}" (${job.mediaUrls.length} media) → sinh caption bằng ${src}, tạo bản nháp chờ duyệt.`
      );
    }
  } catch (e) {
    console.error('[hub] consumer error:', e.message);
  }
  setTimeout(consumeLoop, 1000);
}

// ============================================================================
//  Mô phỏng ĐĂNG BÀI sau khi duyệt
// ============================================================================
function publishDraft(draft) {
  draft.status = 'posting';
  saveState(state);
  log(`🚀 Đang đăng bản nháp "${draft.groupName}" lên ${draft.channels.length} kênh...`);
  setTimeout(() => {
    draft.status = 'posted';
    draft.postedAt = Date.now();
    draft.permalinks = draft.channels.map((c) => ({
      channel: channelName(c),
      url: 'https://example.com/post/' + draft.id + '/' + c,
    }));
    saveState(state);
    const names = draft.channels.map(channelName).join(', ');
    log(`✅ Đã đăng "${draft.groupName}" lên: ${names}`);
  }, 1600);
}

// ============================================================================
//  HTTP server: REST API + phục vụ UI tĩnh
// ============================================================================
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  let path = req.url.split('?')[0];
  if (path === '/') path = '/index.html';
  const file = join(PUBLIC_DIR, path);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST',
    });
    return res.end();
  }

  // ---- API ----
  if (url.startsWith('/api/')) {
    // Trạng thái tổng: đèn 2 backend + độ sâu hàng đợi
    if (url === '/api/status' && method === 'GET') {
      const jobs = readQueue();
      const workerUp = Date.now() - state.lastWorkerHeartbeat < WORKER_TIMEOUT_MS;
      return sendJson(res, 200, {
        hub: 'up',
        worker: workerUp ? 'up' : 'down',
        queueTotal: jobs.length,
        queuePending: jobs.length - state.consumerOffset,
        draftsPending: state.drafts.filter((d) => d.status === 'pending').length,
        draftsPosted: state.drafts.filter((d) => d.status === 'posted').length,
        claude: !!process.env.ANTHROPIC_API_KEY,
      });
    }

    if (url === '/api/groups' && method === 'GET') {
      return sendJson(res, 200, { groups: state.groups, channels: CHANNELS });
    }

    // Bật/tắt nghe 1 nhóm Zalo (ghi config -> worker sẽ đọc)
    if (url === '/api/groups/toggle' && method === 'POST') {
      const body = await readBody(req);
      const g = findGroup(body.id);
      if (g) {
        g.enabled = !g.enabled;
        saveState(state);
        log(`⚙️ ${g.enabled ? 'BẬT' : 'TẮT'} nghe nhóm "${g.name}".`);
      }
      return sendJson(res, 200, { ok: true, groups: state.groups });
    }

    if (url === '/api/drafts' && method === 'GET') {
      return sendJson(res, 200, { drafts: state.drafts });
    }

    if (url === '/api/drafts/approve' && method === 'POST') {
      const body = await readBody(req);
      const d = state.drafts.find((x) => x.id === body.id);
      if (d && d.status === 'pending') {
        d.status = 'approved';
        log(`👍 Duyệt bản nháp "${d.groupName}".`);
        publishDraft(d);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (url === '/api/drafts/reject' && method === 'POST') {
      const body = await readBody(req);
      const d = state.drafts.find((x) => x.id === body.id);
      if (d && d.status === 'pending') {
        d.status = 'rejected';
        log(`🗑️ Từ chối bản nháp "${d.groupName}".`);
        saveState(state);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (url === '/api/activity' && method === 'GET') {
      return sendJson(res, 200, { activity: state.activity });
    }

    // Worker gửi 1 dòng nhật ký (để feed thống nhất)
    if (url === '/api/activity' && method === 'POST') {
      const body = await readBody(req);
      log(body.msg || '(worker)', 'worker');
      return sendJson(res, 200, { ok: true });
    }

    // Worker báo còn sống
    if (url === '/api/worker/heartbeat' && method === 'POST') {
      state.lastWorkerHeartbeat = Date.now();
      return sendJson(res, 200, { ok: true });
    }

    // Reset demo
    if (url === '/api/reset' && method === 'POST') {
      resetAll();
      state = loadState();
      log('🔄 Đã reset demo.');
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'unknown api' });
  }

  // ---- UI tĩnh ----
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  🗂️  HUB API (Backend 1) chạy tại  http://localhost:${PORT}`);
  console.log(`  📊  Claude caption: ${process.env.ANTHROPIC_API_KEY ? 'BẬT (API thật)' : 'mock (chưa có ANTHROPIC_API_KEY)'}`);
  console.log(`  🌐  Mở UI:          http://localhost:${PORT}\n`);
  consumeLoop();
});
