// zalovideo-inspect.mjs — Gắn 1 video vào hộp thoại đăng rồi DỪNG trước khi bấm đăng,
// để lấy cấu trúc form thật (Zalo chỉ dựng form sau khi tải file lên xong).
// KHÔNG đăng gì lên kênh.
//
//   npm run zalovideo:inspect -- duong/dan/video.mp4
import { inspectUploadForm } from "../src/zalovideo.mjs";

const videoPath = process.argv[2];
if (!videoPath) {
  console.error("Thiếu đường dẫn video.\n  npm run zalovideo:inspect -- duong/dan/video.mp4");
  process.exit(1);
}

inspectUploadForm({ videoPath })
  .then((r) => {
    console.log("\n===== TRƯỜNG NHẬP =====");
    console.log(JSON.stringify(r.fields, null, 1));
    console.log("\n===== NÚT =====");
    console.log(JSON.stringify(r.buttons, null, 1));
    console.log("\n===== CHỮ TRÊN MÀN HÌNH =====");
    console.log(r.text);
    console.log("\nẢnh chụp:", r.screenshot);
  })
  .catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
