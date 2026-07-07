# 🚀 Deploy Việt Anh Media Hub — Docker trên VPS

Hướng dẫn đưa Media Hub lên VPS chạy 24/7 bằng Docker. Dùng
[`docker-compose.prod.yaml`](../docker-compose.prod.yaml) (build image **từ source**
để gồm mọi custom: Claude AI, Zalo, /viral…), khác `docker-compose.yaml` (image
official Postiz, không có custom).

---

## 1. Kiến trúc deploy

```
Internet ──HTTPS──▶ Reverse proxy (Caddy/nginx/Coolify) ──▶ container media-hub:5000
                                                              │ nginx
                                                              ├─ /api/     → backend :3000
                                                              ├─ /uploads/ → volume tĩnh
                                                              └─ /         → frontend :4200
                                                       (pm2 chạy backend + frontend + orchestrator)
        frontend /botapi ──(JWT + HUB_BOT_TOKEN)──▶ container zalo-bot:8088 (KHÔNG có domain riêng)
        Postgres ─ Redis ─ Temporal(+ES+PG) : các container hạ tầng cùng compose
```

- **1 container `media-hub`** (all-in-one): nginx + pm2 chạy backend + frontend +
  **orchestrator** (worker Temporal — bắt buộc để bài lên lịch được đăng).
- **1 container `zalo-bot`** (zca-js, build từ repo bot): nguồn ảnh từ nhóm Zalo.
  **Không expose cổng/domain** — mọi thao tác (QR đăng nhập, duyệt bài, token
  Facebook, Google Business, chân bài, thời gian chờ…) làm ngay trong **trang
  Zalo của Hub** (proxy `/botapi`, xác thực JWT + bí mật `HUB_BOT_TOKEN`).
  → Domain cũ của bot (vd `autopost.vietanh.org`) **bỏ được** — 1 domain duy nhất.
- `prisma-db-push` **tự chạy** mỗi lần container khởi động (tạo/cập nhật bảng, gồm
  4 model mới: AiCredit/ViralPost/ViralSource/ViralClone + cột Integration.postFooter).
- Media lưu **local** trong volume `media-hub-uploads`, nginx phục vụ `/uploads/`
  trực tiếp (không qua Next — nhanh, bền).
- **API key nhập QUA UI** (không cần trong `.env`): Hub lưu vào volume `/config`
  (`CONFIG_DIR`), bot lưu vào volume `/app/data` → sống qua restart/rebuild.

## 2. Yêu cầu VPS

- **RAM ≥ 4 GB** (Temporal + Elasticsearch khá nặng; 2 GB dễ OOM). CPU 2 nhân+.
- Ổ đĩa ≥ 20 GB (image + Postgres + uploads).
- Ubuntu 22.04+ với **Docker Engine + Docker Compose v2** (`docker compose`, không phải `docker-compose`).
- 1 domain trỏ về IP VPS (vd `hub.truongvietanh.com`).

## 3. Các bước deploy

```bash
# 1) Đưa code lên VPS (khuyến nghị: push repo lên GitHub PRIVATE rồi clone)
git clone <repo-private-cua-ban> media-hub && cd media-hub

# 2) Tạo .env từ mẫu — CHỈ hạ tầng (API key nhập qua UI sau khi đăng nhập)
cp .env.production.example .env
nano .env            # FRONTEND_URL, JWT_SECRET, POSTGRES_PASSWORD, HUB_BOT_TOKEN, ZALO_DASHBOARD_PASS
#   JWT_SECRET:       openssl rand -hex 32
#   HUB_BOT_TOKEN:    openssl rand -hex 24
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

- **API keys nhập QUA UI, không cần `.env`.** Key được lưu bền trên volume:
  Hub → `/config` (`CONFIG_DIR`: `anthropic-key.txt`, `image-gen.json`,
  `viral-config.json`, `social-keys.env`); bot → `/app/data` (`tokens.json`).
  Sau khi đăng nhập lần đầu: **Settings** (Claude AI, Tạo ảnh, Social keys gồm
  Zalo OA/Facebook/Telegram…) và **trang Zalo** (token Trang FB, Google Business,
  key Claude của bot). Ngoại lệ: `NEXT_PUBLIC_POLOTNO` là biến build-time của
  frontend — muốn dùng Design Media thì đặt trong `.env` trước khi build image.
- **Bot Zalo nằm trong compose (service `zalo-bot`)** — build từ repo
  `github.com/phihung13/zalo-bot-group-put-image-video`. Sau khi `up -d`:
  mở **trang Zalo trong Hub → quét QR** đăng nhập tài khoản Zalo (session lưu
  volume `zalo-bot-data`). Lưu ý bot dùng **zca-js không chính thức** — dùng
  tài khoản Zalo phụ.
  - **Nếu bot đang chạy bằng app Coolify riêng** (deploy từ repo bot): giữ app đó
    cũng được — chỉ cần (1) set env cho app bot: `WEB_HOST=0.0.0.0` +
    `HUB_BOT_TOKEN=<cùng giá trị với Hub>`; (2) nối 2 app vào cùng Docker
    network trong Coolify; (3) đặt `ZALO_BOT_URL=http://<tên-container-bot>:8088`
    cho Hub; (4) **xoá domain riêng của bot** (autopost.vietanh.org) — không cần
    nữa, tránh lộ dashboard ra ngoài. Khi đó xoá service `zalo-bot` khỏi compose.
- **Cấu hình "cầu nối → Media Hub" của bot trong Docker:** ở trang Zalo, địa chỉ
  Media Hub backend phải là `http://media-hub:3000` (mặc định đã đúng qua env
  `POSTIZ_API_URL` — đừng sửa thành localhost).
- **`prisma-db-push` dùng `--accept-data-loss`** (Postiz mặc định): push schema trực
  tiếp, phù hợp khi schema chỉ thêm bảng/cột. Trước khi update lớn nên **backup DB** (mục 6).
- **Lưu trữ media:** mặc định `local` (volume). Muốn bền + CDN cho traffic lớn, cân
  nhắc chuyển `STORAGE_PROVIDER=cloudflare` (R2) — điền `CLOUDFLARE_*` trong `.env` và
  bỏ block STORAGE local trong compose. Khi đó nginx `/uploads` không dùng nữa.
- **Backup repo:** hiện code chỉ nằm trên máy dev. Tạo GitHub **private** rồi push
  trước khi deploy (`git remote add origin <url-private>` — remote `upstream` đang trỏ
  Postiz gốc, chỉ để pull update, KHÔNG push lên đó).

## 8. Deploy bằng Coolify (khuyến nghị của dự án)

Coolify deploy kiểu **Docker Compose**: tạo Resource → *Docker Compose* → trỏ repo
`medida-hub` + file `docker-compose.prod.yaml`.

1. Điền **Environment Variables** trong Coolify đúng như `.env.production.example`
   (FRONTEND_URL, JWT_SECRET, POSTGRES_PASSWORD, HUB_BOT_TOKEN, ZALO_DASHBOARD_PASS).
2. Gán domain duy nhất (vd `hub.truongvietanh.com`) cho service `media-hub`
   cổng **5000** — Coolify tự lo HTTPS. **KHÔNG gán domain cho `zalo-bot`.**
3. Deploy → chờ build (lần đầu 15–30 phút). Log phải thấy pm2 online 3 app.
4. Vào domain → tạo admin (mục 5) → nhập key qua UI (mục 7) → trang Zalo quét QR.
5. Nếu trước đó bot có app Coolify riêng + domain `autopost.vietanh.org`:
   sau khi xác nhận trang Zalo trong Hub điều khiển được bot → **xoá domain đó**
   (hoặc xoá luôn app cũ nếu dùng service `zalo-bot` trong compose — nhớ việc
   này làm MẤT session Zalo cũ, phải quét QR lại; cấu hình nhóm/chân bài thì
   thiết lập lại trong trang Zalo, hoặc copy volume `/app/data` sang trước).

### 8a-1. Chuyển hẳn app bot đứng riêng (`auto-post`) thành resource Media Hub

Quyết định user: **sửa ngay trên resource Coolify `auto-post` cũ** (không tạo
resource mới), **cắt luôn 1 lần** (không chạy song song), **quét QR mới** (không
copy session cũ). Có sẵn 1 resource media-hub khác trên CÙNG server
(`vps.truongvietanh.com`) từ webhook CI/CD trước đó nhưng **chưa có dữ liệu thật**
→ xoá luôn sau khi cutover xong. Domain cuối cùng: **`autopost.vietanh.org` là
domain DUY NHẤT** cho toàn bộ Hub. 64 GB RAM nên không lo tài nguyên (Postgres +
Redis + Temporal + Elasticsearch + media-hub + zalo-bot chạy cùng lúc).

1. Vào resource `auto-post` → **General** → đổi **Build Pack**: Dockerfile →
   **Docker Compose**.
2. Tab **Git Source** → đổi repo sang `phihung13/medida-hub`, branch `main`.
3. Sau khi đổi Build Pack, **General** sẽ hiện lại field đường dẫn compose
   (kiểu "Docker Compose Location") → đặt `/docker-compose.prod.yaml`. Base
   Directory giữ `/`.
4. **Domains**: gán `https://autopost.vietanh.org` cho service **`media-hub`**
   (không gán cho `zalo-bot`). Xoá port mapping/expose cũ (`8088`, `3000:3000`)
   nếu Coolify không tự dọn khi đổi Build Pack — compose tự định nghĩa port riêng.
   Xoá luôn **Custom Docker Options** cũ (flags FUSE/apparmor của bot) — không
   cần nữa với compose.
5. Tab **Environment Variables**: điền theo `.env.production.example` —
   `FRONTEND_URL=https://autopost.vietanh.org`, `JWT_SECRET`, `POSTGRES_PASSWORD`,
   `HUB_BOT_TOKEN` (tạo mới `openssl rand -hex 24`), `ZALO_DASHBOARD_PASS`.
6. Tab **Persistent Storage**: kiểm Coolify đã nhận diện đủ volume từ compose
   (`postgres-volume`, `media-hub-config`, `media-hub-uploads`, `zalo-bot-data`,
   `temporal-es-data`, `temporal-pg-data`, `postiz-redis-data`).
7. Tab **Webhooks**: copy **Deploy Webhook URL** mới của resource này → so với
   secret `COOLIFY_WEBHOOK` hiện tại trong GitHub repo `medida-hub` (Settings →
   Secrets → Actions) — nếu khác, **cập nhật lại secret** để CI/CD tự deploy
   đúng resource này (`COOLIFY_TOKEN` thường là token tài khoản, giữ nguyên).
8. **Save** → **Redeploy**, chờ build xong toàn bộ stack lần đầu (~15–30 phút,
   gồm cả Temporal/ES). Kiểm đĩa trống ≥20 GB (image ~5.66 GB + Postgres x2 + ES).
9. Vào `autopost.vietanh.org` → tạo tài khoản admin đầu (mục 5) → nhập key qua
   UI (mục 7).
10. Trang `/zalo` trong Hub → **quét QR mới** → thiết lập lại nhóm→trang/chân
    bài/thời gian chờ (config cũ nằm trong volume bot cũ, không tự mang sang).
11. Đăng thử 1 bài xác nhận orchestrator + ảnh nhóm Zalo → draft Calendar chạy
    đúng, rồi **xoá resource media-hub cũ** (còn lại trên server, chưa có dữ
    liệu thật) để khỏi trùng lặp.

### 8b. Auto deploy khi merge (CI/CD — giống repo bot)

**CI có sẵn:** workflow `Build` (kế thừa Postiz) chạy `pnpm install + build` cả
3 app trên MỌI push/PR — đang xanh trên GitHub. Merge code lỗi build sẽ thấy ❌.

**CD — chọn 1 trong 2:**

- **Cách A (đơn giản, y hệt repo bot):** trong Coolify, mở resource media-hub →
  bật **Auto Deploy** (GitHub App). Mỗi lần push/merge vào `main` Coolify tự
  pull + build + deploy. Nhược: deploy cả khi CI đỏ.
- **Cách B (khuyến nghị — chỉ deploy khi CI XANH):** đã có sẵn workflow
  `.github/workflows/deploy.yml` (chạy sau khi `Build` xanh trên main → gọi
  Deploy Webhook của Coolify). Chỉ cần đặt 2 secret trong GitHub repo
  (Settings → Secrets and variables → Actions):
  - `COOLIFY_WEBHOOK` = URL ở Coolify → resource → **Webhooks → Deploy Webhook**
  - `COOLIFY_TOKEN` = Coolify → **Keys & Tokens → API tokens** (quyền deploy)
  Khi dùng cách B thì TẮT Auto Deploy của cách A (kẻo deploy 2 lần).
  Chưa đặt secret thì workflow tự bỏ qua, không báo đỏ.

## 9. Trạng thái kiểm chứng + việc cần verify trên VPS

- ✅ **Compose validate OK** (`docker compose config`).
- ✅ **Image media-hub ĐÃ BUILD THỬ THÀNH CÔNG** với custom code (Docker Desktop,
  image Linux `viet-anh-media-hub:latest` ~5.66 GB; cả 3 app build exit 0).
  Native module (`bcrypt`/`sharp`/`canvas`) build OK nhờ `g++ make python3-pip`.
- ✅ Trang Zalo trong Hub = FULL dashboard bot (duyệt bài/FB/GBP/hẹn giờ/chân
  bài/thời gian chờ/token/nhật ký) qua `/botapi` — verify trên máy dev.

Còn lại cần verify **khi chạy container thật trên VPS** (chưa chạy thử end-to-end):

1. **RAM khi build**: `pnpm run build` đặt `--max-old-space-size=4096`; VPS 4 GB nên
   thêm swap khi build (build local đã qua nhưng máy dev nhiều RAM hơn).
2. Sau khi `up -d`: đăng nhập được, **đăng thử 1 bài** (kiểm orchestrator đăng thật qua
   Temporal), ảnh media hiển thị (`/uploads` qua nginx volume), AI viết caption (Claude) chạy.
3. Domain + HTTPS trỏ đúng `FRONTEND_URL` (cookie/media phụ thuộc biến này).
4. **Bot trong Docker**: quét QR từ trang Zalo của Hub, bot giữ session qua restart
   (volume `zalo-bot-data`), ảnh nhóm Zalo → bản nháp trên Calendar; GBP trong
   container cần đăng nhập Google qua **upload session** (trình duyệt không mở
   được trong container — xem tab Google Business).
