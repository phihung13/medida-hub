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

// Đọc lại lịch sử thì CHẶT hơn luồng trực tiếp (người dùng yêu cầu): không
// gộp 2 bài khác nhau làm một, và không lấy chữ chat không liên quan làm
// tư liệu caption.
const POST_GAP_MS = 5 * 60 * 1000;   // ảnh cách nhau quá 5 phút -> bài khác
const PRE_TEXT_MS = 10 * 60 * 1000;  // chữ gửi trước ảnh tối đa 10 phút
// Có ít nhất 4 chữ cái/chữ số -> không phải chỉ emoji, dấu câu, "ok", "dạ".
const meaningful = (t) => ((String(t || "").match(/[\p{L}\p{N}]/gu) || []).length >= 4);

/**
 * Chia tin (đã sắp theo thời gian) thành các BÀI.
 * - Mỗi bài là ảnh/video của MỘT người gửi (người khác chen vào giữa không
 *   cắt bài của người đang gửi).
 * - Ảnh cách nhau quá 5 phút (hoặc quá debounceMs nếu nhỏ hơn), hoặc quá
 *   maxWaitMs kể từ ảnh đầu -> bài mới.
 * - Lệnh "xong/đăng/ok" chỉ chốt bài khi do CHÍNH người đang gửi ảnh gõ.
 * - Chữ đi kèm: chỉ chữ của chính người gửi bài, từ 10 phút trước ảnh đầu
 *   tới 5 phút sau ảnh cuối, có nội dung (bỏ emoji/"ok"). Mỗi tin chữ chỉ
 *   gắn vào MỘT bài — bài gần nó nhất.
 */
export function splitSessions(events, route) {
  const debounce = Number(route.debounceMs) || 600000;
  const maxWait = Number(route.maxWaitMs) || 1800000;
  const gap = Math.min(debounce, POST_GAP_MS);
  const sessions = [];
  const texts = [];
  // Bài đang mở của TỪNG người gửi: cô A đang gửi mà cô B chen vài tấm vào
  // thì bài của cô A vẫn liền một bài, không bị cắt đôi.
  const open = new Map();
  const close = (sender) => {
    const cur = open.get(sender);
    if (cur && cur.items.length) sessions.push(cur);
    open.delete(sender);
  };
  for (const ev of events) {
    if (ev.kind === "command") {
      close(ev.senderId);
      continue;
    }
    if (ev.kind === "text") {
      if (meaningful(ev.text)) texts.push(ev);
      continue;
    }
    if (ev.kind !== "image" && ev.kind !== "video") continue;
    let cur = open.get(ev.senderId);
    if (cur && (ev.ts - cur.lastTs > gap || ev.ts - cur.firstTs > maxWait)) {
      close(ev.senderId);
      cur = null;
    }
    if (!cur) {
      cur = {
        senderId: ev.senderId,
        items: [],
        texts: [],
        firstTs: ev.ts,
        lastTs: ev.ts,
        msgIds: [],
        senders: new Set(),
      };
      open.set(ev.senderId, cur);
    }
    cur.items.push({
      kind: ev.kind, url: ev.mediaUrl, posterUrl: ev.posterUrl,
      caption: ev.caption || "", senderId: ev.senderId, ts: ev.ts, meta: ev.mediaMeta,
    });
    cur.msgIds.push(String(ev.msgId));
    if (ev.senderName) cur.senders.add(ev.senderName);
    cur.lastTs = ev.ts;
  }
  for (const sender of [...open.keys()]) close(sender);
  sessions.sort((a, b) => a.firstTs - b.firstTs);

  for (const t of texts) {
    let best = null;
    let bestDist = Infinity;
    for (const s of sessions) {
      if (s.senderId !== t.senderId) continue;
      if (t.ts < s.firstTs - PRE_TEXT_MS || t.ts > s.lastTs + gap) continue;
      const dist = t.ts < s.firstTs ? s.firstTs - t.ts : t.ts > s.lastTs ? t.ts - s.lastTs : 0;
      if (dist < bestDist) { best = s; bestDist = dist; }
    }
    if (best) best.texts.push({ text: t.text, senderId: t.senderId, ts: t.ts });
  }
  for (const s of sessions) s.texts.sort((a, b) => a.ts - b.ts);
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

/**
 * Mốc bắt đầu các đợt bot ĐÃ xử lý, theo nhóm. pipeline.mjs lưu mỗi đợt vào
 * output/<threadId>_<startedAt> (startedAt = lúc tin đầu của đợt vào bộ gom),
 * nên đây là dấu vết đáng tin cho cả những bài có TRƯỚC khi có seen-msgs.json.
 * Thư mục chỉ mất khi bỏ bản nháp ngay trong bot.
 */
function listProcessed() {
  const map = new Map();
  let names = [];
  try { names = fs.readdirSync(dataPath("output")); } catch {}
  for (const n of names) {
    const m = /^(.+)_(\d{12,14})$/.exec(n);
    if (!m) continue;
    const arr = map.get(m[1]) || [];
    arr.push(Number(m[2]));
    map.set(m[1], arr);
  }
  return map;
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
    const processed = listProcessed();
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
          // Một đợt trực tiếp gom ảnh từ lúc bắt đầu tới tối đa maxWaitMs sau đó
          // -> ảnh đầu của đợt này rơi vào khung đó thì nhiều khả năng đã có
          // bản nháp. Bỏ qua thư mục của chính đợt này nếu nó là đợt đã lấy lại.
          const maxWait = Number(route.maxWaitMs) || 1800000;
          const dupAt = (processed.get(tid) || []).find(
            (s0) =>
              s.firstTs >= s0 - 120000 &&
              s.firstTs <= s0 + maxWait + 120000 &&
              !(s0 === s.firstTs && done.has(id))
          );
          return {
            id,
            threadId: tid,
            start: s.firstTs,
            end: s.lastTs,
            images: s.items.filter((i) => i.kind === "image").length,
            videos: s.items.filter((i) => i.kind === "video").length,
            senders: [...s.senders].slice(0, 3),
            // Đoạn chữ đầu của bài — để nhận ra bài nào là bài nào.
            text: (s.texts[0]?.text || s.items.find((i) => i.caption)?.caption || "").slice(0, 120),
            thumb: s.items.find((i) => i.kind === "image")?.url || s.items[0]?.posterUrl || "",
            // Bot đã nhận trực tiếp ảnh của đợt này (dù chỉ 1 tấm) -> đợt đó
            // đã ra bản nháp, lấy lại sẽ thành trùng.
            seenLive: seen > 0,
            // Trùng khung thời gian một đợt bot đã xử lý -> có thể đã có bản nháp.
            maybeDup: dupAt != null,
            dupAt: dupAt ?? null,
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
