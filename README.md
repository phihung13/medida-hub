# Việt Anh Media Hub

Hệ thống quản lý & đăng bài mạng xã hội tập trung, tự host, của **Trường Việt Anh**.

Fork từ [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0) và tùy biến:

- 🎨 Rebrand toàn bộ giao diện Postiz → Việt Anh Media Hub (song ngữ Việt/Anh).
- 🤖 AI viết caption & Agent chuyển từ OpenAI → **Claude API** (prompt riêng từng kênh).
- 💬 **Zalo OA** provider + trang cấu hình bot nhóm Zalo (nhận ảnh/video từ nhóm → tạo bài chờ duyệt).
- 🏆 Trang **Discover / Lò Bài Thắng** (`/viral`): bắt bài viral giáo dục → AI mổ công thức → nhân bản thành bản nháp.
- 🔑 Quản lý key ngay trong Settings (Anthropic, key tạo ảnh OpenAI/Fal, OAuth các kênh), dashboard credit AI.
- 👤 Quản lý tài khoản admin-driven (mời thành viên/đặt lại mật khẩu bằng link, không cần SMTP).

## Chạy hệ thống (Windows)

```bat
start-postiz.bat            # = node run.mjs: tự bật Docker (Postgres/Redis/Temporal) + build nếu thiếu + chạy tất cả
start-postiz.bat --rebuild  # build lại sau khi đổi code
start-tunnel.bat            # (tuỳ chọn) Cloudflare tunnel để truy cập từ xa
stop-hub.bat                # dừng tất cả
```

- Frontend: http://localhost:4200 · Backend API: http://localhost:3000 · Orchestrator (Temporal worker): :3002
- Yêu cầu: Docker Desktop, Node 22 LTS, dùng `corepack pnpm` (không dùng npm/yarn).

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `apps/backend` | NestJS API |
| `apps/frontend` | Next.js UI |
| `apps/orchestrator` | Temporal worker — đăng bài theo lịch (bắt buộc chạy để bài được đăng) |
| `libraries/nestjs-libraries` | Providers, AI, DB (Prisma) dùng chung |
| `libraries/react-shared-libraries` | UI + i18n dùng chung |
| `docs/` | Tài liệu thiết kế, blueprint demo |

## Tài liệu dự án

- **[MEDIA_HUB_HANDOFF.md](MEDIA_HUB_HANDOFF.md)** — file bàn giao: trạng thái, quyết định kiến trúc, nhật ký từng bước. **Đọc đầu tiên.**
- [PRODUCT.md](PRODUCT.md) — mô tả sản phẩm.

## Giấy phép

Kế thừa AGPL-3.0 từ Postiz (xem [LICENSE](LICENSE)). Dùng nội bộ Trường Việt Anh.
