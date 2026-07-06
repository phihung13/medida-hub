// Lưu trạng thái Hub + hàng đợi bền (thay cho Postgres + Redis trong bản demo).
//
//  - queue.jsonl : hàng đợi BỀN, append-only. Mỗi dòng = 1 job worker đẩy vào
//                  (tương đương Redis queue "zalo:ingest"). Worker CHỈ ghi thêm,
//                  Hub CHỈ đọc + tự nhớ đã xử lý tới đâu (consumerOffset).
//                  => không tranh chấp, và nếu Hub tắt thì job vẫn nằm đây chờ.
//  - state.json  : trạng thái Hub (nhóm, bản nháp, offset, nhật ký hoạt động).

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { DEFAULT_GROUPS } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', '..', 'data');
export const QUEUE_FILE = join(DATA_DIR, 'queue.jsonl');
export const STATE_FILE = join(DATA_DIR, 'state.json');

export function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(QUEUE_FILE)) fs.writeFileSync(QUEUE_FILE, '');
}

// ---- Hàng đợi bền -------------------------------------------------------

// Worker gọi hàm này để đẩy 1 job vào hàng đợi (append-only, an toàn đa tiến trình).
export function pushJob(job) {
  ensureData();
  fs.appendFileSync(QUEUE_FILE, JSON.stringify(job) + '\n');
}

// Đọc toàn bộ job trong hàng đợi (Hub dùng để lấy các job chưa xử lý).
export function readQueue() {
  ensureData();
  const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---- Trạng thái Hub -----------------------------------------------------

export function loadState() {
  ensureData();
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      /* file hỏng -> khởi tạo lại bên dưới */
    }
  }
  return {
    consumerOffset: 0, // đã xử lý bao nhiêu dòng của queue.jsonl
    lastWorkerHeartbeat: 0, // mốc thời gian worker báo sống gần nhất
    groups: structuredClone(DEFAULT_GROUPS),
    drafts: [], // bản nháp chờ duyệt / đã đăng
    activity: [], // nhật ký hoạt động (feed hiển thị trên UI)
  };
}

export function saveState(state) {
  ensureData();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Reset sạch demo (xoá queue + state).
export function resetAll() {
  ensureData();
  fs.writeFileSync(QUEUE_FILE, '');
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}
