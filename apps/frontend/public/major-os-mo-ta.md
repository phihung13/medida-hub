# Media Hub — mô tả API báo cáo cho Major OS

*Chuẩn "Kết nối app với Major OS" v2 · cập nhật {{NGAY}}*

## 1. App làm gì, ai dùng

Media Hub là công cụ của **team truyền thông / marketing** Trường Việt Anh. Nhân viên dùng Hub để:

- soạn bài và lên lịch đăng lên Facebook, Zalo, Zalo Video, TikTok, YouTube, LinkedIn…;
- quản lý lịch bài và các kênh mạng xã hội;
- quản lý thư viện ảnh/video;
- dùng AI viết caption, tạo ảnh, tạo video;
- nhận ảnh từ nhóm Zalo để thành bài nháp.

**Người dùng là nhân viên** (email `@truongvietanh.com`). Học sinh và phụ huynh **không** dùng Hub. Hub không gửi
dữ liệu học sinh trong báo cáo. Bài đăng có thể có ảnh hoặc tên học sinh, nên báo cáo **không bao giờ** chứa nội dung
bài, caption, tên file, tên kênh hay tên nhóm Zalo. Chỉ có khoá tính năng, số đếm và mã ngắn.

Hub ghi lại thời gian và tính năng sử dụng ngay trong app. Người dùng được thông báo bằng câu: "Ứng dụng ghi nhận
thời gian và tính năng sử dụng để cải thiện sản phẩm."

## 2. Cách gọi

- Gốc: `{{API}}`
- **HTTPS, GET, trả JSON.**
- Key: header `Authorization: Bearer <key>`. Key do quản trị hệ thống tạo trong Hub (Cài đặt → Kết nối Major OS),
  chỉ đọc báo cáo, thu hồi được bất cứ lúc nào.
- Tham số chung:

| Tham số | Bắt buộc | Ý nghĩa |
|---|---|---|
| `tu` | không (mặc định: `den` − 24 giờ) | ISO 8601 có múi giờ, vd `2026-10-04T08:00:00+07:00` |
| `den` | không (mặc định: lúc gọi) | ISO 8601 có múi giờ, **không tính** chính mốc này |
| `trang_sau` | không | con trỏ trang kế tiếp, lấy từ phản hồi trước |
| `so_dong` | không | số dòng mỗi trang, mặc định 500, tối đa 1.000 |

- `tu`/`den` lọc theo **lúc Hub nhận** dữ liệu, không phải lúc thao tác. Nhờ vậy sự kiện gửi trễ (máy mất mạng rồi
  gửi bù) vẫn nằm trong lượt lấy kế tiếp, không bị sót.
- Mỗi lần lấy tối đa 190 ngày. Hub giữ dữ liệu thô 180 ngày.
- **Phân trang**: còn trang thì `trang_sau` khác `null`. Gọi lại với **cùng `tu`/`den`** kèm `trang_sau`.
- **Mỗi dòng có `id` cố định**: lấy lại nhiều lần thì ghi đè theo `id`, không sinh bản trùng.
- Giờ trả về theo giờ Việt Nam (`+07:00`).
- Mã lỗi: `400` tham số sai (`{"loi": "…"}`), `401` key sai hoặc đã thu hồi, `429` quá giới hạn gọi.
- Giới hạn: **120 lần gọi/phút mỗi key**.

## 3. Endpoint

### 3.1 `GET /tinh-nang` — mỗi dòng là một lần dùng tính năng (hoặc một lần lỗi)

```
GET {{API}}/tinh-nang?tu=2026-10-04T08:00:00%2B07:00&den=2026-10-04T08:15:00%2B07:00
Authorization: Bearer <key>
```

```json
{
  "du_lieu": [
    {
      "id": "6f1c0b8e-3c1f-4a59-9a6e-2f1f0c6d9b11",
      "luc": "2026-10-04T08:03:12.120+07:00",
      "nhan_luc": "2026-10-04T08:04:01.502+07:00",
      "nguoi": { "email": "an.tran@truongvietanh.com", "ten": "Trần Văn An" },
      "loai": "dung_tinh_nang",
      "tinh_nang": "bai-viet.len-lich",
      "ket_qua": "thanh_cong",
      "so_lan": 1,
      "thoi_luong_ms": 418000,
      "trang": "/launches",
      "thiet_bi": "may_tinh",
      "them": { "so_kenh": 3, "so_phan": 1, "so_media": 6, "sua": false, "lap_lai": false }
    },
    {
      "id": "0d2c41aa-9b7e-4f0a-8c55-1e2f3a4b5c6d",
      "luc": "2026-10-04T08:05:40.000+07:00",
      "nhan_luc": "2026-10-04T08:05:41.010+07:00",
      "nguoi": { "email": "an.tran@truongvietanh.com", "ten": "Trần Văn An" },
      "loai": "loi",
      "tinh_nang": "ai.viet-caption",
      "ket_qua": "loi",
      "so_lan": 1,
      "them": { "ma_loi": "HET_THOI_GIAN" }
    }
  ],
  "trang_sau": null
}
```

| Trường | Ý nghĩa |
|---|---|
| `id` | uuid cố định của lần thao tác |
| `luc` | lúc người dùng thao tác (theo giờ máy người dùng) |
| `nhan_luc` | lúc Hub nhận, là mốc dùng để lọc `tu`/`den` |
| `nguoi` | nhân viên: `{email, ten}`. Email ngoài `@truongvietanh.com`: chỉ `{ma}` (mã nội bộ của Hub, không lộ danh tính) |
| `loai` | `dung_tinh_nang` (thao tác xong) hoặc `loi` (thao tác thất bại / bị chặn) |
| `tinh_nang` | khoá tính năng cố định (mục 4) |
| `ket_qua` | `thanh_cong` hoặc `loi` |
| `so_lan` | luôn là 1 (một dòng = một lần) |
| `thoi_luong_ms` | thao tác mất bao lâu, tính bằng mili-giây (vd với `bai-viet.*` là thời gian soạn bài) |
| `trang` | trang đang mở (đã bỏ query; mã trong đường dẫn thay bằng `:id`) |
| `thiet_bi` | `may_tinh` · `dien_thoai` · `may_tinh_bang` · `khac` |
| `them` | chi tiết phụ: chỉ số đếm, đúng/sai, mã ngắn (mục 4); `ma_loi` có ở dòng lỗi |

### 3.2 `GET /thoi-gian-dung` — mỗi dòng là thời gian dùng Hub của một người trong một ngày

```json
{
  "du_lieu": [
    {
      "id": "tg_3b1e…_2026-10-04",
      "ngay": "2026-10-04",
      "luc": "2026-10-04T00:00:00+07:00",
      "cap_nhat_luc": "2026-10-04T08:14:30.000+07:00",
      "nguoi": { "email": "an.tran@truongvietanh.com", "ten": "Trần Văn An" },
      "tinh_nang": "hub.su-dung",
      "so_phut": 42.5,
      "so_phien": 3,
      "so_thao_tac": 17
    }
  ],
  "trang_sau": null
}
```

| Trường | Ý nghĩa |
|---|---|
| `id` | `tg_<mã người>_<ngày>`: **một id cho mỗi người mỗi ngày** |
| `ngay` | ngày theo giờ Việt Nam |
| `so_phut` | thời gian dùng **thật** = 0,5 phút × số "ô 30 giây" khác nhau có hoạt động. Tab đang hiện thì 30 giây gửi một nhịp; tab ẩn, máy khoá hay để mở mà không nhìn thì không tính; mở hai tab không tính gấp đôi |
| `so_phien` | số lần mở Hub (mỗi tab là một phiên) |
| `so_thao_tac` | số lần dùng tính năng trong ngày |
| `cap_nhat_luc` | lúc Hub nhận hoạt động gần nhất của người đó trong ngày |

**Quan trọng:** dòng này là **số của cả ngày tính tới lúc lấy**. Trong ngày, lượt lấy sau trả lại cùng `id` với
`so_phut` lớn hơn, nên **ghi đè theo `id`, đừng cộng dồn**. Một người chỉ xuất hiện khi Hub nhận hoạt động mới của
người đó trong khoảng `tu`/`den`.

### 3.3 `GET /gop-y` — góp ý người dùng gửi từ nút "Góp ý" trong Hub

```json
{
  "du_lieu": [
    {
      "id": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      "luc": "2026-10-04T10:00:00.000+07:00",
      "nguoi": { "email": "an.tran@truongvietanh.com", "ten": "Trần Văn An" },
      "loai": "de_xuat",
      "noi_dung": "Cho lọc bài trên lịch theo kênh",
      "muc_hai_long": 4,
      "trang": "/launches"
    }
  ],
  "trang_sau": null
}
```

| Trường | Ý nghĩa |
|---|---|
| `loai` | `loi` (báo lỗi) · `de_xuat` · `khen` · `khac` |
| `noi_dung` | 1–4.000 ký tự, người dùng tự gõ (đã nhắc không ghi tên, số điện thoại học sinh) |
| `muc_hai_long` | 1–5, có thể không có |
| `trang` | trang đang mở lúc gửi góp ý |

## 4. Danh sách tính năng

| Khoá | Tên hiển thị | `them` |
|---|---|---|
| `hub.su-dung` | Dùng Media Hub (thời gian dùng, mục 3.2) | |
| `bai-viet.mo-khung-soan` | Mở khung soạn bài | `sua` |
| `bai-viet.len-lich` | Lên lịch bài | `so_kenh`, `so_phan`, `so_media`, `sua`, `lap_lai` |
| `bai-viet.dang-ngay` | Đăng bài ngay | như trên |
| `bai-viet.luu-nhap` | Lưu bài nháp | như trên |
| `bai-viet.cap-nhat` | Cập nhật bài đã đăng | như trên |
| `bai-viet.xoa` | Xoá bài | `tu` = `lich` / `khung-soan` |
| `bai-viet.nhan-ban` | Nhân bản bài | |
| `bai-viet.xem-truoc` | Xem trước bài để chia sẻ | |
| `bai-viet.xem-thong-ke` | Xem thống kê một bài | |
| `lich.keo-tha` | Kéo-thả đổi giờ bài trên lịch | `kieu` |
| `lich.doi-che-do` | Đổi chế độ xem lịch | `che_do` = `day` / `week` / `month` / `list` |
| `kenh.ket-noi` | Kết nối / làm mới kênh mạng xã hội | `kenh` (mã nền tảng), `lam_moi`, `hai_buoc` |
| `kenh.xoa` | Xoá kênh | `kenh` |
| `kenh.tam-tat` | Tạm tắt kênh | |
| `kenh.bat-lai` | Bật lại kênh | |
| `media.tai-len` | Tải ảnh/video lên | `so_tep`, `so_video`, `tu` |
| `media.xoa` | Xoá ảnh/video trong thư viện | |
| `ai.viet-caption` | AI viết caption từ ảnh | `so_anh`, `co_ngu_canh` |
| `ai.tao-anh` | AI tạo ảnh | |
| `ai.tao-video` | AI tạo video | `loai`, `khung` |
| `zalo.mo-bai` | Mở bài lấy từ nhóm Zalo sang trình soạn | `da_day` |
| `zalo.xoa-bai` | Xoá thẻ bài Zalo | |
| `zalo.chot-ngay` | Chốt ngay đợt gom ảnh Zalo | |
| `zalo.luu-nhom` | Lưu cấu hình nhóm Zalo → kênh | `so_nhom` |
| `zalo.xem-tin-bi-lo` | Quét tin Zalo bị lỡ khi đăng xuất | `tu_dong`, `so_dot` |
| `zalo.lay-lai-tin` | Lấy lại tin Zalo bị lỡ thành bài nháp | `so_dot` |
| `zalo.ket-noi-lai` | Đăng nhập lại Zalo (QR) | |
| `zalo.dang-xuat` | Đăng xuất Zalo của bot | `xoa_du_lieu` |
| `zalo-video.tai-phien` | Tải phiên đăng nhập Zalo Video lên bot | |
| `gop-y.gui` | Gửi góp ý | `loai` |

Mã lỗi (`them.ma_loi`) khi lên lịch / đăng bị chặn: `THIEU_NOI_DUNG`, `CAI_DAT_SAI`, `NOI_DUNG_KHONG_HOP_LE`,
`QUA_DAI` (kèm `them.kenh` là nền tảng gây lỗi); máy chủ từ chối: `HTTP_<mã>`; AI: `HET_THOI_GIAN`, `LOI_MANG`,
`HTTP_<mã>`.

## 5. Báo cáo muốn hiện trên Major OS

- Bảng xếp hạng chung: thời gian dùng (`/thoi-gian-dung`) và số lần dùng tính năng (`/tinh-nang`).
- Tính năng ít dùng nhất, tỷ lệ lỗi theo tính năng, và kênh nào hay làm bài bị chặn (`ma_loi` + `kenh`).
- Hộp góp ý (`/gop-y`).
- Cảnh báo nghiệp vụ riêng: **chưa có** (dự kiến: kênh mất kết nối, bài đăng lỗi).

## 6. Liên hệ kỹ thuật

{{LIEN_HE}}
