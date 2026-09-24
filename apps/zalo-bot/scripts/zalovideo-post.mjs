// zalovideo-post.mjs — ĐĂNG THẬT một video lên Zalo Video.
//
//   npm run zalovideo:post -- "D:\duong\dan\video.mp4" "Nội dung mô tả"
//
// Tuỳ chọn:
//   --show               xem tận mắt trình duyệt làm gì (khuyên dùng lần đầu)
//   --dry-run            chạy trọn luồng nhưng KHÔNG bấm Đăng (không tạo danh sách phát)
//   --channel=<id>       id kênh Zalo Video (xem: npm run zalovideo:channels)
//   --cover=<giây>       lấy khung tại giây này làm ảnh bìa
//   --playlist=<tên>     thêm vào danh sách phát (chưa có thì tạo)
//   --ai                 bật nhãn "Nội dung do AI tạo"
import { postToZaloVideo } from "../src/zalovideo.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
};
const headless = !flag("show");
const dryRun = flag("dry-run");
const rest = args.filter((a) => !a.startsWith("--"));
const [videoPath, description = ""] = rest;

if (!videoPath) {
  console.error(
    'Thiếu đường dẫn video.\n  npm run zalovideo:post -- "video.mp4" "mô tả" [--show] [--dry-run] [--channel=id] [--cover=giây] [--playlist=tên] [--ai]'
  );
  process.exit(1);
}

if (dryRun) {
  console.log("🧪 DRY RUN — chạy trọn luồng nhưng KHÔNG bấm Đăng.");
} else {
  console.log("⚠️  Lệnh này ĐĂNG THẬT lên kênh Zalo Video. Ctrl+C trong 5 giây nếu muốn dừng.");
  await new Promise((r) => setTimeout(r, 5000));
}

postToZaloVideo({
  videoPath,
  description,
  headless,
  dryRun,
  channelId: opt("channel") || "",
  coverTime: opt("cover") !== undefined ? Number(opt("cover")) : null,
  playlist: opt("playlist") || "",
  aiGenerated: flag("ai"),
})
  .then((r) => console.log("Xong:", r))
  .catch((e) => { console.error("Lỗi:", e.message); process.exit(1); });
