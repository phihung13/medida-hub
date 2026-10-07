# Báo cáo nội dung "làm ra / dùng" & mô tả agent AI — Media Hub

*Cập nhật 06/10/2026, theo mail: "Thống kê tỷ lệ sử dụng / làm ra, có phân theo kênh / loại content · Tối ưu · Gửi
a Dương mô tả từng agent để refine".*

Tài liệu này dành cho **người đọc số** (quản lý, team AI bên Major OS) và **người refine agent** (anh Dương). Phần
cách gọi API chi tiết nằm ở file mô tả gửi Major OS: `apps/frontend/public/major-os-mo-ta.md` (bấm "Tải file mô tả"
trong Cài đặt → Kết nối Major OS).

---

## 1. Hai câu hỏi API trả lời được

| Câu hỏi | Endpoint |
|---|---|
| Mỗi agent / mỗi kênh / mỗi loại nội dung **làm ra bao nhiêu, dùng được bao nhiêu**? | `GET /noi-dung` |
| Hub có những agent AI nào, mỗi agent làm gì, model gì, **prompt nằm ở đâu để sửa**? | `GET /agent` |

Cả hai nằm cùng gốc với các API cũ: `https://hub.vietanh.org/api/major-os/v1`, dùng chung key
(`Authorization: Bearer <key>`, tạo ở Cài đặt → Kết nối Major OS).

---

## 2. Đọc báo cáo `/noi-dung`

### 2.1 Một dòng là gì

Mỗi dòng là **một nhóm nội dung làm ra trong cùng một ngày (giờ Việt Nam)**, gom theo:

- `agent`: ai làm ra (bảng ở mục 3);
- `kenh`: kênh đăng (`facebook`, `instagram`, `zalo-video`, `tiktok`, `youtube`…); sản phẩm Phát hiện / Sản xuất
  chưa đăng lên kênh nào thì `kenh` = `hub`;
- `loai`: loại nội dung (bảng ở mục 2.3).

Số trong dòng là **trạng thái hiện tại** của các bài đó, không phải sự kiện. Một bài nháp làm ra hôm nay, ba hôm sau
mới đăng, thì ba hôm sau dòng của **hôm nay** đổi từ "nháp" sang "đã đăng". Major OS lấy lại dòng đó, cùng `id`, rồi
**ghi đè**. Đừng cộng dồn.

### 2.2 Các cột số

| Cột | Nghĩa |
|---|---|
| `so_lam_ra` | Tổng số bài / sản phẩm agent làm ra trong ngày (kể cả đã xoá sau đó) |
| `so_da_dang` | Đã đăng thành công |
| `so_cho_dang` | Đã lên lịch, chưa tới giờ đăng |
| `so_loi` | Đăng lỗi (hoặc sản xuất lỗi) |
| `so_nhap` | Vẫn còn là nháp, chưa ai đụng tới |
| `so_bo` | Bị xoá: người duyệt không dùng |
| `so_dung` | **Dùng** = `so_da_dang` + `so_cho_dang` + `so_loi`: người duyệt đã chấp nhận và cho đi đăng (lỗi là do kênh, không phải do nội dung) |
| `ty_le_dung` | `so_dung / so_lam_ra × 100` (%) |

Riêng **Phát hiện / Sản xuất** (`nguon` = `phat-hien-san-xuat`), "dùng" nghĩa là:

| Sản phẩm | "Dùng" khi |
|---|---|
| Podcast | đã phát hành lên kênh podcast RSS |
| Blog | sản xuất xong (Hub không đăng blog; không biết có tải file về hay không) |
| Infographic | sản xuất xong; số **đẩy lên Lịch và đăng** xem ở dòng `nguon` = `bai-dang`, `agent` = `viral-infographic` |
| "Bài của mình" | đã đẩy lên Lịch |

### 2.3 Loại nội dung (`loai`)

| `loai` | Nghĩa |
|---|---|
| `chu` | Chỉ có chữ |
| `anh` | 1 ảnh |
| `album` | Từ 2 ảnh trở lên |
| `video` | Có video (.mp4 / .mov) |
| `blog`, `podcast`, `infographic`, `bai-viet` | Sản phẩm Phát hiện / Sản xuất |

Ảnh bị bot ẩn (an toàn trẻ em, ảnh trùng) không được đăng nên không tính vào số ảnh.

### 2.4 Đọc nhanh thế nào

- **Agent nào làm ra nhiều mà bị bỏ nhiều** (`ty_le_dung` thấp, `so_bo` cao): prompt cần refine. Mở `/agent` để biết
  prompt nằm ở đâu.
- **Agent nào làm ra mà để nháp mãi** (`so_nhap` cao lâu ngày): người duyệt không có thời gian, hoặc nội dung chưa
  đủ tốt để đăng mà cũng chưa tệ tới mức xoá.
- **Kênh nào hay lỗi** (`so_loi` theo `kenh`): lỗi kênh (token hết hạn, sai định dạng), không phải lỗi agent. Chi
  tiết lỗi xem `/tinh-nang` (`loai` = `loi`, `ma_loi`).
- **So kênh / loại**: cộng `so_lam_ra` và `so_dung` theo `kenh` hoặc `loai` trên nhiều ngày, rồi mới chia. Đừng lấy
  trung bình của các `ty_le_dung`.

### 2.5 Ví dụ

```json
{
  "id": "nd_2026-10-05_zalo-bot_facebook_album",
  "nguon": "bai-dang",
  "ngay": "2026-10-05",
  "agent": "zalo-bot",
  "kenh": "facebook",
  "loai": "album",
  "so_lam_ra": 5,
  "so_dung": 3, "so_da_dang": 2, "so_cho_dang": 1, "so_loi": 0,
  "so_nhap": 1, "so_bo": 1,
  "ty_le_dung": 60
}
```

Đọc là: ngày 05/10, bot Zalo làm ra 5 bài album cho Facebook. 2 bài đã đăng, 1 bài đã lên lịch, 1 bài còn nằm nháp, 1
bài bị xoá. Tỷ lệ dùng 60%.

---

## 3. Mã agent trong báo cáo

| `agent` | Là gì | Ghi chú |
|---|---|---|
| `zalo-bot` | Bot Zalo gom ảnh nhóm thành bài nháp | Bài cũ (trước 06/10) nhận ra nhờ tag "Zalo" |
| `viral-clone` | Phát hiện → Nhân bản theo công thức viral | Từ 06/10 |
| `viral-ban-cua-minh` | Phát hiện → "Bài của mình" | Từ 06/10 |
| `viral-infographic` / `viral-blog` / `viral-podcast` | Sản xuất | |
| `agent-chat` | Trang Agent / MCP: lên lịch bằng chat | Từ 06/10 |
| `excel-ai` | Nhập Excel có bấm "AI chuốt" | Từ 06/10 |
| `autopost-rss` | Autopost từ RSS | |
| `generator` | Bộ tạo bài cũ (ít dùng) | |
| `thu-cong` | **Người tự soạn** trong Hub | Có thể đã dùng bút phép thuật / tạo ảnh AI. Số lần dùng xem ở `/tinh-nang` |
| `api` / `cli` | Bài gửi qua API công khai / CLI mà không khai agent | Gồm Excel không bấm AI chuốt |
| `ai-khac` | Bài AI làm ra **trước 06/10** từ Phát hiện hoặc Agent (hồi đó chưa tách được) | Sẽ không tăng thêm |

Các trợ lý **trong trình soạn** (bút phép thuật viết caption, tạo ảnh / video AI, YouTube AI, Copilot, tách thread)
không làm ra bài riêng: chúng đổ chữ / ảnh vào bài người đang soạn, nên bài đó tính là `thu-cong`. Muốn biết chúng
được dùng bao nhiêu lần, lỗi bao nhiêu, AI trả lời mất bao lâu, xem `/tinh-nang` (khoá `ai.viet-caption`,
`ai.tao-anh`, `ai.tao-video`).

---

## 4. Mô tả từng agent (để refine)

`GET /agent` trả đúng danh mục này, ở dạng JSON. Nguồn duy nhất là
`libraries/nestjs-libraries/src/usage/hub.agents.ts`: thêm hoặc sửa agent thì sửa file đó, API và bảng dưới đây cập
nhật theo.

**Hai cách refine:**

1. **Không cần lập trình:** trang **Phát hiện → 🧪 Công thức AI**. Sửa trực tiếp các "skill" (cột *Skill sửa trên giao
   diện* bên dưới), lưu là chạy ngay, bấm "Khôi phục" để quay về bản gốc.
2. **Sửa code:** mở file ở cột *Prompt*, sửa, push lên `main` (tự deploy).

Mỗi model đều chọn được trong Cài đặt → Claude API key:

- **Claude:** Sonnet 4.6 (mặc định), Haiku 4.5 hoặc Opus 4.8.
- **OpenRouter DeepSeek:** chỉ cho phần "AI viết bài". Đọc ảnh (vision) và Copilot luôn dùng Claude.

### 4.1 Agent làm ra bài

**Bot Zalo** (`zalo-bot`)

- **Làm gì:** gom ảnh/video giáo viên gửi vào nhóm Zalo thành từng đợt (nhóm im 10 phút, tối đa 30 phút), rồi:
  - lọc ảnh trùng, chọn ảnh đẹp nhất;
  - kiểm an toàn trẻ em và ẩn ảnh không phù hợp;
  - viết caption, hashtag và chú thích từng ảnh;
  - đẩy thành bài nháp, mỗi kênh một thẻ.
- **Model:** Claude, cài trên bot (đồng bộ từ Cài đặt Hub).
- **Prompt:**
  - `apps/zalo-bot/src/caption.mjs`: giọng văn chung (`SYSTEM`), caption bài, hashtag, chú thích ảnh, video, viết lại.
  - `pickbest.mjs`: chọn ảnh đẹp nhất.
  - `safety.mjs`: kiểm an toàn trẻ em.
- **Sửa không cần code:** mỗi nhóm Zalo có ô "Hướng dẫn viết" và "Văn mẫu" trong trang Zalo → Nhóm Zalo. Đây là phần
  ghi đè giọng văn cho từng trang.

**Phát hiện: Nhân bản** (`viral-clone`)

- **Làm gì:** mổ "công thức" vì sao một bài được share, rồi viết bài mới cùng công thức cho kênh trường.
- **Prompt:** `openai.service.ts`, các hàm `viralFormula` và `viralClone`.
- **Skill:** `skill-mo-cong-thuc`, `he-thong-viet-anh`.

**Phát hiện: Bài của mình** (`viral-ban-cua-minh`)

- **Làm gì:** viết lại bài / chủ đề cho đúng chân dung phụ huynh, chấm 100 điểm, so với bài gốc.
- **Prompt:** `openai.service.ts`, hàm `viralRewriteAndScore`.
- **Skill:** `tieu-chi-cham-diem`, `he-thong-viet-anh`.

**Sản xuất: Infographic / Blog / Podcast** (`viral-infographic`, `viral-blog`, `viral-podcast`)

- **Prompt:** `libraries/nestjs-libraries/src/viral/viral.produce.prompts.ts`.
- **Skill:**
  - Infographic: `cong-thuc-carousel`, `cong-thuc-ve-slide`, `cong-thuc-infographic`.
  - Blog: `cong-thuc-blog`, `giong-van-blog`, `diem-tua`.
  - Podcast: `cong-thuc-podcast`, `giong-podcast`.
  - Dùng chung: `ho-so-truong`, `chinh-ta`, `cta-that`.
- **Model:**
  - Chữ: Claude, hoặc DeepSeek nếu chọn OpenRouter.
  - Infographic: ảnh slide vẽ bằng Gemini.
  - Podcast: giọng đọc MiniMax.

**Trang Agent / MCP** (`agent-chat`)

- **Làm gì:** nhận yêu cầu bằng chat, rồi tự viết, tạo ảnh/video và lên lịch.
- **Prompt:** `libraries/nestjs-libraries/src/chat/load.tools.service.ts` (phần `instructions`), mô tả công cụ ở
  `chat/tools/*`.
- **Lưu ý:** prompt hiện viết tiếng Anh, chung chung (bản gốc Postiz). Nên refine: thêm giọng Trường Việt Anh, luật
  chính tả, kênh mặc định.

**Excel: AI chuốt** (`excel-ai`)

- **Prompt:** `bulk-import.service.ts`, hàm `polish`.

**Autopost RSS** (`autopost-rss`)

- **Model:** OpenAI gpt-4.1.
- **Prompt:** `autopost.service.ts`.
- **Lưu ý:** prompt tiếng Anh (bản gốc Postiz): giới hạn 100 ký tự, thêm emoji. Nếu dùng cho trường thì nên viết lại
  bằng tiếng Việt.

### 4.2 Trợ lý trong trình soạn

| Agent | Prompt | Đo ở `/tinh-nang` |
|---|---|---|
| Bút phép thuật: caption từ ảnh | `openai.service.ts` `generateCaptionsForImages` + `VIET_ANH_SYSTEM` | `ai.viet-caption` |
| Tạo ảnh AI | `openai.service.ts` `generatePromptForPicture` | `ai.tao-anh` |
| Tạo video AI | `openai.service.ts` `generateSlidesFromText`, `generateVoiceFromText` | `ai.tao-video` |
| YouTube AI | `openai.service.ts` `generateYoutubeContentFromImages`, `gemini.service.ts` | chưa đo |
| Copilot | `new-launch/manage.modal.tsx` (CopilotPopup) | chưa đo |
| Tách thread | `openai.service.ts` `separatePosts` | chưa đo |

### 4.3 Phát hiện, chấm điểm, phân tích (không làm ra bài)

| Agent | Prompt / Skill |
|---|---|
| Quét, phân tích, gom chủ đề, chấm điểm | `openai.service.ts` (`viralAnalyze`, `viralScoreBatch`, `viralClusterBatch`, `viralSynthesizeTopic`, `viralLeadMagnets`). Skill: `skill-phan-loai-viet-lai`, `skill-tong-hop-chu-de`, `nguyen-tac-chon-nhom`, `tieu-chi-cham-diem`, `skill-lead-magnet` |
| Bản tin tuần | `viralWeeklyBrief`. Skill: `skill-ban-tin-tuan` |
| Phân tích kênh (bài thắng, hỏi đáp) | `analyzeChannelWinners`, `analyzeYoutubeWinners`, `answerAboutChannel` |

---

## 5. Gợi ý tối ưu (đọc số rồi làm gì)

1. **Mỗi tuần** xem `/noi-dung` gom theo `agent`. Agent nào `ty_le_dung` dưới 50% thì đọc 5 bài bị xoá gần nhất của
   agent đó trên Lịch, tìm điểm chung (sai giọng, sai chính tả, bịa thông tin, sai kênh…), rồi sửa skill / prompt
   tương ứng ở mục 4.
2. **Bot Zalo:** `so_nhap` cao mà `so_bo` thấp nghĩa là nội dung ổn nhưng không ai duyệt kịp. Cân nhắc bật tự đăng cho
   nhóm tin cậy. `so_bo` cao thì xem lại "Hướng dẫn viết" của nhóm đó.
3. **So loại nội dung:** nếu `video` có `ty_le_dung` cao hơn hẳn `album` thì nên ưu tiên bot làm video (Zalo Video).
4. **Sau mỗi lần sửa prompt**, ghi lại ngày sửa. Một hai tuần sau so `ty_le_dung` trước và sau để biết sửa có hiệu
   quả không.
5. Agent `thu-cong` có `so_lam_ra` lớn nghĩa là người vẫn soạn tay nhiều. Đối chiếu với `/tinh-nang`
   (`ai.viet-caption`) để biết họ có dùng bút phép thuật không.

---

## 6. Giới hạn cần biết

- **Trước 06/10/2026**, bài từ Phát hiện và trang Agent gộp chung là `ai-khac`, Excel gộp vào `api`. Bot Zalo vẫn
  nhận ra được nhờ tag.
- Nhóm Zalo bật **"tự đăng Facebook / GBP"** thì bot đăng thẳng lên Facebook **và vẫn đẩy một bản nháp vào Lịch**.
  Bản nháp đó nằm im nên bị tính là "chưa dùng" dù bài đã đăng thật, nên tỷ lệ dùng của `zalo-bot` có thể **thấp hơn
  thực tế**. Đối chiếu với danh sách nhóm đang bật tự đăng (trang Zalo → Nhóm Zalo).
- "Bài của mình" xoá thì bị xoá cứng (không lưu lại), nên số làm ra của ngày đó giảm theo.
- Báo cáo chỉ biết bài đã đăng hay chưa, **không biết hiệu quả** (like, share, reach). Muốn so hiệu quả theo agent
  phải nối thêm số liệu Facebook / Meta (bước sau).
