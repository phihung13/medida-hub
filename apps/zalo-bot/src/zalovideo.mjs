// src/zalovideo.mjs — Đăng video lên Zalo Video (video.zalo.me/creator) qua Playwright.
//
// VÌ SAO KHÔNG DÙNG API: Zalo KHÔNG có API công khai cho Zalo Video. Danh mục
// sản phẩm trên developers.zalo.me chỉ gồm Official Account API, Social API,
// ZNS, ZBS — không có Zalo Video. Thư viện không chính thức zca-js cũng không
// có hàm đăng feed (chỉ `sendVideo` để gửi video TRONG KHUNG CHAT).
//
// Creator Center CÓ đường đồng bộ chính thức từ TikTok, nhưng chỉ hữu ích nếu
// kênh TikTok được đăng đều — xin API đăng tự động của TikTok rất khó nên
// hướng đó không dùng được. Còn lại đúng một cách: điều khiển trình duyệt.
//
// ⚠️ RỦI RO ĐÃ BIẾT VÀ ĐÃ ĐƯỢC CHẤP NHẬN:
//   - Trái điều khoản sử dụng của Zalo; tài khoản có thể bị khoá.
//   - Vỡ mỗi khi Zalo đổi giao diện (selector chạy theo DOM, không phải hợp đồng API).
//   - KHÔNG lưu mật khẩu: phiên đăng nhập lưu dạng cookie, hết hạn thì phải
//     đăng nhập tay lại bằng `npm run zalovideo:login`.
//
// GIỚI HẠN CỦA ZALO VIDEO (đọc từ chính hộp thoại đăng):
//   - Định dạng .mp4 hoặc .mov
//   - Độ phân giải từ 720p trở lên
//   - Dung lượng tối đa 500MB
import fs from "node:fs";
import path from "node:path";
import { dataPath } from "./paths.mjs";

export const ZALOVIDEO_SESSION_FILE = dataPath("data", "zalo-video-session.json");
export const CREATOR_URL = "https://video.zalo.me/creator";
const TIMEOUT = 60_000;

// Input file của hộp thoại đăng video. Zalo dựng SẴN 2 input[type=file]:
//   - accept="video/*"                      -> của phần xác thực kênh TikTok
//   - accept="video/mp4,video/quicktime"    -> của hộp thoại ĐĂNG VIDEO  <-- cái này
// Input bị ẩn (offsetParent === null) nhưng setInputFiles() gắn thẳng được,
// không cần mô phỏng kéo thả.
const FILE_INPUT = 'input[type=file][accept="video/mp4,video/quicktime"]';

/**
 * Chờ trang ĐỨNG YÊN trước khi thao tác.
 *
 * Vì sao cần: vào video.zalo.me bằng phiên đã lưu, Zalo vẫn nhảy một vòng qua
 * oauth.zaloapp.com/v4/permission rồi mới quay lại /creator/... Nếu mình bấm
 * mở hộp thoại và gắn file TRƯỚC khi vòng đó xong, cú điều hướng sẽ cuốn phăng
 * hộp thoại đang mở — lần chạy đầu chết đúng kiểu này ("Target page, context
 * or browser has been closed" trong lúc chờ textarea).
 */
async function waitUrlSettled(page, { quietMs = 5000, timeoutMs = 90_000, log } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    let url = "";
    try { url = page.url(); } catch { break; }
    if (url !== last) {
      last = url;
      stableSince = Date.now();
      log?.("   ...trang chuyển tới:", url.slice(0, 90));
    } else if (
      Date.now() - stableSince >= quietMs &&
      /\/creator\//.test(url) &&
      !/oauth\.zaloapp\.com|\/login/.test(url)
    ) {
      return url;
    }
    await page.waitForTimeout(500);
  }
  return last;
}

/**
 * Vào Creator Center ở trạng thái ĐÃ ĐĂNG NHẬP, rồi lưu cookie mới về file.
 *
 * Phiên có HAI lớp: cookie tài khoản Zalo (id.zalo.me — sống lâu) và phiên
 * riêng của video.zalo.me (ngắn hơn). Hết lớp thứ hai thì Zalo đưa về
 * /creator/register với nút "Đăng nhập Zalo để bắt đầu" — bấm vào là Zalo TỰ
 * đăng nhập lại bằng lớp thứ nhất, KHÔNG đòi quét QR (đã thử thực tế). Đây là
 * nút đăng nhập bình thường của chính Zalo cho người dùng quay lại — không nhập
 * mật khẩu, không vượt CAPTCHA.
 *
 * Mỗi lần như vậy Zalo cấp cookie MỚI và vô hiệu cookie cũ. Bản trước KHÔNG
 * lưu lại -> lần chạy sau dùng cookie đã bị huỷ và hỏng. Giờ lưu storageState
 * ngay khi vào được, như một trình duyệt thật tự nhớ phiên.
 */
async function ensureLoggedIn(page, ctx, { sessionFile, log }) {
  await page.goto(CREATOR_URL, { timeout: TIMEOUT, waitUntil: "domcontentloaded" });
  log("→ Chờ Zalo xong vòng xác thực và trang đứng yên...");
  let settled = await waitUrlSettled(page, { log });

  if (/\/creator\/register/.test(settled)) {
    log("→ Phiên video.zalo.me hết hạn — bấm 'Đăng nhập Zalo để bắt đầu' để Zalo tự đăng nhập lại...");
    const btn = page.getByText("Đăng nhập Zalo để bắt đầu", { exact: false });
    if (await btn.count()) {
      await btn.first().click({ timeout: TIMEOUT });
      settled = await waitUrlSettled(page, { log });
    }
  }

  // Vẫn kẹt ở đăng ký, hoặc bị đưa sang trang đăng nhập/QR của Zalo -> lớp
  // cookie tài khoản cũng đã hết thật, lúc này mới cần người đăng nhập tay.
  if (
    !/video\.zalo\.me\/creator\//.test(settled) ||
    /\/creator\/register/.test(settled)
  ) {
    throw new Error(
      "Phiên Zalo đã hết hạn thật (cần quét QR) — chạy lại: npm run zalovideo:login"
    );
  }

  await ctx.storageState({ path: sessionFile });
  log("→ Đã vào Creator Center, cập nhật phiên:", sessionFile);
}

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED_EXT = /\.(mp4|mov)$/i;

/** Lazy-load playwright để service không crash nếu chưa cài. */
async function getChromium() {
  try {
    const { chromium } = await import("playwright");
    return chromium;
  } catch {
    throw new Error(
      "Playwright chưa được cài — chạy: npm install playwright && npx playwright install chromium --with-deps"
    );
  }
}

export function inspectZaloVideoSession({ sessionFile = ZALOVIDEO_SESSION_FILE } = {}) {
  if (!fs.existsSync(sessionFile)) {
    return { hasSession: false, path: sessionFile, expiresAt: null, expired: null, updatedAt: null };
  }
  let expiresAt = null;
  try {
    const st = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    const exp = (st.cookies || [])
      .filter((c) => String(c.domain || "").includes("zalo") && Number(c.expires) > 0)
      .map((c) => Number(c.expires) * 1000);
    if (exp.length) expiresAt = Math.max(...exp);
  } catch {}
  let updatedAt = null;
  try { updatedAt = fs.statSync(sessionFile).mtimeMs; } catch {}
  return {
    hasSession: true,
    path: sessionFile,
    expiresAt,
    expired: expiresAt ? expiresAt < Date.now() : null,
    updatedAt,
  };
}

/** Chạy 1 LẦN trên máy CÓ màn hình: tự đăng nhập rồi lưu phiên. */
export async function loginZaloVideo({ sessionFile = ZALOVIDEO_SESSION_FILE } = {}) {
  const chromium = await getChromium();
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(CREATOR_URL);
  console.log("\n📲 Đăng nhập Zalo trong cửa sổ trình duyệt vừa mở (bấm 'Đăng nhập Zalo để bắt đầu').");
  console.log("   KHÔNG cần nhấn gì ở đây — đăng nhập xong là tự lưu phiên rồi đóng.\n");

  // TỰ nhận biết thay vì chờ ENTER: script hay được chạy ở nơi không có stdin
  // tương tác (chạy qua công cụ, CI, hoặc `!` trong Claude Code) — lúc đó
  // process.stdin.once("data") treo vĩnh viễn và chẳng bao giờ lưu được gì.
  // Chưa đăng nhập thì Zalo giữ ở /creator/register; vào được trang trong là xong.
  const DEADLINE = Date.now() + 5 * 60_000;
  let loggedIn = false;
  while (Date.now() < DEADLINE) {
    if (page.isClosed()) break;
    let url = "";
    try { url = page.url(); } catch { break; }
    if (/\/creator\//.test(url) && !/\/creator\/register/.test(url)) {
      loggedIn = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!loggedIn) {
    await browser.close();
    throw new Error(
      "Hết 5 phút mà chưa thấy đăng nhập xong (vẫn ở màn hình đăng ký). Chạy lại và đăng nhập trong cửa sổ vừa mở."
    );
  }

  // Zalo còn ghi tiếp cookie sau khi chuyển trang — chờ một nhịp cho chắc.
  await page.waitForTimeout(3000);
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  await ctx.storageState({ path: sessionFile });
  await browser.close();
  console.log("✅ Đã lưu phiên Zalo Video:", sessionFile);
}

/**
 * Mở Creator Center ngầm, đăng nhập lại nếu cần và lưu cookie mới — KHÔNG đăng
 * gì. Dùng để: kiểm tra phiên còn sống, và "giữ ấm" phiên định kỳ (mỗi lần gọi
 * Zalo cấp cookie mới, nên gọi đều thì phiên không bao giờ nguội tới mức cần
 * quét QR lại).
 */
export async function checkZaloVideoSession({
  sessionFile = ZALOVIDEO_SESSION_FILE,
  log = console.log,
} = {}) {
  if (!fs.existsSync(sessionFile)) {
    throw new Error("Chưa có phiên Zalo Video — chạy: npm run zalovideo:login");
  }
  const chromium = await getChromium();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ storageState: sessionFile });
  const page = await ctx.newPage();
  try {
    await ensureLoggedIn(page, ctx, { sessionFile, log });
    return { ok: true, url: page.url() };
  } finally {
    await browser.close();
  }
}

/**
 * Chạy một thao tác CHỈ ĐỌC trên Creator Center với phiên đã lưu: tự đăng
 * nhập lại nếu cần, và LƯU cookie mới SAU khi xong. Mọi đoạn soi trang phải đi
 * qua đây — mở trang bằng storageState rồi đóng mà không lưu sẽ làm file phiên
 * giữ cookie cũ đã bị Zalo huỷ (chính lỗi đã gặp khi soi thủ công).
 */
export async function withZaloVideoPage(
  fn,
  { sessionFile = ZALOVIDEO_SESSION_FILE, log = () => {} } = {}
) {
  if (!fs.existsSync(sessionFile)) {
    throw new Error("Chưa có phiên Zalo Video — chạy: npm run zalovideo:login");
  }
  const chromium = await getChromium();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ storageState: sessionFile });
  const page = await ctx.newPage();
  try {
    await ensureLoggedIn(page, ctx, { sessionFile, log });
    const out = await fn(page);
    await ctx.storageState({ path: sessionFile });
    return out;
  } finally {
    await browser.close();
  }
}

/**
 * Thông tin kênh Zalo Video (id, tên, avatar) — Hub dùng để tạo kênh đúng
 * tên/ảnh. Đọc từ CHÍNH response API /v2/public-api/channel mà trang Creator
 * tự gọi (đã đo: {"error":0,"data":{"id","name","avatar",...}}), không dò chữ.
 * Đồng thời là phép kiểm tra phiên còn dùng được.
 */
export async function getZaloVideoChannel({
  sessionFile = ZALOVIDEO_SESSION_FILE,
  log = () => {},
} = {}) {
  return withZaloVideoPage(
    async (page) => {
      const wait = page
        .waitForResponse((r) => /\/v\d\/public-api\/channel(\?|$)/.test(r.url()), { timeout: TIMEOUT })
        .catch(() => null);
      await page.goto(`${CREATOR_URL}/video?tab=tong-quat&type=public`, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT,
      });
      const res = await wait;
      let j = null;
      try { j = res ? await res.json() : null; } catch {}
      if (!j || j.error !== 0 || !j.data?.id) {
        throw new Error(
          `Không đọc được thông tin kênh Zalo Video (${j ? `[${j.error}] ${j.msg || ""}` : "không có phản hồi"}).`
        );
      }
      return {
        id: String(j.data.id),
        name: String(j.data.name || "Zalo Video"),
        avatar: String(j.data.avatar || ""),
      };
    },
    { sessionFile, log }
  );
}

// ---------------------------------------------------------------------------
//  NHIỀU KÊNH
//
//  Một tài khoản Zalo quản trị nhiều OA, mỗi OA có một kênh Zalo Video. Creator
//  Center chỉ làm việc với MỘT kênh "đang chọn" tại một thời điểm, lưu theo
//  PHIÊN đăng nhập (đã đo: bot chuyển sang Thái Sơn, trình duyệt của người dùng
//  cùng tài khoản vẫn ở Trường Việt Anh). Nên trước mỗi lần đăng bot chuyển
//  đúng kênh rồi kiểm lại — và kiểm lần nữa ngay trước cú bấm Đăng.
//
//  Đã đo trên trang thật:
//   - GET /v2/public-api/user/oas-by-admin -> [{id: oaId, name, avatar, channelId}]
//   - GET /v2/public-api/channel           -> kênh đang chọn {id, name, avatar}
//   - Chuyển kênh = POST /v2/public-api/user/choose-oa (oaId, cid) kèm header
//     X-CSRF-TOKEN mà trang giữ trong bộ nhớ JS -> KHÔNG gọi thẳng được. Bot
//     bấm menu như người dùng: tên kênh ở góc phải thanh trên -> menu "Kênh OA
//     đang quản lý" (chỉ liệt kê vài OA đầu) -> "Xem tất cả kênh OA" (đủ hết).
// ---------------------------------------------------------------------------

// Gọi API nội bộ của Creator Center TỪ TRONG trang (cùng origin, cookie phiên
// tự đi kèm) — đúng như chính trang gọi. Zalo luôn trả HTTP 200, lỗi nằm ở
// trường `error`. Lỗi mạng / trang đang tải lại -> {error:-1}, không ném.
async function zvApi(page, apiPath) {
  try {
    const j = await page.evaluate(async (p) => {
      try {
        const r = await fetch(p, { credentials: "include" });
        return await r.json();
      } catch (e) {
        return { error: -1, msg: String(e?.message || e) };
      }
    }, apiPath);
    return j || { error: -1, msg: "không có phản hồi" };
  } catch (e) {
    return { error: -1, msg: String(e?.message || e).split("\n")[0] };
  }
}

async function readCurrentChannel(page) {
  const j = await zvApi(page, "/v2/public-api/channel");
  if (j.error !== 0 || !j.data?.id) return null;
  return {
    id: String(j.data.id),
    name: String(j.data.name || "").trim(),
    avatar: String(j.data.avatar || ""),
  };
}

async function readManagedChannels(page) {
  const [oas, current, user] = await Promise.all([
    zvApi(page, "/v2/public-api/user/oas-by-admin"),
    readCurrentChannel(page),
    zvApi(page, "/v2/public-api/user"),
  ]);
  const channels = (oas.error === 0 && Array.isArray(oas.data) ? oas.data : [])
    .filter((o) => o?.channelId)
    .map((o) => ({
      id: String(o.channelId),
      oaId: String(o.id),
      name: String(o.name || "").trim(),
      avatar: String(o.avatar || ""),
    }));
  // Kênh đang chọn không thuộc OA nào (kênh cá nhân) vẫn đăng được — nhưng
  // không có đường chuyển về nó, nên chỉ liệt kê khi nó đang là kênh chọn.
  if (current && !channels.some((c) => c.id === current.id)) {
    channels.unshift({ ...current, oaId: null });
  }
  const u = user.error === 0 ? user.data || {} : {};
  return {
    account: { id: String(u.id || ""), name: String(u.name || ""), avatar: String(u.avatar || "") },
    current,
    channels,
  };
}

/** Mọi kênh Zalo Video mà tài khoản đang quản lý — Hub dùng để chọn kênh. */
export async function listZaloVideoChannels({
  sessionFile = ZALOVIDEO_SESSION_FILE,
  log = () => {},
} = {}) {
  return withZaloVideoPage(
    async (page) => {
      const r = await readManagedChannels(page);
      if (!r.channels.length) {
        throw new Error("Tài khoản Zalo này chưa quản lý kênh Zalo Video nào (hoặc không đọc được danh sách kênh).");
      }
      return r;
    },
    { sessionFile, log }
  );
}

/**
 * Chuyển Creator Center sang kênh `channelId` (id kênh Zalo Video, KHÔNG phải
 * id OA) rồi đọc lại để chắc chắn. Đã ở đúng kênh thì không bấm gì.
 */
export async function switchZaloVideoChannel(page, channelId, { log = () => {} } = {}) {
  const want = String(channelId);
  let cur = await readCurrentChannel(page);
  if (cur?.id === want) return cur;

  const { channels } = await readManagedChannels(page);
  const target = channels.find((c) => c.id === want);
  if (!target) {
    throw new Error(
      `Tài khoản Zalo không còn quản lý kênh Zalo Video này (id ${want}) — kiểm tra quyền quản trị OA, hoặc kết nối lại kênh trên Hub.`
    );
  }
  log(`→ Chuyển kênh: ${cur?.name || "?"} → ${target.name}`);

  const header = page.locator("header.ant-layout-header");
  const chosen = page
    .waitForResponse((r) => /\/public-api\/user\/choose-oa/.test(r.url()), { timeout: TIMEOUT })
    .catch(() => null);
  const trigger = cur?.name
    ? header.getByText(cur.name, { exact: true }).last()
    : header.locator("p.text-white").last();
  await trigger.click({ timeout: TIMEOUT });

  const pop = page.locator(".ant-popover").filter({ hasText: "Kênh OA đang quản lý" }).last();
  await pop.waitFor({ state: "visible", timeout: TIMEOUT });
  // Menu nhanh chỉ có vài OA đầu danh sách (đã thấy 2/3) — OA còn lại phải
  // mở "Xem tất cả kênh OA".
  const quick = pop.getByText(target.name, { exact: true });
  if ((await quick.count()) && (await quick.first().isVisible())) {
    await quick.first().click({ timeout: TIMEOUT });
  } else {
    await pop.getByText("Xem tất cả kênh OA", { exact: true }).click({ timeout: TIMEOUT });
    const modal = page.locator(".ant-modal-content").filter({ hasText: "Kênh OA đang quản lý" }).last();
    await modal.waitFor({ state: "visible", timeout: TIMEOUT });
    await modal.getByText(target.name, { exact: true }).first().click({ timeout: TIMEOUT });
  }

  const res = await chosen;
  let j = null;
  try { j = res ? await res.json() : null; } catch {}
  if (j && typeof j.error === "number" && j.error !== 0) {
    throw new Error(`Zalo không cho chuyển sang kênh "${target.name}": [${j.error}] ${j.msg || ""}`);
  }

  // Chọn xong trang tự tải lại — đọc lại tới khi thấy đúng kênh (tối đa 30s).
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    cur = await readCurrentChannel(page);
    if (cur?.id === want) break;
  }
  if (cur?.id !== want) {
    throw new Error(`Đã bấm chuyển sang "${target.name}" nhưng kênh đang chọn vẫn là "${cur?.name || "?"}".`);
  }
  await waitUrlSettled(page, { quietMs: 3000, log });
  log(`→ Đang ở kênh: ${cur.name}`);
  return cur;
}

/**
 * Nạp file phiên (storageState) tải lên từ MÁY CÓ MÀN HÌNH — quét QR đăng nhập
 * bắt buộc phải có màn hình, máy chủ không làm được. Cùng khuôn với GBP.
 */
export function importZaloVideoSession(state, { sessionFile = ZALOVIDEO_SESSION_FILE } = {}) {
  let obj = state;
  if (typeof state === "string") {
    try { obj = JSON.parse(state); } catch { throw new Error("File không phải JSON hợp lệ."); }
  }
  const cookies = Array.isArray(obj?.cookies) ? obj.cookies : null;
  if (!cookies || !cookies.some((c) => String(c.domain || "").includes("zalo"))) {
    throw new Error(
      "File phiên không hợp lệ (không có cookie Zalo). Phải là data/zalo-video-session.json tạo bởi `npm run zalovideo:login`."
    );
  }
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  fs.writeFileSync(sessionFile, JSON.stringify(obj), { encoding: "utf8" });
  return inspectZaloVideoSession({ sessionFile });
}

/** Kiểm tra file trước khi mở trình duyệt — hỏng sớm, đỡ tốn thời gian. */
export function validateVideo(videoPath) {
  if (!fs.existsSync(videoPath)) throw new Error(`Không thấy file: ${videoPath}`);
  if (!ALLOWED_EXT.test(videoPath)) throw new Error("Zalo Video chỉ nhận .mp4 hoặc .mov.");
  const size = fs.statSync(videoPath).size;
  if (size > MAX_BYTES) {
    throw new Error(`Video ${(size / 1024 / 1024).toFixed(1)}MB vượt trần 500MB của Zalo Video.`);
  }
  // Zalo còn đòi từ 720p trở lên, nhưng đọc độ phân giải cần ffprobe —
  // để Zalo tự từ chối và trả thông báo, thay vì thêm phụ thuộc.
  return { size };
}

/**
 * Mở hộp thoại đăng, gắn file vào, rồi DỪNG LẠI trước khi bấm đăng.
 * Dùng để chụp lại cấu trúc form thật (Zalo chỉ dựng form sau khi có file),
 * KHÔNG đăng gì lên kênh.
 * @returns {Promise<{fields:object[], buttons:string[], screenshot:string}>}
 */
export async function inspectUploadForm({
  videoPath,
  sessionFile = ZALOVIDEO_SESSION_FILE,
  log = console.log,
} = {}) {
  validateVideo(videoPath);
  if (!fs.existsSync(sessionFile)) {
    throw new Error("Chưa có phiên Zalo Video — chạy: npm run zalovideo:login");
  }

  const chromium = await getChromium();
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ storageState: sessionFile });
  const page = await ctx.newPage();

  try {
    await ensureLoggedIn(page, ctx, { sessionFile, log });

    log("→ Mở hộp thoại Đăng video...");
    await page.getByRole("button", { name: "Đăng video" }).first().click({ timeout: TIMEOUT });
    await page.waitForSelector(FILE_INPUT, { state: "attached", timeout: TIMEOUT });

    log("→ Gắn file:", videoPath);
    await page.setInputFiles(FILE_INPUT, videoPath);

    // Zalo chỉ dựng form nhập tiêu đề/mô tả SAU KHI tải lên xong. File to
    // (vài trăm MB) mất vài phút, nên DÒ cho tới khi có ô nhập hiện ra thay vì
    // chờ một khoảng cố định rồi chụp phải màn hình đang tải dở.
    log("→ Đang tải lên, chờ form hiện ra (tối đa 10 phút)...");
    const deadline = Date.now() + 10 * 60_000;
    let formReady = false;
    while (Date.now() < deadline) {
      formReady = await page.evaluate(() =>
        [...document.querySelectorAll("input[type=text], textarea, [contenteditable=true]")]
          .some((e) => e.offsetParent !== null)
      );
      if (formReady) break;
      await page.waitForTimeout(3000);
      const pct = Math.round((Date.now() - (deadline - 10 * 60_000)) / 1000);
      if (pct % 30 === 0) log(`   ...đã chờ ${pct}s`);
    }
    if (!formReady) {
      log("⚠️  Hết 10 phút chưa thấy form — vẫn chụp lại màn hình hiện tại để xem kẹt ở đâu.");
    } else {
      log("→ Form đã hiện, chờ thêm 3s cho render xong.");
      await page.waitForTimeout(3000);
    }

    const dump = await page.evaluate(() => {
      const vis = (e) => e.offsetParent !== null;
      return {
        fields: [...document.querySelectorAll("input, textarea, [contenteditable=true]")]
          .filter(vis)
          .map((e) => ({
            tag: e.tagName.toLowerCase(),
            type: e.getAttribute("type") || "",
            name: e.getAttribute("name") || "",
            id: e.id || "",
            placeholder: e.getAttribute("placeholder") || "",
            maxlength: e.getAttribute("maxlength") || "",
          })),
        buttons: [...document.querySelectorAll("button, [role=button]")]
          .filter(vis)
          .map((b) => (b.innerText || "").trim())
          .filter(Boolean),
        text: document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 2500),
      };
    });

    const shot = dataPath("output", `zalovideo-form-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    log("📸 Đã chụp form:", shot);
    log("⏸  KHÔNG bấm đăng — cửa sổ để mở 30 giây cho bạn xem, rồi tự đóng.");
    await page.waitForTimeout(30_000);

    return { ...dump, screenshot: shot };
  } finally {
    await browser.close();
  }
}

// Form đăng (dựng SAU khi tải file xong) gồm:
//   - "Nội dung video": textarea, tối đa 4000 ký tự. KHÔNG có ô tiêu đề riêng.
//   - "Hẹn giờ đăng video": input "Chọn thời điểm" (tuỳ chọn, chưa dùng).
//   - "Chọn ảnh bìa": dải khung hình, Zalo TỰ CHỌN SẴN khung đầu.
//   - "Gắn nhãn video" / "Thêm vào danh sách phát": tuỳ chọn, chưa dùng.
//   - "Nội dung do AI tạo": công tắc, mặc định tắt.
//   - Nút "Đăng video" màu xanh ở cuối form.
// Ô "Nội dung video" là DIV contenteditable (class "input-conteneditable"),
// KHÔNG phải <textarea>, và KHÔNG có thuộc tính placeholder — chữ gợi ý vẽ
// bằng CSS. Bản cũ chọn textarea[placeholder…] nên khớp 0 phần tử và chờ
// tới hết giờ dù form đã hiện (đã đo trên DOM thật). Dấu hiệu ổn định nhất
// là maxlength="4000" — khớp đúng bộ đếm "0 / 4000" trên màn hình.
const DESC_SELECTOR =
  '[contenteditable="true"][maxlength="4000"], div.input-conteneditable[contenteditable="true"]';

// Khối form chứa nhãn `label` = thẻ CHA của nhãn (đã đo trên form thật: nhãn
// "Thêm vào danh sách phát" / "Nội dung do AI tạo" là một div chữ, nút nằm
// cạnh nó trong cùng thẻ cha). Bản trước dùng div.filter({has}).last() — bộ
// lọc khớp luôn CHÍNH thẻ nhãn nên .last() trỏ vào nhãn, tìm nút mãi không ra
// (chạy thử trên máy chủ: hết 60s ở bước danh sách phát).
const formSection = (page, label) =>
  page.getByText(label, { exact: true }).first().locator("xpath=..");

/**
 * Chọn ẢNH BÌA = khung hình tại giây `seconds`.
 *
 * Đã đo trên form thật: "Chọn ảnh bìa" là một dải khung hình + ô chọn kéo được
 * (.cursor-grab, rộng 62px). Bấm vào điểm nào trên dải thì ô chọn nhảy tới đó
 * và thẻ <video> ẩn trong khối tua tới giây = (vị trí bấm / bề rộng) × thời
 * lượng — đó là khung dùng làm ảnh bìa. Bấm TRÚNG ô chọn thì không có gì xảy
 * ra, nên trước tiên "đẩy" ô chọn sang đầu bên kia của dải rồi mới bấm đích.
 * Lúc mới mở form, currentTime của video ẩn còn là rác từ lúc Zalo cắt dải
 * khung (đo được 8.75s trong khi ô chọn ở 0) — chỉ tin nó SAU khi đã bấm.
 */
async function pickCover(page, seconds, log) {
  const info = () =>
    page.evaluate(() => {
      const label = [...document.querySelectorAll("div")].find(
        (e) => e.childElementCount === 0 && e.textContent.trim() === "Chọn ảnh bìa"
      );
      const sec = label?.parentElement;
      const video = sec?.querySelector("video");
      const handle = sec?.querySelector(".cursor-grab");
      const strip = handle?.parentElement;
      if (!video || !strip) return null;
      const r = strip.getBoundingClientRect();
      const imgs = [...(handle.previousElementSibling?.querySelectorAll("img") || [])];
      return {
        dur: video.duration,
        t: video.currentTime,
        seeking: video.seeking,
        frames: imgs.length,
        framesReady: imgs.length > 0 && imgs.every((m) => m.complete && m.naturalWidth > 0),
        x: r.x, y: r.y, w: r.width, h: r.height,
      };
    });

  await page.getByText("Chọn ảnh bìa", { exact: true }).scrollIntoViewIfNeeded().catch(() => {});

  // Gắn file xong, Zalo tua video ẩn qua từng mốc để cắt dải khung hình (đo
  // được: 8 mốc, video 10s mất ~1s; video lớn trên máy chủ lâu hơn nhiều). Bấm
  // lúc đó thì bị tua đè — lần chạy thử đầu muốn 3.0s mà ra 7.3s. Chờ đủ ảnh
  // khung + video đứng yên ≥1.5s rồi mới bấm. Lớp skeleton của Zalo nằm dưới
  // dải ảnh và KHÔNG bao giờ ẩn, không dùng làm dấu hiệu được.
  let i = null;
  let lastT = null;
  let stable = 0;
  const readyBy = Date.now() + 90_000;
  while (Date.now() < readyBy) {
    i = await info().catch(() => null);
    const ok = i && Number.isFinite(i.dur) && i.dur > 0 && i.w > 0 && i.framesReady && !i.seeking;
    stable = ok && i.t === lastT ? stable + 1 : 0;
    lastT = i?.t ?? null;
    if (stable >= 3) break;
    await page.waitForTimeout(500);
  }
  if (!i || !(i.dur > 0) || !(i.w > 0)) {
    throw new Error("Không tìm thấy dải chọn ảnh bìa trên form Zalo — dừng, KHÔNG bấm Đăng.");
  }
  if (stable < 3) {
    throw new Error("Zalo chưa cắt xong dải khung ảnh bìa sau 90 giây — dừng, KHÔNG bấm Đăng.");
  }

  const want = Math.min(Math.max(Number(seconds) || 0, 0), i.dur);
  const f = want / i.dur;
  const y = i.y + i.h / 2;
  const xAt = (frac) => i.x + Math.min(Math.max(frac, 0.005), 0.995) * i.w;
  const tol = Math.max(0.3, i.dur * 0.02);
  let after = null;
  // Thử tay trên Chrome: đôi khi vài cú bấm đầu bị dải bỏ qua (ô chọn đứng
  // yên), bấm lại thì ăn — nên thử tối đa 4 lượt, lượt nào cũng đọc lại giây.
  // Rê chuột tới trước và giữ nút ~60ms như người bấm thật.
  const press = async (x) => {
    await page.mouse.move(x, y, { steps: 4 });
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
  };
  for (let attempt = 1; attempt <= 4; attempt++) {
    // Đẩy ô chọn ra xa điểm đích, rồi bấm đích.
    await press(xAt(f < 0.5 ? 0.97 : 0.03));
    await page.waitForTimeout(600);
    await press(xAt(f));
    await page.waitForTimeout(900);
    after = await info().catch(() => null);
    if (after && !after.seeking && Math.abs(after.t - want) <= tol) break;
    log(`   ...ảnh bìa lần ${attempt} ra ${after ? after.t.toFixed(1) : "?"}s, thử lại`);
    after = null;
    await page.waitForTimeout(1500);
  }
  if (!after) {
    const now = await info().catch(() => null);
    throw new Error(
      `Chọn ảnh bìa lệch: muốn ${want.toFixed(1)}s, Zalo đang ở ${now ? now.t.toFixed(1) : "?"}s — dừng, KHÔNG bấm Đăng.`
    );
  }
  log(`→ Ảnh bìa: khung ${after.t.toFixed(1)}s / ${i.dur.toFixed(1)}s`);
  return after.t;
}

/**
 * Thêm video vào DANH SÁCH PHÁT tên `name`. Có sẵn thì chọn, chưa có thì tạo
 * (hộp "Tạo danh sách phát": tên 3–40 ký tự, quyền riêng tư mặc định Công khai).
 * dryRun: không tạo gì trên kênh — chỉ báo sẽ tạo.
 */
async function pickPlaylist(page, name, { dryRun, log }) {
  const want = String(name).trim();
  const section = formSection(page, "Thêm vào danh sách phát");
  const isChosen = async () => {
    // Đã chọn thì tên danh sách hiện NGAY trong khối (ngoài menu thả xuống).
    const txt = await section.innerText().catch(() => "");
    return txt.split("\n").some((l) => l.trim() === want);
  };
  if (await isChosen()) return;

  const openMenu = async () => {
    await section.getByRole("button").filter({ hasText: /^\s*\+?\s*Thêm\s*$/ }).first().click({ timeout: TIMEOUT });
    const menu = page.locator(".ant-dropdown:not(.ant-dropdown-hidden)").last();
    await menu.waitFor({ state: "visible", timeout: TIMEOUT });
    return menu;
  };

  let menu = await openMenu();
  const existing = menu.getByText(want, { exact: true });
  if (await existing.count()) {
    await existing.first().click({ timeout: TIMEOUT });
  } else if (dryRun) {
    log(`🧪 DRY RUN: chưa có danh sách phát "${want}" — lúc đăng thật sẽ tạo mới.`);
    await page.keyboard.press("Escape");
    return;
  } else {
    log(`→ Tạo danh sách phát mới: ${want}`);
    await menu.getByText("Tạo danh sách phát", { exact: true }).click({ timeout: TIMEOUT });
    const modal = page.locator(".ant-modal-content").filter({ hasText: "Tạo danh sách phát" }).last();
    await modal.waitFor({ state: "visible", timeout: TIMEOUT });
    await modal.locator('input[placeholder="Nhập tên danh sách phát"]').fill(want);
    const created = page
      .waitForResponse((r) => /playlist/i.test(r.url()) && r.request().method() !== "GET", { timeout: TIMEOUT })
      .catch(() => null);
    await modal.getByRole("button", { name: "Tạo", exact: true }).click({ timeout: TIMEOUT });
    const res = await created;
    let j = null;
    try { j = res ? await res.json() : null; } catch {}
    if (j && typeof j.error === "number" && j.error !== 0) {
      throw new Error(`Zalo không tạo được danh sách phát "${want}": [${j.error}] ${j.msg || ""}`);
    }
    await modal.waitFor({ state: "hidden", timeout: TIMEOUT }).catch(() => {});
    await page.waitForTimeout(800);
    // Tạo xong có thể Zalo đã tự chọn luôn; chưa thì mở menu chọn lại.
    if (!(await isChosen())) {
      menu = await openMenu();
      await menu.getByText(want, { exact: true }).first().click({ timeout: TIMEOUT });
    }
  }
  await page.waitForTimeout(500);
  if (!(await isChosen())) {
    throw new Error(`Không chọn được danh sách phát "${want}" trên form Zalo — dừng, KHÔNG bấm Đăng.`);
  }
  log(`→ Danh sách phát: ${want}`);
}

/** Công tắc "Nội dung do AI tạo" (mặc định tắt). */
async function setAiLabel(page, on, log) {
  const sw = formSection(page, "Nội dung do AI tạo").locator('button.ant-switch, [role="switch"]').first();
  const read = async () => (await sw.getAttribute("aria-checked")) === "true";
  if ((await read()) !== on) await sw.click({ timeout: TIMEOUT });
  await page.waitForTimeout(300);
  if ((await read()) !== on) {
    throw new Error("Không gạt được công tắc 'Nội dung do AI tạo' — dừng, KHÔNG bấm Đăng.");
  }
  log(`→ Nội dung do AI tạo: ${on ? "bật" : "tắt"}`);
}

/**
 * Đăng 1 video lên Zalo Video.
 *
 * ⚠️ ĐĂNG THẬT LÊN KÊNH. Không có bước xác nhận nào nữa sau khi gọi hàm này.
 *
 * @param {object} o
 * @param {string} o.videoPath    — đường dẫn file .mp4/.mov, ≤500MB
 * @param {string} o.description  — nội dung video (≤4000 ký tự)
 * @param {string} [o.channelId]  — id kênh Zalo Video cần đăng; bỏ trống = kênh đang chọn
 * @param {number} [o.coverTime]  — giây lấy khung làm ảnh bìa; bỏ trống = khung đầu (mặc định Zalo)
 * @param {string} [o.playlist]   — tên danh sách phát; chưa có thì tạo
 * @param {boolean} [o.aiGenerated] — bật nhãn "Nội dung do AI tạo"
 * @param {boolean} [o.headless]  — false để xem tận mắt lần chạy đầu
 * @returns {Promise<{ok:boolean, url:string}>}
 */
export async function postToZaloVideo({
  videoPath,
  description = "",
  channelId = "",
  coverTime = null,
  playlist = "",
  aiGenerated = false,
  sessionFile = ZALOVIDEO_SESSION_FILE,
  headless = true,
  // dryRun: chạy trọn luồng nhưng DỪNG ngay trước cú bấm Đăng — để kiểm tra
  // an toàn bằng video thử mà không đăng gì lên kênh.
  dryRun = false,
  log = console.log,
} = {}) {
  validateVideo(videoPath);
  if (!fs.existsSync(sessionFile)) {
    throw new Error("Chưa có phiên Zalo Video — chạy: npm run zalovideo:login");
  }

  const chromium = await getChromium();
  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ storageState: sessionFile });
  const page = await ctx.newPage();

  const shoot = async (tag) => {
    const p = dataPath("output", `zalovideo-${tag}-${Date.now()}.png`);
    try { await page.screenshot({ path: p, fullPage: true }); log("📸", p); } catch {}
    return p;
  };

  try {
    await ensureLoggedIn(page, ctx, { sessionFile, log });
    if (channelId) {
      await switchZaloVideoChannel(page, channelId, { log });
      // Chuyển kênh làm cookie xoay vòng — lưu ngay, lỡ bước sau hỏng.
      await ctx.storageState({ path: sessionFile });
    }

    log("→ Mở hộp thoại Đăng video...");
    // KHÔNG dùng exact: tên truy cập của nút không khớp tuyệt đối "Đăng video"
    // (đã đo: exact -> 0 nút, không exact -> 1 nút) nên exact làm bấm trượt.
    await page.getByRole("button", { name: "Đăng video" }).first().click({ timeout: TIMEOUT });
    await page.waitForSelector(FILE_INPUT, { state: "attached", timeout: TIMEOUT });

    log("→ Gắn file:", videoPath);
    await page.setInputFiles(FILE_INPUT, videoPath);

    log("→ Đang tải lên, chờ form hiện ra (tối đa 15 phút)...");
    await page.waitForSelector(DESC_SELECTOR, { state: "visible", timeout: 15 * 60_000 });
    await page.waitForTimeout(3000);

    const desc = String(description || "").slice(0, 4000);
    if (desc) {
      log("→ Điền nội dung:", desc.slice(0, 60) + (desc.length > 60 ? "..." : ""));
      // contenteditable của React: bấm vào rồi insertText (bắn đủ sự kiện
      // beforeinput/input như dán chữ) chắc hơn fill().
      const box = page.locator(DESC_SELECTOR).first();
      await box.click();
      await page.keyboard.insertText(desc);
      // Kiểm tra lại: chữ phải thật sự nằm trong ô rồi mới được đi tiếp.
      const typed = (await box.innerText()).replace(/\s+/g, " ").trim();
      const want = desc.replace(/\s+/g, " ").trim().slice(0, 30);
      if (!typed.includes(want)) {
        throw new Error(
          `Không điền được nội dung vào ô (đọc lại được: "${typed.slice(0, 60)}") — dừng, KHÔNG bấm Đăng.`
        );
      }
    }

    // Tuỳ chọn của form. Mỗi bước tự kiểm lại và NÉM LỖI nếu không làm được —
    // thà không đăng còn hơn đăng thiếu cái người dùng đã chọn.
    if (coverTime !== null && coverTime !== undefined && coverTime !== "") {
      await pickCover(page, Number(coverTime), log);
    }
    if (String(playlist || "").trim()) {
      await pickPlaylist(page, playlist, { dryRun, log });
    }
    if (aiGenerated) {
      await setAiLabel(page, true, log);
    }

    // CÓ HAI nút tên "Đăng video": một ở thanh điều hướng trái (mở hộp thoại)
    // và một màu xanh ở cuối form (đăng thật). Nút ở nav đứng TRƯỚC trong DOM,
    // nên .last() là nút đăng. Bấm nhầm nút nav chỉ mở lại hộp thoại và mất bài.
    const publish = page.getByRole("button", { name: "Đăng video" }).last();
    await publish.scrollIntoViewIfNeeded();
    // Chốt chặn: nút đăng thật PHẢI nằm DƯỚI ô nội dung. Nếu bộ chọn lỡ trỏ vào
    // nút ở thanh menu trái (nằm TRÊN), dừng hẳn thay vì bấm nhầm.
    const [descBox, pubBox] = await Promise.all([
      page.locator(DESC_SELECTOR).boundingBox(),
      publish.boundingBox(),
    ]);
    if (!descBox || !pubBox || pubBox.y <= descBox.y) {
      throw new Error(
        "Không xác định chắc được nút Đăng của form (vị trí bất thường) — dừng để không bấm nhầm."
      );
    }
    // Kiểm lần cuối: đăng nhầm kênh thì không gỡ lặng lẽ được — thà dừng.
    if (channelId) {
      const cur = await readCurrentChannel(page);
      if (cur?.id !== String(channelId)) {
        throw new Error(
          `Kênh đang chọn bị đổi giữa chừng (giờ là "${cur?.name || "?"}") — dừng, KHÔNG bấm Đăng.`
        );
      }
    }
    if (dryRun) {
      log("🧪 DRY RUN: mọi bước đều ổn — dừng tại đây, KHÔNG bấm Đăng.");
      return { ok: true, dryRun: true, url: page.url() };
    }
    // Theo dõi request THẬT tới Zalo (bỏ analytics/giám sát lỗi). Việc tải
    // video lên CHỈ bắt đầu khi bấm Đăng — đã đo: chọn file xong không có
    // request tải lên nào, xem trước chỉ đọc blob: trên máy.
    const NOISE = /google-analytics|googletagmanager|doubleclick|sentry|\/collect\b|^blob:|^data:/i;
    const inflight = new Map();
    const netLog = [];
    let lastActivity = Date.now();
    let started = 0;
    const tag = (q) => `${q.method()} ${q.url().split("?")[0].slice(0, 90)}`;
    page.on("request", (q) => {
      if (NOISE.test(q.url()) || q.method() === "GET") return;
      inflight.set(q, Date.now());
      started++;
      lastActivity = Date.now();
      log("   ↑ bắt đầu:", tag(q));
    });
    const onEnd = (ok) => async (q) => {
      if (!inflight.has(q)) return;
      const secs = Math.round((Date.now() - inflight.get(q)) / 1000);
      inflight.delete(q);
      lastActivity = Date.now();
      let st = "";
      try { st = String((await q.response())?.status() ?? ""); } catch {}
      const line = `${ok ? "xong" : "HỎNG"} ${st} (${secs}s) ${tag(q)}${ok ? "" : " — " + (q.failure()?.errorText || "")}`;
      netLog.push(line);
      log("   ↓", line);
    };
    page.on("requestfinished", onEnd(true));

    // Zalo LUÔN trả HTTP 200, lỗi thật nằm trong trường "error" của JSON
    // (đo được: video/list -> {"error":-404}, ekyc-c06 -> {"error":-142}).
    // Chỉ xem mã HTTP là tin nhầm — phải đọc nội dung.
    const apiErrors = [];
    const apiReplies = [];
    page.on("response", async (res) => {
      const u = res.url();
      if (!/video\.zalo\.me\/(upload-api|v\d\/public-api)\//.test(u)) return;
      if (res.request().method() === "GET") return;
      let body = "";
      try { body = await res.text(); } catch { return; }
      const short = body.replace(/\s+/g, " ").replace(/[A-Za-z0-9_\-]{40,}/g, "<long>").slice(0, 300);
      const path = u.split("?")[0].replace("https://video.zalo.me", "");
      apiReplies.push(`${path} -> ${short}`);
      try {
        const j = JSON.parse(body);
        if (j && typeof j.error === "number" && j.error !== 0) {
          apiErrors.push(`${path}: [${j.error}] ${j.msg || j.message || ""}`);
        }
      } catch {}
    });
    // Thông báo nổi (toast) Zalo hiện sau khi bấm Đăng — thường chứa lý do từ chối.
    const toasts = new Set();
    const toastTimer = setInterval(async () => {
      try {
        const t = await page.evaluate(() =>
          [...document.querySelectorAll(".ant-message, .ant-notification, [role=alert]")]
            .map((e) => (e.innerText || "").trim()).filter(Boolean));
        t.forEach((x) => toasts.add(x.replace(/\s+/g, " ").slice(0, 200)));
      } catch {}
    }, 700);
    // unref: lỗi xảy ra trước clearInterval thì bộ đếm này không được giữ
    // tiến trình sống — nếu không script sẽ treo mãi sau khi báo lỗi.
    toastTimer.unref?.();
    page.on("requestfailed", onEnd(false));

    log("→ Bấm ĐĂNG...");
    await publish.click({ timeout: TIMEOUT });

    // KHÔNG coi "form đóng" là xong: bản cũ làm vậy rồi đóng trình duyệt ngay
    // trong khi video mới BẮT ĐẦU tải lên -> tải bị cắt ngang, kênh không có
    // video nào dù script báo ✅. Giờ chờ tới khi mọi request thật đã xong và
    // mạng đứng yên 20 giây (tối đa 20 phút cho file lớn).
    log("→ Chờ Zalo tải video lên xong (đừng đóng cửa sổ)...");
    const QUIET = 20_000;
    const HARD = Date.now() + 20 * 60_000;
    let lastReport = 0;
    while (Date.now() < HARD) {
      const idle = inflight.size === 0 && Date.now() - lastActivity >= QUIET;
      if (idle && started > 0) break;
      if (Date.now() - lastReport > 30_000) {
        lastReport = Date.now();
        log(`   ...đang chờ: ${inflight.size} request chưa xong, ${started} đã bắt đầu`);
      }
      await page.waitForTimeout(1000);
    }
    if (started === 0) {
      await shoot("khong-co-request");
      throw new Error("Đã bấm Đăng nhưng Zalo không gửi request nào — xem ảnh chụp.");
    }
    if (inflight.size > 0) {
      await shoot("tai-len-qua-lau");
      throw new Error(`Quá 20 phút vẫn còn ${inflight.size} request tải lên chưa xong.`);
    }
    const failed = netLog.filter((l) => l.startsWith("HỎNG") || / [45]\d\d /.test(l));
    if (failed.length) {
      await shoot("request-hong");
      throw new Error("Có request tới Zalo bị lỗi khi đăng: " + failed.join(" | "));
    }

    clearInterval(toastTimer);
    for (const line of apiReplies) log("   ⇠", line);
    if (toasts.size) log("   💬 Zalo báo:", [...toasts].join(" | "));
    if (apiErrors.length) {
      await shoot("zalo-tu-choi");
      throw new Error(
        "Zalo từ chối (HTTP 200 nhưng error ≠ 0): " + apiErrors.join(" | ") +
        (toasts.size ? " — thông báo: " + [...toasts].join(" | ") : "")
      );
    }

    // Kiểm chứng bằng chính API danh sách của Zalo, KHÔNG dò chữ trên giao
    // diện (cách cũ báo sai khi bảng chưa tải xong).
    log("→ Kiểm tra qua API danh sách video của kênh...");
    // TỪ ĐÂY Zalo đã tạo bài KHÔNG lỗi. Mọi trục trặc ở bước kiểm chứng (trang
    // tải quá giờ...) KHÔNG được biến thành "thất bại": Hub sẽ thử lại và video
    // bị đăng TRÙNG. Lỗi kiểm chứng chỉ dẫn tới trạng thái "chờ xác minh".
    let listJson = null;
    try {
    for (let attempt = 1; attempt <= 3 && !listJson?.data; attempt++) {
      const wait = page.waitForResponse((r) => /\/v\d\/public-api\/video\/list/.test(r.url()), { timeout: 60_000 }).catch(() => null);
      await page.goto(`${CREATOR_URL}/video?tab=tong-quat&type=public`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
      const res = await wait;
      try { listJson = res ? await res.json() : null; } catch { listJson = null; }
      log(`   video/list lần ${attempt}:`, JSON.stringify(listJson).slice(0, 200));
      if (!listJson?.data) await page.waitForTimeout(20_000);
    }
    } catch (e) {
      log("   (kiểm chứng gặp trục trặc, không ảnh hưởng bài đã tạo):", String(e?.message || e).split("\n")[0]);
      listJson = null;
    }
    // Mới chỉ thấy phản hồi lúc TRỐNG ({"error":-404}); chưa biết lúc có video
    // Zalo bọc danh sách dưới tên trường nào -> tìm mảng khác rỗng đầu tiên
    // trong data, không đoán cứng tên trường.
    const firstArray = (v, depth = 0) => {
      if (Array.isArray(v)) return v;
      if (!v || typeof v !== "object" || depth > 3) return null;
      for (const k of Object.keys(v)) {
        const a = firstArray(v[k], depth + 1);
        if (a && a.length) return a;
      }
      return null;
    };
    const items = listJson?.error === 0 ? firstArray(listJson.data) || [] : [];
    if (!items.length) {
      await shoot("chua-thay-video");
      log("⚠️  Zalo đã NHẬN file (tải lên 200) nhưng API danh sách chưa có video — có thể đang xử lý/kiểm duyệt, hoặc bị giữ lại. Xem các dòng ⇠ phía trên.");
      return { ok: false, pending: true, netLog, apiReplies, toasts: [...toasts] };
    }
    log(`✅ Đã đăng — API danh sách có ${items.length} video.`);
    return { ok: true, count: items.length, url: page.url(), netLog, apiReplies };
  } catch (e) {
    await shoot("loi");
    throw e;
  } finally {
    await browser.close();
  }
}
