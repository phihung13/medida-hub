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
const DESC_SELECTOR = 'textarea[placeholder*="Nhập nội dung mô tả"]';

/**
 * Đăng 1 video lên Zalo Video.
 *
 * ⚠️ ĐĂNG THẬT LÊN KÊNH. Không có bước xác nhận nào nữa sau khi gọi hàm này.
 *
 * @param {object} o
 * @param {string} o.videoPath    — đường dẫn file .mp4/.mov, ≤500MB
 * @param {string} o.description  — nội dung video (≤4000 ký tự)
 * @param {boolean} [o.headless]  — false để xem tận mắt lần chạy đầu
 * @returns {Promise<{ok:boolean, url:string}>}
 */
export async function postToZaloVideo({
  videoPath,
  description = "",
  sessionFile = ZALOVIDEO_SESSION_FILE,
  headless = true,
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

    log("→ Mở hộp thoại Đăng video...");
    await page.getByRole("button", { name: "Đăng video", exact: true }).first().click({ timeout: TIMEOUT });
    await page.waitForSelector(FILE_INPUT, { state: "attached", timeout: TIMEOUT });

    log("→ Gắn file:", videoPath);
    await page.setInputFiles(FILE_INPUT, videoPath);

    log("→ Đang tải lên, chờ form hiện ra (tối đa 15 phút)...");
    await page.waitForSelector(DESC_SELECTOR, { state: "visible", timeout: 15 * 60_000 });
    await page.waitForTimeout(3000);

    const desc = String(description || "").slice(0, 4000);
    if (desc) {
      log("→ Điền nội dung:", desc.slice(0, 60) + (desc.length > 60 ? "..." : ""));
      await page.fill(DESC_SELECTOR, desc);
    }

    // CÓ HAI nút tên "Đăng video": một ở thanh điều hướng trái (mở hộp thoại)
    // và một màu xanh ở cuối form (đăng thật). Nút ở nav đứng TRƯỚC trong DOM,
    // nên .last() là nút đăng. Bấm nhầm nút nav chỉ mở lại hộp thoại và mất bài.
    const publish = page.getByRole("button", { name: "Đăng video", exact: true }).last();
    await publish.scrollIntoViewIfNeeded();
    log("→ Bấm ĐĂNG...");
    await publish.click({ timeout: TIMEOUT });

    // Đăng xong Zalo gỡ form đi (quay về danh sách nội dung).
    try {
      await page.waitForSelector(DESC_SELECTOR, { state: "detached", timeout: 120_000 });
      log("✅ Đã đăng.");
    } catch {
      await shoot("sau-khi-bam-dang");
      throw new Error(
        "Đã bấm Đăng nhưng form không đóng sau 2 phút — xem ảnh chụp để biết Zalo báo gì (có thể vướng kiểm duyệt hoặc thiếu trường bắt buộc)."
      );
    }

    return { ok: true, url: page.url() };
  } catch (e) {
    await shoot("loi");
    throw e;
  } finally {
    await browser.close();
  }
}
