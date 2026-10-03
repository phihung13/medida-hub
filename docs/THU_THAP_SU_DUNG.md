# Thu thập sử dụng & góp ý — Media Hub

Media Hub gắn **chuẩn "Thu thập sử dụng & góp ý cho app nội bộ v1" của Major OS**. Chuẩn gốc viết cho app học
thuật; ở Hub đã chỉnh lại cho đúng thực tế:

- **Người dùng là nhân viên truyền thông / marketing** (email `@truongvietanh.com`), không phải học sinh. Major OS
  lưu email + tên của nhân viên và xếp hạng thời gian dùng.
- **Tính năng đo là việc của nghề truyền thông**: soạn và lên lịch bài, lịch, kênh mạng xã hội, thư viện media, AI,
  Zalo. Không có điểm danh, điểm số hay lớp học.
- **Nội dung bài vẫn có thể chứa ảnh, tên học sinh** (bài khoe hoạt động của trường), nên luật riêng tư vẫn áp dụng
  đầy đủ. Xem mục "Riêng tư" bên dưới.

## Luồng dữ liệu

```
Trình duyệt (UsageTracker)
   │  gom lô: mỗi 60 giây / đủ 50 sự kiện / khi ẩn tab hoặc rời trang (fetch keepalive)
   ▼
Backend Hub  POST /usage/events · POST /usage/feedback   (cần đăng nhập)
   │  gắn email + tên từ phiên đăng nhập, làm sạch, gom lô 5 giây/lần (≤500)
   ▼
Major OS     POST /api/thu-thap/v1/su-kien · /gop-y      (Bearer MAJOR_OS_APP_KEY)
```

| Phần | File |
|---|---|
| Bộ theo dõi trình duyệt | `apps/frontend/src/components/usage/usage.tracker.ts` |
| Gắn vào layout, dải thông báo, khung Góp ý | `apps/frontend/src/components/usage/usage.component.tsx` |
| Controller | `apps/backend/src/api/routes/usage.controller.ts` |
| Làm sạch / gom lô / gửi lại | `libraries/nestjs-libraries/src/usage/` (`usage.sanitize.ts`, `usage.service.ts`, `major-os.client.ts`) |

## Cấu hình (backend)

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `MAJOR_OS_APP_KEY` | có | Khoá app dạng `mos_…`, xin ở Major OS → Quản trị → Thu thập sử dụng. **Chỉ đặt ở backend**, không bao giờ đưa vào biến `NEXT_PUBLIC_*`. |
| `MAJOR_OS_URL` | không | Mặc định `https://os.truongvietanh.com`. |

Không có khoá thì backend nhận rồi bỏ sự kiện (không tích hàng đợi), còn khung Góp ý báo "Hub chưa được cấu hình".
Nếu khoá sai hoặc bị thu hồi (401), log backend báo mỗi 10 phút một lần.

## Phiên và thời gian dùng

- Mỗi lần tải trang (mỗi tab) là một phiên, gửi `phien_bat_dau`. Rời trang gửi `phien_ket_thuc`. Quay lại từ bfcache
  thì mở phiên mới.
- Gửi `nhip` mỗi 30 giây **khi tab đang hiện**. Tab hiện lại thì gửi một nhịp ngay.
- Gửi `xem_trang` mỗi khi đổi đường dẫn. Đường dẫn bỏ `?query` và `#hash`; đoạn trông như mã (cuid, uuid, số dài)
  được thay bằng `:id`, ví dụ `/p/:id/preview`.
- Mất mạng, 429 hoặc 5xx thì giữ lại để gửi sau. Sắp rời trang thì cất vào `localStorage` (`hub_usage_q_*`), lần mở
  sau gửi tiếp. Mỗi sự kiện có `id` uuid riêng nên gửi lại không sinh bản trùng.

## Bảng khoá tính năng

Khoá là **cố định**. Đổi chữ trên nút thì khoá giữ nguyên. **Đừng đổi tên khoá**, vì số cũ và số mới sẽ thành hai
dòng. Nếu buộc phải đổi thì báo team AI.

`them` chỉ chứa **số đếm, đúng/sai và mã ngắn** (`facebook`, `week`, `HTTP_500`…).

### Bài viết

| Khoá | Khi nào | `thoi_luong_ms` | `them` |
|---|---|---|---|
| `bai-viet.mo-khung-soan` | Mở khung soạn bài (tạo mới, sửa, nhân bản) | | `sua` |
| `bai-viet.len-lich` | Bấm "Lên lịch" thành công | thời gian từ lúc mở khung soạn | `so_kenh`, `so_phan`, `so_media`, `sua`, `lap_lai` |
| `bai-viet.dang-ngay` | Bấm "Đăng ngay" thành công | như trên | như trên |
| `bai-viet.luu-nhap` | Lưu nháp | như trên | như trên |
| `bai-viet.cap-nhat` | Chỉ cập nhật bài đã đăng (không đăng lại) | như trên | như trên |
| `bai-viet.xoa` | Xoá bài | | `tu` = `lich` / `khung-soan` |
| `bai-viet.nhan-ban` | Nhân bản bài trên lịch | | |
| `bai-viet.xem-truoc` | Mở trang xem trước để chia sẻ | | |
| `bai-viet.xem-thong-ke` | Mở thống kê của một bài | | |

Khi lên lịch / đăng / lưu nháp **bị chặn**, Hub gửi `loai = loi` với cùng khoá và `them.ma_loi`:
`THIEU_NOI_DUNG`, `CAI_DAT_SAI`, `NOI_DUNG_KHONG_HOP_LE`, `QUA_DAI` (kèm `them.kenh` là mã nền tảng) hoặc
`HTTP_<mã>` khi máy chủ từ chối. Bảng "lỗi theo tính năng" của Major OS cho biết kênh nào hay làm nhân viên vấp.

### Lịch

| Khoá | Khi nào | `them` |
|---|---|---|
| `lich.keo-tha` | Kéo-thả bài sang giờ khác | `kieu` = `schedule` / `update` |
| `lich.doi-che-do` | Đổi chế độ xem | `che_do` = `day` / `week` / `month` / `list` |

### Kênh

| Khoá | Khi nào | `them` |
|---|---|---|
| `kenh.ket-noi` | Kết nối hoặc làm mới kênh thành công (lỗi thì gửi `loi`) | `kenh` (mã nền tảng), `lam_moi`, `hai_buoc` |
| `kenh.xoa` | Xoá kênh | `kenh` |
| `kenh.tam-tat` | Tạm tắt kênh | |
| `kenh.bat-lai` | Bật lại kênh | |

### Media & AI

| Khoá | Khi nào | `thoi_luong_ms` | `them` |
|---|---|---|---|
| `media.tai-len` | Tải ảnh/video lên | | `so_tep`, `so_video`, `tu` = `thu-vien` / `chon-media` / `khung-soan` |
| `media.xoa` | Xoá media trong thư viện | | |
| `ai.viet-caption` | Bút phép thuật: AI viết caption từ ảnh | thời gian AI trả lời | `so_anh`, `co_ngu_canh` |
| `ai.tao-anh` | AI tạo ảnh | thời gian tạo | |
| `ai.tao-video` | AI tạo video | thời gian tạo | `loai`, `khung` |

AI lỗi thì gửi `loai = loi`, `ma_loi` = `HTTP_<mã>` / `HET_THOI_GIAN` / `LOI_MANG`.

### Zalo

| Khoá | Khi nào | `them` |
|---|---|---|
| `zalo.mo-bai` | Từ thẻ bài Zalo, mở bài sang trình soạn | `da_day` |
| `zalo.xoa-bai` | Xoá thẻ bài khỏi danh sách Zalo | |
| `zalo.chot-ngay` | Chốt đợt gom ảnh ngay, không chờ hết giờ | |
| `zalo.luu-nhom` | Lưu cấu hình Nhóm Zalo → kênh (tự lưu) | `so_nhom` |
| `zalo.xem-tin-bi-lo` | Quét lịch sử tin bị lỡ lúc đăng xuất | `tu_dong`, `so_dot` |
| `zalo.lay-lai-tin` | Tạo bản nháp từ các đợt tin bị lỡ | `so_dot` |
| `zalo.ket-noi-lai` | Tạo QR đăng nhập Zalo lại | |
| `zalo.dang-xuat` | Đăng xuất tài khoản Zalo của bot | `xoa_du_lieu` |
| `zalo-video.tai-phien` | Tải phiên Zalo Video lên bot | |

### Khác

| Khoá | Khi nào | `them` |
|---|---|---|
| `gop-y.gui` | Gửi góp ý thành công | `loai` |

Thống kê kênh / bài (`/analytics`) được đếm qua `xem_trang`.

## Góp ý

Nút **Góp ý** nằm ở thanh trên (máy tính) và trong sheet **Thêm** (điện thoại). Khung góp ý có:

- loại: Báo lỗi / Đề xuất / Khen / Khác;
- nội dung, tối đa 4.000 ký tự;
- mức hài lòng 1–5 (không bắt buộc);
- trang hiện tại, gửi kèm tự động.

Email và tên do backend gắn. Nội dung góp ý gửi ngay về Major OS, không ghi log.

## Riêng tư — luật cứng

- **Không bao giờ** đưa caption, nội dung bài, tên file, tên kênh, tên nhóm Zalo, tên hay số điện thoại học sinh
  vào `them` / `trang` / `tinh_nang`.
- Lưới chặn phía backend (`usage.sanitize.ts`) chỉ là lớp bảo vệ cuối, không phải giấy phép:
  - email/tên gửi từ trình duyệt bị bỏ;
  - trường lạ bị bỏ;
  - `them` chỉ giữ số, đúng/sai và chuỗi mã `^[A-Za-z0-9._:-]{1,40}$`, tối đa 12 khoá;
  - `trang` bị cắt query.
- Câu thông báo bắt buộc hiện **một lần mỗi trình duyệt** (dải nhỏ góc dưới), và luôn nằm ở cuối khung Góp ý:
  > Ứng dụng ghi nhận thời gian và tính năng sử dụng để cải thiện sản phẩm.

## Thêm khoá mới

1. Đặt tên theo dạng `nhom.hanh-dong`: chữ thường không dấu, số, `.`, `_`, `-`, tối đa 80 ký tự.
2. Gọi `trackFeature('nhom.hanh-dong', { durationMs?, extra? })` khi thao tác **thành công**. Khi thất bại thì gọi
   `trackFeatureError('nhom.hanh-dong', 'MA_LOI')`.
3. Thêm một dòng vào bảng trên. Tính năng chưa từng gửi thì Major OS không biết nó tồn tại.
