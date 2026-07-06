# 🚀 Deploy Việt Anh Media Hub — Docker trên VPS

Hướng dẫn đưa Media Hub lên VPS chạy 24/7 bằng Docker. Dùng
[`docker-compose.prod.yaml`](../docker-compose.prod.yaml) (build image **từ source**
để gồm mọi custom: Claude AI, Zalo, /viral…), khác `docker-compose.yaml` (image
official Postiz, không có custom).

---

## 1. Kiến trúc deploy

```
Internet ──HTTPS──▶ Reverse proxy (Caddy/nginx/Cloudflare) ──▶ container media-hub:5000
                                                                 │ nginx
                                                                 ├─ /api/     → backend :3000
                                                                 ├─ /uploads/ → volume tĩnh
                                                                 └─ /         → frontend :4200
                                                          (pm2 chạy backend + frontend + orchestrator)
        Postgres ─ Redis ─ Temporal(+ES+PG) : các container hạ tầng cùng compose
```

- **1 container `media-hub`** (all-in-one): nginx + pm2 chạy backend + frontend +
  **orchestrator** (worker Temporal — bắt buộc để bài lên lịch được đăng).
- `prisma-db-push` **tự chạy** mỗi lần container khởi động (tạo/cập nhật bảng, gồm
  4 model mới: AiCredit/ViralPost/ViralSource/ViralClone + cột Integration.postFooter).
- Media lưu **local** trong volume `media-hub-uploads`, nginx phục vụ `/uploads/`
  trực tiếp (không qua Next — nhanh, bền).

## 2. Yêu cầu VPS

- **RAM ≥ 4 GB** (Temporal + Elasticsearch khá nặng; 2 GB dễ OOM). CPU 2 nhân+.
- Ổ đĩa ≥ 20 GB (image + Postgres + uploads).
- Ubuntu 22.04+ với **Docker Engine + Docker Compose v2** (`docker compose`, không phải `docker-compose`).
- 1 domain trỏ về IP VPS (vd `hub.truongvietanh.com`).

## 3. Các bước deploy

```bash
# 1) Đưa code lên VPS (khuyến nghị: push repo lên GitHub PRIVATE rồi clone)
git clone <repo-private-cua-ban> media-hub && cd media-hub

# 2) Tạo .env từ mẫu rồi điền domain/JWT/mật khẩu/API keys
cp .env.production.example .env
nano .env            # điền FRONTEND_URL, JWT_SECRET, POSTGRES_PASSWORD, ANTHROPIC_API_KEY…
#   JWT_SECRET:       openssl rand -hex 32
#   POSTGRES_PASSWORD: đặt mạnh

# 3) Build image + chạy toàn bộ (lần đầu build ~15–30 phút)
docker compose -f docker-compose.prod.yaml up -d --build

# 4) Theo dõi khởi động (prisma-db-push chạy tự động ở đây)
docker compose -f docker-compose.prod.yaml logs -f media-hub
#   Chờ tới khi thấy backend + frontend + orchestrator đều "online" (pm2)
```

Kiểm tra nhanh (trên VPS): `curl -I http://localhost:4007/` → **307** (redirect /login) là OK.

## 4. HTTPS + domain (reverse proxy)

Container nghe cổng host `4007` (đổi bằng `PORT` trong `.env`). Đặt reverse proxy
HTTPS trước nó. **Caddy** là gọn nhất (tự xin Let's Encrypt) — `/etc/caddy/Caddyfile`:

```
hub.truongvietanh.com {
    reverse_proxy localhost:4007
}
```

`sudo systemctl reload caddy` → xong, có HTTPS. (Hoặc dùng nginx + certbot, hoặc
Cloudflare Tunnel named cho URL cố định thay cho Quick Tunnel tạm.)

> `FRONTEND_URL` trong `.env` **phải** = `https://hub.truongvietanh.com` (đúng domain,
> không dấu `/` cuối) — media URL và cookie dựa vào biến này.

## 5. Tài khoản admin đầu tiên

Máy không có SMTP nên quản lý tài khoản là admin-driven. Lần đầu chưa có user nào:

1. Tạm đặt `DISABLE_REGISTRATION=false` trong `.env`, `docker compose -f docker-compose.prod.yaml up -d media-hub`.
2. Mở domain → đăng ký tài khoản đầu (đây sẽ là super-admin).
3. Đặt lại `DISABLE_REGISTRATION=true` → `up -d media-hub`. Từ đó chỉ admin mời thành viên (Settings → Team, link mời/reset copy tay).

## 6. Vận hành

| Việc | Lệnh |
|---|---|
| Cập nhật code mới | `git pull && docker compose -f docker-compose.prod.yaml up -d --build` |
| Xem log | `docker compose -f docker-compose.prod.yaml logs -f media-hub` |
| Restart | `docker compose -f docker-compose.prod.yaml restart media-hub` |
| Dừng tất cả | `docker compose -f docker-compose.prod.yaml down` (giữ volume/dữ liệu) |
| **Backup DB** | `docker exec postiz-postgres pg_dump -U postiz-user postiz-db > backup-$(date +%F).sql` |
| **Backup media** | backup volume `media-hub-uploads` (vd `docker run --rm -v media-hub-uploads:/u -v $PWD:/b alpine tar czf /b/uploads.tgz -C /u .`) |

## 7. Lưu ý quan trọng (đọc trước khi deploy)

- **API keys đặt qua `.env`, KHÔNG qua ô nhập-key trên UI.** Trên máy Windows, key
  nhập từ UI lưu file runtime (`anthropic-key.txt`, `viral-config.json`,
  `image-gen.json`) — trong container các file này **ephemeral, mất khi rebuild**.
  Production hãy đặt `ANTHROPIC_API_KEY`, `ZALO_*`, `YOUTUBE_API_KEY`, `APIFY_TOKEN`… trong `.env`.
- **Bot Zalo (nhận ảnh/video từ nhóm Zalo) CHƯA nằm trong Docker.** Nó là hệ riêng
  (`D:\Zalo bot group`, zca-js cần session sống, hiện chạy trên máy Windows). Core
  Media Hub deploy độc lập được; bot Zalo là giai đoạn sau (chạy ở máy Windows hoặc
  VPS riêng, trỏ API về domain). Không bật bot ⇒ chỉ thiếu nguồn ảnh tự động từ Zalo,
  mọi thứ khác chạy bình thường.
- **`prisma-db-push` dùng `--accept-data-loss`** (Postiz mặc định): push schema trực
  tiếp, phù hợp khi schema chỉ thêm bảng/cột. Trước khi update lớn nên **backup DB** (mục 6).
- **Lưu trữ media:** mặc định `local` (volume). Muốn bền + CDN cho traffic lớn, cân
  nhắc chuyển `STORAGE_PROVIDER=cloudflare` (R2) — điền `CLOUDFLARE_*` trong `.env` và
  bỏ block STORAGE local trong compose. Khi đó nginx `/uploads` không dùng nữa.
- **Backup repo:** hiện code chỉ nằm trên máy dev. Tạo GitHub **private** rồi push
  trước khi deploy (`git remote add origin <url-private>` — remote `upstream` đang trỏ
  Postiz gốc, chỉ để pull update, KHÔNG push lên đó).

## 8. Cần verify khi build lần đầu trên VPS (chưa chạy thử ở môi trường dev)

`docker-compose.prod.yaml` + `.env.production.example` đã soạn theo chuẩn Postiz +
custom Media Hub và **validate cú pháp compose OK**, nhưng **image chưa được build thử
trên Linux** ở phiên chuẩn bị này. Lần build đầu trên VPS cần để ý:

1. **Build native module** (`bcrypt`, `sharp`, `canvas`…) trên Linux — Dockerfile.dev đã
   cài `g++ make python3-pip`; nếu thiếu gói, thêm vào `Dockerfile.dev`.
2. **RAM khi build**: `pnpm run build` đặt `--max-old-space-size=4096`; VPS 4 GB có thể
   cần thêm swap khi build frontend.
3. Sau khi lên, verify: đăng nhập được, **đăng thử 1 bài** (kiểm orchestrator đăng thật),
   ảnh media hiển thị (`/uploads`), AI viết caption (Claude) chạy.
