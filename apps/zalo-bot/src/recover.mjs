// src/recover.mjs — LẤY LẠI TIN BỊ LỠ (vd lỡ đăng xuất Zalo một lúc).
//
// Listener chỉ nhận tin tới trong lúc đang kết nối; đăng xuất/mất phiên thì ảnh
// gửi vào nhóm lúc đó không bao giờ tới bot. Zalo vẫn giữ lịch sử nhóm: zca-js
// có getGroupChatHistory(groupId, count) trả về N tin MỚI NHẤT của nhóm, cùng
// khuôn với tin listener nhận (GroupMessage) -> chạy được qua extractEvent.
//
// Giới hạn: chỉ lấy được N tin mới nhất (không có tham số "trước thời điểm X"),
// nên nhóm càng nhiều tin mới thì ảnh cũ càng trôi khỏi tầm — xem cờ `complete`.
//
// Chia đợt ảnh theo ĐÚNG luật của batcher.mjs để mỗi đợt ra một bản nháp như
// khi nhận trực tiếp: đợt chốt khi im lặng quá debounceMs, hoặc đã quá maxWaitMs
// kể từ ảnh đầu, hoặc gặp lệnh "xong/đăng". Tin chữ gửi trước ảnh (trong 1 giờ)
// làm tư liệu caption, như pre-buffer của batcher.
import fs from "node:fs";
import path from "node:path";
import { extractEvent } from "./extract.mjs";
import { dataPath } from "./paths.mjs";

const PRE_EXPIRY_MS = 3600000;

/** Đọc lịch sử nhóm, thử số tin lớn trước (Zalo có thể giới hạn). */
export async function fetchGroupHistory(api, threadId) {
  let lastErr = null;
  for (const count of [200, 100, 50]) {
    try {
      const r = await api.getGroupChatHistory(String(threadId), count);
      return { msgs: r?.groupMsgs || [], more: !!r?.more, count };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Không đọc được lịch sử nhóm");
}

/** Chia tin (đã sắp theo thời gian) thành các đợt như batcher. */
export function splitSessions(events, route) {
  const debounce = Number(route.debounceMs) || 600000;
  const maxWait = Number(route.maxWaitMs) || 1800000;
  const sessions = [];
  let cur = null;
  let preTexts = [];
  const close = () => {
    if (cur && cur.items.length) sessions.push(cur);
    cur = null;
  };
  for (const ev of events) {
    if (ev.kind === "command") {
      close();
      continue;
    }
    if (ev.kind === "text") {
      if (!ev.text) continue;
      const t = { text: ev.text, senderId: ev.senderId, ts: ev.ts };
      if (cur && ev.ts - cur.lastTs <= debounce) {
        cur.texts.push(t);
        cur.lastTs = ev.ts; // batcher: có ảnh rồi thì chữ gia hạn debounce
      } else {
        if (cur) close();
        preTexts.push(t);
      }
      continue;
    }
    if (ev.kind !== "image" && ev.kind !== "video") continue;
    if (cur && (ev.ts - cur.lastTs > debounce || ev.ts - cur.firstTs > maxWait)) close();
    if (!cur) {
      cur = {
        items: [],
        texts: preTexts.filter((t) => ev.ts - t.ts <= PRE_EXPIRY_MS).slice(-80),
        firstTs: ev.ts,
        lastTs: ev.ts,
        msgIds: [],
        senders: new Set(),
      };
      preTexts = [];
    }
    cur.items.push({
      kind: ev.kind, url: ev.mediaUrl, posterUrl: ev.posterUrl,
      caption: ev.caption || "", senderId: ev.senderId, ts: ev.ts, meta: ev.mediaMeta,
    });
    cur.msgIds.push(String(ev.msgId));
    if (ev.senderName) cur.senders.add(ev.senderName);
    cur.lastTs = ev.ts;
  }
  close();
  return sessions;
}

/**
 * Nhớ id các tin ảnh/video listener đã nhận trực tiếp (5000 tin gần nhất, lưu
 * đĩa) — để màn xem trước biết đợt nào bot ĐÃ có, khỏi lấy lại thành trùng.
 */
export function createSeenStore(file = dataPath("data", "seen-msgs.json"), limit = 5000) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const set = new Set(list);
  let timer = null;
  const flush = () => {
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(list));
    } catch {}
  };
  return {
    add(msgId) {
      const id = String(msgId || "");
      if (!id || set.has(id)) return;
      set.add(id);
      list.push(id);
      if (list.length > limit) set.delete(list.shift());
      if (!timer) { timer = setTimeout(flush, 5000); timer.unref?.(); }
    },
    has: (msgId) => set.has(String(msgId)),
  };
}

// Đợt đã lấy lại (khoá = nhóm + id tin ảnh đầu) — chặn bấm "tạo bản nháp" 2 lần.
const DONE_FILE = dataPath("data", "recovered-sessions.json");
function loadDone() {
  try { return new Set(JSON.parse(fs.readFileSync(DONE_FILE, "utf8"))); } catch { return new Set(); }
}
function saveDone(set) {
  try {
    fs.mkdirSync(path.dirname(DONE_FILE), { recursive: true });
    fs.writeFileSync(DONE_FILE, JSON.stringify([...set].slice(-2000)));
  } catch {}
}

/**
 * Tạo bộ "lấy lại tin" gắn với phiên bot hiện tại.
 * @param {object} o
 * @param {() => object} o.getApi          phiên zca-js đang chạy
 * @param {() => Map} o.getRoutes          cfg.byThread (threadId -> route)
 * @param {(tid:string) => object} o.getRoute  route đang bật của nhóm
 * @param {(msgId:string) => boolean} o.wasSeen  tin đã được listener nhận chưa
 * @param {(batch:object, reason:string) => Promise<void>} o.handleBatch  đúng hàm chốt batch của luồng trực tiếp
 * @param {(m:string) => void} o.log
 */
export function createRecovery({ getApi, getRoutes, getRoute, wasSeen, handleBatch, log }) {
  let running = null;

  async function collect({ from, to }) {
    const api = getApi();
    if (!api) throw new Error("Bot chưa đăng nhập Zalo — quét QR trước rồi lấy lại.");
    const fromMs = Number(from), toMs = Number(to);
    if (!(fromMs > 0) || !(toMs > fromMs)) throw new Error("Khoảng thời gian không hợp lệ.");
    const done = loadDone();
    const tids = [...getRoutes().keys()].filter((tid) => getRoute(tid));
    // Đọc song song 4 nhóm một lúc: proxy trước bot cắt kết nối sau ~60s.
    const groups = new Array(tids.length);
    let next = 0;
    const worker = async () => {
      while (next < tids.length) {
        const i = next++;
        groups[i] = await readGroup(tids[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, tids.length) }, worker));
    return groups;

    async function readGroup(tid) {
      const route = getRoute(tid);
      let hist;
      try {
        hist = await fetchGroupHistory(api, tid);
      } catch (e) {
        return { threadId: tid, label: route.label, error: String(e?.message || e), sessions: [] };
      }
      const events = hist.msgs
        .map((m) => { try { return extractEvent(m); } catch { return null; } })
        .filter((ev) => ev && ev.ts && ["image", "video", "text", "command"].includes(ev.kind))
        .sort((a, b) => a.ts - b.ts);
      const oldest = events.length ? events[0].ts : null;
      const sessions = splitSessions(events, route)
        .filter((s) => s.firstTs >= fromMs && s.firstTs <= toMs)
        .map((s) => {
          const id = `${tid}:${s.msgIds[0]}`;
          const seen = s.msgIds.filter((m) => wasSeen(m)).length;
          return {
            id,
            threadId: tid,
            start: s.firstTs,
            end: s.lastTs,
            images: s.items.filter((i) => i.kind === "image").length,
            videos: s.items.filter((i) => i.kind === "video").length,
            senders: [...s.senders].slice(0, 3),
            thumb: s.items.find((i) => i.kind === "image")?.url || s.items[0]?.posterUrl || "",
            // Bot đã nhận trực tiếp toàn bộ ảnh đợt này -> không cần lấy lại.
            seenLive: seen === s.msgIds.length,
            recovered: done.has(id),
            _batch: { threadId: tid, items: s.items, texts: s.texts, startedAt: s.firstTs },
          };
        });
      return {
        threadId: tid,
        label: route.label,
        fetched: hist.msgs.length,
        // Tin cũ nhất đọc được vẫn MỚI hơn mốc "từ" -> có thể còn ảnh cũ hơn
        // đã trôi khỏi tầm đọc của Zalo.
        complete: oldest != null ? oldest <= fromMs || !hist.more : true,
        oldest,
        sessions,
      };
    }
  }

  const strip = (groups) =>
    groups.map((g) => ({ ...g, sessions: g.sessions.map(({ _batch, ...s }) => s) }));

  async function preview(range) {
    return strip(await collect(range));
  }

  async function run({ from, to, ids }) {
    if (running) throw new Error("Đang lấy lại một đợt khác — đợi xong rồi thử lại.");
    const want = new Set((ids || []).map(String));
    if (!want.size) throw new Error("Chưa chọn đợt ảnh nào.");
    const groups = await collect({ from, to });
    const picked = groups.flatMap((g) => g.sessions).filter((s) => want.has(s.id) && !s.recovered);
    if (!picked.length) throw new Error("Các đợt đã chọn không còn trong lịch sử, hoặc đã lấy lại rồi.");
    const done = loadDone();
    running = (async () => {
      let ok = 0;
      for (const s of picked) {
        try {
          // Đánh dấu TRƯỚC khi xử lý: lỡ bấm lần hai giữa chừng cũng không tạo trùng.
          done.add(s.id);
          saveDone(done);
          await handleBatch(s._batch, "recover");
          ok++;
        } catch (e) {
          log(`Lấy lại tin lỗi (${s.id}): ${e?.message || e}`);
        }
      }
      log(`Lấy lại tin bị lỡ: xong ${ok}/${picked.length} đợt ảnh.`);
    })().finally(() => { running = null; });
    return { started: picked.length };
  }

  return { preview, run, isRunning: () => !!running };
}
