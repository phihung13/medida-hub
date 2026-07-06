# Việt Anh Media Hub

Hệ thống quản lý & đăng bài mạng xã hội tập trung, tự host, của **Trường Việt Anh**.

Fork từ [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0) và tùy biến:

- 🎨 Rebrand toàn bộ giao diện Postiz → Việt Anh Media Hub (song ngữ Việt/Anh).
- 🤖 AI viết caption & Agent chuyển từ OpenAI → **Claude API** (prompt riêng từng kênh).
- 💬 **Zalo OA** provider + trang cấu hình bot nhóm Zalo (nhận ảnh/video từ nhóm → tạo bài chờ duyệt).
- 🏆 Trang **Discover / Lò Bài Thắng** (`/viral`): bắt bài viral giáo dục → AI mổ công thức → nhân bản thành bản nháp.
- 🔑 Quản lý key ngay trong Settings (Anthropic, key tạo ảnh OpenAI/Fal, OAuth các kênh), dashboard credit AI.
- 👤 Quản lý tài khoản admin-driven (mời thành viên/đặt lại mật khẩu bằng link, không cần SMTP).

## Chạy hệ thống (Windows — một lệnh)

```bat
start-postiz.bat            :: bật TẤT CẢ + tunnel public (in ra URL truy cập từ xa)
start-postiz.bat --rebuild  :: build lại sau khi đổi code, rồi chạy
stop-postiz.bat             :: dừng tunnel + 4 dịch vụ
```

`start-postiz.bat` gọi `scripts/run.mjs --tunnel`: tự bật Docker (Postgres/Redis/Temporal), tự build nếu thiếu, rồi chạy backend + orchestrator + frontend + bot Zalo + tunnel Cloudflare trong một cửa sổ. Đóng cửa sổ = tắt hệ thống.

- Frontend: http://localhost:4200 · Backend API: http://localhost:3000 · Orchestrator (Temporal worker): :3002 · Bot Zalo: :8088
- Tunnel: URL `https://<random>.trycloudflare.com` đổi mỗi lần chạy, lưu ở `tunnel-url.txt`.
- Chạy 24/7 tự hồi sinh (tùy chọn): `node scripts/supervise.mjs`.
- Yêu cầu: Docker Desktop, Node 22 LTS, dùng `corepack pnpm` (không dùng npm/yarn).

> Deploy production (Docker trên VPS): xem [docs/DEPLOY.md](docs/DEPLOY.md).

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `apps/backend` | NestJS API |
| `apps/frontend` | Next.js UI |
| `apps/orchestrator` | Temporal worker — đăng bài theo lịch (bắt buộc chạy để bài được đăng) |
| `libraries/nestjs-libraries` | Providers, AI, DB (Prisma) dùng chung |
| `libraries/react-shared-libraries` | UI + i18n dùng chung |
| `scripts/` | Script vận hành: `run.mjs` (chạy tất cả), `tunnel.mjs` (Cloudflare tunnel), `supervise.mjs` (watchdog 24/7) |
| `docs/` | Tài liệu bàn giao, deploy, thiết kế, blueprint demo |

## Tài liệu dự án

- **[docs/MEDIA_HUB_HANDOFF.md](docs/MEDIA_HUB_HANDOFF.md)** — file bàn giao: trạng thái, quyết định kiến trúc, nhật ký từng bước. **Đọc đầu tiên.**
- [docs/DEPLOY.md](docs/DEPLOY.md) — hướng dẫn deploy Docker trên VPS.
- [docs/PRODUCT.md](docs/PRODUCT.md) — mô tả sản phẩm.

## Giấy phép

Kế thừa AGPL-3.0 từ Postiz (xem [LICENSE](LICENSE)). Dùng nội bộ Trường Việt Anh.
