// src/sharewatch.mjs — ĐẾM LƯỢT CHIA SẺ VÀO NHÓM ZALO (đặc tả v2 "ưu tiên share")
// ----------------------------------------------------------------------------
//  Bot nghe mọi nhóm nó có mặt. Tin nào chứa link bài của Hub (link chuyển
//  hướng /public/r/<mã> ở bình luận đầu) hoặc link bài Facebook -> báo Hub
//  POST /public/v1/zalo-share; Hub tự khớp link với bài và +1 lượt chia sẻ.
//  Chỉ ĐỌC, không gửi gì vào nhóm. Tắt: SHARE_WATCH=0.
// ============================================================================

const LINK_RE = /https?:\/\/[^\s<>"'\])]+/gi;
const WANTED_RE = /\/public\/r\/[A-Za-z0-9]{6,16}|(?:^|\/\/|\.)(?:facebook\.com|fb\.com|fb\.watch)\//i;
const DEDUPE_MS = 24 * 3600 * 1000;
const seen = new Map(); // khoá nhóm:người:link -> thời điểm

function apiUrl() {
  return (process.env.POSTIZ_API_URL || "http://localhost:3000").replace(/\/$/, "");
}

// Gom mọi chuỗi có thể chứa link: tin chữ, thẻ link (href/title/description), params.
export function linksOf(m) {
  const c = m?.data?.content;
  const parts = [];
  if (typeof c === "string") parts.push(c);
  else if (c && typeof c === "object") {
    for (const k of ["href", "title", "description", "params"]) if (typeof c[k] === "string") parts.push(c[k]);
  }
  const out = new Set();
  for (const p of parts) for (const u of p.match(LINK_RE) || []) {
    const link = u.replace(/[.,;:!?]+$/, "");
    if (WANTED_RE.test(link)) out.add(link);
  }
  return [...out];
}

export async function watchShares(m, { log = () => {} } = {}) {
  if (process.env.SHARE_WATCH === "0") return;
  if (!m || m.isSelf || m.type !== 1) return; // chỉ tin người khác gửi trong NHÓM
  const apiKey = process.env.POSTIZ_API_KEY;
  if (!apiKey) return;
  const links = linksOf(m);
  if (!links.length) return;
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > DEDUPE_MS) seen.delete(k);
  for (const url of links) {
    const key = `${m.threadId}:${m.data?.uidFrom || ""}:${url}`;
    if (seen.has(key)) continue;
    seen.set(key, now);
    try {
      const res = await fetch(`${apiUrl()}/public/v1/zalo-share`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: apiKey },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(10000),
      });
      const r = await res.json().catch(() => ({}));
      if (r?.matched) log(`🔁 +1 lượt chia sẻ vào nhóm ${m.threadId} (bài ${r.postId})`);
    } catch (e) {
      seen.delete(key); // lỗi mạng -> lần sau thấy lại vẫn báo được
      log(`báo lượt chia sẻ lỗi: ${e.message}`);
    }
  }
}
