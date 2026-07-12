# HỢP ĐỒNG ĐỐI TÁC v3 — Hệ thống Media Hub ↔ Claude Cowork
## Pipeline content Trường Việt Anh: ai làm gì, làm đến đâu, hụt thì sao

> Người viết: **Hệ thống Media Hub** (bên code — xưng "TÔI"). Người nhận: **Claude
> Cowork** (bên cào Facebook — gọi "BẠN"). Bản này THAY THẾ tài liệu cũ; các mục
> 5 (bước 2-3-4), 6 (schema brief), 8 (chống trùng lịch phía bạn) của bản cũ hủy bỏ.
> Chúng ta là 2 mắt xích của MỘT dây chuyền: bạn hụt thì tôi đói nguyên liệu,
> tôi hụt thì công bạn cào đổ sông. Đọc kỹ mục 5 (chỉ tiêu) và mục 6 (chống lỗi).

---

## 1. RANH GIỚI — bảng phân công duy nhất, không lấn sân

| # | Việc | BẠN (Cowork) | TÔI (Media Hub) |
|---|---|---|---|
| 1 | Cào 19 nguồn Facebook (Chrome đã đăng nhập) | ✅ | ❌ tôi không làm được nếu không mua Apify |
| 2 | Cào RSS 5 báo + Google News 10 keyword + YouTube | ❌ đừng đụng | ✅ có sẵn, chạy tự động |
| 3 | Lọc rác trước khi gửi (quảng cáo thuần, bài không liên quan) | ✅ lớp 1 | ✅ lớp 2 (spam filter) |
| 4 | Gửi bài thô vào hệ thống qua webhook | ✅ | ✅ tôi mở endpoint + chống trùng |
| 5 | Gom cụm: nhiều bài, nhiều nguồn → 1 CONTENT | ❌ **cấm làm** | ✅ AI/embeddings |
| 6 | Khớp 8 persona + chấm điểm 0–100 | ❌ **cấm làm** | ✅ rubric nội bộ, persona động |
| 7 | Viết lại content theo skill đến khi đạt điểm | ❌ **cấm làm** | ✅ vòng lặp ≤3 lần |
| 8 | Duyệt: ≥90 auto duyệt · <70 auto bỏ · giữa thì chờ người | ❌ | ✅ |
| 9 | Sản xuất: blog .docx / infographic / podcast mp3 | ❌ | ✅ tự chạy sau duyệt |
| 10 | Đưa lên Lịch + canh trùng lịch giữa 5 trang | ❌ | ❌ — NGƯỜI DUYỆT làm |
| 11 | Đăng công khai lên fanpage | ❌ cấm theo nguyên tắc an toàn | ❌ chỉ người bấm |
| 12 | Báo cáo kết quả mỗi kỳ (phễu số liệu) | ✅ log phía cào | ✅ bản tin Zalo/email |

**Tư duy bắt buộc: 1 CONTENT = NHIỀU BÀI TỪ NHIỀU NGUỒN.** Bài lẻ bạn gửi chỉ là
tín hiệu thô. Việc của bạn là đổ đủ tín hiệu; việc của tôi là chưng cất. Bạn mà
gom cụm/chấm điểm/viết brief trước là chúng ta xử lý 2 lần, lệch chuẩn, hỏng phễu.

---

## 2. NĂNG LỰC THẬT CỦA TÔI — làm được gì, đến đâu, giới hạn ở đâu

### Làm được (đã chạy production):
- Nhận dữ liệu qua API 24/7 trên VPS — máy bạn tắt sau khi gửi xong cũng không mất gì.
- AI đọc bài thô tự bóc: tiêu đề, nguồn, nội dung, số like/share/comment/view từ text.
- Gom cụm chủ đề 2 chế độ (AI theo mẻ / embeddings xuyên mẻ), ngưỡng hội tụ chỉnh được.
- Chấm điểm 0–100 theo 8 persona (persona ĐỘNG — tự làm giàu insights sau mỗi kỳ từ
  3 tín hiệu: tiếng nói phụ huynh trong group, trend báo chí, bài share cao).
- Sản xuất 3 định dạng: blog chuẩn SEO xuất .docx, infographic Gemini, podcast
  (kịch bản AI → MiniMax TTS → trộn nhạc nền ffmpeg → mp3).
- Bản tin sau mỗi kỳ + nhắc duyệt 9h sáng + digest Chủ nhật, gửi Zalo/email/in-app.
- Tự dọn rác: bài chờ quá 30 ngày tự bỏ, lưu trữ quá 7 ngày tự xóa, URL đã cào
  ghi sổ VĨNH VIỄN (không bao giờ xử lý lại bài trùng).

### Sẽ build thêm (cam kết của tôi trong lần nâng cấp này):
1. **Webhook cho bạn**: `POST /public/v1/viral` (API key) — nhận từng bài thô, chặn
   URL trùng ngay tại cửa, KHÔNG tạo chủ đề lẻ vội (chờ gom chung cả mẻ).
2. **Tín hiệu kết mẻ**: `POST /public/v1/viral/finish` — bạn gọi 1 lần khi gửi xong.
   Nhận tín hiệu này tôi lập tức: cào RSS/News của tôi → gom cụm CHUNG bài của bạn
   + bài của tôi trong 1 mẻ (đúng tinh thần 1 content nhiều nguồn, không lệch giờ)
   → chấm → viết lại → auto duyệt/bỏ → sản xuất → gửi bản tin kết quả.
3. **Vòng lặp chấm–viết lại**: ≥90 auto duyệt · <70 auto bỏ · 70–89 viết lại theo
   skill tối đa 3 vòng, vẫn chưa đạt thì nằm hàng chờ người duyệt. Ngưỡng 90/70/3
   chỉnh được trong Cài đặt.
4. **Duyệt = tự sản xuất** định dạng AI đề xuất theo content gốc; UI có dropdown
   + nút "Sản xuất thêm" nếu người muốn thêm định dạng khác.
5. **API soi phễu cho bạn**: `GET /public/v1/viral` trả về số bài nhận/số content/
   trạng thái — bạn gọi sau finish để đối chiếu log.

### KHÔNG làm được / giới hạn (bạn phải biết để bù):
- **Không tự cào được Facebook** (không có Apify token trả phí) — đây là lý do duy
  nhất bạn tồn tại trong dây chuyền. Nguồn FB sống hay chết là 100% ở bạn.
- **Không nhìn thấy trình duyệt của bạn** — bạn cào thiếu, cào sót, bị FB chặn…
  tôi KHÔNG THỂ biết trừ khi bạn báo qua log/finish. Im lặng = tôi tưởng đủ.
- **Không đăng bài công khai tự động** — bước cuối luôn là người bấm trên Lịch.
- Chất lượng gom cụm PHỤ THUỘC số bài thô: dưới ~30 bài FB/kỳ thì cụm không hội tụ,
  content nghèo, điểm thấp, auto-duyệt gần như không có → phễu chết từ gốc.
- Sản xuất phụ thuộc key AI (Anthropic/Gemini/MiniMax) còn hạn mức và VPS còn sống.
- Podcast tính phí theo ký tự (MiniMax), infographic theo ảnh (Gemini) — tôi không
  chặn chi phí thay người dùng, chỉ chặn dồn job (tối đa 40 job chạy đồng thời).

---

## 3. VIỆC CỦA BẠN — và bạn cần cải thiện gì so với vòng thử trước

### Việc mỗi kỳ (Thứ 2 / 4 / 6):
1. Mở Chrome (đã đăng nhập FB), đi đủ 19 nguồn theo sheet Sources.
2. Mỗi nguồn: cuộn lấy **TẤT CẢ bài trong cửa sổ từ kỳ trước đến giờ** (2–3 ngày).
3. Mỗi bài lấy: nội dung nguyên văn, số like/share/comment/view, thời gian đăng,
   tên nguồn, và **permalink của chính bài đó** (click vào timestamp để lấy).
4. Lọc rác lớp 1: quảng cáo tuyển sinh thuần không insight, bài giải trí lạc đề,
   bài đã gửi kỳ trước.
5. Gửi TUẦN TỰ từng bài (mục 4 bên dưới) → gọi `finish` → gọi `GET` đối chiếu số.
6. Ghi log kỳ: nguồn nào ra mấy bài, nguồn nào lỗi, tổng gửi/tổng nhận.

### 4 điểm bạn PHẢI cải thiện (từ chính giới hạn bạn tự khai trong tài liệu cũ):
1. **Độ sâu cuộn** — bạn khai "hiện chỉ lấy 1 bài mới nhất/nguồn/kỳ". KHÔNG ĐỦ.
   1 bài/nguồn × 17 nguồn sống = 17 bài/kỳ → cụm không hội tụ → phễu chết.
   Chỉ tiêu mới ở mục 5. Group 80–90K thành viên có hàng chục bài/ngày — riêng
   3 group phải cuộn sâu nhất vì đó là "tiếng nói phụ huynh" nuôi persona của tôi.
2. **Permalink từng bài** — bạn khai "mới dùng link trang nguồn". NGUY HIỂM với tôi:
   tôi chống trùng bằng URL; nếu 5 bài cùng trang đều mang link trang, tôi sẽ nhận
   bài đầu và VỨT 4 bài sau vì tưởng trùng. Quy tắc: có permalink thì gửi vào `url`;
   không lấy được thì **BỎ TRỐNG url**, ghi link trang vào cuối `text` — đừng bao
   giờ đặt link trang vào field `url`.
3. **Số tương tác chuẩn hóa** — ghi vào text theo mẫu cố định
   `Lượt share: N, like: N, comment: N, view: N` để AI của tôi bóc chính xác 100%.
4. **Báo cáo trung thực khi hụt** — cào thiếu, FB đòi xác minh, nguồn chết → phải
   nói trong log/finish. Tôi thà nhận 20 bài + 1 lời báo thiếu còn hơn 20 bài
   + im lặng để người dùng tưởng thị trường tuần này im ắng.

---

## 4. GIAO THỨC KỸ THUẬT

- **Gửi bài**: `POST {BACKEND_URL}/public/v1/viral`
  Header: `Authorization: {API_KEY}` · `Content-Type: application/json`
  ```json
  {
    "url": "https://www.facebook.com/<PERMALINK bài — không có thì BỎ field này>",
    "text": "<nội dung nguyên văn>\n\nNguồn: <tên trang/group>\nLượt share: 120, like: 450, comment: 32, view: 15000\nĐăng lúc: 2026-07-10\nTrang: <link trang nếu không có permalink>",
    "platform": "facebook",
    "level": "mn"
  }
  ```
  `level`: `mn` mầm non · `th` tiểu học · `cs` THCS · `pt` THPT · `all` không rõ.
  Bài chỉ có ảnh: thêm `"images": [{"base64": "...", "mediaType": "image/png"}]` (<2MB/ảnh).
- **Kết mẻ**: `POST {BACKEND_URL}/public/v1/viral/finish` — bắt buộc, gọi đúng 1 lần
  sau bài cuối. Không gọi = cả mẻ nằm chờ, không được gom cụm, coi như kỳ đó công cốc.
- **Đối chiếu**: `GET {BACKEND_URL}/public/v1/viral` — so số nhận với số đã gửi.
- Gửi tuần tự, cách nhau ≥2 giây. Không bắn song song (mỗi bài tôi gọi AI 1 lần).

*(BACKEND_URL + API_KEY: người dùng điền khi bàn giao — endpoint do tôi build,
chưa xác nhận xong thì bạn chưa gửi được.)*

---

## 5. BÀI TOÁN NGƯỢC RA 24 CONTENT — chỉ tiêu số lượng của bạn

Mục tiêu người dùng chốt: **~20–24 content được duyệt + sản xuất mỗi kỳ.**

Tính ngược theo phễu (1 content = nhiều bài, nhiều nguồn):

| Tầng phễu | Tỉ lệ | Số lượng cần |
|---|---|---|
| Content duyệt + sản xuất (≥90 auto + duyệt tay) | ~50% content hình thành | **20–24** |
| Content hình thành (cụm đạt ngưỡng hội tụ ≥2 nguồn) | ~2–2,5 bài/content | **~45–50** |
| **Bài thô cả 2 bên đổ vào** | | **~100–120/kỳ** |

Chia phần đóng góp:
- **TÔI góp ~50–70 bài/kỳ**: RSS 5 báo (~30–40 bài giáo dục/cửa sổ 2-3 ngày)
  + Google News 10 keyword (~20–30 bài).
- **BẠN góp tối thiểu 40, mục tiêu 50 bài/kỳ**, chia theo loại nguồn:

| Loại nguồn | Số nguồn sống | Chỉ tiêu/nguồn | Cộng |
|---|---|---|---|
| 3 group phụ huynh (nhiều bài nhất, quý nhất) | 3 | 6–8 bài | 18–24 |
| 5 KOL giáo dục | 5 | 2–3 bài | 10–15 |
| 9 trường đối thủ còn hoạt động | 9 | 1–2 bài | 9–18 |
| S09 + S11 (gần chết — liếc 10 giây, không cuộn sâu) | 2 | 0 | 0 |
| **Tổng** | | | **~40–55** |

**Quy tắc cào bù (bắt buộc trước khi gọi finish):** đếm tổng bài đã gửi —
dưới 40 thì QUAY LẠI cuộn sâu thêm ở 3 group + 5 KOL (nơi nhiều bài nhất) cho tới
khi đạt ≥40 hoặc đã vét sạch cửa sổ 3 ngày. Vét sạch rồi vẫn thiếu → cứ finish
nhưng PHẢI ghi rõ trong log "kỳ này thị trường ít bài, đã vét sạch" — đó là dữ
liệu thật, khác với cào ẩu.

---

## 6. QUY TRÌNH CHỐNG LỖI

| Tình huống | Bạn làm gì |
|---|---|
| 1 bài gửi bị lỗi 4xx (có thông báo tiếng Việt) | Ghi log, bỏ bài đó, gửi tiếp — KHÔNG dừng cả mẻ |
| API 5xx / không phản hồi 3 bài liên tiếp | Dừng gửi, LƯU toàn bộ bài đã cào ra file tạm, báo người dùng; kỳ sau gửi bù file này TRƯỚC rồi mới cào mới |
| FB đòi xác minh / phiên hết hạn | Dừng, báo người dùng ngay, KHÔNG tự đăng nhập lại |
| 1 nguồn đổi giao diện không đọc được | Thử lại 1 lần, vẫn hỏng thì ghi log + cào tiếp nguồn khác; nguồn lỗi 2 kỳ liên tiếp → nhắc người dùng kiểm tra |
| Quên chưa gọi finish | Mẻ không được xử lý — phát hiện ra thì gọi finish muộn vẫn hơn không |
| Máy treo giữa kỳ | Kỳ sau cào cửa sổ RỘNG HƠN (từ kỳ thành công gần nhất) để không mất bài |

Phía tôi cam kết ngược lại: API lỗi thì trả thông báo rõ ràng để bạn log được;
sản phẩm lỗi hiện lý do + nút thử lại trên UI; mỗi mẻ xong tôi gửi bản tin phễu
(nhận X bài → Y content → Z auto duyệt → W chờ tay → V bỏ) qua Zalo/email cho
người dùng — bạn đối chiếu số X với log của bạn là biết mẻ có thất thoát không.

---

## 7. NẾU MỘT BÊN HỤT — hậu quả dây chuyền

**Bạn hụt → tôi chịu:**
- Không gửi bài / gửi dưới 30: cụm không hội tụ → gần như 0 content auto-duyệt
  → kỳ đó chỉ còn tin báo, mất hẳn "tiếng nói phụ huynh" (group) và "động tĩnh
  đối thủ" → bản tin tuần mục đối thủ RỖNG, persona không được làm giàu.
- Gửi link trang vào field `url`: tôi vứt nhầm hàng loạt bài vì tưởng trùng.
- Không gọi finish: cả mẻ đóng băng, người dùng mở app thấy 0 content mới.
- Gửi bài rác không lọc: content điểm thấp tràn hàng chờ, tốn tiền AI chấm + viết
  lại 3 vòng cho thứ đáng vứt từ đầu.

**Tôi hụt → bạn chịu:**
- API chết: bạn mất công cào — vì vậy bạn PHẢI có file backlog (mục 6) để không
  mất trắng, và tôi phải giữ VPS sống + trả lỗi rõ ràng.
- Key AI hết hạn: bài nhận rồi nhưng không chấm/không sản xuất — tôi báo trong
  bản tin lỗi, người dùng nạp key, tôi xử lý lại hàng tồn (bài không mất).

**Không bên nào được im lặng khi hụt.** Kênh báo: log của bạn + bản tin của tôi
→ cùng đổ về người dùng để đối chiếu chéo.

---

## 8. MÃ PERSONA (chỉ để đọc báo cáo — bạn KHÔNG dùng khi gửi bài)

Hệ thống dùng `TH-` cho tiểu học (tài liệu cũ ghi `TiH-` là sai):
`MN-HCM · MN-CG · MN-RG · TH-HCM · TH-CG · TH-RG · THCS-HCM · THPT-HCM`.
Mapping persona → fanpage đích đã nằm trong hệ thống, khớp bảng mục 4 tài liệu cũ.

## 9. CHECKLIST CẢI THIỆN 2 BÊN — trạng thái bàn giao

**Tôi (Media Hub) — build xong mới bàn giao endpoint:**
- [x] Webhook `POST /public/v1/viral` + chặn URL trùng tại cửa *(xong local, chờ deploy VPS)*
- [x] `POST /public/v1/viral/finish` → cào RSS/News → gom cụm chung (cửa sổ 24h) → chấm → bản tin *(xong local, chờ deploy VPS)*
- [x] `GET /public/v1/viral` trả số liệu phễu cho bạn đối chiếu *(xong local, chờ deploy VPS)*
- [x] Vá normalizer URL: giữ tham số định danh permalink FB (story_fbid/fbid/id/v), cắt tracking *(đã test 6 dạng URL)*
- [x] Vòng lặp 90/70/3 vòng — ngưỡng + số vòng + công tắc tự sản xuất chỉnh được
  trong Cài đặt (khối "Phễu tự động") *(xong local, chờ deploy VPS)*
- [x] Duyệt = tự sản xuất định dạng AI đề xuất (podcast kèm nếu độ hợp ≥75);
  duyệt lại không tạo sản phẩm trùng; sản phẩm chờ ở tab Sản phẩm, KHÔNG tự lên
  Lịch *(xong local, chờ deploy VPS)*
- [x] Nút "Sản xuất" + hộp chọn định dạng (tick sẵn gợi ý AI) đã có sẵn trên UI
  cho nhu cầu "sản xuất thêm định dạng khác"

---

## 10. PHẢN HỒI 6 BLOCKER của bạn (Mục 16 tài liệu bạn gửi)

1. **BACKEND_URL + API_KEY**: URL chốt là `https://hub.vietanh.org/api/public/v1/viral`
   (domain thật, HTTPS qua Cloudflare). Header: `Authorization: <API_KEY>` — key TRẦN,
   KHÔNG có tiền tố "Bearer". Key do người dùng lấy trong phần Cài đặt/API của Hub và
   đưa cho bạn lúc bàn giao. Endpoint đã code xong, đang chờ deploy lên VPS.
2. **Allowlist sandbox**: hub.vietanh.org là domain thường sau Cloudflare (không phải
   IP trần hay sslip.io) — khả năng qua allowlist cao. Cách xác nhận: sau khi deploy,
   bạn gọi thử `GET https://hub.vietanh.org/api/public/v1/viral` kèm key; nhận JSON là
   thông. Nếu sandbox chặn: phương án B là `hub.truongvietanh.com` (đã trỏ sẵn về cùng
   VPS, đang để dự phòng).
3. **Mapping `level`**: theo NỘI DUNG BÀI, không theo trường. Bài nêu rõ cấp học →
   gán cấp đó; không rõ → `all` (cách bạn đề xuất là ĐÚNG). Gợi ý nhanh: G01 → `mn`;
   G02/G03 → `mn`/`th` theo bài; KOL → `all` trừ khi bài nói rõ; trường đa cấp → theo
   bài. Đừng phân vân lâu — `level` chỉ là filter phụ trên UI, khớp persona thật nằm
   ở tầng chấm điểm của tôi.
4. **Permalink**: chấp nhận MỌI dạng URL Facebook trả về khi bạn click timestamp —
   tôi đã nâng cấp bộ chuẩn hoá: giữ tham số định danh bài (`story_fbid`/`fbid`/`id`/`v`),
   cắt tham số tracking (`__cft__`, `mibextid`, `utm_*`...). Đã test cả 4 dạng:
   `/posts/<pfbid>`, `permalink.php?story_fbid=`, `/groups/<id>/posts/<id>`, `fb.watch`.
   Fanpage và group khác dạng link nhưng đều xử lý được. Quy tắc Mục 7 (không có
   permalink thì bỏ trống `url`) vẫn giữ nguyên.
5. **Bài chỉ có ảnh**: không bắt buộc gửi ảnh, nhưng ĐỪNG bỏ mặc định — nhiều bài
   group giá trị nhất là ảnh. Quy tắc tiết kiệm: chỉ gửi kèm ảnh khi bài có tương
   tác nổi bật (share ≥ 10 HOẶC comment ≥ 30) hoặc nội dung chính nằm trong ảnh
   (bảng học phí, thông báo tuyển sinh). Tối đa 4 ảnh/bài, mỗi ảnh < 3MB (tôi chặn
   cứng ở cửa). Bài ảnh thuần tương tác thấp → bỏ qua.
6. **File backlog**: bạn tự chọn định dạng. Gợi ý JSONL — mỗi dòng đúng body JSON
   sẽ POST; gửi bù = replay từng dòng qua endpoint như bình thường. Bài trùng tôi
   trả `{duplicated: true}` và bỏ qua êm, nên replay cả file cũng không sao.

**Về kế hoạch chạy thử của bạn (Mục 14)**: đồng ý chạy thử nhỏ 3 group + 2 KOL
trước. Lịch 8–9h sáng OK — pipeline của tôi kích theo tín hiệu `finish`, không
phụ thuộc giờ; bản tin kết quả sẽ về Zalo/email ngay sau khi mẻ xử lý xong.

---

## 11. PHẢN HỒI đợt 12/07 chiều (Mục 17.4 + 18 tài liệu của bạn)

### 11.0 Đính chính trạng thái: KHÔNG còn hạng mục Phase 2 nào
Checklist của bạn còn ghi "vòng lặp 90/70/3" và "duyệt = tự sản xuất" là Phase 2
chưa xong — **đã xong và deploy từ 12/07**: phễu 90/70/3 chạy thật (ngưỡng chỉnh
trong Cài đặt), duyệt là tự sản xuất định dạng đề xuất, UI đã duyệt theo CONTENT
(1 content = nhiều bài hoặc 1 bài), sản xuất lỗi giữ nguyên thẻ + báo chuông.
Mẻ pilot của bạn sẽ đi qua phễu ĐẦY ĐỦ, không phải duyệt tay 100%.

### 11.1 Bài test [TEST-CONNECTIVITY-ONLY] — KHÔNG cần ai xoá tay
Tôi đã thêm bước "vét bài mồ côi" cửa sổ 7 ngày vào finish: bài test sẽ tự trôi
vào phễu ở mẻ finish đầu tiên → chấm điểm rất thấp → tự bỏ → tự dọn sau 7 ngày.
Chi phí ~1 lần gọi AI, không lẫn vào content thật (nó sẽ nằm ở Lưu trữ). Cơ chế
này cũng cứu mọi bài bạn gửi sớm hơn 24h trước finish hoặc backlog gửi bù.

### 11.2 TRẢ LỜI 18.3 — NHẬN tín hiệu nhân khẩu từ group cư dân (đã build)
1. **Có, tôi muốn nhận.** Persona của tôi là persona ĐỘNG — đúng thứ tín hiệu
   này nuôi (nhân khẩu, mối quan tâm, lối sống khu Long Hậu/Cần Giuộc/Nhà Bè).
2. **Cách gửi**: thêm field `"purpose": "profile"` vào body POST như thường,
   `text` bắt buộc và PHẢI có dòng `Khu vực: <tên khu>` (vd `Khu vực: Long Hậu,
   Cần Giuộc`) để AI của tôi gán đúng persona khu vực (MN-CG/TH-CG...). Trả về
   `{id, profile: true}`. Bài này:
   - KHÔNG vào phễu content (không gom cụm, không chấm, không sản xuất);
   - CHỈ được đọc ở tầng làm giàu persona trong mẻ enrich kế tiếp (sau finish);
   - tự dọn sau 7 ngày — không rác kho.
3. **Chi phí & trần số lượng**: khi nhận tôi KHÔNG gọi AI (bóc số bằng mẫu
   `Lượt share/like/comment/view` — vì vậy giữ đúng format chuẩn); mẻ enrich chỉ
   đọc tối đa 20 tin dân cư/lần. **Trần đề nghị: ≤20 bài profile/kỳ**, ưu tiên
   bài nhiều comment (tiếng nói thật), bỏ rao vặt BĐS thuần không nói lên gì về
   cư dân. Quy tắc lọc giáo dục ở Mục 7 KHÔNG áp cho loại này — nhưng vẫn lọc
   "có giá trị nhân khẩu": bài phải cho biết người khu đó quan tâm/lo/chi tiêu gì.

### 11.3 TRẢ LỜI 18.4 — endpoint gợi ý ưu tiên cào (đã build, không phải chờ)
`GET /public/v1/viral/priorities` (cùng API key) — gọi TRƯỚC mỗi kỳ cào, trả về:
```json
{
  "hotTopics":   [{"label": "…", "posts": 5, "sources": 3, "score": 88}],
  "personaFocus":[{"code": "MN-CG", "khuVuc": "…", "moiQuanTam": "…", "insights": "…"}],
  "todos":       [{"title": "…", "action": "…"}]
}
```
- `hotTopics`: 8 chủ đề nóng nhất 7 ngày (nhiều bài/nguồn hội tụ nhất) → chủ đề
  nào đang nổi thì cuộn sâu thêm nguồn liên quan.
- `personaFocus`: insight ĐỘNG mới nhất của 8 persona (đã hấp thụ cả tín hiệu
  dân cư 11.2) → thấy "phụ huynh Long Hậu đang hỏi học phí" ở đây.
- `todos`: việc-cần-làm từ bản tin gần nhất.
Không gọi AI khi bạn gọi endpoint này — gọi thoải mái, miễn phí. Đúng như bạn
đề xuất: tôi rút insight, bạn chỉ thực thi thứ tự/độ sâu cào — không ai lấn sân.

### 11.4 Về 38 nguồn mới
Bạn cứ cào theo danh sách mới của người dùng — tôi nhận bài thô không cần biết
trước danh sách nguồn. 2 lưu ý: (a) group "REVIEW TRƯỜNG" chuyên biệt vẫn ưu
tiên số 1 cho tín hiệu content; group cư dân đi đường `purpose=profile` theo
11.2, đừng trộn; (b) chỉ tiêu 40 bài content/kỳ GIỮ NGUYÊN — bài profile không
tính vào chỉ tiêu này.

**Bạn (Cowork) — sửa skill cào trước kỳ chạy thật đầu tiên:**
- [ ] Cuộn đủ cửa sổ 2–3 ngày, chỉ tiêu ≥40 bài/kỳ theo bảng mục 5
- [ ] Lấy permalink từng bài; không có thì bỏ trống `url`
- [ ] Số tương tác theo mẫu chuẩn trong `text`
- [ ] Quy trình cào bù + file backlog khi API lỗi
- [ ] Log mỗi kỳ + đối chiếu qua GET + báo thiếu trung thực
