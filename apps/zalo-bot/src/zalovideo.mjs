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
    await page.goto(CREATOR_URL, { timeout: TIMEOUT, waitUntil: "domcontentloaded" });
    // Phiên hết hạn -> Zalo đá về /creator/register
    if (/\/creator\/register/.test(page.url())) {
      throw new Error("Phiên đã hết hạn — chạy lại: npm run zalovideo:login");
    }

    log("→ Mở hộp thoại Đăng video...");
    await page.getByRole("button", { name: "Đăng video" }).first().click({ timeout: TIMEOUT });
    await page.waitForSelector(FILE_INPUT, { state: "attached", timeout: TIMEOUT });

    log("→ Gắn file:", videoPath);
    await page.setInputFiles(FILE_INPUT, videoPath);

    // Zalo cần thời gian tải lên + dựng form nhập tiêu đề/mô tả.
    log("→ Đang tải lên, chờ form hiện ra (tối đa 3 phút)...");
    await page.waitForTimeout(15_000);

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

/**
 * Đăng 1 video lên Zalo Video.
 *
 * ⚠️ CHƯA HOÀN THIỆN: Zalo chỉ dựng form nhập tiêu đề/mô tả SAU KHI file được
 * tải lên xong, nên không thể biết trước tên trường và nút bấm nếu chưa chạy
 * thật một lần. Chạy `npm run zalovideo:inspect -- <file.mp4>` để lấy cấu trúc
 * form thật, rồi điền nốt phần dưới đây. Cố đoán selector ở bước này chỉ dẫn
 * tới việc bấm nhầm nút và đăng bừa lên kênh thật.
 */
export async function postToZaloVideo() {
  throw new Error(
    "Chưa cài đặt xong bước điền form + bấm đăng. Chạy `npm run zalovideo:inspect -- <file.mp4>` " +
    "để lấy cấu trúc form thật rồi hoàn thiện postToZaloVideo()."
  );
}
