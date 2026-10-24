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

### 4.7 Bảng sản xuất Media

Trang `/media-board` (menu **Sản xuất**) theo dõi sản xuất video qua các cột: Kịch bản → Chờ quay → Đã quay · chờ dựng → Đang dựng → Chờ duyệt → Lên lịch phát → Đã phát hành. Bảng này chỉ để theo dõi nội bộ, không công cụ nào đăng gì ra mạng xã hội.

**Thẻ được kiểm theo đúng luật của giao diện.** Giao diện và MCP dùng chung logic `@gitroom/helpers/utils/media-board.logic`. Các luật:
- **Bắt buộc:** tiêu đề và ngày phát hành. Hạn quay và hạn dựng xong được tính ngược từ ngày phát.
- **Thứ tự ngày:** ngày quay ≤ bắt đầu dựng ≤ xong dựng ≤ ngày phát.
- **Link** phải là `https://`. **Mã tập** không được trùng.
- **Video dài** (trên 5 phút) phải chọn buổi xong dựng. Mỗi buổi chỉ nhận tối đa N video dài, tính theo người dựng hoặc cả team tuỳ cài đặt.
- **Điều kiện vào cột:**
  - Chờ quay: cần ngày quay.
  - Đang dựng: cần ngày bắt đầu và xong dựng, và buổi đó còn chỗ.
  - Chờ duyệt: cần link file dựng.
  - Lên lịch phát: cần ngày phát.
  - Đã phát hành: cần URL bài đăng.
- **Tự chuyển cột** khi dữ liệu đủ:
  - có link kịch bản và ngày quay → Chờ quay;
  - có link file dựng → Chờ duyệt;
  - có URL bài đăng → Đã phát hành.

Thẻ được gọi bằng **id hoặc mã tập** (tham số `the`). Ngày dùng dạng `YYYY-MM-DD`. Muốn xoá một ô thì truyền chuỗi rỗng.

**Duyệt:** đưa thẻ *lần đầu* vào Lên lịch phát hoặc Đã phát hành là bước duyệt, cần quyền `dang`. Khoá `nhap` tạo, sửa, chuyển cột được bình thường, nhưng thẻ sẽ dừng ở Chờ duyệt.

| Công cụ | Quyền | Việc |
|---|---|---|
| `media_board_tong_quan` | doc | Như dải chip đầu trang: số thẻ theo cột, thẻ đỏ, đã quay chưa dựng, chờ duyệt, trễ phát, đã phát 7 ngày, luồng lệch nhịp, quy tắc, việc gấp |
| `media_board_danh_sach` | doc | Danh sách thẻ kèm hạn quay/dựng, cảnh báo, tiến độ bản cắt. Lọc theo luồng, chuyên mục, người, dài/ngắn, chip cảnh báo, cột. |
| `media_board_xem_the` | doc | Một thẻ đầy đủ, gồm:<br>• bản cắt đã có / còn thiếu<br>• sức chứa buổi dựng<br>• gợi ý "Điền lịch theo hạn"<br>• bước kế tiếp đang bị chặn vì gì |
| `media_board_lich_dung` | doc | Lịch dựng theo ngày × người × buổi: đã xếp / tối đa, chỗ trống, đang dựng dở, video ngắn, video đã quay chưa xếp lịch |
| `media_board_luong` | doc | Sức khoẻ từng luồng: nhịp cam kết so với số đã lên lịch, phát gần nhất / kế tiếp, cảnh báo |
| `media_board_xuat_csv` | doc | Như nút "Tải CSV". Trả theo trang, mỗi trang 90 dòng. |
| `media_board_cau_hinh` | doc | Luồng, thành viên, quy tắc |
| `media_board_tao_the` | nhap | Như nút "+ Thêm video". Chọn luồng thì Hub tự điền các ô trống và mã tập. `dien_lich_theo_han` điền ngày quay/dựng. |
| `media_board_sua_the` | nhap | Sửa các ô được truyền (như bấm Lưu trong editor). Xếp lịch dựng bằng `xong_dung` + `buoi_xong_dung`. |
| `media_board_chuyen_trang_thai` | nhap | Kéo–thả sang cột khác. Bỏ trống cột đích = nút "→". |
| `media_board_tao_ban_cat` | nhap | "+ Tạo bản cắt": mã `<gốc>-C<n>`, lấy kênh phụ còn thiếu, phát sau bản gốc 1 ngày |
| `media_board_tao_tap_cung_buoi` | nhap | "+ Tập khác cùng buổi quay" |
| `media_board_duyet` | dang | "Duyệt ✓": Chờ duyệt → Lên lịch phát |
| `media_board_xoa_the` | dang | Xoá thẻ |
| `media_board_cau_hinh_sua` | dang | Thêm / sửa / đổi tên / xoá luồng, thay danh sách thành viên, đổi quy tắc |

Luồng gợi ý cho agent lập kế hoạch tuần:
1. `media_board_tong_quan` để xem việc gấp.
2. `media_board_tao_the` (kèm `luong`, `ngay_phat_hanh`, `dien_lich_theo_han=true`) cho từng tập.
3. `media_board_lich_dung` để xem chỗ trống.
4. `media_board_sua_the` để xếp buổi dựng.
5. Khi có link file dựng, `media_board_sua_the` với `link_file_dung`; thẻ tự sang Chờ duyệt.
6. Người duyệt (hoặc khoá `dang`) gọi `media_board_duyet`.


## 4b. Công cụ bổ sung: ảnh, chân bài, hashtag, kênh, viral, tự động hoá, Zalo (15/10/2026)

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

## 5. Chưa có trong MCP (và lý do)

| Thao tác | Lý do |
|---|---|
| Đọc / trả lời **comment của khách** trên Facebook, Instagram… | Bản thân app chưa có tính năng này. Sẽ làm cả giao diện lẫn MCP khi có. |
| Kết nối / gỡ **kênh mạng xã hội**; đăng nhập Zalo bằng QR; phiên Zalo Video / Google Business | Cần người đăng nhập trên trình duyệt (OAuth / quét QR) |
| Đổi **API key AI**, SMTP, nhóm → Fanpage của bot (token Facebook) | Thao tác chứa bí mật hoặc của quản trị hệ thống. Làm trên giao diện. |
| Billing, người dùng, quyền | Việc quản trị |
| Xoá kênh; đổi tên file media; tải file lên (nhạc nền, ảnh bìa podcast, phiên Zalo Video) | Rủi ro cao hoặc cần thao tác file trên giao diện |

## 6. Ví dụ luồng cho Hermes

**Dọn ảnh và chuẩn hoá bài trước khi duyệt**
1. `hub_anh_cham_diem` với `bai_id`: điểm và lý do từng ảnh, nhóm ảnh trùng. Thêm `ai: true` nếu cần soi nhắm mắt / bố cục.
2. `hub_anh_cham_diem` với `bo_duoi: 50, xep_lai: true`: bỏ ảnh xấu và ảnh trùng, đưa ảnh đẹp lên đầu.
3. `hub_anh_kiem_tra_kenh` với `tu_sua: true`: cắt / đệm / nén cho đúng luật kênh.
4. `hub_hashtag` (`chuan_hoa`) → `hub_chan_bai_ap` (chữ ký mặc định).
5. `hub_bai_kiem_tra` → `hub_bai_dang_ngay` hoặc `hub_bai_duyet_hang_loat`.

**Bài trong hàng chờ Zalo**: `zalo_hang_cho` → `hub_anh_cham_diem` (bài Zalo, kèm `bo_duoi`) → `zalo_bai_anh` / `zalo_bai_anh_sua` → `zalo_bai_sua` → `zalo_bai_duyet_facebook`.

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
