// zalovideo-check.mjs — Kiểm tra phiên Zalo Video còn sống, tự đăng nhập lại
// bằng tài khoản Zalo đã lưu nếu cần, rồi lưu cookie mới. KHÔNG đăng gì.
//
//   npm run zalovideo:check
import { checkZaloVideoSession } from "../src/zalovideo.mjs";

checkZaloVideoSession()
  .then((r) => console.log("✅ Phiên dùng được:", r.url))
  .catch((e) => { console.error("❌", e.message); process.exit(1); });
