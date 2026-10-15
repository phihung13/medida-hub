# MCP của Việt Anh Media Hub — cắm agent ngoài (Hermes…)

Hub có một máy chủ MCP. Agent bên ngoài (Hermes agentic OS, Claude Desktop/Code, Cursor…) dùng nó để điều khiển gần như mọi thao tác trong app: lịch đăng, bài, Zalo, đăng tự động RSS, nhập Excel, viral, số liệu, media.

## 1. Kết nối

| | |
|---|---|
| Địa chỉ | `https://hub.vietanh.org/api/mcp`. Lấy đúng địa chỉ ở Cài đặt → Kết nối agent MCP. |
| Giao thức | Streamable HTTP (MCP 2025-03-26), trả JSON. |
| Xác thực | Header `Authorization: Bearer <khoá>` |
| Client không gửi được header | `…/mcp/<khoá>` (khoá nằm trong URL, kém an toàn hơn) |
| SSE cũ | `…/sse/<khoá>` |

**Tạo khoá:** quản trị viên tổ chức vào **Cài đặt → Kết nối agent MCP**, đặt tên (vd `Hermes`), chọn mức quyền rồi bấm **Tạo khoá**.
- Khoá có dạng `hub_mcp_…` và chỉ hiện đúng một lần. Thẻ có sẵn nút chép cấu hình mẫu.
- Mỗi tổ chức có tối đa 10 khoá, thu hồi được từng khoá.

Cấu hình mẫu (định dạng `mcpServers`, dùng được với hầu hết client):

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

## 2. Mức quyền

| Mức | Được làm |
|---|---|
| `doc`: chỉ đọc | Xem lịch, bài, số liệu, thư viện media, hàng chờ/nhật ký Zalo, viral, nguồn RSS, file Excel đã nhập. |
| `nhap`: tạo nháp | Mọi thứ của `doc`, thêm:<br>• tạo/sửa bài **nháp**<br>• chạy AI (caption, phân tích, viết lại, sản xuất viral)<br>• tải media, ghi chú nội bộ<br>• sửa caption Zalo, đẩy bài Zalo sang Lịch<br>Không có gì ra ngoài: người duyệt vẫn bấm đăng. |
| `dang`: được đăng | Mọi thứ của `nhap`, thêm:<br>• lên lịch / đăng ngay / sửa và đổi giờ bài đã lên lịch<br>• duyệt đăng Facebook/Google Business từ hàng chờ Zalo<br>• gửi tin nhắn Zalo<br>• cấu hình nguồn RSS / nhóm Zalo / nguồn viral<br>• xoá |

Gọi công cụ vượt quyền thì nhận `{ "loi": "Khoá MCP này chỉ có quyền … cần quyền …" }`. Không có gì bị thực hiện.

Mức quyền của các loại khoá:
- **API key của tổ chức** (Cài đặt → Public API) và **OAuth** vẫn toàn quyền như trước, để không làm hỏng các kết nối đang dùng.
- Agent mới nên dùng **khoá MCP riêng**.
- Agent chạy tự động nên **bắt đầu bằng `nhap`**.

## 3. Quy ước chung

- **Lỗi** trả về dạng `{ "loi": "…" }`. Thông điệp nói rõ phải sửa gì, để agent tự sửa rồi gọi lại.
- **Kết quả dài** bị cắt:
  - chuỗi quá 1.500 ký tự, mảng quá 100 mục;
  - danh sách viral chỉ lấy 50 mục, kèm trường `con_nua` cho biết còn bao nhiêu.
- **Giờ** dùng ISO 8601. Nên ghi kèm múi giờ, vd `2026-10-14T19:30:00+07:00`.
- **Nội dung bài** nhận chữ thường (mỗi dòng thành một đoạn) hoặc HTML (`p, h1-h3, strong, u, ul, li`).
- **Media** phải nằm trong thư viện Hub. Link ngoài thì gọi `uploadFromUrlTool` trước, rồi dùng `path` trả về.
- **Ghi nhận agent:** bài do khoá MCP riêng tạo được ghi `agent = mcp-ngoai` trong báo cáo `/noi-dung` của Major OS.
- **Trạng thái bài:** `nhap`, `da_len_lich`, `da_dang`, `loi`.

## 4. Danh sách công cụ

### 4.1 Công cụ gốc (Postiz)

| Công cụ | Quyền | Việc |
|---|---|---|
| `integrationList` | doc | Danh sách kênh (id, nền tảng, khách hàng) |
| `groupList` | doc | Nhóm khách hàng |
| `integrationSchema` | doc | Cài đặt bắt buộc + luật của từng kênh — gọi trước khi đăng kênh lạ |
| `triggerTool` | doc | Lấy dữ liệu phụ của kênh (board Pinterest, playlist…) |
| `schedulePostTool` | nhap (draft) / dang | Tạo bài theo schema gốc (nhiều kênh, thread) |
| `uploadFromUrlTool` | nhap | Tải ảnh/video từ link công khai vào thư viện |
| `generateImageTool` | nhap | AI tạo ảnh |
| `generateVideoOptions`, `videoFunctionTool`, `generateVideoTool` | doc / nhap | AI tạo video |
| agent `postiz` | theo công cụ bên trong | Giao việc bằng lời cho agent của Hub (agent dùng các công cụ gốc ở trên, vẫn bị chặn theo mức quyền của khoá) |

### 4.2 Bài & Lịch

| Công cụ | Quyền | Việc |
|---|---|---|
| `hub_lich_xem` | doc | Mọi bài trong khoảng ngày (≤ 62 ngày) |
| `hub_bai_danh_sach` | doc | Danh sách bài theo trạng thái, phân trang |
| `hub_bai_chi_tiet` | doc | Toàn văn bài + comment đầu, media, cài đặt kênh, tag, lỗi |
| `hub_bai_tao` | nhap / dang | Tạo bài cho nhiều kênh. `loai`: `draft` (nhap), `schedule` / `now` (dang). Bỏ trống giờ thì Hub chọn giờ trống. |
| `hub_bai_sua` | nhap / dang | Sửa nội dung, comment đầu, media, tag, cài đặt:<br>• bài nháp hoặc bài lỗi: nhap<br>• bài đã lên lịch: dang<br>• bài đã đăng: không sửa được |
| `hub_bai_doi_gio` | nhap / dang | Đổi giờ. Bài nháp vẫn là nháp; bài đã lên lịch được lên lịch lại. |
| `hub_bai_trang_thai` | nhap / dang | `draft` (gỡ khỏi hàng đăng) hoặc `schedule` (**duyệt**: đưa vào hàng đăng, cần dang) |
| `hub_bai_dang_ngay` | dang | **Đăng thật ngay** một bài nháp / đã lên lịch / bị lỗi (kiểm hợp lệ, đặt giờ = bây giờ) |
| `hub_bai_duyet_hang_loat` | dang | Duyệt ≤ 50 bài nháp vào hàng đăng theo giờ trên bài. Bài đã qua giờ: `gio_qua` = `bo_qua` (mặc định) / `dang_ngay` / `gio_trong` (dời sang giờ trống). Trả kết quả từng bài. |
| `hub_bai_xoa` | dang | Xoá bài khỏi Lịch, huỷ lịch. Bài đã đăng trên mạng không bị gỡ. |
| `hub_gio_trong` | doc | Giờ trống kế tiếp của kênh |
| `hub_bai_so_lieu` | doc | Số liệu bài đã đăng + lượt bấm link rút gọn |
| `hub_ghi_chu_xem` / `hub_ghi_chu_them` | doc / nhap | Ghi chú nội bộ trên bài (trao đổi duyệt). `them` cần khoá MCP riêng và ghi dưới tên người tạo khoá. |
| `hub_tag_danh_sach` / `hub_tag_tao` | doc / nhap | Tag |
| `hub_mau_bai` | doc | Mẫu bài + chữ ký có sẵn (để bám giọng văn) |
| `hub_thong_bao` | doc | Thông báo: bài lỗi, kênh mất kết nối… |

### 4.3 Số liệu & Media

| Công cụ | Quyền | Việc |
|---|---|---|
| `hub_so_lieu_tong_quan` | doc | Tổng quan mọi kênh trong 7 / 30 / 90 ngày |
| `hub_so_lieu_kenh` | doc | Số liệu theo ngày của một kênh |
| `hub_bai_noi_bat` | doc | Bài nổi bật của kênh (YouTube: kèm top video) |
| `hub_phan_tich_kenh` | nhap | AI phân tích vì sao bài thắng, gợi ý content |
| `hub_hoi_ve_kenh` | nhap | Hỏi AI một câu về kênh (đọc số liệu thật) |
| `hub_media_danh_sach` | doc | Thư viện media (18 mục/trang) |
| `hub_media_xoa` | dang | Xoá media |
| `hub_ai_caption` | nhap | AI nhìn ảnh, viết caption + chú thích từng ảnh |
| `hub_ai_youtube` | nhap | Gemini xem video, viết tiêu đề + mô tả YouTube |

### 4.4 Đăng tự động: RSS & Excel

| Công cụ | Quyền | Việc |
|---|---|---|
| `hub_autopost_danh_sach` | doc | Nguồn RSS tự đăng |
| `hub_autopost_luu` | dang | Thêm / sửa nguồn RSS. Nguồn đang bật sẽ **tự đăng**. |
| `hub_autopost_bat_tat` / `hub_autopost_xoa` | dang | Bật/tắt, xoá nguồn |
| `hub_excel_doc_file` | nhap | Tải file .xlsx/.csv từ link công khai (≤ 10MB), đọc thành bảng dòng, khớp kênh, báo lỗi từng dòng. Chưa lên lịch. |
| `hub_excel_ai_chuot` | nhap | AI chuốt tiêu đề/nội dung, trả gợi ý theo số dòng |
| `hub_excel_luu_bang` | nhap | Lưu bản sửa của bảng (mở lại trên giao diện vẫn thấy) |
| `hub_excel_len_lich` | dang | Lên lịch hàng loạt |
| `hub_excel_lich_su` | doc | File đã nhập / toàn bộ dòng của một file |

Luồng gợi ý: `hub_excel_doc_file` → (`hub_excel_ai_chuot` → áp gợi ý, đặt `aiPolished=true`) → `hub_excel_luu_bang` → người duyệt xem trên giao diện → `hub_excel_len_lich`.

### 4.5 Viral

Luồng: cào nguồn → **chủ đề** (nhiều nguồn cùng nói một chuyện) → duyệt → "Bài của mình" (AI viết lại) hoặc sản xuất blog / infographic / podcast → đưa lên Lịch thành **bản nháp**. Không công cụ nào trong nhóm này tự đăng ra ngoài.

| Công cụ | Quyền | Việc |
|---|---|---|
| `hub_viral_chu_de` / `hub_viral_chu_de_chi_tiet` | doc | Chủ đề viral + bài nguồn |
| `hub_viral_chu_de_duyet` | nhap (delete: dang) | approve / skip / pending / delete hàng loạt. Duyệt thì Hub tự sản xuất nếu bật trong Cài đặt. |
| `hub_viral_chu_de_viet_lai` | nhap | Chủ đề → "Bài của mình" |
| `hub_viral_bai` / `hub_viral_bai_duyet` | doc / nhap | Từng bài viral; approve / skip / pending / clone / delete |
| `hub_viral_them` | nhap | Thêm bài viral bằng link / chữ |
| `hub_viral_nhan_ban` | nhap | Mổ công thức, viết bài mới cho kênh → nháp trên Lịch |
| `hub_viral_cao_ngay` | nhap | Cào mọi nguồn (chạy nền vài phút) |
| `hub_viral_bai_cua_minh` (+ `_len_lich`, `_viet_lai`, `_xoa`) | doc / nhap / dang | "Bài của mình" chờ đăng. `_len_lich`: nháp (nhap) hoặc `dang_ngay=true` đăng thật (dang) |
| `hub_viral_san_xuat` | nhap | Xếp hàng sản xuất blog / infographic / podcast (≤ 20 mục) |
| `hub_viral_san_pham` (+ `_len_lich`, `_lam_lai`, `_xoa`) | doc / nhap / dang | Sản phẩm đã làm; infographic → nháp trên Lịch, hoặc `dang_ngay=true` đăng thật (dang) |
| `hub_viral_nguon` / `hub_viral_nguon_them` / `hub_viral_nguon_sua` | doc / dang | Nguồn theo dõi, bật/tắt tự cào, xoá |
| `hub_viral_chan_dung` | doc | 8 chân dung khách hàng mục tiêu |
| `hub_viral_ban_tin` | doc | Bản tin viral tuần đã gửi |
| `hub_group_fb_tong_quan` | doc | Khu Group FB: group đang theo dõi + các kỳ cào (chủ đề hot, chủ đề nhiều người hỏi) |
| `hub_group_fb_bai` | doc | Bài cào từ group (link bài, group, chủ đề, loại hỏi/chia sẻ/review/phàn nàn, tương tác) |
| `hub_group_fb_them_group` | nhap | Thêm / sửa / bật-tắt group theo dõi (xoá cần `dang`) |
| `hub_group_fb_lam_content` | nhap | Đưa 1 bài group sang phễu content (thành content chờ duyệt) |

### 4.6 Zalo

Bot Zalo dùng chung cho cả Hub (một tài khoản Zalo). Hub gọi bot qua mạng nội bộ nên agent không cần biết địa chỉ bot.

| Công cụ | Quyền | Việc |
|---|---|---|
| `zalo_tong_quan` | doc | Kết nối, tạm dừng, số bài chờ, nhóm đang nghe, khoảng mất phiên |
| `zalo_hang_cho` | doc | Bài bot đã gom đang chờ duyệt (caption, số ảnh, duyệt theo kênh) |
| `zalo_da_dang` | doc | Lịch sử bài bot đã đăng Facebook / Google Business |
| `zalo_dang_gom` | doc | Phiên gom đang chạy theo nhóm |
| `zalo_nhom` / `zalo_ban_be` | doc | Nhóm Zalo / bạn bè của tài khoản bot |
| `zalo_nhat_ky` | doc | Nhật ký bot |
| `zalo_video_trang_thai` | doc | Phiên Zalo Video |
| `zalo_bai_sua` | nhap | Sửa caption / chú thích ảnh |
| `zalo_bai_viet_lai_ai` | nhap | AI viết lại caption. Chỉ là bản xem trước; muốn dùng thì gọi `zalo_bai_sua`. |
| `zalo_bai_tai_lai_chan_bai` | nhap | Áp chân bài mới nhất của nhóm |
| `zalo_bai_day_sang_hub` | nhap | Đẩy bài sang Lịch Hub thành nháp (để đăng đa kênh) |
| `zalo_chot_phien` | nhap | Chốt ngay phiên gom của một nhóm |
| `zalo_bai_huy_hen` | nhap | Huỷ hẹn giờ |
| `zalo_bai_duyet_facebook` | dang | **Đăng thật** lên Fanpage (`cong_khai=false`: nháp Facebook) |
| `zalo_bai_duyet_google` | dang | **Đăng thật** lên Google Business |
| `zalo_bai_hen_gio` | dang | Hẹn giờ bot tự đăng Fanpage |
| `zalo_da_dang_cong_khai` | dang | Chuyển bài nháp Facebook thành công khai |
| `zalo_bai_bo_kenh` / `zalo_bai_bo` | dang | Bỏ một kênh / bỏ hẳn bài khỏi hàng chờ |
| `zalo_tam_dung` | dang | Tạm dừng / chạy lại bot |
| `zalo_nhom_cau_hinh` | dang | Bật/tắt nghe nhóm, đổi kênh đích trên Hub |
| `zalo_gui_tin` | dang | **Gửi thật** tin nhắn Zalo tới nhóm / người |

**Đăng Zalo Video:** tạo bài trên Lịch cho kênh Zalo Video bằng `hub_bai_tao`. Bot tự đăng khi tới giờ.

## 5. Chưa có trong MCP (và lý do)

| Thao tác | Lý do |
|---|---|
| Đọc / trả lời **comment của khách** trên Facebook, Instagram… | Bản thân app chưa có tính năng này. Sẽ làm cả giao diện lẫn MCP khi có. |
| Kết nối / gỡ **kênh mạng xã hội**; đăng nhập Zalo bằng QR; phiên Zalo Video / Google Business | Cần người đăng nhập trên trình duyệt (OAuth / quét QR) |
| Đổi **API key AI**, SMTP, cài đặt hệ thống, công thức AI (skill), nhóm → Fanpage của bot (token Facebook) | Thao tác chứa bí mật hoặc của quản trị hệ thống. Làm trên giao diện. |
| Billing, người dùng, quyền | Việc quản trị |

## 6. Ví dụ luồng cho Hermes

1. `zalo_hang_cho`: có 3 bài mới từ nhóm Zalo.
2. `zalo_bai_day_sang_hub` cho từng bài: bài thành nháp trên Lịch.
3. `hub_lich_xem` (hôm nay → 7 ngày tới): xem lịch còn trống chỗ nào.
4. `hub_bai_sua`: chỉnh caption theo `hub_mau_bai`. Tiếp theo là `hub_bai_doi_gio` vào giờ trống (`hub_gio_trong`).
5. Khoá `nhap` dừng ở đây; người duyệt bấm đăng trên Hub. Khoá `dang` có thể:
   - gọi `hub_bai_trang_thai` với `schedule` cho từng bài;
   - gọi `hub_bai_duyet_hang_loat` cho cả loạt;
   - gọi `hub_bai_dang_ngay` khi người dùng bảo đăng luôn.

### Group Facebook → content → đăng

Giao diện: tab 👥 Group FB → ⚡ Làm content → Chờ duyệt (lọc nguồn 👥 Group FB) → Duyệt → Viết lại / Sản xuất → Chờ đăng → 📤 nháp hoặc 🚀 đăng ngay.

Qua MCP:
1. `hub_group_fb_tong_quan`: kỳ cào mới nhất, `hotTopics` / `askedTopics`.
2. `hub_group_fb_bai` (`loai: "hoi"`, `chu_de: …`): chọn bài tiêu biểu, có link.
3. `hub_group_fb_lam_content`: được `topicId`. AI tổng hợp và chấm điểm (vài phút).
4. `hub_viral_chu_de_duyet` (`approve`), rồi một trong hai:
   - `hub_viral_chu_de_viet_lai`: viết lại thành bài social;
   - `hub_viral_san_xuat`: sản xuất infographic / blog / podcast.
5. `hub_viral_bai_cua_minh_len_lich` hoặc `hub_viral_san_pham_len_lich`: mặc định tạo **nháp**. Truyền `dang_ngay=true` để đăng thật (khoá `dang`, chỉ khi người dùng nói rõ).

## 7. Đối tác cào (Public API, không phải MCP)

Claude chạy skill `cao-facebook-viral-vietanh` gửi dữ liệu thô qua Public API (header `Authorization: <API key tổ chức>` + User-Agent trình duyệt):

| Endpoint | Việc |
|---|---|
| `GET /public/v1/viral/priorities` | Gợi ý ưu tiên cào (chủ đề nóng, persona) |
| `POST /public/v1/viral` → `POST /public/v1/viral/finish` | Bài KOL / trường đối thủ → phễu content (`sourceType`, `sourceName`) |
| `GET /public/v1/viral/groups` | Danh sách group FB đang bật |
| `POST /public/v1/viral/groups` | Đăng ký group (`url`, `name`, `area`) |
| `POST /public/v1/viral/groups/posts` | 1 bài group: `groupUrl`, `text` (bắt buộc), `url` (permalink), `groupName`, `topic`, `kind` (`hoi` / `chia_se` / `review` / `phan_nan` / `khac`), `level`, `likes` / `comments` / `shares`, `postedAt`, `topComments[]` |
| `POST /public/v1/viral/groups/finish` | Kết kỳ: `summary`, `hotTopics[]`, `askedTopics[]` (`{topic, posts, comments, groups[], urls[], note}`); thiếu thì Hub tự đếm theo nhãn `topic` |
