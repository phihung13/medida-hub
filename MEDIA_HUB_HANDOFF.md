# 🗂️ MEDIA HUB VIỆT ANH — FILE BÀN GIAO (HANDOFF)

> **Đọc file này đầu tiên khi tiếp tục dự án.** Đây là bộ nhớ duy nhất giúa các phiên làm việc.
> Mỗi khi làm xong một bước, **cập nhật mục "TRẠNG THÁI HIỆN TẠI" và "NHẬT KÝ" bên dưới.**
> Ngôn ngữ làm việc: tiếng Việt. Người dùng: Phi Hùng (dev), phê duyệt: anh Dương.

Cập nhật lần cuối: **2026-07-06** — DỌN REPO + **COMMIT LẦN ĐẦU** toàn bộ custom (`1f7a148`, 233 file) + remote đổi `origin`→`upstream` (hết nguy cơ push nhầm lên Postiz public) + build production pass cả 3 app (mục 48). Chạy: `start-postiz.bat` (+ `start-tunnel.bat` cho truy cập từ xa). Xem nhật ký (mục 8) từ dòng mới nhất.

---

## 1. DỰ ÁN NÀY LÀ GÌ (TL;DR)

Xây **"Việt Anh Media Hub"** — hệ thống quản lý & đăng bài mạng xã hội tập trung, tự host, cho Trường Việt Anh.

**Cách làm:** KHÔNG build từ đầu. **Fork Postiz open-source** (đã clone tại chính folder này) rồi custom:
1. Đổi thương hiệu Postiz → Việt Anh Media Hub (custom chính giao diện Next.js của Postiz, không dùng UI khác).
2. Đổi AI viết caption từ **OpenAI → Claude API** (claude-sonnet-4-6), viết prompt riêng từng kênh.
3. Thêm **Zalo OA** làm kênh đăng (provider mới).
4. Thêm **`zalo-worker`** (dùng zca-js) — tiến trình chạy nền, hứng ảnh/video từ **nhóm Zalo** rồi tự tạo bài chờ duyệt trong Postiz.
5. Workflow duyệt bài + thông báo qua Zalo.

**Mục tiêu:** thay thế việc quản lý MXH rời rạc hiện tại. Kế thừa pipeline Zalo Group → Facebook đang chạy tốt.

---

## 2. CÂU CHUYỆN & QUYẾT ĐỊNH (vì sao làm thế này)

- **Vì sao fork Postiz, không build mới:** phần khó & dễ lỗi nhất (OAuth đa nền tảng FB/IG/TikTok + scheduling durable) Postiz đã làm xong, test bởi cộng đồng. Build lại từ đầu = chết chìm ở đúng 2 chỗ đó. Postiz stack: TypeScript, NestJS, Next.js, PostgreSQL (Prisma), Redis, **Temporal** (scheduling engine, durable — không mất job khi restart). Có webhook sẵn.
- **Vì sao đổi sang Claude:** hiểu tiếng Việt tốt hơn, nhúng được tone riêng Việt Anh. Postiz đang **hardcode OpenAI**.
- **Vì sao KHÔNG dùng n8n:** người dùng muốn một codebase duy nhất, không maintain n8n song song. Bridge nhận từ Zalo Group được viết thẳng thành `zalo-worker` trong monorepo.
- **Vì sao tách `zalo-worker` riêng (không nhồi vào NestJS backend):** zca-js cần **session Zalo sống liên tục**; Postiz backend chạy trong Docker, restart/scale tự do. Nhồi chung → mất session khi restart, 2 instance tranh nhau. Tách ra: một cái gãy không kéo cái kia sập.
- **Một giao diện, nhiều process:** người dùng chỉ thấy 1 app Postiz (1 đăng nhập). Trang "Nhóm Zalo" chỉ ghi config vào DB; `zalo-worker` đọc config đó mà chạy nền.
- **zca-js là API KHÔNG chính thức** → rủi ro Zalo đổi API làm gãy. Đây là lý do phải tách worker + có reconnect + alert admin.
- Hệ thống cũ (folder `D:\Zalo bot group`) đã có sẵn: zca-js listener + caption pipeline + đăng FB/GBP (3 nhóm Zalo → 3 page FB). **Tái sử dụng code này cho `zalo-worker`**, chỉ đổi đầu ra từ "đăng thẳng FB" sang "đẩy vào Postiz".

---

## 3. KIẾN TRÚC — 2 BACKEND GIAO TIẾP THẾ NÀO

```
CHIỀU DỮ LIỆU (ảnh/video vào):
  zalo-worker  ──push job──▶  Redis queue "zalo:ingest"  ──pull──▶  Postiz consumer
  (zca-js, giữ session)         (bền, Postiz đã có Redis)            → tải media về MinIO
                                                                     → Claude sinh caption
                                                                     → PostService.createDraft() [service nội bộ]
                                                                     → gán Reviewer, vào hàng chờ duyệt

CHIỀU ĐIỀU KHIỂN (bật/tắt nhóm):
  Trang "Nhóm Zalo" (UI)  ──ghi config──▶  Postgres  ──worker đọc/subscribe──▶  đổi danh sách nghe
```

- **Dùng Redis queue, KHÔNG dùng:** (a) worker ghi thẳng Postgres [bỏ qua validation/media/AI, khớp cứng schema], (b) HTTP call [đồng bộ, Postiz sập là mất ảnh].
- **Payload job mẫu:** `{ groupId, groupName, mediaUrls:[...], type:"album"|"photo"|"video", capturedAt }`. Worker chỉ gửi URL (Zalo có URL tải công khai) + metadata; Postiz consumer làm phần nặng (tải, MinIO, Claude, createDraft).
- **Khi Postiz sập:** worker vẫn hứng, job nằm Redis chờ → không mất bài.
- **Khi worker sập:** Postiz vẫn đăng bình thường; chỉ ngừng nguồn vào từ Zalo; UI báo đèn đỏ + alert admin.

---

## 4. VỊ TRÍ FILE QUAN TRỌNG (đã xác minh trong Postiz v1.47.0)

| Mục đích | Đường dẫn |
|---|---|
| **AI service (đổi OpenAI→Claude ở đây)** | `libraries/nestjs-libraries/src/openai/openai.service.ts` |
| **Social providers** (mẫu để viết Zalo OA) | `libraries/nestjs-libraries/src/integrations/social/*.provider.ts` (vd `facebook.provider.ts`) |
| **Đăng ký provider** | `libraries/nestjs-libraries/src/integrations/integration.manager.ts` |
| **UI chọn provider (frontend)** | `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx` |
| Posts service (createDraft) | `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts` |
| Media service | `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts` |
| Autopost service | `libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts` |
| Env mẫu | `.env.example` (thêm `ANTHROPIC_API_KEY`, config Zalo) |
| Docker | `docker-compose.yaml`, `docker-compose.dev.yaml`, `Dockerfile.dev` |

**Cấu trúc monorepo (pnpm workspace):**
- `apps/backend` — NestJS API
- `apps/frontend` — Next.js UI
- `apps/orchestrator` — Temporal orchestrator (scheduling)
- `apps/commands`, `apps/extension`, `apps/sdk` — CLI, browser extension, SDK
- `libraries/nestjs-libraries` — code backend dùng chung (providers, AI, DB đều ở đây)
- `libraries/react-shared-libraries` — UI dùng chung
- `libraries/helpers`

**Lưu ý submodule:** `.gitmodules` trỏ tới `libraries/plugins/src/list/public-api` (git@github.com:gitroomhq/public-api.git). Clone `--depth 1` nên CHƯA fetch submodule này. Nếu build lỗi thiếu public-api → chạy `git submodule update --init` (có thể cần SSH key, hoặc đổi URL sang https).

---

## 5. KẾ HOẠCH (PHASES)

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Clone Postiz + chạy được dev server local | ✅ Xong (đăng nhập OK) |
| 1 | Rebrand Postiz → Việt Anh Media Hub (logo, tên, màu, favicon) | ✅ Xong |
| 2 | Đổi AI caption OpenAI → Claude | ✅ Xong (openai.service.ts) |
| 2b | Đổi AGENT Postiz sang Claude (CopilotKit+Mastra+LangGraph) | ✅ Xong (cần test) |
| 3 | Cầu nối Zalo→Postiz (đẩy bản nháp qua Public API) + UI cấu hình | ✅ Xong khung (cần cắm key + test) |
| 3b | Zalo tích hợp trong giao diện Postiz (sidebar "Zalo" + nhúng bảng) | ✅ Xong (cần rebuild để thấy) |
| 4 | Kênh dễ (Telegram/Discord/Mastodon) cho demo | ⏳ Gộp vào setup (user kết nối) |
| 5 | Zalo OA provider (đăng NGƯỢC từ Postiz ra Zalo) | ☐ Chưa (để sau) |
| 6 | Test end-to-end thật + SOP | ☐ Chưa (cần user chạy + cấp key) |

**Ước tính với AI hỗ trợ code: ~5–6 tuần** (không AI: ~9 tuần).

PRD chi tiết đã có: `D:\Zalo bot group\PRD-Viet-Anh-Media-Hub-v2.docx` (bản DOCX đầy đủ 12 mục + checklist).
Demo UI tương tác đã dựng (mockup, chưa phải Postiz thật) — cho thấy 1 giao diện + 2 backend, nút "giả lập ảnh từ nhóm Zalo".

---

## 6. TRẠNG THÁI HIỆN TẠI  ⚠️ CẬP NHẬT MỤC NÀY MỖI BƯỚC

**VỊ TRÍ:** dự án đã chuyển sang **`C:\Media_Hub_VietAnh`** (bản `D:\Media_Hub_VietAnh` là backup, xoá được). Hệ Zalo vẫn ở **`D:\Zalo bot group`** (chạy `start.bat`, dashboard :8088).

- ✅ Postiz chạy được, **ĐĂNG NHẬP OK** (tài khoản `duong@vietanh.edu.vn` / `VietAnh@2026`).
- ✅ Chạy bằng **1 lệnh**: `C:\Media_Hub_VietAnh\start-postiz.bat` (= `node run.mjs`: tự bật Docker + tự build nếu thiếu + 1 cửa sổ). Build lại khi đổi code: `start-postiz.bat --rebuild`.
- ✅ Rebrand xong; AI caption + Agent chạy Claude; Zalo có mục trong sidebar Postiz.
- ⚠️ **CẦN LÀM (user):** (1) điền `ANTHROPIC_API_KEY` vào `C:\Media_Hub_VietAnh\.env` (cho Agent + composer AI). (2) Trong Postiz tạo API key (Settings→Public API) + kết nối ≥1 kênh. (3) Restart bot Zalo (D:) + build lại Postiz 1 lần → vào Sidebar→Zalo cấu hình. (4) Test luồng thật.
- ☐ **CHƯA TEST THẬT** nhiều phần (Claude không tự chạy/test app được — user chạy `start-postiz.bat` để kiểm). Agent Claude có thể cần chỉnh (khác format tool-calling).
- ✅ **Git đã gọn (2026-07-06):** toàn bộ custom đã commit (`1f7a148`, 233 file, +16.854/−2.830); remote `origin`→`upstream` (chỉ để pull update Postiz, KHÔNG push). Chưa có remote riêng để push backup — muốn backup lên GitHub private thì tạo repo mới rồi `git remote add origin <url>`.
- ✅ **Sẵn sàng deploy:** build production pass cả 3 app. Khi deploy máy mới: `corepack pnpm install` → `.env` (theo `.env.example`, có `ANTHROPIC_API_KEY`+`ZALO_*`) → `corepack pnpm run prisma-db-push` (schema có 4 model mới AiCredit/ViralPost/ViralSource/ViralClone + `Integration.postFooter`) → `start-postiz.bat`. Key nhập từ UI nằm ở file runtime KHÔNG commit: `anthropic-key.txt`, `viral-config.json`, `image-gen.json` (cwd = `apps/backend/`) — chuyển máy phải copy tay (hoặc nhập lại qua UI).

### ⚙️ MÔI TRƯỜNG (gotchas quan trọng)

- **Node:** máy đang chạy **v23.9.0** nhưng Postiz yêu cầu **`>=22.12.0 <23.0.0`** (field engines). `.npmrc` KHÔNG bật engine-strict nên install vẫn chạy. **NHƯNG** nếu install/build/runtime lỗi (đặc biệt native module `canvas`, `sharp`, `bcrypt`) → cài **Node 22 LTS** rồi cài lại. Máy KHÔNG có nvm/winget/fnm — phải tải Node 22 MSI thủ công hoặc cài nvm-windows.
- **pnpm:** shim KHÔNG nằm trên PATH. Luôn gọi **`corepack pnpm ...`** (không phải `pnpm` trần). Đã chạy `corepack enable`. Ví dụ: `corepack pnpm -C "D:\Media_Hub_VietAnh" install`.
- **Stack Postiz v1.47:** Next 16.2.6, React 19.2.4, NestJS 11, Temporal 1.14, Prisma 6.5.0, AWS S3 SDK (dùng cho MinIO/R2), `openai ^6.2.0` + `@langchain/openai` (đây là AI stack sẽ đổi sang Claude — cân nhắc dùng `@langchain/anthropic` hoặc SDK Anthropic).
- **Scripts chính:** `pnpm run dev` (chạy song song extension+orchestrator+backend+frontend); `pnpm run dev:backend` / `dev:frontend` chạy riêng; `pnpm run dev:docker` bật Postgres+Redis qua docker-compose.dev.yaml. `postinstall` tự chạy `prisma-generate`.
- **DB/Redis:** cần Postgres + Redis chạy trước khi dev. Dễ nhất: `pnpm run dev:docker` (đọc `docker-compose.dev.yaml` xem service gì).

---

## 7. VIỆC LÀM NGAY TIẾP THEO (cho session sau)

✅ Đã xong: `pnpm install`, tạo `.env`, bật Docker Postgres+Redis (đang chạy khi ghi dòng này).

**Các lệnh chạy dev (theo thứ tự) — LUÔN dùng `corepack pnpm`:**
```powershell
# 1. Đảm bảo Docker Desktop chạy, rồi bật Postgres + Redis:
docker compose -f "D:\Media_Hub_VietAnh\docker-compose.dev.yaml" up -d postiz-postgres postiz-redis
#    (Temporal nặng — chỉ bật khi cần scheduling: thêm service `temporal temporal-postgresql temporal-elasticsearch temporal-ui`)

# 2. Đẩy schema Prisma vào DB (tạo bảng) — chạy 1 lần đầu:
corepack pnpm -C "D:\Media_Hub_VietAnh" run prisma-db-push

# 3. Chạy backend + frontend (KHÔNG kèm orchestrator/extension cho nhẹ):
corepack pnpm -C "D:\Media_Hub_VietAnh" run dev-backend
#    ⚠️ DÙNG `dev-backend` (GẠCH NGANG) — KHÔNG dùng `dev:backend` (HAI CHẤM)! Xem gotcha Windows.
#    Full stack (có Temporal orchestrator + extension): run dev — nhưng cần Temporal đang chạy
```
- Frontend: **http://localhost:4200** · Backend API: **http://localhost:3000**
- Mục tiêu Phase 0 = mở được trang đăng ký/đăng nhập Postiz ở localhost:4200, tạo user đầu tiên.

**🪟 GOTCHA WINDOWS (quan trọng):** nhiều script ở `package.json` gốc dùng lệnh Unix `rm -rf` (vd `dev:backend`, `dev:frontend`, `build:*` — loại HAI CHẤM) → **CRASH trên Windows/PowerShell** ("'rm' is not recognized"). Cách né:
  - Dùng script loại GẠCH NGANG `dev-backend` (gọi thẳng `dev` per-app, không có `rm`).
  - Script `dev` per-app sạch: backend = `nest start --watch`, frontend = `next dev -p 4200`.
  - Hoặc chạy riêng: `corepack pnpm --filter ./apps/backend run dev` và `... ./apps/frontend run dev` (xoá `dist` thủ công bằng `Remove-Item` nếu cần).
  - Hoặc chạy qua Git Bash (có `rm`) — nhưng pnpm trên Windows mặc định dùng cmd để chạy script nên vẫn có thể lỗi; an toàn nhất là dùng script gạch-ngang.
4. Khi UI chạy được → bắt đầu Phase 1 (rebrand). Ghi tiến độ vào file này.

**GOTCHA `.env` (đã xử lý):** `.env.example` ghi DATABASE_URL sai creds so với docker-compose.dev.yaml. File `.env` đã sửa đúng: user `postiz-local` / pwd `postiz-local-pwd` / db `postiz-db-local`. STORAGE_PROVIDER=local (không cần Cloudflare R2 khi dev). OPENAI_API_KEY để trống (Phase 2 đổi Claude).

**Việc cần NGƯỜI DÙNG (không tự làm được — nhắc họ):**
- Đăng ký Facebook App / TikTok Developer / Google OAuth (cần tài khoản, xác minh DN, chờ duyệt).
- Đăng nhập session Zalo (quét QR bằng điện thoại).
- Cấp `ANTHROPIC_API_KEY`.
- VPS, domain, secrets production.
- Anh Dương duyệt UX/nghiệp vụ.

---

## 8. NHẬT KÝ (LOG) — thêm dòng mới nhất lên đầu

- **2026-07-06 (48): 🧹 DỌN REPO + COMMIT LẦN ĐẦU + CHUẨN BỊ DEPLOY.** (1) Xoá 6 log runtime `_*.log` + `tunnel-url.txt`; `.gitignore` thêm `_*.log`, `var/`, và — QUAN TRỌNG — 2 file key runtime chưa được ignore: `viral-config.json` (token Apify/YouTube), `image-gen.json` (key OpenAI/Fal); rà secret toàn code: sạch (key chỉ ở env/file đã ignore). (2) `git remote rename origin upstream` — hết nguy cơ push nhầm lên `gitroomhq/postiz-app` public; muốn backup thì tạo repo private riêng làm `origin` mới. (3) README.md viết lại cho Media Hub (bỏ marketing Postiz); `.env.example` thêm `ANTHROPIC_API_KEY` + `ZALO_APP_ID/SECRET`. (4) Build production `corepack pnpm run build` PASS cả 3 app (frontend đủ route /login /viral /zalo). (5) **Commit `1f7a148`**: 233 file (+16.854/−2.830) — TOÀN BỘ custom từ khi fork giờ mới nằm trong git; working tree sạch. Deploy máy mới: install → .env → prisma-db-push → start-postiz.bat; nhớ copy tay 3 file key runtime (không nằm trong git).
- **2026-07-04 (47): 🌐 SONG NGỮ ĐÚNG CHUẨN (English = mọi thứ tiếng Anh trừ content; Tiếng Việt = tiếng Việt hết).** Lỗi trước: nhiều chuỗi hardcode `t('key','Tiếng Việt')` (mặc định = tiếng Việt) + 365 dòng tiếng Việt THÔ chưa qua `t()` → English mode vẫn ra tiếng Việt. Sửa bằng **Workflow 25 agent** (mỗi file 1 agent): chuyển default code sang TIẾNG ANH + bọc raw string thành `t('key','English')`, trả `{key,en,vi}`. 20/25 file sửa, **377 chuỗi**; script `i18n-merge.mjs` gộp **311 key mới vào cả vi + en** JSON (không đè key Postiz sẵn có; 8 key trùng giữ bản Postiz). Cơ chế đúng: code default = English → English mode; `vi/translation.json` có bản dịch → Vietnamese mode. GIỮ TIẾNG VIỆT (brand/content): brand.showcase (MỘT ĐỘI NGŨ/KỂ CHUYỆN VIỆT ANH), "sản phẩm của Trường Việt Anh", tên riêng, AI system prompt. Build FE exit 0 (không vỡ file nào). Verify: `viral_title` code='Winning Post Forge', vi='Lò Bài Thắng', en='Winning Post Forge'.
- **2026-07-04 (46): 🏆 TRANG MỚI "LÒ BÀI THẮNG" (/viral) — bắt bài viral giáo dục → AI mổ công thức → nhân bản thành bản nháp.** Thước đo chính: LƯỢT SHARE. Nguồn dữ liệu (đã khảo sát: share của người khác KHÔNG free qua API — BuzzSumo $199, Fanpage Karma $69; nên):
  - **FREE:** dán tay Link/Text/Ảnh → `OpenaiService.viralAnalyze` (Claude vision đọc số share ngay trên ảnh); RSS báo/blog (`crawlRss`, parse XML regex) + tra `share_count` 1 URL qua Graph API app-token (`fbShareCount`, free); YouTube Data API (`crawlYoutube`, cần key free Google, xếp theo view — YouTube KHÔNG có share ở đâu). Link nhanh chính chủ: TikTok Creative Center, FB Ad Library, Google Trends, YouTube Trending.
  - **TRẢ PHÍ (tùy chọn):** token Apify → `crawlApify` (actor facebook-posts/instagram/tiktok scraper) lấy bài + share. Bản free Apify $5/tháng.
  - **AI 3 hàm** trong `openai.service`: `viralAnalyze` (metadata), `viralFormula` (mổ hook/cấu trúc/cảm xúc/format/whyShared — cache vào `ViralPost.formula`), `viralClone` (sinh bài Việt Anh MỚI theo công thức, KHÔNG copy → `createPost` type:draft vào hàng chờ duyệt).
  - **Model mới:** `ViralPost` (platform/level/title/shares/likes/comments/views/formula/clonedCount…) + `ViralSource` (nguồn theo dõi, cờ `auto`). Backend: `viral/viral.keys.ts` (config Apify/YouTube/chu-kỳ), `database/prisma/viral/{repository,service}`, controller `/viral` (list/capture/:id/formula/:id/clone/crawl/config/sources). Đăng ký 2 module. **Scheduler cào định kỳ** (`ViralService.onModuleInit` + setInterval theo `crawlEveryHours`) — CHỈ chạy backend (`main.ts` set `RUN_VIRAL_CRAWLER=1`, orchestrator không set → tránh cào 2 lần).
  - **Frontend:** `components/viral/viral.component.tsx` — panel đồng bộ app (bg-newBgColorInner), tab nền tảng + chip cấp học + sort theo share, thẻ ảnh/tiêu đề/số liệu (share vàng nổi bật), click thẻ → popup xem chi tiết + mổ công thức + nhân bản 1 chỗ; modal Thêm bài / Thêm nguồn / Cấu hình; nút "Cào ngay". Menu "Bài Thắng" (`top.menu.tsx`, sau Zalo). Mockup gốc: artifact 804900c9.
- **2026-07-03 (45): 🔀 GOM AUTH VỀ MỘT ROUTE `/login` (bỏ `/auth`) + FORM MỜI GỌN + CHÂN BÀI Ở PREVIEW.**
  - **Refactor `/auth` → `/login`:** `cp -r (app)/auth (app)/login`, xoá route trùng `login/login` + self-service `login/forgot/page.tsx`, xoá hẳn `(app)/auth`. **PHÂN BIỆT:** trang & điều hướng dùng `/login`; **API backend GIỮ `/auth/*`** (đi qua /hubapi, loại khỏi matcher — `fetchData('/auth/login')`, `/auth/register`, `/auth/oauth/*`... KHÔNG đổi). Proxy: đổi hết ref native `/auth`→`/login` + thêm redirect đầu file `/auth*`→`/login*` (giữ /forgot,/activate). Link nav (href/router.push) sed sang `/login`. `layout.context` import `useReturnUrl` từ `/login/return.url.component`. Backend link reset/forgot → `/login/forgot/<token>`. **Verify curl:** /login=200, /auth→307→/login, /(chưa auth)→307→/login, follow-redirect 0 hops (KHÔNG loop), /auth/forgot/X→/login/forgot/X→200.
  - **Form mời gọn (register.tsx RegisterAfter):** decode cookie `org` (JWT chuẩn, `atob` payload) → `isInvite` + email điền sẵn khoá (`readOnly`). Chế độ mời ẩn Google/Github/OAuth, ẩn Company (đặt default 'Trường Việt Anh' cho qua validate), ẩn Terms + "Already have account", heading "Đặt mật khẩu", nút "Đặt mật khẩu & vào". Không email → đăng ký hoàn tất ngay, set cookie auth → vào app.
  - **Chân bài hiện ở PREVIEW:** `high.order.provider.tsx` `withFooter()` chèn `postFooter` vào content của IntegrationContext (chỉ preview; ô nhập giữ sạch).
- **2026-07-03 (44): 👤 QUẢN LÝ TÀI KHOẢN (admin-only) + FIX 3 UI + CHÂN BÀI HIỆN Ở PREVIEW.**
  - **Quản lý tài khoản (chỉ admin tạo/mời):** Máy KHÔNG có email/SMTP → toàn bộ admin-driven. `org.service.inviteTeamMember(origin)` + `generateMemberResetLink(org,userId,origin)` (ký `{id,expires+2d}` bằng `AuthService.signJWT` = token mà `/auth/forgot/<token>`+`/forgot-return` nhận). `settings.controller`: `@Post('/team')` nhận `@Body('origin')`, thêm `@Post('/team/:id/reset-password')` (gate ADMIN). **Link mời/reset dùng `window.location.origin`** (frontend gửi kèm) → mở được từ tunnel/LAN, hết kẹt `FRONTEND_URL=localhost`. `teams.component.tsx` viết lại: Việt hoá, chỉ ADMIN thấy nút, tạo link copy được (LinkResult modal), nút "Đặt lại mật khẩu" mỗi thành viên. Login: bỏ link tự-quên-MK → "Liên hệ quản trị viên". **FIX LỖI NGHIÊM TRỌNG:** `/auth/page.tsx` trước chỉ `<Login/>` (login-only) → người được MỜI mở link không đặt được mật khẩu; sửa: đọc cookie `org` (next/headers `await cookies()`) → có mời thì `<Register/>` (form đặt MK), không thì Login. Không email nên đăng ký-qua-mời hoàn tất NGAY (`activationRequired=false`).
  - **3 UI fix:** logo VA bỏ `mt-[8px]` (hết tụt); ẩn Plugs khỏi menu (`top.menu.tsx` item `hide:true`, cả desktop+mobile lọc `f.hide`); trang Integrations bỏ `ThirdPartyComponent` cũ, chỉ còn dashboard credit (`ai.credits.component` bọc panel `bg-newBgColorInner p-[24px]`).
  - **Chân bài hiện ở PREVIEW:** backend chèn lúc createPost (vô hình trong composer) → thêm chèn client cho XEM TRƯỚC: `high.order.provider.tsx` `withFooter()` chèn `postFooter` vào content của IntegrationContext (phần cuối, trên hashtag, idempotent). `/integrations/list` trả `postFooter` thô nên store có sẵn. **Ô nhập giữ sạch** (footer cố định, không sửa). *Caveat: SWR list cache (revalidateIfStale:false) → đổi footer xong cần refresh trang để composer thấy.*
- **2026-07-03 (43): 🚨 VÁ LỖI TIỀM ẨN — ORCHESTRATOR (worker đăng bài) CHƯA TỪNG CHẠY → bài lên lịch không đăng.** Backend = client Temporal (`getTemporalModule(false)`) chỉ xếp workflow vào queue `main`; **orchestrator = worker** (`getTemporalModule(true)`) mới chạy `PostActivity.postSocial` để đăng thật. Orchestrator dist chưa build + run.mjs không start → bài duyệt xong **nằm im trong hàng đợi, không bao giờ lên Facebook** (lỗi im lặng). Vá: build `apps/orchestrator` + start ngay (worker `main`+`facebook`+mọi queue state RUNNING, health :3002, 0 lỗi Temporal/DB) + **thêm vào run.mjs** (build nếu thiếu + `start('orchestrator',34,...)` cạnh backend, tự bật mỗi lần). Từ giờ hệ đủ 5 chân: backend:3000 · orchestrator:3002 · frontend:4200 · bot:8088 · tunnel. Xem memory `media-hub-ops`.
- **2026-07-03 (42): 🧩 6 TINH CHỈNH THEO YÊU CẦU USER (ngôn ngữ, Filerobot, ẩn kênh, key ảnh, chân bài, dashboard credit).**
  - **#1 Ngôn ngữ:** `language.component.tsx` lọc `availableLanguages` chỉ còn `['en','vi']` (không đụng mảng `languages` global của i18n).
  - **#2 Filerobot:** `filerobot.editor.tsx` thêm nút "Tải ảnh lên để sửa" (đọc file → dataURL → source, `key={src}` remount) + layout `flex h-full` lấp đầy; `designMedia` (media.component) đổi modal sang `size:'calc(100%-120px)' + height:'calc(100vh-120px)'` → modal căn giữa + editor lấp đầy (hết khoảng trắng thừa).
  - **#4b Ẩn kênh:** `integration.manager.ts` — `getAllIntegrations()` lọc `HIDDEN_SOCIAL` (18 kênh: dribbble/slack/kick/twitch/mastodon/bluesky/lemmy/wrapcast/nostr/vk/medium/devto/hashnode/wordpress/listmonk/moltbook/whop/mewe). Ẩn khỏi UI, KHÔNG gỡ provider (kênh đang kết nối vẫn đăng). Verify API: còn 15 kênh, 0 kênh ẩn lọt.
  - **#3 Key tạo ảnh (đa nhà cung cấp):** Claude không tạo ảnh → `image.key.ts` (mới) lưu provider (openai/fal) + key, nạp env, `hasImageGenKey()`. `media.service.generateImage`: chưa key → `HttpException` (không tạo ảnh hỏng); route openai (b64) / fal (fetch URL→base64, `generateImageFal`). Endpoint `GET/POST /copilot/image-key` (gate super-admin). UI `image.gen.component.tsx` trong Settings (chọn OpenAI/Fal + dán key). `ai.image.tsx` chỉ nhận ảnh có `{id,path}`, lỗi thì toast (không thêm ảnh hỏng). Import `image.key` trong `main.ts`.
  - **#4a Chân bài từng page:** cột mới `Integration.postFooter String?` (db push, nullable). `integration.service.updatePostFooter` + endpoint `POST /integrations/:id/footer` + `/list` trả `postFooter`. Chèn lúc `posts.service.createPost` qua `applyPostFooter()` — DƯỚI caption, TRÊN khối hashtag cuối, idempotent (không lặp khi sửa). UI: menu kênh (`menu.tsx`) thêm mục "Chân bài cố định" → `footer.modal.tsx` (textarea). *Lưu ý: orchestrator (:3002) KHÔNG chạy nên chèn ở createPost thay vì lúc publish — footer nằm sẵn trong content.*
  - **#6 Dashboard credit AI:** model mới `AiCredit` (org, provider, label, apiKey, balance, unit, threshold, auto, lastChecked/Error — KHÔNG relation Organization). `ai-credits/` repo+service (`ai.credit.*`), controller `/ai-credits` (list/create/update/delete/:id/refresh, mask apiKey). Đăng ký `database.module` + `api.module`. HeyGen tự lấy số dư (`remaining_quota ÷60`); **Anthropic/OpenAI/Google AI Studio KHÔNG có API số dư → nhập tay** (giới hạn từ nhà cung cấp). UI `ai.credits.component.tsx` (card + cảnh báo ngưỡng đỏ + refresh) gắn vào trang Integrations (`third-party/page.tsx`, giữ ThirdPartyComponent bên dưới).
  - **#5 Analytics:** không phải lỗi — cần bấm "Refresh Channel" (token FB hết hạn) + có bài đăng qua Hub. Giải thích, không sửa code.
- **2026-07-03 (41): 🖼️ THAY POLOTNO → FILEROBOT IMAGE EDITOR (MIT, miễn phí, KHÔNG license/watermark) + KHÔI PHỤC SAU SỰ CỐ DOCKER.**
  - **Filerobot:** user không có license Polotno → thay hẳn. Cài `react-filerobot-image-editor` (pnpm, workspace frontend). Component mới `apps/frontend/src/components/launches/filerobot.editor.tsx`: nạp `dynamic(ssr:false)` (editor đụng window khi import), tab Annotate/Adjust/Filters/Finetune/Resize/Watermark (chuỗi, KHÔNG import enum để khỏi kéo window vào SSR), nguồn = ảnh đang có HOẶC nền trắng 1080×1080 khi thiết kế từ đầu. `onBeforeSave={()=>false}` (bỏ hộp tải file) → `onSave` upload thẳng `/media/upload-simple` → `setMedia`. `media.component.tsx`: đổi cả 2 chỗ `<Polonto>` (`designMedia` + `showDesignModal`) sang `<FilerobotEditor>`, bỏ import Polonto. Build FE production EXIT=0 (32 chunk chứa filerobot). Polotno cũ giữ file `polonto.tsx` (không còn import).
  - **SỰ CỐ DOCKER (mất ~1 buổi):** Docker Desktop crash lặp `initializing Inference manager/Secrets Engine ... *.sock ... syntax is incorrect`. Whack-a-mole xoá/đổi tên socket dir VÔ ÍCH (Docker tạo lại rồi lại lỗi). User lỡ bấm **Reset to factory defaults** — MAY là daemon không chạy nổi nên KHÔNG xoá được volume (`postgres-volume` sống). Nguyên nhân thật = **Winsock/AF_UNIX Windows hỏng**. Sửa: `netsh winsock reset` (admin) + reboot → `docker info` OK (Server 29.2.1). Dữ liệu nguyên: 1 user/1 org/4 kênh/3 post. Xem memory `docker-afunix-socket-crash`. **Bài học: gặp lỗi *.sock "syntax is incorrect" → winsock reset ngay, đừng đụng file Docker; TUYỆT ĐỐI không bấm Reset factory defaults.**
- **2026-07-02 (40): 🗑️ AGENT XÓA CHAT + 🎨 KHÔI PHỤC DESIGN MEDIA (ẩn chữ đòi license) + REBRAND LỜI CHÀO AGENT.** Backend `POST /copilot/list/:id/delete` (verify org). `agent.tsx`: nút thùng rác mỗi thread (hiện khi hover) + `deleteChat`. `media.component.tsx`: `canDesign=true` (Design Media luôn hiện). Rebrand "Việt Anh Media Hub agent"→"Social Hub agent" trong 16 file translation JSON (đây là lý do tên cũ còn hiện dù đã sửa code). *(Ghi chú: Design Media sau đó được thay hẳn sang Filerobot ở mục 41.)*
- **2026-07-02 (39): 🛡️ TỔNG RÀ SOÁT 25 AGENT → VÁ 18 LỖI THẬT (3 CRITICAL bảo mật) + ĐƠN GIẢN HÓA TRANG ZALO.**
  - **CRITICAL bảo mật tunnel (đã vá + verify qua URL public thật):**
    1. `proxy.ts` /botapi chỉ check cookie truthy + nhận `?loggedAuth=1` → ai cũng điều khiển bot qua tunnel. FIX: `botApiGuard` verify JWT THẬT bằng `jose` (jwtVerify HS256, JWT_SECRET) TRƯỚC mọi nhánh; bỏ loggedAuth cho botapi. Verify: loggedAuth=1 → 401, cookie rác → 401, JWT thật → 200 ✓.
    2. Bot `/api/postiz/*` không auth + listen 0.0.0.0 → LAN gọi thẳng đăng FB/xoá/logout. FIX: **`app.listen(PORT, '127.0.0.1')`** (web.mjs) — chỉ máy chủ (proxy qua 127.0.0.1) gọi được; LAN IP:8088 → refused ✓.
    3. Client dùng bot: đổi `getBotUrl` LUÔN same-origin `/botapi` (bỏ isLanHost lệch regex #8/#11) → cookie 'auth' tự đi kèm fetch/img → proxy verify JWT. Đơn giản hơn, an toàn hơn.
  - **MAJOR (đã vá):** (#4) bot refuse chạy nếu DASHBOARD_PASS mặc định/yếu (<8 ký tự); (#7/#13/#17) key Claude + OAuth social-keys là biến TOÀN CỤC instance → gate `assertSuperAdmin` ở copilot.controller (3 route) + settings.controller (2 route) — **đã set duong.isSuperAdmin=true** (trước đó false → nếu gate mà không set sẽ tự khóa!); (#16) MobileNav z-[200]→z-[150] (đè nút Post Now/Schedule trong modal trên mobile).
  - **MINOR (đã vá):** (#5) `.env` DISABLE_REGISTRATION=true (chặn /hubapi/auth/register qua tunnel — verify "Registration is disabled" ✓); (#12) bot đánh dấu `pushedToHub` khi auto-đẩy → panel Zalo hiện "✓ Đã ở Media Hub" thay nút đẩy lại (hết nhân đôi bài); (#14) sync-zalo-bot fetch AbortSignal.timeout(8000); (#15) ai-caption chặn ảnh >20MB + sharp limitInputPixels 50M.
  - **KNOWN LIMIT (không vá, ghi chú):** (#9) upload file >100MB qua tunnel Cloudflare free bị 413 — localhost/LAN không sao; ảnh Uppy nén 1000px nên hiếm gặp. 2 finding bị BÁC (save() không còn integrationId; toast integrations sai — code đã đổi).
  - **ĐƠN GIẢN HÓA TRANG ZALO (theo user):** BỎ hẳn card "Key Claude" (giờ tự đồng bộ NGẦM key từ Settings 1 lần khi mở trang — `keySynced` ref, chỉ super-admin); BỎ "kênh mặc định" — kênh chọn theo TỪNG nhóm ở danh sách (dropdown vàng cảnh báo nhóm nghe chưa gán kênh + banner "N nhóm chưa chọn kênh"). Còn 2 bước: (1) Kết nối = dán API key; (2) Bật cầu nối. `running` = enabled+hasKey+zaloLogged (bỏ integrationId). Verify tunnel: card Claude/kênh-mặc-định mất, 23 botapi call 200, 0 lỗi.
  - Link dashboard bot :8088 chỉ hiện khi mở từ máy chủ (localhost) vì bot bind loopback. Build FE+BE EXIT=0.

- **2026-07-02 (38): 🤖 FIX "Agent không trả lời" — 4 chỗ gọi backendUrl TRẦN không qua resolveBaseUrl.**
  - **Chẩn đoán:** backend agent vẫn chạy hoàn hảo (curl mutation agentSession postiz → Claude trả lời ✓). Lỗi ở CLIENT: `agent.chat.tsx` tạo CopilotKit riêng với `runtimeUrl={backendUrl + '/copilot/agent'}` — KHÔNG qua resolveBaseUrl → mở từ điện thoại/LAN/tunnel là gọi về localhost:3000 = chính thiết bị người xem → chết im.
  - **Vá 4 chỗ** bọc resolveBaseUrl: agent.chat.tsx (runtime agent), preview.wrapper.tsx (runtime chat trang preview), media.settings.component.tsx (/public/stream video), **uppy.upload.ts (endpoint upload media — trước đó upload từ điện thoại/tunnel cũng chết!)**. Tăng `proxyTimeout` 90s→300s (stream AI dài qua /hubapi).
  - **BÀI HỌC chèn import bằng script:** file bắt đầu `'use client'` + import nhiều dòng → chèn "sau dòng import đầu" làm VỠ statement (build fail 2 lần). Cách đúng: chèn TRƯỚC `^import ` đầu tiên (regex multiline).
  - Build EXIT=0. **VERIFY E2E qua tunnel thật:** Playwright mở /agents/new, gõ câu hỏi, Agent TRẢ LỜI ("tôi hoạt động bình thường 😊"), mọi call đi /hubapi/copilot/agent ✓. Localhost không đổi hành vi (resolveBaseUrl là identity).

- **2026-07-02 (37): 🏷️ REBRAND → "SOCIAL HUB" + CHỈ-LOGIN (bỏ đăng ký & Google) + polish showcase.**
  - **Rebrand toàn app:** thay MỌI chuỗi hiển thị "Việt Anh Media Hub"/"Việt Anh Hub" → **"Social Hub"** (42 file: titles, logo text, settings, zalo page, toasts backend...). GIỮ NGUYÊN "Trường Việt Anh" (thương hiệu mẹ + giọng AI VIET_ANH_SYSTEM không đổi). Dòng phụ "MỘT SẢN PHẨM CỦA TRƯỜNG VIỆT ANH" đặt dưới logo ở màn login + trong showcase.
  - **Auth chỉ-login:** `/auth` (page.tsx) giờ render thẳng `<Login/>` (hết trang Sign Up; title "Social Hub — Đăng nhập"); login.tsx bỏ toàn bộ OAuth (Google/Farcaster/Wallet + "Continue With"/OR) + bỏ link "Sign Up", thêm ghi chú "Tài khoản do quản trị viên cấp — liên hệ team marketing". Giữ Forgot password. Register component còn trong repo nhưng không còn route trỏ tới.
  - **Layout login cao đúng màn hình:** auth/layout `min-h-dvh lg:h-dvh lg:overflow-hidden` (desktop hết scroll dọc), cột form `lg:overflow-y-auto` dự phòng màn thấp.
  - **Showcase:** copy mới đỡ sến — sub "All-in-one social command center — vận hành bởi team marketing Major Education."; display đổi dòng 3 thành "SOCIAL HUB"; utility bar "SOCIAL HUB — MAJOR EDUCATION"; badge xoay "SOCIAL HUB ✦ MAJOR EDUCATION"; **grid nền giờ CHUYỂN ĐỘNG** (keyframes va-grid pan 5s linear, có reduced-motion). Gotcha Tailwind: bản này KHÔNG hỗ trợ variant `min-[1500px]:` (class chết im lặng — thẻ bay biến mất ở 1600px) → thêm screen `wide {raw:'(min-width:1500px)'}` vào tailwind.config.cjs, dùng `wide:block`.
  - Build FE+BE EXIT=0, verify Playwright 1600px: title/logo Social Hub ✓, không Google/Sign Up ✓, note cấp tài khoản ✓, dòng sản phẩm ✓, sub mới ✓, copy cũ sạch ✓, grid animation chạy ✓, không scroll dọc ✓, 3 thẻ bay hiện lại ✓.
  - **Bổ sung theo user:** heading showcase KHÔI PHỤC dòng 3 về "KỂ CHUYỆN VIỆT ANH" (bộ ba "MỘT ĐỘI NGŨ / MỌI NỀN TẢNG / KỂ CHUYỆN VIỆT ANH" là câu chốt thương hiệu — không thay bằng "SOCIAL HUB"). Build + verify lại ✓.

- **2026-07-02 (36): 🌍 TUNNEL PUBLIC — truy cập từ xa qua Cloudflare Quick Tunnel (1 URL cho cả frontend+backend+bot).**
  - **Chạy: `start-tunnel.bat`** (= `node tunnel.mjs`; yêu cầu start-postiz.bat đang chạy). Lần đầu tự tải `tools/cloudflared.exe` chính chủ GitHub Cloudflare (~60MB). In URL `https://<random>.trycloudflare.com` + lưu `tunnel-url.txt`. URL ĐỔI mỗi lần chạy lại (muốn cố định → ngrok có tài khoản / Cloudflare named tunnel). Đóng cửa sổ = tắt truy cập từ xa.
  - **Kiến trúc 1-URL:** qua tunnel không gọi thẳng được cổng 3000/8088 → thêm rewrites trong next.config: `/hubapi/:path*`→127.0.0.1:3000, `/botapi/:path*`→127.0.0.1:8088. Client tự chọn đường theo hostname (3 nhánh trong `resolveBaseUrl` + `getBotUrl`): localhost→trực tiếp; LAN IP/hostname không chấm/*.local→đổi host giữ port; còn lại (public)→`origin/hubapi|/botapi`. `fixMediaHost`+`LanMediaFix` đổi sang thay NGUYÊN origin (ảnh chạy đúng cả https tunnel).
  - **Bảo mật:** proxy.ts matcher bỏ `hubapi/` (backend tự xác thực; /hubapi/auth/login phải chạy khi chưa cookie — verify 400 chứ không redirect ✓) nhưng GIỮ `botapi/` → bot API qua tunnel bị GATE bằng cookie đăng nhập (không cookie → 307 /auth ✓, có cookie → 200 ✓). URL random khó đoán + app có màn login.
  - **VERIFY end-to-end qua URL public thật** (Playwright viewport điện thoại đi qua Cloudflare edge): /launches 11 call qua /hubapi (0 call localhost), calendar+6/6 ảnh hiện qua origin tunnel; /zalo 16 call qua /botapi, pill + ảnh QR hiện; 0 request fail. Build EXIT=0. `tools/` + `tunnel-url.txt` đã vào .gitignore.

- **2026-07-02 (35): ✨ BRAND SHOWCASE MÀN ĐĂNG NHẬP (kiểu Studio Freight, theo yêu cầu "wow" của user) + XOÁ testimonial.component.tsx.**
  - Component mới `components/auth/brand.showcase.tsx` (client): typography khổng lồ tiếng Việt font **Anton** (next/font, subset vietnamese) 3 dòng "MỘT ĐỘI NGŨ / MỌI NỀN TẢNG / KỂ CHUYỆN VIỆT ANH" (outline-stroke / trắng / xanh điện #3f8dff); **marquee vô tận** dưới đáy (NHÓM ZALO → AI VIẾT CAPTION → CHỜ DUYỆT → ...); 3 **mock card bay lơ lửng** (Đã lên lịch/Chờ duyệt Zalo/AI caption — chỉ hiện ≥1500px để không đè chữ); **huy hiệu tròn xoay** "TRƯỜNG VIỆT ANH ✦ MEDIA HUB"; đồng hồ TP.HCM chạy thật; 2 quầng glow xanh trôi + lưới mờ. Toàn bộ CSS thuần, có `prefers-reduced-motion` tắt hết. auth/layout.tsx gắn `<BrandShowcase/>` (chỉ hiện lg+; mobile giữ form thuần). ĐÃ XOÁ `components/auth/testimonial.component.tsx` (dọn kho).
  - Đã tạo **PRODUCT.md** (register/product + ngoại lệ brand cho /auth, users, brand personality "tự tin — kỹ tính — sáng tạo trẻ", anti-references không-Postiz, 5 design principles) — các lệnh /impeccable sau đọc file này. DESIGN.md chưa tạo (chạy `/impeccable document` khi cần).
  - Build EXIT=0, verify Playwright 1280/1440/1600: marquee animation chạy, clock tick, overflow-x=0, 1280 không còn card đè chữ (đã hạ ngưỡng hiện card từ xl→1500px sau vòng chụp đầu).

- **2026-07-02 (34): 🎨 BỎ TESTIMONIAL POSTIZ Ở MÀN ĐĂNG NHẬP/ĐĂNG KÝ.** `apps/frontend/src/app/(app)/auth/layout.tsx` viết lại: xoá khối "Over 20,000+ Entrepreneurs" + TestimonialComponent (marketing Postiz gốc, bao cả /auth lẫn /auth/login), thay bằng **panel thương hiệu Việt Anh** (logo VA gradient xanh + tagline "Trung tâm quản lý mạng xã hội của Trường Việt Anh" + 3 gạch đầu dòng tính năng, nền radial gradient mờ) — chỉ hiện màn rộng (lg), mobile giữ form thuần. File `components/auth/testimonial.component.tsx` không còn được import (xoá được). Build EXIT=0, verify Playwright: desktop có brand panel + hết chữ 20,000/Entrepreneurs, mobile 0 tràn ngang.

- **2026-07-02 (33): 📱 MOBILE/LAN HOÀN CHỈNH — truy cập từ điện thoại + responsive toàn app + FRONTEND CHUYỂN PRODUCTION MODE.**
  - **Vì sao điện thoại không vào được (4 tầng, đã fix hết):** (1) frontend hardcode gọi API `localhost:3000` → thêm `resolveBaseUrl()` trong `custom.fetch.func.ts` (đổi host theo trang đang mở, chỉ khi baseUrl là localhost & trang không phải localhost) — áp cho MỌI useFetch + CopilotKit runtimeUrl; (2) ảnh media lưu URL tuyệt đối localhost → `use.media.directory.ts` fixMediaHost + component mới `layout/lan.media.fix.tsx` (MutationObserver vá mọi img/video src localhost khi mở qua IP, gắn ở (app)/layout.tsx); (3) CORS: backend main.ts đổi origin thành callback cho phép IP private cùng port 4200; bot web.mjs HUB_LAN_RE cho origin LAN; trang Zalo `getBotUrl()` theo hostname (state botUrl tránh hydration mismatch); (4) **Next DEV chặn thiết bị khác**: allowedDevOrigins chỉ fix static chunks, còn websocket HMR treo với host ≠ localhost → trang trắng. → **CHUYỂN FRONTEND SANG PRODUCTION** (`run.mjs`: build nếu thiếu BUILD_ID + `next start`). ĐỔI CODE FRONTEND GIỜ PHẢI `start-postiz.bat --rebuild` (hoặc `corepack pnpm --filter ./apps/frontend run build:sentry`). Sửa 2 lỗi type chặn build (FC cho lan.media.fix + suppress.dev.warnings). **CẦN USER (1 lần, PowerShell Admin):** `netsh advfirewall firewall add rule name="VietAnh Media Hub" dir=in action=allow protocol=TCP localport=3000,4200,8088 profile=private` — rồi điện thoại cùng Wi-Fi mở `http://192.168.6.78:4200` (IP đổi thì xem `ipconfig`).
  - **Responsive (audit 3 agent → 7 blocker + 20 major, fix hết các blocker/major chính):** shell: sidebar ẩn trên ≤1025px, thay bằng **bottom nav** mới (`new-layout/mobile.nav.tsx`, tái dùng MenuItem, scroll ngang); header wrap + ẩn separator/extension; children `mobile:flex-col` (mọi trang panel tự stack); nút Support thu tròn. Calendar: mobile mặc định **Day view** (calendar.context matchMedia), Week/Month có sàn cột 150/110px → scroll ngang; icon hành động hover → `mobile:block`; filters wrap. Composer: preview `mobile:w-full` (đã bỏ `tablet:w-[440px]` vì cascade tablet ĐÈ mobile ở ≤1025!), footer thành cột dọc full-width, **Post Now thành nút tĩnh riêng trên mobile** (hover-only chết trên cảm ứng), toolbar + attachments wrap, emoji picker fixed. Modal mặc định `mobile:w-[calc(100vw-24px)]`; Add Channel grid 3/2 cột; Settings menu thành chip ngang; media: w8-max 4/3 cột (global.scss), tên file truncate có nền (hết đè chồng), pagination wrap; Zalo: panel phải stack (bỏ tablet:hidden), hàng nhóm wrap, select kênh xuống hàng riêng; auth h1 nhỏ lại, w-screen→w-full.
  - **VERIFY bằng Playwright** (bot có sẵn, channel:'chrome', viewport 414×880 isMobile + 768×1024): 5 trang chính **overflow-x = 0**, bottom nav hiện, calendar Day view, composer mở được + nút chính trong màn hình; **qua IP 192.168.6.78**: 11 API call đúng IP:3000, 8/8 ảnh sống (host tự đổi), trang Zalo gọi bot IP:8088 OK. Script audit: `D:\Zalo bot group\_mobile-audit*.mjs` (xoá được).
  - **LƯU Ý VẬN HÀNH MỚI:** frontend đổi code → PHẢI rebuild (`--rebuild`); dev mode chỉ dùng khi làm UI trên chính máy chủ (đổi run.mjs frontend `run start`→`run dev` tạm thời).

- **2026-07-02 (32): 🔑 DÙNG CHUNG 1 KEY CLAUDE + KÊNH RIÊNG TỪNG NHÓM (theo 2 câu hỏi kiến trúc của user).**
  - **1 key Claude cho cả 2 hệ:** endpoint mới `POST /copilot/anthropic-key/sync-zalo-bot` (copilot.controller.ts) — backend đọc key của Media Hub (getAnthropicKey) → gửi server→server sang bot `/api/claude/key` (key KHÔNG qua trình duyệt) → test luôn. Trang Zalo bước 1 có nút **"⚡ Dùng key Claude của Media Hub (khuyên dùng)"** (hiện khi Hub có key, đọc GET /copilot/anthropic-key). **ĐÃ CHẠY SYNC THẬT: bot /api/claude/test giờ trả {ok:true, model:claude-sonnet-4-6} — lỗi 401 của user ĐÃ HẾT** (key cũ trong bot sai, key Hub hợp lệ đè lên). Env tùy chọn `ZALO_BOT_URL` (mặc định localhost:8088).
  - **Kênh Media Hub RIÊNG cho từng nhóm Zalo:** route thêm field `postizIntegrationId` (config.mjs whitelist + routes.json). pushToPostiz nhận `integrationId` (ưu tiên route, fallback POSTIZ_INTEGRATION_ID); service.mjs + push-hub truyền route.postizIntegrationId. `POST /api/postiz/routes` giờ là PATCH (chỉ đổi field gửi lên: enabled/integrationId/name — đã test không phá enabled khi đổi kênh); overview trả kèm postizIntegrationId. UI: mỗi hàng nhóm có dropdown "→ Kênh mặc định / → tên kênh" (lọc BOT_SUPPORTED_PROVIDERS); bước 2 đổi tên thành **"Kênh mặc định trong Media Hub"** (chỉ dùng khi nhóm không chọn riêng); danh sách kênh giờ TỰ TẢI khi có API key (không cần bấm "Tải kênh").
  - Build backend EXIT=0, 4 file bot node --check PASS, restart, verify sống: sync key ✓, route patch + kênh riêng ✓ (test xong khôi phục routes.json), UI đủ nút/label mới ✓.

- **2026-07-02 (31): 🎛️ TRANG ZALO = DASHBOARD BOT ĐẦY ĐỦ (theo feedback user) — bỏ hero, thêm hàng chờ bot + điều khiển bot.**
  - **Bỏ hero:** xoá khối "Nguồn bài từ nhóm Zalo" + logo Z→ (user yêu cầu — header layout đã có chữ "Zalo"). Thanh trạng thái giờ chỉ còn 3 pill + nút "Mở Calendar duyệt bài" khi đang chạy.
  - **Key Claude 401:** user bấm Kiểm tra ra 401 invalid x-api-key = key ĐÃ LƯU trong bot (data/tokens.json) nhưng sai/bị thu hồi → UI mới: state `claudeKeyOk`, khi test fail → StepBadge đỏ "!" + desc đỏ hướng dẫn "tạo key mới tại console.anthropic.com → dán → Lưu" (lưu key mới tự reset trạng thái). **USER phải dán key Claude MỚI vào ô đó** (key này của bot, KHÁC key trong Settings Media Hub).
  - **Hàng chờ của bot ngay trong trang /zalo** (`Card "Hàng chờ của bot"`): mỗi bài hiện thumbnail (max 8, endpoint mới `GET /api/postiz/draft-image/:id/:idx` stream từ đĩa vì /output cần login), caption bấm-để-sửa (textarea + "Lưu caption" + "✨ AI viết lại" qua rewriteCaption của bot), hành động: **📥 Đẩy sang Media Hub** (push-hub, disabled khi cầu nối tắt), **Đăng Facebook ngay** (chỉ hiện khi route có token, confirm trước), **Từ chối** (xoá ảnh + bỏ khỏi hàng chờ, confirm). Timeout client 120s cho các hành động nặng.
  - **Nhóm đang nghe + realtime:** mỗi nhóm hiện trạng thái live (Chờ ảnh mới / Đang gom: x ảnh y video / stage xử lý / Đã tạo bản nháp) + nút "Chốt ngay →" khi đang gom (POST live/close).
  - **Card "Điều khiển bot"** (panel phải): toggle Tạm dừng bot (settings.paused), nút "Đổi tài khoản Zalo (đăng xuất)" (confirm → relogin QR mới), link dashboard chỉ còn cho việc hiếm (token FB/GBP).
  - **web.mjs thêm 11 endpoint** dưới `/api/postiz/*` (CORS whitelist sẵn): pending (list), draft-image/:id/:idx, pending/:id/save|rewrite|approve|reject|push-hub (mirror handler cũ, dùng chung publishFacebookDraft/approvalsOf/completePendingIfDone; push-hub import pushToPostiz từ postiz.mjs), live + live/close (mirror /api/live), settings (paused), zalo/logout (relogin). `node --check` PASS, restart OK.
  - **VERIFY:** pending trả bài thật "Nhóm Thái Sơn" (bài cũ không ảnh → draft-image 404 đúng logic, UI ẩn strip), live OK, trang /zalo render đủ: hero đã mất, hàng chờ (1) + sửa caption + Đẩy sang Media Hub + Điều khiển bot + QR — console 0 lỗi.

- **2026-07-02 (30): 🪄 TÍCH HỢP SÂU ZALO ↔ MEDIA HUB — redesign trang Zalo + nút bút phép thuật + luồng chờ duyệt.**
  - **Trang /zalo REDESIGN TOÀN BỘ** (`components/zalo/zalo.component.tsx` viết lại): full màn hình theo pattern panel mới (`bg-newBgColorInner` 2 cột trên nền `newBgLineColor`, giống Calendar), token mới (btnPrimary/btnSimple/newTableBorder/textItemBlur...). Tính năng mới ngay trong Media Hub: **QR đăng nhập Zalo** (quét không cần mở dashboard bot, nút "Tạo QR mới"), **chọn nhóm nghe** (bật/tắt từng nhóm + thêm nhóm mới có tìm kiếm), **nhật ký bot** (panel phải, tự refresh 8s), 3 pill trạng thái (bot/Zalo/cầu nối). Khi bật cầu nối tự tạo **tag "Zalo" (#0068FF)** trong org (GET/POST /posts/tags) để calendar nhận diện bài.
  - **Nút BÚT PHÉP THUẬT trong composer** (AI đọc ảnh → viết caption): backend `POST /media/ai-caption` (`media.controller.ts` — đặt TRƯỚC @Post('/:endpoint') catch-all; `media.service.generateAiCaptions`: check org + đọc file từ UPLOAD_DIRECTORY (cắt path sau '/uploads') hoặc fetch URL, sharp→JPEG≤1568px, check `organizationId===org.id`; `openai.service`: helper `claudeVision` blocks image+text + `generateCaptionsForImages` trả `{postCaption, imageCaptions[]}`; DTO `generate.ai.caption.dto.ts` max 20 ảnh). Frontend: `new-launch/magic.caption.tsx` (nút hồng bg-ai trong toolbar editor cạnh Signature/Bold/Emoji — `editor.tsx`), ghi caption vào TipTap (`setContent` + onChange sync store), ghi caption từng ảnh vào **alt** media (giữ field khác, xem/sửa khi bấm ảnh → Media Settings) + persist `/media/information`. Icon `MagicWandIcon` thêm vào `ui/icons/index.tsx`. Nút disable khi chưa có ảnh.
  - **Luồng Zalo → CHỜ DUYỆT trên calendar:** bot đẩy draft kèm `tags:[{value:'Zalo'}]` + **alt = caption từng ảnh** + date now+2h (không rớt khỏi tab Draft vì list lọc publishDate>=now). Calendar (`calendar.tsx` CalendarItem): bài DRAFT + tag Zalo → **viền vàng ⏳ + chữ "Chờ duyệt:"** (pattern giống ERROR). Banner mới `launches/zalo.pending.banner.tsx` trên đầu Calendar: đếm bài chờ duyệt (quét /posts ±7 ngày, hook SWR riêng refresh 60s), có bài mới tự `reloadCalendarView()` (khỏi F5), nút "Xem danh sách" nhảy sang list view tab Draft. Duyệt = click bài → composer → nút tự thành "Schedule".
  - **Bot Zalo (D:\Zalo bot group):** `postiz.mjs` pushToPostiz nhận thêm imageCaptions/videoCaptions → media[].alt + tag Zalo + date +2h; `service.mjs` truyền draft.imageCaptions (bot vốn đã sinh caption từng ảnh bằng captionImageSet, trước đây bị vứt). `web.mjs` thêm 6 endpoint dưới prefix `/api/postiz/*` (hưởng CORS :4200 sẵn, không auth như nhóm này từ trước): `GET overview` (trạng thái+routes+pendingCount), `GET qr` (ảnh QR), `POST zalo/reconnect`, `GET groups` (cache 5ph), `POST routes` ({threadId,name,enabled} — tạo/bật/tắt route tối thiểu, reload nóng), `GET logs` (80 dòng). 3 file `node --check` PASS.
  - **Build backend EXIT=0** (dist 14:58). Đã restart cả 3 tiến trình. LƯU Ý: `start` detached bị sandbox chặn phiên này → chạy `node run.mjs` qua background task của Claude Code; nếu tắt phiên Claude thì user chạy lại `start-postiz.bat`.
  - **REVIEW ĐỐI KHÁNG (10 agent) → 6 lỗi thật ĐÃ FIX:** (1) lỗi Claude bị nuốt thành 500 "Internal server error" → media.service bọc try/catch ném HttpException(message, 400); (2) race stale-closure magic.caption: setImages ghi snapshot cũ đè media (mất ảnh thêm trong lúc AI chạy) → merge alt theo id trên `useLaunchStore.getState()` (nhận prop `num`); (3) CORS bot phản chiếu mọi origin (web độc hại đọc groups/logs/QR, ghi routes) → whitelist cứng localhost:4200/127.0.0.1:4200; (4) tag match case-sensitive + chỉ tạo khi bấm Lưu ở trang Zalo → posts.repository thêm `mode:'insensitive'` + trang Zalo ensure tag cả khi thấy cfg.enabled (useRef guard); (5) qrBroken kẹt vĩnh viễn sau 1 lần 404 → loadAll reset khi overview.hasQr; (6) kênh đích có settings bắt buộc (YouTube/Instagram/Pinterest/Slack/Discord...) luôn 400 khi bot đẩy → dropdown disable kênh ngoài BOT_SUPPORTED_PROVIDERS. Finding bị bác: "AI caption không trừ credit" (đúng thiết kế fork nội bộ, /copilot/chat cũng vậy). Build lại EXIT=0, restart.
  - **VERIFY SỐNG:** POST /media/ai-caption với ảnh thật → Claude trả caption bài + caption từng ảnh tiếng Việt chuẩn tone ✓. Bot endpoints overview/logs/qr/groups đều đúng ✓. Trang /zalo render đủ (3 pill, QR hiện, steps) ✓. Calendar 4 kênh FB + composer mở, nút đũa phép hiện đúng trạng thái disabled khi chưa có ảnh ✓.
  - **CẦN USER TEST:** (1) /zalo: quét QR đăng nhập → chọn nhóm nghe → bật cầu nối. (2) Composer: up ảnh → bấm nút đũa phép hồng cạnh emoji (cần key Claude trong Settings Media Hub). (3) Gửi ảnh vào nhóm Zalo → chờ bot gom (10ph hoặc nhắn "xong") → bài viền vàng hiện trên Calendar → click → Schedule.

- **2026-07-02 (29): 🔇 Chặn popup lỗi đỏ vô hại của dev mode.** Next dev biến MỌI console.error/warn của lib bên thứ 3 (Uppy ThumbnailGenerator, i18next Locize promo, CopilotKit...) thành overlay đỏ che màn → gây hoảng dù vô hại. Thêm `components/layout/suppress.dev.warnings.tsx` (client, patch console.error/warn lọc allow-list dòng LÀNH đã biết, chỉ dev, lỗi thật vẫn hiện) + gắn vào `(app)/layout.tsx`. Frontend dev mode → chỉ cần refresh, không build. FB App ID `2507519123026351` đã nạp, scope 4 quyền OK, sẵn sàng kết nối.

- **2026-07-02 (28): ✅ Chọn NHIỀU kênh vệ tinh CHO MỌI NỀN TẢNG + Claude tự restart giúp user (verify sống).**
  - **Ảnh:** đã verify HTTP 200 sau khi Claude tự restart (upload cũ + mới đều 200/image). Fix cwd (mục 27) chạy đúng.
  - **Multi-channel tổng quát:** mỗi provider dùng data-shape KHÁC nhau khi chọn kênh (FB `{page}`, GMB `{id}`, Instagram `{id,pageId}`, LinkedIn `{page}`, YouTube `{id}`). Backend `saveProviderPage` viết lại GENERIC: `data.pages` = MẢNG OBJECT data (mỗi phần tử = nguyên shape bản chọn-1) → loop `fetchPageInformation(token, eachObject)`; phần tử đầu update between-steps, còn lại tạo integration mới. HOC `with-continue-provider` default multi = `{pages: selections.map(transformSaveData)}` (không cần custom per-provider); multi-select track theo ITEM ID (selection có thể là object nên không dùng ===). Bật `multiple:true` cho CẢ 5: facebook/gmb/instagram/linkedin/youtube. Build EXIT=0, restart sống.
  - **Claude TỰ restart được:** user chỉ ra có thể tự `Start-Process cmd /c node run.mjs` (detached) → sống qua turn. Đã dùng để restart + verify. Không cần bắt user Ctrl+C mỗi lần nữa (nhưng vẫn cần rebuild backend khi đổi code backend).
  - **USER:** vào Add Channel → Facebook/Google Business/LinkedIn/Instagram/YouTube → sau đăng nhập, tick NHIỀU kênh (dấu ✓), nút "Save (N)" → mỗi kênh thành 1 channel. (Google Business = nhiều location/business; các nền tảng khác tương tự.)

- **2026-07-02 (27): 🖼️ FIX ẢNH KHÔNG HIỆN (lỗi gốc) + Facebook chọn NHIỀU Page.**
  - **Ảnh ẩn hết (media upload/logo/ảnh FB):** LỖI GỐC = cwd mismatch. Backend chạy cwd `apps/backend`, frontend cwd `apps/frontend`; cả 2 dùng `UPLOAD_DIRECTORY="./uploads"` → backend LƯU vào `apps/backend/uploads`, còn frontend route `app/(app)/api/uploads/[[...path]]/route.ts` ĐỌC từ `apps/frontend/uploads` (khác chỗ) → `statSync` throw → 500 → ảnh không hiện. **Fix: `.env` đổi `UPLOAD_DIRECTORY="C:/Media_Hub_VietAnh/uploads"` (tuyệt đối, forward slash) → cả 2 trỏ chung.** Đã tạo `C:/Media_Hub_VietAnh/uploads` + copy file cũ từ apps/backend/uploads sang. publicPath (`/YYYY/MM/DD/name.ext`) độc lập nên URL không đổi. `uploads/` đã gitignore. **CẦN RESTART** (env nạp lúc khởi động). Nếu chuyển ổ phải sửa path này.
  - **Facebook nhiều Page:** `saveProviderPage` (integration.service.ts) nhận thêm `data.pages: string[]` (tương thích ngược `data.page`): page đầu update integration between-steps, các page còn lại `createOrUpdateIntegration` tạo kênh MỚI (mỗi page 1 kênh). HOC `with-continue-provider.tsx` thêm opt-in `multiple`+`transformSaveDataMultiple` (multi-select, tick ✓, nút "Save (N)"); `facebook.continue.tsx` bật `multiple:true`. Provider khác (gmb/instagram/linkedin/youtube) KHÔNG đổi (mặc định single). Build EXIT=0.
  - **CÒN TREO (chưa xong turn trước):** nút ⚙ sửa OAuth key trên thẻ kênh + bỏ 2 scope FB (mục 26) — đã có trong build này. **USER: Ctrl+C → start-postiz.bat** (restart bắt buộc cho cả ảnh lẫn scope). Rồi: kết nối FB → chọn nhiều Page 1 lần; ảnh hiện lại.

- **2026-07-02 (26): 🔧 Fix Facebook "Invalid Scopes" + cho sửa lại OAuth key sau lần đầu.**
  - **Scopes:** `facebook.provider.ts` bỏ `pages_manage_engagement` + `read_insights` (FB chặn nếu app chưa App Review → lỗi "Invalid Scopes" dù app đúng loại). Giữ 4 quyền cốt lõi đăng bài: `pages_show_list`, `business_management`, `pages_manage_posts`, `pages_read_engagement`. Build EXIT=0, dist đã sạch 2 scope. → đăng FB chạy với app Business thường; mất comment-management + FB analytics (thêm lại + App Review nếu cần).
  - **Sửa key sau lần đầu:** guard cũ chỉ mở form khi key TRỐNG → lưu key sai rồi thì bấm Facebook nhảy thẳng OAuth, không sửa được. Thêm **nút ⚙** góc mỗi thẻ kênh (Add Channel) — chỉ hiện cho kênh có trong PLATFORM_GUIDES, bấm mở `SocialKeyGuideForm` sửa key bất cứ lúc nào (stopPropagation, không vào OAuth). NGOÀI RA: Settings → "Kết nối kênh — OAuth keys" accordion vốn đã cho sửa mọi lúc.
  - **USER:** Ctrl+C → `start-postiz.bat` (backend build sẵn). Bấm ⚙ trên thẻ Facebook để chỉnh/đổi App ID+Secret; hoặc Settings. Sau đó bấm chính thẻ Facebook để kết nối — lần này không còn Invalid Scopes.

- **2026-07-02 (25): 🔧 Fix warning React + mở rộng chặn key cho Telegram.** (a) `web3/providers/telegram.provider.tsx:111` — Input hiển thị lệnh `/connect ...` có `value` mà thiếu `onChange` → thêm `readOnly` (hết console error). (b) `add.provider.component.tsx` — bỏ điều kiện `!isWeb3` trong guard chặn key: Telegram thuộc nhóm web3-modal nhưng vẫn cần TELEGRAM_TOKEN/BOT_NAME → giờ bấm Telegram chưa có key cũng hiện hướng dẫn (PLATFORM_GUIDES chỉ có telegram trong nhóm web3 nên không ảnh hưởng ví web3 khác). Frontend dev mode → refresh là ăn, không cần build. Telegram vẫn là kênh TÙY CHỌN (user không thích thì bỏ — khuyến nghị dùng lại app Facebook có sẵn của bot Zalo, xem mục 22/24).

- **2026-07-02 (24): ✅ XONG: OAuth keys nhập qua UI + hướng dẫn từng nền tảng (verify sống).**
  - **Backend:** `libraries/nestjs-libraries/src/keys/social.keys.ts` — whitelist 29 env OAuth, `setSocialKeys` ghi `.env` gốc (replace/append) + set `process.env` ăn NGAY (FB/LinkedIn/GMB generateAuthUrl đọc env lúc gọi). Endpoints `GET/POST /settings/social-keys` trong `settings.controller.ts` (masked, chặn key ngoài whitelist — verify: HACK_INJECTION bị bỏ, REDDIT_CLIENT_ID ghi vào .env dòng 54 + status cập nhật tức thì trên :3001, build EXIT=0).
  - **Telegram token lazy:** `telegram.provider.ts` — `telegramBot` thành lazy Proxy (tạo bot lần dùng đầu, đọc env lúc đó) → token nhập UI dùng ngay; riêng `TELEGRAM_BOT_NAME` là biến frontend → cần restart (UI đã ghi chú).
  - **Frontend:** `components/settings/social-keys.component.tsx` — export `PLATFORM_GUIDES` (12 nền tảng: telegram/facebook/instagram(+standalone)/linkedin(+page)/gmb/youtube/discord/x/tiktok/reddit — steps tiếng Việt, portal link, Redirect URI copy 1 nút, note dev-mode/duyệt) + `SocialKeyGuideForm` (form điền key, hiện ✓ masked) + `SocialKeysComponent` (accordion trong Settings, badge ĐÃ CẤU HÌNH/CHƯA CÓ KEY). Gắn vào `global.settings.tsx` (dưới Claude key).
  - **Chặn thông minh:** `add.provider.component.tsx` — bấm kết nối kênh chưa có key → mở modal hướng dẫn + form điền ngay (không đẩy sang trang lỗi "Invalid app ID"/"client_id undefined" nữa). Lưu xong bấm kênh lại là kết nối.
  - **USER:** Ctrl+C → `start-postiz.bat` (backend build sẵn 11:03). Vào Settings thấy mục "Kết nối kênh — OAuth keys", hoặc bấm thẳng kênh trong Add Channel để được hướng dẫn.
- **2026-07-02 (23): 🔨 (đã hoàn thành ở mục 24) Kế hoạch: OAuth keys nhập qua UI + hướng dẫn từng nền tảng.** Yêu cầu user: không điền .env nữa — điền key FB/LinkedIn/GBP/Telegram... ngay trên UI, và khi bấm kết nối kênh chưa cấu hình thì hiện hướng dẫn thay vì đẩy sang trang lỗi của nền tảng. Kế hoạch: (a) backend helper ghi `.env` gốc + set process.env (FB/LinkedIn/GMB generateAuthUrl đọc env lúc gọi → ăn ngay; Telegram token là const module-load → cần restart hoặc vá lazy); endpoints `GET/POST /settings/social-keys` (whitelist env, masked); (b) component Settings "Kết nối kênh (OAuth)" accordion từng nền tảng: trạng thái, form key, redirect URI copy được, các bước đăng ký; (c) chặn trong `add.provider.component.tsx`: kênh chưa có key → mở hướng dẫn. Redirect URIs: FB `http://localhost:4200/integrations/social/facebook`, LinkedIn `.../linkedin`, GMB `.../gmb`. Env names: FACEBOOK_APP_ID/SECRET, LINKEDIN_CLIENT_ID/SECRET, GOOGLE_GMB_CLIENT_ID/SECRET, TELEGRAM_BOT_NAME+TELEGRAM_TOKEN, X_API_KEY/SECRET, DISCORD_CLIENT_ID/SECRET/BOT_TOKEN_ID, YOUTUBE_CLIENT_ID/SECRET, TIKTOK_CLIENT_ID/SECRET, REDDIT_CLIENT_ID/SECRET.

- **2026-07-02 (22): Kết nối kênh lỗi "Invalid app ID / client_id undefined" = THIẾU OAuth app (việc của user, không code được).** Đã thêm dòng chờ điền vào `.env`: `LINKEDIN_CLIENT_ID/SECRET`, `GOOGLE_GMB_CLIENT_ID/SECRET`, `TELEGRAM_BOT_NAME/TOKEN` (FACEBOOK_APP_ID/SECRET có sẵn). **Redirect URI phải khai khi đăng ký app** (đọc từ provider code): FB `http://localhost:4200/integrations/social/facebook`, LinkedIn `.../linkedin`, GBP `.../gmb`. Telegram không cần app — chỉ cần bot từ @BotFather. Điền `.env` xong PHẢI restart. GBP lưu ý: Google Business Profile API phải xin quyền truy cập riêng với Google (form, chờ duyệt) — chậm nhất; FB dev-mode dùng ngay với tài khoản admin app; LinkedIn cần request product "Share on LinkedIn".

- **2026-07-02 (21): 🎯 TÌM RA & FIX LỖI GỐC "[Network] Unknown error" (CopilotKit/urql).**
  - **Nguyên nhân:** CopilotKit (trang Agent + popup) fetch với `credentials:"include"`, nhưng `main.ts` CORS chỉ bật `credentials:true` khi KHÔNG NOT_SECURED → thiếu header `Access-Control-Allow-Credentials: true` → **trình duyệt chặn mọi request copilot** → urql báo "[Network] Unknown error" lặp vô hạn. (curl không kiểm CORS nên server test "OK" — đó là lý do trước đó tưởng server lành. Phần app còn lại không sao vì useFetch ở NOT_SECURED không gửi credentials.)
  - **Fix:** `main.ts` cors → `credentials: true` LUÔN (origin đã là danh sách cụ thể gồm FRONTEND_URL nên hợp chuẩn credentialed CORS). + Fix TS2742 `testAnthropicKey` (thêm kiểu trả về tường minh — trước đó `nest build` exit 1 nhưng vẫn emit; giờ **EXIT=0 sạch**).
  - **VERIFY trên instance 3001:** preflight + POST đều trả `Access-Control-Allow-Origin: http://localhost:4200` + `Access-Control-Allow-Credentials: true` ✓. Backend dist build sẵn 09:56.
  - **USER:** Ctrl+C → `start-postiz.bat` → Ctrl+Shift+R trang Agents → chat chạy.

- **2026-07-02 (20): Xác nhận: KHÔNG cần quét QR ngay khi khởi động.** Bot vốn thiết kế đúng: `startWeb` chạy TRƯỚC, login Zalo chạy NỀN (`ensureZaloLogin` vòng lặp, QR hết hạn tự tạo mới, dashboard không sập) → đăng nhập Zalo lúc nào cũng được qua dashboard tab Cài đặt. Nâng cấp kèm: `/api/postiz/status` (bot) trả thêm `zaloConnected`/`zaloRelogging`; trang Zalo trong Postiz hiện **banner vàng "Zalo chưa đăng nhập — đăng nhập lúc nào cũng được"** + nút mở dashboard; dải xanh "đang hoạt động" giờ yêu cầu cả `zaloConnected`. (Bot cần restart để có field mới — start-postiz.bat lo.)

- **2026-07-02 (19): 🚀 Bot Zalo vào start-postiz.bat + Agent verify trên backend user + Zalo UI đẹp.**
  - **`run.mjs`:** giờ khởi động **3 tiến trình 1 cửa sổ**: backend(3000) + frontend(4200) + **bot Zalo** (`D:\Zalo bot group`, `node --env-file=.env src/service.mjs`, prefix log `[zalo]` vàng). Có check cổng 8088 (bot chạy sẵn → bỏ qua, không double). Bot cần quét QR → xem log [zalo] / `qr.png`. Ctrl+C tắt cả 3.
  - **Agent "không trả lời" — VERIFY TRÊN CHÍNH BACKEND USER (3000):** mutation agentSession postiz với câu tiếng Việt → Claude stream "Xin chào! 👋 Tôi có thể giúp bạn quản lý và lên lịch đăng bài..." → **server hoạt động 100%**. `loadAgentState` cũng OK (tìm thấy postiz). Auth qua cookie same-site OK (curl cookie → 200). ⇒ Vấn đề là TRANG TRÌNH DUYỆT giữ state cũ → **Ctrl+Shift+R trang /agents rồi hỏi lại**. `availableAgents:[]` là cosmetic (resolver 1.10.6 chỉ đọc remote endpoints — client không validate qua đó).
  - **Zalo UI redesign:** `zalo.component.tsx` viết lại — header ZaloMark gradient + StatusPill; layout 2 cột (trái: 3 StepCard đánh số/tick xanh khi xong — key Claude / cầu nối+chọn kênh / toggle bật; phải: card "Luồng hoạt động" 5 bước + card Nâng cao mở dashboard); dải xanh "Cầu nối đang hoạt động" khi enabled+có kênh; màn hình bot-offline mới có hướng dẫn. Token: bg-sixth/border-fifth/bg-forth + green-500 opacity chuẩn tailwind.
  - **CẦN USER:** Ctrl+C → đóng cửa sổ bot cũ (nếu chạy riêng) → chạy lại `start-postiz.bat` (1 cửa sổ đủ cả 3) → Ctrl+Shift+R trang Agents + trang Zalo.

- **2026-07-02 (18): ✅ TỔNG KIỂM TRA + FIX TOÀN DIỆN — Agent Claude CHẠY END-TO-END (đã verify sống).**
  - **MCP:** `claude mcp add postiz http://localhost:3000/mcp` (Bearer = Postiz API key) → ✔ Connected. Dùng được từ phiên Claude Code sau.
  - **Kiểm kê 28 controller, quét 17+ endpoint bằng auth thật:** hầu hết 200. Key Claude lưu qua UI **verify sống với Anthropic** (`{"ok":true,"model":"claude-sonnet-4-6"}`). Upload public API **201** trả `{id,path}` → payload cầu nối Zalo CHUẨN.
  - **FIX #1 (lỗi Agent thật):** trang Agents lỗi vì `MastraAgent.getLocalAgents` (@ag-ui/mastra 1.0.1) không lấy được agent từ Mastra 1.21 → `agents:{}`. Sửa `copilot.controller.ts` tự build map (listAgents sync/async-proof + fallback `getAgentById('postiz')`). **VERIFY SỐNG trên instance test :3001:** mutation `agentSession{agentName:'postiz'}` → stream `"AGENT-OK"` HTTP 200/2s. Chat popup cũng verify → `"OK-VIETANH"`. Lưu ý: `availableAgents` trả [] là hành vi resolver 1.10.6 — cosmetic, không chặn.
  - **FIX #2:** thiếu key → handler `return;` làm treo request → client báo "[Network] Unknown error". Giờ trả **400 JSON** thông báo rõ (cả /chat lẫn /agent).
  - **FIX #3:** `agent.graph.service.ts` + `agent.graph.insert.service.ts` → `getModel()` lazy (key nhập UI ăn ngay mọi luồng, hết cảnh restart).
  - **FIX #4:** nút **"Kiểm tra key"** cạnh Lưu trong Settings (endpoint `GET /copilot/anthropic-key/test` ping Claude thật).
  - **FIX #5 (Zalo native):** trang `/zalo` viết lại **native React** đồng bộ giao diện Postiz (`components/zalo/zalo.component.tsx` — dark theme bg-sixth/border-fifth, Button/Input chuẩn, toggle, chọn kênh, trạng thái bot, offline state). Gọi thẳng API bot; `web.mjs` bot thêm **CORS middleware** cho `/api/postiz/*` + `/api/claude/*` (đặt TRƯỚC routes). Bỏ iframe.
  - **FIX #6 (Polotno):** "license key is missing" = thiếu `NEXT_PUBLIC_POLOTNO` (key FREE tại polotno.com). KHÔNG dùng được khi thiếu key → nút **Design Media tự ẨN** (`media.component.tsx` gate theo `loadVars().plontoKey`). Muốn dùng: dán key vào `.env` → `NEXT_PUBLIC_POLOTNO="..."` (đã thêm dòng chờ) → restart.
  - **KHÔNG PHẢI LỖI:** `/analytics/trending` 500 = dead code (UI dùng PlatformAnalytics, không gọi); integrations [] = chưa kết nối kênh (user làm, Telegram dễ nhất); bot Zalo :8088 đang tắt.
  - **Backend đã BUILD SẴN bản mới (dist 09:26)** → user chỉ cần Ctrl+C + chạy lại `start-postiz.bat` (không phải chờ build). Frontend dev mode tự nhận trang Zalo/Settings mới.

- **2026-07-02 (17): ⚡ FRONTEND CHUYỂN SANG DEV MODE (hết build 10 phút).** `run.mjs`: frontend chạy `run dev` (next dev) thay vì `run start`; bỏ bước build:sentry. Đổi code frontend là hiện ngay khi refresh (biên dịch từng trang lần đầu ~vài giây trên C:). Lý do: ô "Claude API key" trong Settings không hiện vì frontend đang chạy BUILD CŨ (build 00:21 < component 00:29). Backend vẫn build (`run start` trên dist) — đã xoá dist để build lại có fix. Muốn quay lại build mode cho demo cuối: đổi `run.mjs` frontend về `run build:sentry` + `run start`.

- **2026-07-02 (16): 🔧 FIX backend crash lúc khởi động (ChatAnthropic).** `agent.graph.service.ts` + `agent.graph.insert.service.ts`: `new ChatAnthropic` tạo lúc module-load, nếu `ANTHROPIC_API_KEY` rỗng thì NÉM "Anthropic API key not found" → sập backend. Fix: `apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder-set-in-settings'` (giống ChatOpenAI cũ có `|| 'sk-proj-'`). Key thật đọc lúc chạy (từ Settings UI / file). Đã xoá `apps/backend/dist` → chạy lại `start-postiz.bat` để build backend có fix (frontend không cần build lại).

- **2026-07-02 (15): ✅ NHẬP ANTHROPIC KEY QUA UI SETTINGS + fix favicon cache.**
  - **Key qua UI (không cần .env):** helper `libraries/nestjs-libraries/src/openai/anthropic.key.ts` (`getAnthropicKey`/`setAnthropicKey`, lúc load nạp từ file `apps/backend/anthropic-key.txt`→env). Import ĐẦU TIÊN trong `apps/backend/src/main.ts`. Endpoint `GET/POST /copilot/anthropic-key` trong `copilot.controller.ts` (ghi file + set `process.env` runtime). UI: `apps/frontend/src/components/settings/anthropic.component.tsx` (Input+Button, `useFetch`), thêm vào `global.settings.tsx` → hiện ở **Settings** (đầu trang). `anthropic-key.txt` đã gitignore.
  - **Tác dụng:** caption (openai.service) + Agent chat (copilot AnthropicAdapter) + Mastra đọc `process.env` lúc chạy → key set qua UI ăn ngay. LƯU Ý: 2 file LangGraph `agent.graph*.ts` đọc key lúc module-load → set qua UI xong cần **restart 1 lần** để 2 flow đó nhận (main.ts nạp file→env khi khởi động).
  - **Favicon:** file `favicon.ico` trên C: ĐÚNG là logo VA (1709 bytes) — chưa hiện là do **cache trình duyệt**. Đã thêm `?v=va2` vào link favicon trong 3 layout → build lại + Ctrl+Shift+R sẽ hiện.
  - Backend dist + frontend .next đã xoá từ trước → 1 lần `start-postiz.bat` build lại hết.

- **2026-07-02 (14): ✅ AGENT POSTIZ CHUYỂN SANG CLAUDE (cả 3 tầng).**
  - **Tầng 1 CopilotKit** `apps/backend/src/api/routes/copilot.controller.ts`: `OpenAIAdapter`→`AnthropicAdapter` (2 chỗ, model `claude-sonnet-4-6`); gate `OPENAI_API_KEY`→`ANTHROPIC_API_KEY`.
  - **Tầng 2 Mastra** `libraries/nestjs-libraries/src/chat/load.tools.service.ts`: `openai('gpt-5.2')`→`anthropic('claude-sonnet-4-6')` (import `@ai-sdk/anthropic-v5`, cùng dòng AI SDK v5 với openai@2 nên tương thích).
  - **Tầng 3 LangGraph** `agent.graph.service.ts` + `agent.graph.insert.service.ts`: `ChatOpenAI`→`ChatAnthropic` (`@langchain/anthropic@^1.5.1` đã cài). **DALL·E (DallEAPIWrapper) GIỮ OpenAI** — Claude không tạo ảnh.
  - Đã cài `@langchain/anthropic` (v1.5.1, tương thích @langchain/core 1.1.39). Verify: ChatAnthropic/AnthropicAdapter/ai-sdk anthropic đều load OK.
  - **⚠️ KEY:** Agent đọc `ANTHROPIC_API_KEY` từ Postiz `.env` LÚC KHỞI ĐỘNG (model là const cấp module → KHÔNG set qua UI được). USER phải điền `ANTHROPIC_API_KEY` vào `C:\Media_Hub_VietAnh\.env`. Nếu Agent dùng tạo ảnh → cần thêm `OPENAI_API_KEY` (DALL·E).
  - Đã xoá `apps/backend/dist` + `apps/frontend/.next` → 1 lần `start-postiz.bat` build lại HẾT (rebrand + Zalo menu + Agent Claude).
  - **CHƯA TEST:** format gọi tool khác nhau OpenAI vs Claude → Agent có thể cần chỉnh khi chạy thật. Báo lỗi nếu Agent lỗi.

- **2026-07-01 (13): ✅ ZALO TÍCH HỢP VÀO GIAO DIỆN POSTIZ (mục sidebar).**
  - **Sidebar:** thêm mục **"Zalo"** (sau Calendar) trong `apps/frontend/src/components/layout/top.menu.tsx` (path `/zalo`, icon chat bubble).
  - **Trang mới:** `apps/frontend/src/app/(app)/(site)/zalo/page.tsx` — nhúng iframe `http://localhost:8088/postiz` (bảng cấu hình cầu nối). Config logic vẫn ở bot Zalo, Postiz chỉ nhúng.
  - **Bot Zalo `D:\Zalo bot group\src\web.mjs`:** bỏ `requireAuth` trên 3 API `/api/postiz/*` + route `/postiz` cho phép nhúng iframe từ Postiz (CSP frame-ancestors localhost:4200, xoá X-Frame-Options). `node --check` PASS.
  - **ĐỂ THẤY:** đã xoá `apps/frontend/.next` → chạy `start-postiz.bat` tự build lại (~10p). VÀ **restart bot Zalo** (D:) để nạp web.mjs. Sau đó Postiz sidebar có "Zalo" → bấm → bảng cấu hình hiện trong Postiz.

- **2026-07-01 (12): 📁 CHUYỂN POSTIZ SANG Ổ C: → `C:\Media_Hub_VietAnh` (dùng từ nay).**
  - robocopy `D:\Media_Hub_VietAnh`→`C:\Media_Hub_VietAnh` (bỏ node_modules/.next/dist/log), rồi `corepack pnpm install` trên C: (5m44s, Prisma OK, node_modules 1882 mục). `.env`+`.git`+run.mjs+start-postiz.bat đều theo sang.
  - **Docker compose project name = "Media_Hub_VietAnh" (giống D:) → DÙNG CHUNG volume → DB/tài khoản `duong@vietanh.edu.vn` KHÔNG mất.**
  - Bản D: giữ làm backup (xoá sau khi C: chạy ổn). **Zalo (`D:\Zalo bot group`) KHÔNG chuyển** (nhẹ, nhanh; bridge trỏ `localhost:3000` nên không ảnh hưởng).
  - Ghi chú: đo nhanh C:(65ms) vs D:(53ms) đọc metadata ~ngang nhau → "slow filesystem" trước đó có thể do máy tải nặng lúc chạy chồng nhiều bản, không hẳn do ổ. Chậm chính là do app nặng (nạp nhiều module) — chuyển ổ không đổi nhiều.
  - **CHẠY TỪ NAY:** `C:\Media_Hub_VietAnh\start-postiz.bat` (lần đầu build frontend ~10p + backend ~2p; sau đó nhanh).


- **2026-07-01 (11): 🚀 CHẠY 1 LỆNH + tự build (theo feedback UX).**
  - **`run.mjs`** (mới, root): 1 lệnh `node run.mjs` → tự bật Docker infra + tự build backend/frontend nếu thiếu (không cần xóa tay) + chạy backend(3000)+frontend(4200) trong **1 cửa sổ log gộp** + Ctrl+C tắt gọn (Windows taskkill /T). Cờ `--rebuild` để build lại khi đổi code (tự xóa `.next`+`dist`).
  - **`start-postiz.bat`** rút gọn còn `node run.mjs %*` → double-click là chạy, 1 cửa sổ. Restart = đóng (Ctrl+C) rồi mở lại.
  - Đã tự `rm -rf apps/backend/dist` để backend build lại có Claude (Phase 2); GIỮ `apps/frontend/.next` (rebrand đã build, favicon là file tĩnh).
  - **Về KEY (feedback "nhập key vào UI"):** `.env` giờ chỉ là config HẠ TẦNG set-1-lần (DB/Redis/JWT/NOT_SECURED/TEMPORAL) — KHÔNG cần sửa nữa. Caption Claude cho luồng Zalo nhập ở **UI dashboard Zalo** (:8088 Cài đặt) ✅. Cấu hình cầu nối Postiz ở **UI `/postiz`** ✅. Kết nối kênh qua **UI Postiz** ✅. `ANTHROPIC_API_KEY` trong Postiz .env CHỈ dùng cho nút "AI viết" trong composer Postiz (không cần cho demo Zalo). Nếu muốn nút đó cũng nhập key qua UI Postiz → cần thêm settings page trong Postiz (frontend+backend, phải rebuild) — việc follow-up.


- **2026-07-01 (10): ✅ PHASE 3 CẮM NỐI ZALO→POSTIZ HOÀN THIỆN (có UI cấu hình).**
  - **`D:\Zalo bot group\src\postiz.mjs`** (viết lại): `listIntegrations()`, `uploadLocalFile()` (multipart POST /public/v1/upload), `pushToPostiz({caption,imagePaths,videoPaths,groupName})` — upload file local lên Postiz rồi tạo bản nháp (`POST /public/v1/posts` type:draft) gắn media {id,path}. Chỉ chạy khi `POSTIZ_ENABLED=true`.
  - **`web.mjs`**: thêm `GET /api/postiz/status`, `POST /api/postiz/config` (lưu qua saveToken→.env, cập nhật process.env ngay), `GET /api/postiz/integrations` (proxy lấy danh sách kênh). **Trang cấu hình UI: `GET /postiz`** (hằng `POSTIZ_CONFIG_PAGE`) — nhập API URL + key, "Tải danh sách kênh", chọn kênh đích, bật/tắt.
  - **`service.mjs`**: import + gọi `pushToPostiz` NGAY SAU khi tạo `finalDraft` (dòng ~129), chạy nền, guarded `POSTIZ_ENABLED`. Dùng `draft.savedImages/savedVideos` (file local) + `draft.caption`.
  - **3 file `node --check` PASS.** Config `.env` Zalo có POSTIZ_*.
  - **CÁCH DÙNG (thành phẩm):** (1) Postiz: Settings→Public API tạo key; kết nối 1 kênh (Telegram/Discord dễ). (2) Mở dashboard Zalo `http://localhost:<WEB_PORT>/postiz` → nhập key → Tải kênh → chọn → Bật → Lưu. (3) Ảnh mới từ nhóm Zalo → tự đẩy sang Postiz thành bản nháp chờ duyệt (song song luồng FB cũ, không phá).
  - **CHƯA TEST THẬT (Claude không chạy được app):** field media trong post ({id,path}) + shape integrations là suy đoán theo code — có thể cần chỉnh nhẹ khi test lần đầu. Zalo OA provider (đăng NGƯỢC ra Zalo) vẫn để sau.


- **2026-07-01 (9): Favicon VA + Phase 3 (cầu nối Zalo) bắt đầu.**
  - **Favicon:** sinh `apps/frontend/public/favicon.ico` + `favicon.png` logo "VA" thật (script sharp bọc PNG trong ICO, đã xoá script tạm `_gen-favicon.cjs`). File tĩnh nên `next start` phục vụ ngay; cần xoá cache favicon Chrome để thấy (mở `/favicon.ico` trực tiếp hoặc Ctrl+Shift+R nhiều lần).
  - **Lỗi client-side trước đó:** do chạy CHỒNG nhiều bản `start-postiz.bat` (nhiều backend/frontend tranh cổng → EADDRINUSE). Kill hết node → chạy sạch 1 bản là OK. Build hiện tại ĐÃ có rebrand.
  - **Public API tạo bài:** `POST /public/v1/posts` (`apps/backend/src/public-api/routes/v1/public.integrations.controller.ts:160`), header `Authorization: <API_KEY>`, `type:'draft'` bỏ qua validation. Payload: `{type,date,posts:[{integration:{id}, value:[{content, image:[{path}]}]}]}` (xem `mapTypeToPost` posts.service.ts:247). Media check `RESTRICT_UPLOAD_DOMAINS` (không set → URL bất kỳ qua được, nhưng có thể cần upload qua `/public/v1/upload`).
  - **CẦU NỐI đã tạo:** `D:\Zalo bot group\src\postiz.mjs` — hàm `pushToPostiz({caption, mediaUrls, groupName, opts})` đẩy bản nháp vào Postiz. Đã thêm config vào `D:\Zalo bot group\.env`: `POSTIZ_ENABLED/POSTIZ_API_URL/POSTIZ_API_KEY/POSTIZ_INTEGRATION_ID`.
  - **ĐIỂM WIRE:** `D:\Zalo bot group\src\pipeline.mjs` dòng ~122 — hook `opts.post({caption, imagePaths, imageCaptions, videoPaths, videoCaptions})` (nơi hiện đăng FB/GBP). Người gọi `processBatch` (tìm trong `service.mjs`) truyền `opts.post`; thêm `pushToPostiz` SONG SONG ở đó. ⚠️ `imagePaths` là FILE LOCAL → cần upload lên Postiz (multipart) chứ không phải URL; `uploadMedia()` hiện nhận URL, cần bổ sung upload file local (TODO, cần test contract `/public/v1/upload`).
  - **CÒN LẠI Phase 3:** (a) upload media local→Postiz, (b) wire `pushToPostiz` vào caller, (c) tạo API key + kết nối 1 kênh trong Postiz lấy `integration.id` (`GET /public/v1/integrations`), (d) Zalo OA provider (đăng NGƯỢC ra Zalo — phần lớn, để sau: mẫu `libraries/nestjs-libraries/src/integrations/social/*.provider.ts`).
  - **PHASE 4 (kênh dễ):** Postiz có sẵn provider Telegram/Discord/Mastodon; cần env token (`.env.example`: `DISCORD_CLIENT_ID/SECRET/BOT_TOKEN_ID`, Telegram cần bot token, Mastodon `MASTODON_*`). Kết nối trong UI Postiz → dùng làm `POSTIZ_INTEGRATION_ID` để test cầu nối Zalo. **Cần test tương tác — không viết mù được.**


- **2026-07-01 (8): ✅ PHASE 1 (Rebrand) + PHASE 2 (Claude) XONG VỀ CODE.**
  - **Rebrand:** Logo `apps/frontend/src/components/new-layout/logo.tsx` + wordmark `.../components/ui/logo-text.component.tsx` → huy hiệu "VA" gradient xanh. Đổi TẤT CẢ chuỗi hiển thị "Postiz"→"Việt Anh Media Hub" trong `apps/frontend/src` + `libraries/react-shared-libraries/src` (38 file; 0 sót; bảo vệ `#Postiz`→`#VietAnhHub`, `MyPostizAgent`→`MyVietAnhAgent`). Titles (24 file) → "Việt Anh Media Hub …". Màu chủ đạo `#612bd3`(tím)→`#1e6fd9`(xanh) trong 20 file. Favicon SVG mới `apps/frontend/public/va-favicon.svg` + thay `public/postiz.svg`; thêm `<link rel=icon svg>` vào 3 layout. **Chưa làm .ico** (browser ưu tiên svg nên OK). Backend email templates còn "Postiz" (không dùng ở demo local).
  - **Claude:** viết lại `libraries/nestjs-libraries/src/openai/openai.service.ts` — các hàm TEXT (`generatePosts` caption chính, `generatePromptForPicture`, `generateVoiceFromText`, `separatePosts`, `extractWebsiteText`, `generateSlidesFromText`) gọi **Claude `claude-sonnet-4-6` qua fetch** (helper `claudeText`/`claudeJson`, tone Trường Việt Anh, tiếng Việt), GIỮ tên/chữ ký/định dạng trả về. `generateImage` vẫn OpenAI. Đã thêm `ANTHROPIC_API_KEY=""` + `ANTHROPIC_MODEL` vào `.env` — **USER PHẢI DÁN KEY THẬT**.
  - **⚠️ ĐỂ THẤY THAY ĐỔI:** frontend đang chế độ BUILD → phải **build lại** (xóa `apps/frontend/.next` rồi chạy `start-postiz.bat`, nó tự build ~10 phút) + restart backend. Caption Claude chỉ chạy khi có `ANTHROPIC_API_KEY`.
  - **CÒN LẠI:** Phase 3 (Zalo) — kế hoạch: hệ `D:\Zalo bot group` đổi đầu ra `publish.mjs`/`facebook.mjs` từ "đăng thẳng FB/GBP" → gọi **Postiz Public API** (`POST /public/v1/posts`, xem `apps/backend/src/api/routes/public.controller.ts`) tạo bài chờ duyệt; HOẶC Redis queue + consumer theo kiến trúc gốc. Cần dựng **Zalo OA provider** (mẫu: `libraries/nestjs-libraries/src/integrations/social/*.provider.ts` + đăng ký ở `integration.manager.ts` + UI `show.all.providers.tsx`). Phase 4 (kênh dễ): Telegram/Discord/Mastodon cần env token tương ứng — kiểm tra `.env.example` + provider tương ứng.


- **2026-07-01 (7): 📌 CHỐT HƯỚNG + KHẢO SÁT cho Phase 1–4 (dừng ở đây do hết quota, phiên sau tiếp).**
  - **Trạng thái chạy:** Phase 0 xong. Đăng nhập ĐƯỢC. Tài khoản demo đã tạo: **`duong@vietanh.edu.vn` / `VietAnh@2026`**. Đã chuyển frontend sang **chế độ BUILD** (`start-postiz.bat` tự `next build` nếu chưa có `.next/BUILD_ID` rồi `next start` — hết cảnh biên dịch 77s/trang của dev mode). Ổ D: chậm → khuyến nghị chuyển repo sang C: sau.
  - **GOTCHA lớn:** tiến trình do Claude bật (Start-Process/bash background) **luôn bị môi trường kill (Ctrl+C)** → **KHÔNG tự chạy/test app được**. Cách làm: Claude sửa code, **NGƯỜI DÙNG chạy `start-postiz.bat` trong terminal của họ** để test. Docker container thì sống bình thường.
  - **QUYẾT ĐỊNH của user:** (a) Kênh demo = **Zalo + kênh dễ** (Telegram/Discord/Mastodon — không cần duyệt DN); FB/IG/TikTok để "sẵn khung", cắm key khi user đăng ký app Developer + xác minh DN (việc của user, KHÔNG code bỏ chặn được). (b) Làm **cả 3**: Rebrand + Claude + Zalo. Mục tiêu: **demo được**, chưa cần test kỹ.
  - **Vì sao "kênh bị chặn":** các key OAuth trong `.env` đều TRỐNG (`FACEBOOK_APP_ID=` v.v.) → đúng thiết kế, cần app đã đăng ký.
  - **PHASE 1 (Rebrand) — việc tiếp theo:** đổi "Postiz"→"Việt Anh Media Hub". CHƯA map xong (agent bị dừng). Cần grep `"Postiz"` trong `apps/frontend/src` + `libraries/react-shared-libraries`; logo/SVG trong `apps/frontend/public`; favicon; màu ở `apps/frontend/src/app/colors.scss`, `global.scss`, `tailwind.config.js`. Nguồn chữ "Postiz Register" ở trang `/auth` cần tìm. **Chờ user gửi file logo Việt Anh (PNG/SVG); chưa có thì dùng logo chữ "VA".**
  - **PHASE 2 (Claude caption):** sửa `libraries/nestjs-libraries/src/openai/openai.service.ts` — hàm chính `generatePosts(content)` (dòng ~77), còn `generatePromptForPicture`, `generateVoiceFromText`, `separatePosts`, `extractWebsiteText`, `generateSlidesFromText` (đều `gpt-4.1`). Chuyển các hàm **TEXT** sang Claude `claude-sonnet-4-6` qua `@anthropic-ai/sdk`; `generateImage` (chatgpt-image) GIỮ OpenAI (Claude không tạo ảnh) hoặc tạm tắt. **Cần `ANTHROPIC_API_KEY` (user cấp, dán vào `.env`).**
  - **PHASE 3 (Ghép Zalo) — cốt lõi:** `D:\Zalo bot group` = Node ESM, deps `@anthropic-ai/sdk` + `zca-js` + `playwright` + `sharp` + `express`. src: `service.mjs`(entry), `live.mjs`(nghe nhóm Zalo), `curate/pickbest/extract/download`(lọc ảnh), `caption.mjs`(Claude), `facebook.mjs`+`gbp.mjs`+`publish.mjs`(đăng thẳng FB/GBP). Có `zalo-creds.json`(session đã login), `service.log` 530KB (đã chạy thật). **Kế hoạch: đổi ĐẦU RA từ "đăng thẳng FB/GBP" → "đẩy vào Postiz chờ duyệt" (Redis queue), + dựng Zalo OA làm 1 provider trong Postiz.** PRD mới nhất: `D:\Zalo bot group\PRD-Viet-Anh-Social-Hub-v3.docx`.
  - **PHASE 4:** bật + hướng dẫn cắm token Telegram/Discord/Mastodon (kênh không cần duyệt) để demo đăng đa kênh thật.
  - **Blueprint tham khảo:** `D:\Media_Hub_VietAnh\demo\` (bản demo self-contained 2-backend+1-UI đã dựng trước đó — minh hoạ đúng kiến trúc Zalo→queue→duyệt→đăng).
  - **CHỜ USER cấp:** `ANTHROPIC_API_KEY`, file logo Việt Anh.
- **2026-07-01 (6): 🔑 FIX ĐĂNG NHẬP (quan trọng).** Login API trả 200 nhưng **trình duyệt không đăng nhập được** vì cookie `auth` bị `Secure; SameSite=None` → không lưu qua http. **Vá: thêm `NOT_SECURED=true` vào `.env`** → Postiz bỏ cờ Secure, chuyển auth sang header (cả backend `users.controller.ts` lẫn frontend `proxy.ts`/`layout.tsx` đều đọc `NOT_SECURED`). Đã kiểm chứng: Set-Cookie hết `Secure`, có header `auth`. Prod chạy HTTPS thì BỎ dòng này. Lưu ý: đổi `.env` phải **restart backend+frontend**. Sau khi đổi, hard-refresh trình duyệt (Ctrl+Shift+R) rồi đăng nhập.
- **2026-07-01 (5): ✅ PHASE 0 XONG — Postiz THẬT chạy ở localhost.** Backend `http://localhost:3000` (200), Frontend `http://localhost:4200` (trang `/auth` "Postiz Register" render OK). Chi tiết + fix:
  - **Docker:** gỡ kẹt Docker Model Runner (xóa `%LOCALAPPDATA%\Docker\run\dockerInference`), daemon lên (Server 29.2.1).
  - **Hạ tầng:** Postgres(5432)+Redis(6379)+Temporal(7233)+ES+temporal-pg+temporal-ui qua docker-compose.dev.
  - **`.env`: thêm `TEMPORAL_ADDRESS="127.0.0.1:7233"`** — ép IPv4; nếu thiếu, backend crash `ECONNREFUSED ::1:7233` (Windows resolve `localhost`→IPv6 `::1`).
  - **`prisma-db-push`** → DB in sync (bảng tạo xong).
  - **FIX native module (Node 23):** `libraries/nestjs-libraries/src/sentry/initialize.sentry.ts` — chuyển `import '@sentry/profiling-node'` thành **lazy `require`** trong hàm (sau check DSN). Node 23.9 không có prebuilt cho `@sentry-internal/node-cpu-profiler` → crash `MODULE_NOT_FOUND` lúc import. Dev không set DSN nên không nạp; prod (DSN + Node 22) y hệt cũ.
  - **GOTCHA RAM:** full stack + compile → RAM còn ~1.1GB → OOM kill + compile treo. Dọn node mồ côi; backend **bắt buộc Temporal** lúc boot nên không bỏ được, chỉ tắt tạm khi không dùng.
  - **GOTCHA nền:** dev server chạy qua tool nền hay bị kill → chạy detached bằng `Start-Process cmd`, hoặc để người dùng chạy **`start-postiz.bat`** (tự bật infra + `pnpm run dev-backend`).
  - **KHUYẾN NGHỊ:** cài **Node 22 LTS** để tránh các native-module khác (canvas/sharp/bcrypt) lỗi tương tự.
  - Tiếp theo: **Phase 1 (rebrand)** — đăng ký user đầu tại `http://localhost:4200/auth`.

- **2026-07-01 (3):** Dựng **demo chạy được** minh hoạ kiến trúc 2 backend + 1 UI tại `demo/` (zero-dependency, KHÔNG cần Docker/Redis/Postgres). Gồm: `hub-api` (backend 1, cổng 3000, đóng vai Postiz: consume hàng đợi → caption Claude/mock → tạo draft → mô phỏng đăng), `zalo-worker` (backend 2, cổng 3002, giả lập zca-js ingest + heartbeat), 1 UI (`public/`) có đèn trạng thái 2 backend + cấu hình nhóm Zalo + hàng chờ duyệt + nút giả lập + nhật ký. Hàng đợi bền = `queue.jsonl` append-only + offset trong `state.json`. Đã test end-to-end OK (ingest→consume→duyệt→posted, UI serve 200). Chạy: `node dev.js` hoặc `demo/start.bat`. Caption dùng Claude thật nếu có `ANTHROPIC_API_KEY`, không thì mock. **Đây là blueprint để bê vào Postiz (xem bảng ánh xạ cuối `demo/README.md`), chưa động vào code Postiz thật.**
- **2026-07-01 (4):** Tạo `.env` (creds DB khớp docker, storage local, AI trống). Docker daemon ban đầu chưa chạy → khởi động Docker Desktop. Đang bật Postgres+Redis qua docker-compose.dev.yaml. Bước sau: `prisma-db-push` rồi `dev:backend`. Chưa chạy được UI.
- **2026-07-01 (3):** ✅ `pnpm install` XONG (exit 0, mất ~1h37). 4006 packages. Prisma Client v6.5.0 generate OK. Chỉ cảnh báo Node 23 (không lỗi). `node_modules` sẵn sàng.
- **2026-07-01 (2):** Kích hoạt pnpm 10.6.1 qua corepack. Phát hiện Node 23.9 lệch range yêu cầu (cần 22.x) — ghi cảnh báo. Khởi chạy `pnpm install` chạy nền (log: `_pnpm-install.log`).
- **2026-07-01 (1):** Clone Postiz v1.47.0 → `D:\Media_Hub_VietAnh`. Xác minh cấu trúc, tìm được openai.service.ts (đổi Claude) + social providers (mẫu Zalo OA). Tạo file bàn giao này. Chưa cài deps, chưa sửa code.
