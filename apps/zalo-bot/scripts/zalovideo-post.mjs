// zalovideo-post.mjs — ĐĂNG THẬT một video lên Zalo Video.
//
//   npm run zalovideo:post -- "D:\duong\dan\video.mp4" "Nội dung mô tả"
//
// Thêm --show để xem tận mắt trình duyệt làm gì (khuyên dùng cho lần đầu).
import { postToZaloVideo } from "../src/zalovideo.mjs";

const args = process.argv.slice(2);
const headless = !args.includes("--show");
const rest = args.filter((a) => a !== "--show");
const [videoPath, description = ""] = rest;

if (!videoPath) {
  console.error('Thiếu đường dẫn video.\n  npm run zalovideo:post -- "video.mp4" "mô tả" [--show]');
  process.exit(1);
}

console.log("⚠️  Lệnh này ĐĂNG THẬT lên kênh Zalo Video. Ctrl+C trong 5 giây nếu muốn dừng.");
await new Promise((r) => setTimeout(r, 5000));

postToZaloVideo({ videoPath, description, headless })
  .then((r) => console.log("Xong:", r))
  .catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
