# Demo — Việt Anh Media Hub (2 backend + 1 UI)

Demo chạy được, minh hoạ đúng kiến trúc thật của dự án mà **không cần Docker / Postgres / Redis / Temporal**. Mục đích: trình bày ý tưởng "một giao diện, hai tiến trình" cho anh Dương.

## Chạy

Cần Node.js (>=18). Mở terminal tại thư mục này:

```bash
node dev.js
```

hoặc bấm đúp **`start.bat`** (Windows). Trình duyệt tự mở `http://localhost:3000`.

> Muốn caption bằng **Claude thật** (claude-sonnet-4-6): đặt biến môi trường trước khi chạy
> ```
> set ANTHROPIC_API_KEY=sk-ant-...   (Windows CMD)
> ```
> Không có key → dùng caption mock tiếng Việt, demo vẫn chạy đủ.

## Có gì trong demo

| Thành phần | Vai trò | Cổng |
|---|---|---|
| **hub-api** (Backend 1) | Đóng vai Postiz: rút job khỏi hàng đợi → sinh caption (Claude/mock) → tạo bản nháp chờ duyệt → mô phỏng đăng đa kênh. Phục vụ luôn UI. | 3000 |
| **zalo-worker** (Backend 2) | Đóng vai tiến trình zca-js: giữ "session Zalo", giả lập bắt ảnh từ nhóm rồi đẩy vào hàng đợi. Gửi heartbeat cho Hub. | 3002 |
| **UI** | Một giao diện cho cả hai: đèn trạng thái 2 backend, cấu hình nhóm Zalo, hàng chờ duyệt, nút giả lập, nhật ký. | (mở qua 3000) |
| **queue.jsonl** | Hàng đợi **bền** append-only (thay cho Redis `zalo:ingest`). | file |

## Luồng demo (kịch bản trình bày)

1. Mở UI → thấy **2 đèn xanh** (Hub + Worker) và 3 nhóm Zalo.
2. Bấm **"🎬 Giả lập ảnh từ nhóm Zalo"** → Worker bắt album ảnh → đẩy vào hàng đợi → Hub sinh caption → xuất hiện **bản nháp chờ duyệt** bên phải.
3. Bấm **"👍 Duyệt & đăng"** → bài chuyển sang "Đang đăng..." rồi "✅ Đã đăng" lên các kênh đã map.
4. Xem **Nhật ký hoạt động** để thấy 2 backend phối hợp (nhãn `worker` / `hub`).

## Chứng minh kiến trúc (điểm nhấn khi demo)

- **Tắt Worker** (đóng cửa sổ, hoặc chạy riêng chỉ `npm run hub`): đèn Worker đỏ, nút giả lập báo lỗi — nhưng Hub vẫn duyệt/đăng bình thường. *Một cái gãy không kéo cái kia sập.*
- **Tắt Hub** rồi bấm giả lập vài lần trên Worker (`npm run worker`): job **dồn trong hàng đợi**, không mất. Bật lại Hub → nó xử lý hết phần tồn. *Hàng đợi bền → không mất bài.*

## Ánh xạ sang hệ thật (khi bê vào Postiz)

| Demo | Hệ thật |
|---|---|
| `queue.jsonl` | Redis queue `zalo:ingest` |
| `hub-api` consumer | Postiz consumer → `PostService.createDraft()` |
| `caption.js` (Claude) | thay `openai.service.ts` bằng Claude |
| `zalo-worker` giả lập | zca-js thật lắng nghe nhóm Zalo |
| nhóm Zalo trong `state.json` | bảng cấu hình trong Postgres, trang "Nhóm Zalo" |
| mô phỏng đăng | Zalo OA provider + provider FB/GBP sẵn có |

Reset demo bằng nút **🔄 Reset** trên UI.
