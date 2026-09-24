// zalovideo-channels.mjs — Liệt kê các kênh Zalo Video mà tài khoản đang quản lý.
//
//   npm run zalovideo:channels
//
// Chỉ đọc, không đăng gì. Id in ra dùng cho --channel=<id> của zalovideo:post.
import { listZaloVideoChannels } from "../src/zalovideo.mjs";

listZaloVideoChannels({ log: console.log })
  .then(({ account, current, channels }) => {
    console.log(`\nTài khoản: ${account.name || "?"}`);
    for (const c of channels) {
      console.log(`${c.id === current?.id ? "▶" : " "} ${c.id}  ${c.name}${c.oaId ? `  (OA ${c.oaId})` : ""}`);
    }
  })
  .catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
