// src/zalovideojobs.mjs — Hàng đợi việc đăng Zalo Video cho Media Hub gọi.
//
// Hub không đợi một kết nối dài vài phút (dễ đứt): Hub gửi việc, nhận lại
// khoá, rồi hỏi tiến độ. Ba nguyên tắc:
//
// 1. CHỐNG ĐĂNG TRÙNG theo khoá. Temporal chỉ cho mỗi lượt đăng chạy tối đa 10
//    phút rồi TỰ THỬ LẠI (tới 3 lần). Nếu mỗi lượt thử lại gửi một việc mới thì
//    video bị đăng 2–3 lần. Hub dùng id bài làm khoá: gửi lại cùng khoá -> trả
//    về ĐÚNG việc cũ (đang chạy hoặc đã xong), không đăng lần nữa. Chỉ việc đã
//    THẤT BẠI mới được chạy lại với cùng khoá.
//
// 2. MỌI thao tác trình duyệt chạy LẦN LƯỢT qua một khoá chung (đăng, kiểm tra
//    phiên, giữ ấm phiên). Hai trình duyệt cùng mở một file phiên thì cả hai
//    cùng được Zalo cấp cookie mới rồi ghi đè lên nhau -> phiên hỏng.
//
// 3. GIỮ ẤM PHIÊN mỗi 6 tiếng: mỗi lần mở Creator Center Zalo cấp cookie mới,
//    mở đều thì phiên không nguội tới mức phải quét QR lại (miễn cookie tài
//    khoản Zalo còn hạn — ~400 ngày).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dataPath } from "./paths.mjs";
import {
  postToZaloVideo,
  checkZaloVideoSession,
  getZaloVideoChannel,
  inspectZaloVideoSession,
} from "./zalovideo.mjs";

const JOBS_FILE = dataPath("data", "zalo-video-jobs.json");
const TMP_DIR = dataPath("output", "zalo-video-tmp");
const MAX_BYTES = 500 * 1024 * 1024;
const KEEP_JOBS = 200;
const KEEPALIVE_MS = 6 * 60 * 60 * 1000;

// ---- khoá chung cho mọi thao tác trình duyệt ----
let chain = Promise.resolve();
let busyWith = "";
export function withBrowserLock(label, fn) {
  const run = async () => {
    busyWith = label;
    try { return await fn(); } finally { busyWith = ""; }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// ---- lưu việc ra đĩa (để khởi động lại vẫn nhớ việc ĐÃ XONG -> chống trùng) ----
const jobs = new Map();
(() => {
  try {
    for (const j of JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"))) {
      // Việc đang dở lúc bot tắt thì không biết số phận: đánh dấu thất bại để
      // Hub thử lại, thay vì treo "running" mãi.
      if (j.state === "queued" || j.state === "running") {
        j.state = "failed";
        j.error = "Bot khởi động lại giữa chừng — chưa rõ đã đăng hay chưa, kiểm tra kênh trước khi đăng lại.";
      }
      jobs.set(j.key, j);
    }
  } catch {}
})();
const save = () => {
  try {
    const list = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-KEEP_JOBS);
    fs.mkdirSync(path.dirname(JOBS_FILE), { recursive: true });
    fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 1));
  } catch {}
};
const publicJob = (j) =>
  j && {
    key: j.key,
    state: j.state,
    error: j.error || null,
    result: j.result || null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };

// Tải video từ URL công khai của Hub về file tạm (ghi thẳng ra đĩa, không giữ
// cả trăm MB trong RAM), chặn trần 500MB của Zalo Video.
async function download(url, key) {
  const ext = (url.split("?")[0].match(/\.(mp4|mov)$/i)?.[1] || "mp4").toLowerCase();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error(`Không tải được video từ Hub (${e?.cause?.code || e?.message || e}) — ${url.slice(0, 120)}`);
  }
  if (!res.ok || !res.body) throw new Error(`Không tải được video từ Hub (HTTP ${res.status}).`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error(`Video ${(len / 1048576).toFixed(1)}MB vượt trần 500MB của Zalo Video.`);
  const out = fs.createWriteStream(file);
  let got = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (got > MAX_BYTES) throw new Error("Video vượt trần 500MB của Zalo Video.");
      if (!out.write(value)) await new Promise((r) => out.once("drain", r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  return file;
}

async function runJob(job, log) {
  job.state = "running";
  job.updatedAt = Date.now();
  save();
  let file = "";
  try {
    file = await download(job.videoUrl, job.key);
    const r = await withBrowserLock("post", () =>
      postToZaloVideo({ videoPath: file, description: job.description, headless: true, log })
    );
    job.state = "done";
    // pending = Zalo đã nhận file + tạo bài không lỗi, chỉ là API danh sách
    // chưa kịp có video. KHÔNG coi là thất bại — đăng lại sẽ thành trùng.
    job.result = { verified: !!r.ok, pending: !!r.pending, count: r.count || 0 };
    log(`Zalo Video: đăng xong ${job.key}${r.pending ? " (chưa thấy trong danh sách — có thể đang xử lý)" : ""}`);
  } catch (e) {
    job.state = "failed";
    job.error = String(e?.message || e).slice(0, 1500);
    log(`Zalo Video: đăng LỖI ${job.key} — ${job.error}`);
  } finally {
    job.updatedAt = Date.now();
    save();
    if (file) fs.rm(file, { force: true }, () => {});
  }
}

/** Thêm việc đăng. Cùng khoá mà việc cũ chưa thất bại -> trả việc cũ (chống trùng). */
export function enqueueZaloVideo({ key, videoUrl, description = "" }, log = console.log) {
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) throw new Error("Thiếu videoUrl công khai (http/https).");
  const k = String(key || crypto.randomUUID()).slice(0, 120);
  const existing = jobs.get(k);
  if (existing && existing.state !== "failed") return publicJob(existing);
  const job = {
    key: k,
    videoUrl,
    description: String(description).slice(0, 4000),
    state: "queued",
    error: null,
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(k, job);
  save();
  // Không await: Hub hỏi tiến độ bằng getZaloVideoJob().
  runJob(job, log);
  return publicJob(job);
}

export const getZaloVideoJob = (key) => publicJob(jobs.get(String(key)));

export function zaloVideoStatus() {
  const list = [...jobs.values()];
  return {
    session: inspectZaloVideoSession(),
    busyWith,
    running: list.filter((j) => j.state === "running").length,
    queued: list.filter((j) => j.state === "queued").length,
  };
}

/** Kiểm tra phiên + lấy thông tin kênh — dùng khi Hub thêm kênh. */
export const zaloVideoChannel = (log) =>
  withBrowserLock("channel", () => getZaloVideoChannel({ log }));

/** Giữ ấm phiên định kỳ. Bỏ qua nếu chưa có phiên. */
export function startZaloVideoKeepAlive(log = console.log) {
  const tick = async () => {
    if (!inspectZaloVideoSession().hasSession) return;
    try {
      await withBrowserLock("keepalive", () => checkZaloVideoSession({ log: () => {} }));
      log("Zalo Video: đã giữ ấm phiên.");
    } catch (e) {
      log("Zalo Video: giữ ấm phiên LỖI — " + (e?.message || e));
    }
  };
  const t = setInterval(tick, KEEPALIVE_MS);
  t.unref?.();
  return t;
}
