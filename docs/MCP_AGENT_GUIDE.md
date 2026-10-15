---
name: viet-anh-media-hub-mcp
description: "Hướng dẫn agent (Hermes, Claude, Cursor, n8n AI…) điều khiển Việt Anh Media Hub qua MCP v2: kết nối, mức quyền, quy tắc an toàn, các luồng việc mẫu (lịch đăng, Zalo, viral, Group Facebook, Excel/RSS, số liệu) và bảng tra công cụ. Dùng khi agent cần đọc/tạo/sửa/lên lịch bài, xử lý hàng chờ Zalo, chọn content viral, xem chủ đề hot trong group phụ huynh, hoặc lấy số liệu kênh của Media Hub (hub.vietanh.org)."
---

# Việt Anh Media Hub — cách dùng MCP v2 (dành cho agent)

Media Hub (hub.vietanh.org) là hệ thống quản lý đăng bài đa kênh của Trường Việt Anh. Nó gồm:
- **Lịch** đăng Facebook, Instagram, YouTube, Zalo Video, Google Business…
- **Bot Zalo** gom bài từ các nhóm Zalo.
- **Viral**: cào nguồn, gom thành chủ đề, sản xuất content.
- **Group FB**: tín hiệu thô từ các group phụ huynh.
- **Đăng tự động** RSS và Excel.
- **Số liệu** kênh.

Qua MCP, agent làm được gần như mọi thao tác mà người dùng làm trên giao diện.

---

## 1. Kết nối

| | |
|---|---|
| Địa chỉ | `https://hub.vietanh.org/api/mcp` |
| Giao thức | MCP Streamable HTTP (2025-03-26), trả JSON |
| Xác thực | Header `Authorization: Bearer hub_mcp_…` |
| Client không gửi được header | `https://hub.vietanh.org/api/mcp/<khoá>` (kém an toàn hơn) |
| Client chỉ hỗ trợ SSE | `https://hub.vietanh.org/api/sse/<khoá>` |

```json
{
  "mcpServers": {
    "media-hub": {
      "type": "http",
      "url": "https://hub.vietanh.org/api/mcp",
      "headers": { "Authorization": "Bearer hub_mcp_xxx" }
    }
  }
}
```

**Lấy khoá:** quản trị viên tổ chức vào **Cài đặt → Kết nối agent MCP**, đặt tên, chọn mức quyền rồi bấm **Tạo khoá**.
- Khoá chỉ hiện một lần.
- Không dán khoá vào chat, log hay file công khai.
- Lộ khoá thì thu hồi ở cùng màn hình đó.

**Kiểm tra kết nối:** gọi `integrationList` (chỉ đọc). Có danh sách kênh trả về là đã kết nối được.

---

## 2. Mức quyền của khoá — đọc kỹ trước khi làm gì

| Mức | Làm được | Không làm được |
|---|---|---|
| `doc`: chỉ đọc | Xem mọi thứ | Mọi thao tác ghi |
| `nhap`: tạo nháp | Thêm: tạo/sửa **bài nháp**, chạy AI, tải media, ghi chú, sửa caption Zalo, đẩy bài Zalo sang Lịch, sản xuất viral, đưa bài group sang content | Bất cứ thứ gì **ra ngoài**: lên lịch, đăng, gửi tin, xoá |
| `dang`: được đăng | Thêm: lên lịch, đăng ngay, sửa bài đã lên lịch, duyệt đăng Facebook/Google từ Zalo, gửi tin Zalo, cấu hình nguồn, xoá | — |

Gọi công cụ vượt quyền thì nhận:
```json
{ "loi": "Khoá MCP này chỉ có quyền \"tạo nháp\" — … cần quyền \"được đăng\". …" }
```
Khi đó **không có gì bị thực hiện**. Đừng thử lại bằng cách khác. Báo người dùng: việc này cần người duyệt bấm trên Hub, hoặc cần khoá mức cao hơn.

---

## 3. Quy tắc bắt buộc

1. **Mặc định tạo NHÁP.** Kể cả khi khoá có quyền `dang`, chỉ lên lịch hoặc đăng thật khi người dùng nói rõ ("lên lịch", "đăng luôn", "duyệt").
2. **Hỏi lại trước các thao tác không quay lại được:**
   - đăng ngay (`loai: now`, `hub_bai_dang_ngay`, `_len_lich` với `dang_ngay: true`);
   - `hub_bai_duyet_hang_loat`: đọc lại danh sách bài cho người dùng trước khi duyệt;
   - `zalo_bai_duyet_facebook` / `zalo_bai_duyet_google` (đăng thật);
   - `zalo_gui_tin` (gửi tin thật);
   - mọi công cụ `_xoa`;
   - `hub_autopost_luu` với nguồn đang bật (sẽ tự đăng).
3. **Đọc trước, ghi sau.** Trước khi sửa bài thì gọi `hub_bai_chi_tiet`. Trước khi tạo bài thì gọi `integrationList`, và `integrationSchema` nếu là kênh lạ.
4. **Không bịa id.** Mọi id (kênh, bài, chủ đề, group…) phải lấy từ kết quả công cụ.
5. **Lỗi `{ "loi": "…" }` là chỉ dẫn.** Đọc thông điệp, sửa đúng chỗ, gọi lại tối đa 1-2 lần. Vẫn lỗi thì báo người dùng nguyên văn lỗi.
6. **Kết quả có thể bị cắt:**
   - chuỗi quá 1.500 ký tự, mảng quá 100 mục;
   - danh sách viral/group chỉ lấy 50 mục.

   Nếu có trường `con_nua` > 0 thì lọc hẹp lại rồi gọi tiếp.
7. **Giờ dùng ISO 8601 có múi giờ Việt Nam**, vd `2026-10-20T19:30:00+07:00`.
8. **Nội dung bài:**
   - Chữ thường: mỗi dòng thành 1 đoạn.
   - Hoặc HTML đơn giản: `p, h1-h3, strong, u, ul, li`.
   - Không dùng Markdown (`**`, `#`) vì nó sẽ hiện nguyên ký tự.
9. **Ảnh/video phải nằm trong thư viện Hub.** Link ngoài thì gọi `uploadFromUrlTool` trước, rồi dùng `path` nó trả về.
10. Bài do khoá MCP tạo được ghi tác giả là `mcp-ngoai` trong báo cáo. Đừng cố giả làm người dùng.

---

## 4. Luồng việc mẫu

### 4.1 Viết và xếp bài lên lịch (an toàn, khoá `nhap`)
1. `integrationList`: chọn kênh đích, lấy `id`.
2. `hub_mau_bai`: đọc mẫu và chữ ký để bám đúng giọng văn của trường.
3. `hub_gio_trong`: lấy giờ trống kế tiếp của kênh.
4. `hub_bai_tao` với `kenh: [id…]`, `noi_dung`, `loai: "draft"` và `gio_dang` (tuỳ chọn).
5. Báo người dùng: bài đã nằm ở Lịch dưới dạng nháp, mở Hub để duyệt.

Nếu khoá có `dang` **và** người dùng bảo lên lịch hoặc đăng:
- **Duyệt 1 bài theo giờ đã đặt:** `hub_bai_trang_thai` với `trang_thai: "schedule"`.
- **Duyệt nhiều bài một lần:** `hub_bai_duyet_hang_loat` với `ids: […]`.
  - Bài có giờ đăng đã qua thì mặc định bị bỏ qua.
  - `gio_qua: "gio_trong"` dời bài sang giờ trống kế tiếp của kênh.
  - `gio_qua: "dang_ngay"` đăng luôn.
- **Đăng ngay 1 bài nháp:** `hub_bai_dang_ngay`. Đây là đăng thật, nên hỏi lại người dùng trước.
- Hoặc tạo bài mới thẳng với `loai: "schedule"` / `"now"`.

### 4.2 Sửa / dời bài
- Sửa nội dung: `hub_bai_chi_tiet` rồi `hub_bai_sua` (giữ nguyên id, tag và comment đầu nếu không đổi).
  - Bài nháp hoặc bài lỗi: cần `nhap`.
  - Bài đã lên lịch: cần `dang`.
  - Bài đã đăng: **không sửa được**.
- Dời giờ: `hub_bai_doi_gio`.
- Gỡ khỏi hàng đăng mà không xoá: `hub_bai_trang_thai` với `draft`.

### 4.3 Hàng chờ Zalo → đa kênh
1. `zalo_tong_quan`: kiểm tra bot đang chạy, có bị mất phiên không.
2. `zalo_hang_cho`: xem các bài bot đã gom.
3. Chỉnh caption nếu cần: `zalo_bai_viet_lai_ai` (chỉ là bản xem trước), xong mới `zalo_bai_sua` để lưu.
4. `zalo_bai_day_sang_hub`: bài thành nháp trên Lịch Hub để đăng đa kênh. Hoặc, khi người dùng duyệt và khoá có `dang`: `zalo_bai_duyet_facebook` / `zalo_bai_duyet_google`.
5. Đăng Zalo Video: tạo bài trên Lịch cho kênh Zalo Video bằng `hub_bai_tao`. Bot tự đăng khi tới giờ.

### 4.4 Chọn content viral
1. `hub_viral_chu_de` với `trang_thai: "pending"`: các chủ đề chờ duyệt, kèm điểm AI và **nguồn** (báo / group / KOL / đối thủ).
2. `hub_viral_chu_de_chi_tiet`: đọc bài nguồn làm bằng chứng.
3. Đi tiếp theo một trong ba cách:
   - `hub_viral_chu_de_duyet` (`approve`): Hub tự sản xuất nếu đã bật.
   - `hub_viral_chu_de_viet_lai`: viết lại thành "Bài của mình".
   - `hub_viral_san_xuat`: chọn định dạng blog / infographic / podcast.
4. `hub_viral_san_pham` / `hub_viral_bai_cua_minh`, rồi `_len_lich` với `kenh`:
   - mặc định đưa lên Lịch thành **nháp**;
   - `dang_ngay: true` thì **đăng thật ngay**. Cần khoá `dang` và người dùng phải nói rõ "đăng ngay".
   - Kênh cần thêm cài đặt (vd YouTube cần tiêu đề) thì đăng ngay sẽ báo lỗi. Khi đó đưa lên dạng nháp và nhờ người dùng điền trên Lịch.

### 4.5 Group Facebook phụ huynh: chủ đề hot và câu hỏi nhiều người hỏi
Đây là khu riêng (tab 👥 Group FB). Bài do người cào gửi về; Hub không chạy AI ở khu này.
1. `hub_group_fb_tong_quan`: danh sách group và các kỳ cào. Mỗi kỳ có `hotTopics` và `askedTopics` (chủ đề, số bài, số bình luận, group nào, link bài, ghi chú).
2. `hub_group_fb_bai` để xem chi tiết, lọc theo:
   - `ky`: id kỳ cào, hoặc `open` = chưa kết kỳ;
   - `group_id`;
   - `loai`: `hoi`, `chia_se`, `review`, `phan_nan`, `khac`;
   - `chu_de`: đúng nhãn chủ đề;
   - `tim`: tìm trong nội dung.
3. Bài đáng làm content: `hub_group_fb_lam_content` đưa bài sang tab Chờ duyệt của viral, trả về `topicId`. AI tổng hợp và chấm điểm mất vài phút.
4. Từ đây đi đúng luồng 4.4 với `topicId` đó:
   duyệt (`hub_viral_chu_de_duyet`) → viết lại (`hub_viral_chu_de_viet_lai`) hoặc sinh ảnh/content (`hub_viral_san_xuat`) → `_len_lich` dạng nháp, hoặc `dang_ngay: true`.
5. Thêm, tắt hoặc sửa group cần theo dõi: `hub_group_fb_them_group`.

Câu hỏi hay gặp như "phụ huynh đang hỏi gì nhiều nhất tuần này?": đọc `askedTopics` của kỳ mới nhất, rồi dẫn 2-3 bài thật (có link) bằng `hub_group_fb_bai` với `loai: "hoi"` và `chu_de: …`.

### 4.6 Nhập Excel / CSV hàng loạt
`hub_excel_doc_file` (link công khai, tối đa 10MB) → (tuỳ chọn) `hub_excel_ai_chuot` → `hub_excel_luu_bang` → người duyệt xem trên giao diện → `hub_excel_len_lich` (cần `dang`).

### 4.7 Số liệu & báo cáo
- `hub_so_lieu_tong_quan`: tổng quan mọi kênh trong 7 / 30 / 90 ngày.
- `hub_so_lieu_kenh`: số liệu một kênh theo ngày.
- `hub_bai_noi_bat`: bài nổi bật của kênh.
- `hub_bai_so_lieu`: số liệu một bài.
- Cần AI diễn giải: `hub_phan_tich_kenh` hoặc `hub_hoi_ve_kenh` (cần `nhap`, tốn lượt AI).

---

## 5. Bảng tra công cụ (rút gọn)

Tên tham số chính xác nằm trong schema của từng công cụ (client MCP tự hiển thị). Mức quyền ghi trong ngoặc.

**Kênh & công cụ gốc:**
- `integrationList` (doc), `groupList` (doc), `integrationSchema` (doc), `triggerTool` (doc)
- `schedulePostTool` (nháp: nhap / lên lịch: dang)
- `uploadFromUrlTool` (nhap), `generateImageTool` (nhap), `generateVideoTool` (nhap)

**Bài & Lịch:**
- `hub_lich_xem` (doc, tối đa 62 ngày), `hub_bai_danh_sach` (doc), `hub_bai_chi_tiet` (doc)
- `hub_bai_tao` (nhap / dang), `hub_bai_sua` (nhap / dang), `hub_bai_doi_gio` (nhap / dang), `hub_bai_trang_thai` (nhap / dang)
- `hub_bai_dang_ngay` (dang, đăng thật), `hub_bai_duyet_hang_loat` (dang, ≤ 50 bài)
- `hub_bai_xoa` (dang)
- `hub_gio_trong` (doc), `hub_bai_so_lieu` (doc)
- `hub_ghi_chu_xem` (doc), `hub_ghi_chu_them` (nhap)
- `hub_tag_danh_sach` (doc), `hub_tag_tao` (nhap)
- `hub_mau_bai` (doc), `hub_thong_bao` (doc)

**Số liệu & Media:**
- `hub_so_lieu_tong_quan` (doc), `hub_so_lieu_kenh` (doc), `hub_bai_noi_bat` (doc)
- `hub_phan_tich_kenh` (nhap), `hub_hoi_ve_kenh` (nhap)
- `hub_media_danh_sach` (doc), `hub_media_xoa` (dang)
- `hub_ai_caption` (nhap), `hub_ai_youtube` (nhap)

**RSS & Excel:**
- `hub_autopost_danh_sach` (doc)
- `hub_autopost_luu`, `hub_autopost_bat_tat`, `hub_autopost_xoa` (dang)
- `hub_excel_doc_file`, `hub_excel_ai_chuot`, `hub_excel_luu_bang` (nhap)
- `hub_excel_len_lich` (dang), `hub_excel_lich_su` (doc)

**Viral:**
- `hub_viral_chu_de` (doc), `hub_viral_chu_de_chi_tiet` (doc)
- `hub_viral_chu_de_duyet` (nhap; delete cần dang), `hub_viral_chu_de_viet_lai` (nhap)
- `hub_viral_bai` (doc), `hub_viral_bai_duyet` (nhap), `hub_viral_them` (nhap), `hub_viral_nhan_ban` (nhap), `hub_viral_cao_ngay` (nhap)
- `hub_viral_bai_cua_minh` (doc), cùng `_len_lich` (nhap; `dang_ngay` cần dang), `_viet_lai` (nhap), `_xoa` (dang)
- `hub_viral_san_xuat` (nhap)
- `hub_viral_san_pham` (doc), cùng `_len_lich` (nhap; `dang_ngay` cần dang), `_lam_lai` (nhap), `_xoa` (dang)
- `hub_viral_nguon` (doc), `hub_viral_nguon_them` (dang), `hub_viral_nguon_sua` (dang)
- `hub_viral_chan_dung` (doc), `hub_viral_ban_tin` (doc)

**Group Facebook:**
- `hub_group_fb_tong_quan` (doc), `hub_group_fb_bai` (doc)
- `hub_group_fb_them_group` (nhap; xoá cần dang), `hub_group_fb_lam_content` (nhap)

**Zalo:**
- Đọc (doc): `zalo_tong_quan`, `zalo_hang_cho`, `zalo_da_dang`, `zalo_dang_gom`, `zalo_nhom`, `zalo_ban_be`, `zalo_nhat_ky`, `zalo_video_trang_thai`
- Nháp (nhap): `zalo_bai_sua`, `zalo_bai_viet_lai_ai`, `zalo_bai_tai_lai_chan_bai`, `zalo_bai_day_sang_hub`, `zalo_chot_phien`, `zalo_bai_huy_hen`
- Đăng/gửi thật (dang): `zalo_bai_duyet_facebook`, `zalo_bai_duyet_google`, `zalo_bai_hen_gio`, `zalo_da_dang_cong_khai`, `zalo_bai_bo_kenh`, `zalo_bai_bo`, `zalo_tam_dung`, `zalo_nhom_cau_hinh`, `zalo_gui_tin`

---

### 5b. Công cụ bổ sung (ảnh, chân bài, hashtag, kênh, viral, tự động hoá, Zalo)

Quy ước thêm:
- **Ảnh đánh số từ 1** theo thứ tự đang hiển thị trong bài. `hub_bai_anh` / `zalo_bai_anh` đổi thứ tự, bỏ, chèn, đặt ảnh bìa mà không phải gửi lại cả danh sách.
- **Sửa ảnh luôn tạo ảnh MỚI** trong thư viện, ảnh gốc giữ nguyên. Truyền `thay_vao_bai: true` để thay luôn vào bài.
- Chỉ đọc ảnh nằm trong kho của Hub. Link ngoài phải tải lên trước bằng `uploadFromUrlTool`.
- Tool ghi "(ghi cần cao hơn)": xem được bằng khoá chỉ đọc, còn thao tác sửa bên trong đòi quyền tạo nháp / được đăng.
- Sửa bài **đã lên lịch** (ảnh, hashtag, chân bài…) cần quyền **được đăng**, giống `hub_bai_sua`. Bài đã đăng không sửa được.
- Chân bài kênh (`hub_chan_bai_kenh`) **không** nằm trong nội dung bài; Hub chèn lúc đăng thật. Muốn đưa chân bài/chữ ký vào nội dung thì dùng `hub_chan_bai_ap`.
- Chân bài nhóm Zalo: `zalo_chan_bai_nhom_sua` với `noi_ap_dung: "kenh"` là bền nhất. Kiểu `"nhom"` bị xoá khi ai đó lưu lại trang Nhóm Zalo trên Hub.
- Một số tool viral (sửa cấu hình, skill, podcast) chỉ chạy với khoá do **quản trị hệ thống** tạo.
- `hub_anh_ai_sua` xoá phông sẽ ra nền trắng (Gemini không trả nền trong suốt).
- Chưa làm được: đổi tên file media, chú thích **video** trong hàng chờ Zalo (bot chưa hỗ trợ), tải file lên (nhạc nền, ảnh bìa podcast).

### Ảnh & media

| Tool | Quyền | Việc |
|---|---|---|
| `hub_bai_anh` | tạo nháp | Sắp xếp / bỏ / chèn ảnh trong bài |
| `hub_media_thong_tin` | tạo nháp | Đặt alt / thumbnail cho media |
| `hub_anh_sua` | tạo nháp | Sửa ảnh (cắt, chỉnh màu, chữ, logo…) |
| `hub_anh_ghep` | tạo nháp | Ghép nhiều ảnh (collage) |
| `hub_anh_ai_sua` | tạo nháp | AI sửa ảnh theo câu lệnh |
| `hub_anh_cham_diem` | chỉ đọc (ghi cần cao hơn) | Chấm điểm ảnh & tìm ảnh trùng |
| `hub_anh_kiem_tra_kenh` | chỉ đọc (ghi cần cao hơn) | Kiểm ảnh theo luật kênh |
| `hub_video_thumbnail` | tạo nháp | Thumbnail cho video |
| `zalo_bai_anh` | tạo nháp | Sắp xếp / bỏ / chèn ảnh bài chờ Zalo |
| `zalo_bai_anh_sua` | tạo nháp | Sửa một ảnh của bài chờ Zalo |

### Soạn bài: chân bài, chữ ký, hashtag, thread, link, nhân bản, kiểm tra

| Tool | Quyền | Việc |
|---|---|---|
| `hub_chan_bai_kenh` | chỉ đọc (ghi cần cao hơn) | Chân bài cố định của kênh |
| `hub_chan_bai_ap` | tạo nháp | Gắn chữ ký / chân bài vào bài |
| `hub_chu_ky` | chỉ đọc (ghi cần cao hơn) | Quản lý chữ ký |
| `hub_hashtag` | chỉ đọc (ghi cần cao hơn) | Xử lý hashtag trong bài |
| `hub_hashtag_goi_y` | tạo nháp | AI gợi ý hashtag |
| `hub_bai_tach_thread` | tạo nháp | Tách bài dài thành thread |
| `hub_rut_gon_link` | tạo nháp | Rút gọn link |
| `hub_bai_nhan_ban` | tạo nháp | Nhân bản bài |
| `hub_bo_cai_dat` | chỉ đọc (ghi cần cao hơn) | Mẫu bài (sets) |
| `hub_ai_sinh_bai` | tạo nháp | AI sinh bài (Generator) |
| `hub_bai_kiem_tra` | chỉ đọc | Kiểm tra bài trước khi đăng |
| `hub_bai_gan_link_da_dang` | được đăng | Gắn link cho bài đã đăng bị thiếu |
| `hub_khach_hang` | chỉ đọc | Khách hàng & kênh |

### Kênh

| Tool | Quyền | Việc |
|---|---|---|
| `hub_kenh_danh_sach` | chỉ đọc | Danh sách kênh & trạng thái |
| `hub_kenh_bat_tat` | được đăng | Bật / tắt kênh |
| `hub_kenh_doi_ten` | tạo nháp | Đổi tên hiển thị kênh |
| `hub_kenh_nhom` | tạo nháp | Gán kênh cho khách hàng |
| `hub_kenh_gio_dang` | chỉ đọc (ghi cần cao hơn) | Khung giờ đăng mặc định của kênh |
| `hub_kenh_cai_dat` | chỉ đọc (ghi cần cao hơn) | Cài đặt thêm của kênh |
| `hub_kenh_plugs` | chỉ đọc (ghi cần cao hơn) | Plugs của kênh |

### Viral mở rộng

| Tool | Quyền | Việc |
|---|---|---|
| `hub_viral_ban_tin_xoa` | được đăng | Xoá bản tin viral |
| `hub_viral_ban_tin_gui_zalo` | được đăng | Gửi bản tin qua Zalo |
| `hub_viral_ban_tin_tao_ngay` | được đăng | Tạo & gửi bản tin tuần ngay |
| `hub_viral_cau_hinh` | chỉ đọc | Cấu hình viral |
| `hub_viral_cau_hinh_sua` | được đăng | Sửa cấu hình viral |
| `hub_viral_cham_diem` | tạo nháp | AI chấm điểm bài chưa có điểm |
| `hub_viral_nguon_loai` | được đăng | Đổi loại nguồn |
| `hub_viral_nguon_don_dep` | được đăng | Dọn nguồn theo dõi |
| `hub_viral_nguon_nhap_mac_dinh` | được đăng | Nhập bộ nguồn mặc định |
| `hub_viral_moi_cau` | tạo nháp | Gợi ý mồi câu (lead magnet) |
| `hub_viral_cong_thuc` | tạo nháp | Mổ công thức bài viral |
| `hub_viral_san_pham_goi_y_kenh` | tạo nháp | Gợi ý kênh cho sản phẩm |
| `hub_viral_san_pham_blog` | chỉ đọc | Nội dung blog của sản phẩm |
| `hub_viral_san_pham_rss` | được đăng | Phát hành / gỡ podcast khỏi feed RSS |
| `hub_viral_skill` | chỉ đọc | Kho công thức AI (skill) |
| `hub_viral_skill_sua` | được đăng | Sửa / đặt lại công thức AI |
| `hub_viral_podcast_cau_hinh` | chỉ đọc | Cấu hình show podcast |
| `hub_viral_podcast_cau_hinh_sua` | được đăng | Sửa cấu hình show podcast |
| `hub_viral_xoa_han` | được đăng | Xoá hẳn bài / chủ đề viral |
| `hub_viral_luu_tru_don_sach` | được đăng | Dọn sạch Lưu trữ viral |
| `hub_group_fb_bai_xoa` | được đăng | Xoá bài group Facebook |
| `hub_group_fb_ky_xoa` | được đăng | Xoá kỳ cào group Facebook |

### Tự động hoá, webhook, bên thứ ba, so sánh số liệu

| Tool | Quyền | Việc |
|---|---|---|
| `hub_webhook_danh_sach` | chỉ đọc | Danh sách webhook |
| `hub_webhook_luu` | được đăng | Thêm / sửa webhook |
| `hub_webhook_xoa` | được đăng | Xoá webhook |
| `hub_webhook_thu` | được đăng | Gửi thử webhook |
| `hub_autopost_thu` | chỉ đọc | Thử đọc nguồn RSS |
| `hub_excel_xoa_file` | được đăng | Xoá file lịch đăng đã nhập |
| `hub_ben_thu_ba` | chỉ đọc | Tích hợp bên thứ ba |
| `hub_ben_thu_ba_goi` | tạo nháp | Gọi hàm tích hợp bên thứ ba |
| `hub_ben_thu_ba_nhap_media` | tạo nháp | Nhập media bên thứ ba vào thư viện |
| `hub_so_lieu_so_sanh` | chỉ đọc | So sánh số liệu (hai kỳ / hai kênh) |

### Zalo bot: nhóm, chân bài, kết nối, lấy lại tin

| Tool | Quyền | Việc |
|---|---|---|
| `zalo_nhom_cai_dat` | chỉ đọc | Cấu hình các nhóm Zalo của bot |
| `zalo_nhom_sua` | được đăng | Sửa cấu hình một nhóm Zalo |
| `zalo_chan_bai_nhom` | chỉ đọc | Xem chân bài của nhóm Zalo |
| `zalo_chan_bai_nhom_sua` | được đăng | Đặt chân bài cho nhóm Zalo |
| `zalo_cai_dat_bot` | chỉ đọc | Cài đặt bot Zalo |
| `zalo_ket_noi_lai` | được đăng | Kết nối lại Zalo |
| `zalo_lay_lai_tin_xem` | chỉ đọc | Xem trước tin bị lỡ |
| `zalo_lay_lai_tin_chay` | tạo nháp | Tạo bản nháp từ tin bị lỡ |
| `zalo_da_dang_tai_lai_chan_bai` | tạo nháp | Áp lại chân bài cho bài đã đăng |
| `zalo_da_dang_nhap_lai` | tạo nháp | Đăng nháp lại bài đã đăng |
| `zalo_video_kenh` | chỉ đọc | Kênh Zalo Video của tài khoản |

### 5c. Luồng mẫu

**Dọn ảnh và chuẩn hoá bài trước khi duyệt**
1. `hub_anh_cham_diem` với `bai_id`: điểm và lý do từng ảnh, nhóm ảnh trùng. Thêm `ai: true` nếu cần soi nhắm mắt / bố cục.
2. `hub_anh_cham_diem` với `bo_duoi: 50, xep_lai: true`: bỏ ảnh xấu và ảnh trùng, đưa ảnh đẹp lên đầu.
3. `hub_anh_kiem_tra_kenh` với `tu_sua: true`: cắt / đệm / nén cho đúng luật kênh.
4. `hub_hashtag` (`chuan_hoa`) → `hub_chan_bai_ap` (chữ ký mặc định).
5. `hub_bai_kiem_tra` → `hub_bai_dang_ngay` hoặc `hub_bai_duyet_hang_loat`.

**Bài trong hàng chờ Zalo**: `zalo_hang_cho` → `hub_anh_cham_diem` (bài Zalo, kèm `bo_duoi`) → `zalo_bai_anh` / `zalo_bai_anh_sua` → `zalo_bai_sua` → `zalo_bai_duyet_facebook`.

## 6. Những việc MCP KHÔNG làm được (đừng cố)

| Việc | Nên làm gì |
|---|---|
| Đọc / trả lời comment của khách trên Facebook, Instagram | App chưa có tính năng này. Báo người dùng. |
| Kết nối / gỡ kênh mạng xã hội, đăng nhập Zalo bằng QR, phiên Zalo Video / Google Business | Người dùng tự làm trên trình duyệt |
| Đổi API key AI, SMTP, cài đặt hệ thống, công thức AI, token Facebook của bot | Quản trị viên làm trên giao diện |
| Billing, người dùng, phân quyền | Việc quản trị, không qua MCP |

---

## 7. Mẫu trả lời người dùng sau khi làm việc

Mỗi lần xong việc, báo ngắn gọn 3 ý:
- **Đã làm gì:** bao nhiêu bài, kênh nào, giờ nào, trạng thái nháp hay đã lên lịch.
- **Cần người làm gì tiếp:** vd "mở hub.vietanh.org → Lịch để duyệt 3 bài nháp".
- **Lỗi hoặc việc bị chặn:** chép nguyên văn `loi`.

Không bao giờ nói "đã đăng" khi bài mới chỉ là nháp.
