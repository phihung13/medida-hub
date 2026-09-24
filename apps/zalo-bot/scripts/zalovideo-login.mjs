// zalovideo-login.mjs — Chạy 1 LẦN để đăng nhập Zalo và lưu phiên cho Zalo Video.
// Dùng trên máy CÓ màn hình. VPS: chạy ở máy local rồi copy data/zalo-video-session.json lên.
//
//   npm run zalovideo:login
//
// Sau khi chạy: data/zalo-video-session.json được tạo.
import { loginZaloVideo } from "../src/zalovideo.mjs";

loginZaloVideo().catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
