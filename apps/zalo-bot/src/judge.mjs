// src/judge.mjs — Đặc tả v2 (15/10/2026): NGƯỜI CHẤM ĐỘC LẬP (rubric dự báo share).
// Bot KHÔNG tự chấm: gọi Media Hub (POST /public/v1/share-judge) — rubric nằm
// MỘT chỗ ở Hub (skill rubric-du-bao-share), chỉnh trọng số trên Hub là bot ăn
// theo. Người chấm chỉ nhận bài viết + ghi chú giáo viên (nguồn sự thật cho G1),
// không thấy prompt viết. Lỗi/Hub chưa bật -> null (bài đi luồng chờ duyệt).

function apiUrl() {
  return (process.env.POSTIZ_API_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** @returns {Promise<{gates:object, scores:object, evidence:object, total:number, verdict:string, one_fix?:string}|null>} */
export async function judgeShare({ text, note = "" }, { log = () => {} } = {}) {
  const apiKey = process.env.POSTIZ_API_KEY;
  if (process.env.POSTIZ_ENABLED !== "true" || !apiKey || !String(text || "").trim()) return null;
  try {
    const res = await fetch(`${apiUrl()}/public/v1/share-judge`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ type: "UGC", text, note }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await res.text();
    if (!res.ok) { log(`chấm điểm lỗi ${res.status}: ${body.slice(0, 200)}`); return null; }
    const r = JSON.parse(body);
    if (typeof r?.total !== "number" || !r?.verdict) return null;
    return r;
  } catch (e) {
    log(`chấm điểm lỗi: ${e.message}`);
    return null;
  }
}

/** Nhóm ổn định được ĐĂNG NGAY khi: qua đủ 5 cổng, ≥80 điểm, checkSafety không gắn cờ. */
export function passesAutoPost(rubric, { safetyFlagged = false } = {}) {
  if (!rubric || safetyFlagged) return false;
  const gates = rubric.gates || {};
  // gates[Gx] = true nghĩa là TRƯỢT cổng đó (vi phạm) theo rubric v2.
  const anyGateFailed = ["G1", "G2", "G3", "G4", "G5"].some((g) => gates[g] === true);
  return !anyGateFailed && rubric.total >= 80 && rubric.verdict === "đăng";
}
