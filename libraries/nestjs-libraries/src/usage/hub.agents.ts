// ============================================================================
//  Danh mục AGENT AI của Media Hub — trả qua GET /major-os/v1/agent và in ra
//  docs/AGENT_HUB.md để anh Dương đọc / refine prompt.
//
//  `ma` = mã agent dùng trong báo cáo /noi-dung (cột Post.agent). Agent không
//  tự làm ra bài (chỉ đổ chữ vào trình soạn) có `ma` để đối chiếu với lượt
//  dùng ở /tinh-nang (khoá `tinh_nang`), không xuất hiện ở /noi-dung.
//
//  `prompt` = đường dẫn trong repo; `skill` = khoá skill sửa được NGAY trên
//  giao diện (Phát hiện → 🧪 Công thức AI) không cần sửa code.
//  Sửa agent thì sửa ở đây cho khớp.
// ============================================================================

export type HubAgent = {
  ma: string;
  ten: string;
  nhom: 'tao-bai' | 'ho-tro-soan' | 'phat-hien-san-xuat' | 'phan-tich';
  lam_gi: string;
  kich_hoat: string;
  dau_ra: string;
  model: string;
  prompt: string[];
  skill?: string[];
  tinh_nang?: string[];
  do_duoc: string;
};

const MODEL_VIET =
  'Claude (mặc định claude-sonnet-4-6) — hoặc OpenRouter DeepSeek nếu Cài đặt chọn "AI viết bài" = OpenRouter';

export const HUB_AGENTS: HubAgent[] = [
  // ── Tạo ra bài trên Lịch (đếm được ở /noi-dung) ───────────────────────────
  {
    ma: 'zalo-bot',
    ten: 'Bot Zalo — gom ảnh nhóm thành bài nháp',
    nhom: 'tao-bai',
    lam_gi:
      'Gom ảnh/video giáo viên gửi vào nhóm Zalo thành từng đợt, lọc ảnh trùng (chọn ảnh đẹp nhất), kiểm an toàn trẻ em, viết caption + hashtag + chú thích từng ảnh, đẩy thành bài NHÁP cho từng kênh.',
    kich_hoat: 'Tự động khi nhóm Zalo im 10 phút (tối đa 30 phút/đợt), hoặc bấm "Chốt ngay".',
    dau_ra: 'Bài nháp trên Lịch, tag "Zalo", mỗi kênh một thẻ.',
    model: 'Claude (CLAUDE_MODEL trên bot, mặc định claude-sonnet-4-6; đồng bộ từ Cài đặt Hub)',
    prompt: [
      'apps/zalo-bot/src/caption.mjs — SYSTEM (dòng ~64-79), writeCaption (~282-351), hashtag (~138-167), chú thích từng ảnh (~205-261), video (~267-274), viết lại (~185-203)',
      'apps/zalo-bot/src/pickbest.mjs — chọn ảnh đẹp nhất (~33-70)',
      'apps/zalo-bot/src/safety.mjs — kiểm an toàn trẻ em (~53-94)',
    ],
    tinh_nang: ['zalo.mo-bai', 'zalo.chot-ngay', 'zalo.lay-lai-tin'],
    do_duoc:
      'Đủ: bài nháp → lên lịch / đăng / xoá. Lưu ý: nhóm Zalo bật "tự đăng Facebook/GBP" thì bot đăng thẳng, bài đó KHÔNG vào Lịch nên không đếm.',
  },
  {
    ma: 'viral-clone',
    ten: 'Phát hiện — Nhân bản theo công thức viral',
    nhom: 'phat-hien-san-xuat',
    lam_gi: 'Mổ công thức của một bài viral rồi viết bài mới cùng công thức cho kênh của trường.',
    kich_hoat: 'Nút "Nhân bản" trên thẻ bài ở trang Phát hiện.',
    dau_ra: 'Bài nháp trên Lịch.',
    model: MODEL_VIET,
    prompt: [
      'libraries/nestjs-libraries/src/openai/openai.service.ts — viralFormula (~750-772), viralClone (~775-794)',
    ],
    skill: ['skill-mo-cong-thuc', 'he-thong-viet-anh'],
    do_duoc: 'Đủ (từ 06/10/2026). Trước đó gộp chung "ai-khac".',
  },
  {
    ma: 'viral-ban-cua-minh',
    ten: 'Phát hiện — "Bài của mình" (viết lại + chấm điểm)',
    nhom: 'phat-hien-san-xuat',
    lam_gi:
      'Viết lại một bài / chủ đề cho đúng chân dung phụ huynh, chấm điểm theo rubric 100đ, so với điểm bài gốc.',
    kich_hoat: 'Nút "Viết lại cho mình" trên thẻ bài / chủ đề.',
    dau_ra: 'Mục "Bài của mình" (mine) → bấm Đăng thành bài nháp trên Lịch (posted).',
    model: MODEL_VIET,
    prompt: ['libraries/nestjs-libraries/src/openai/openai.service.ts — viralRewriteAndScore (~1230-1265)'],
    skill: ['tieu-chi-cham-diem', 'he-thong-viet-anh'],
    do_duoc:
      '/noi-dung có 2 dòng: nguồn phat-hien-san-xuat (làm ra vs đã đẩy lên Lịch) và nguồn bai-dang (bài trên Lịch đã đăng chưa). Bài xoá cứng thì mất khỏi số làm ra.',
  },
  {
    ma: 'viral-infographic',
    ten: 'Sản xuất — Infographic carousel',
    nhom: 'phat-hien-san-xuat',
    lam_gi: 'Viết kịch bản carousel (HOOK → REWARD → SHARE), rồi vẽ TỪNG slide 1:1 bằng Gemini.',
    kich_hoat: 'Tự sản xuất khi duyệt chủ đề, hoặc bấm "Sản xuất".',
    dau_ra: 'Bộ ảnh slide → bấm "Đẩy lên Lịch" thành bài nháp kèm toàn bộ ảnh.',
    model: `${MODEL_VIET}; vẽ slide: Gemini (ảnh)`,
    prompt: [
      'libraries/nestjs-libraries/src/viral/viral.produce.prompts.ts — kịch bản (~199-239), vẽ slide (~240-275)',
    ],
    skill: ['cong-thuc-carousel', 'cong-thuc-ve-slide', 'cong-thuc-infographic', 'chinh-ta', 'cta-that', 'ho-so-truong-ngan'],
    do_duoc: 'Đủ: làm ra (sản phẩm xong) → dùng (đẩy lên Lịch) → đăng.',
  },
  {
    ma: 'viral-blog',
    ten: 'Sản xuất — Blog chuẩn EEAT (.docx)',
    nhom: 'phat-hien-san-xuat',
    lam_gi: 'Viết bài blog dài theo cấu trúc EEAT + 5 tầng lập luận, xuất file Word, gợi ý site đăng.',
    kich_hoat: 'Tự sản xuất khi duyệt chủ đề, hoặc bấm "Sản xuất".',
    dau_ra: 'File .docx tải về (Hub không đăng blog).',
    model: MODEL_VIET,
    prompt: ['libraries/nestjs-libraries/src/viral/viral.produce.prompts.ts — blog (~42-74), gợi ý site (~76-160)'],
    skill: ['cong-thuc-blog', 'giong-van-blog', 'ho-so-truong', 'chinh-ta', 'cta-that', 'diem-tua'],
    do_duoc: 'Một phần: "dùng" = sản xuất xong (không biết có tải về / đăng web thật không).',
  },
  {
    ma: 'viral-podcast',
    ten: 'Sản xuất — Podcast',
    nhom: 'phat-hien-san-xuat',
    lam_gi: 'Viết kịch bản kể chuyện (Twist/Reveal), đọc thành mp3 bằng giọng AI.',
    kich_hoat: 'Tự sản xuất khi duyệt chủ đề, hoặc bấm "Sản xuất".',
    dau_ra: 'File mp3 → bật 📡 để phát hành lên kênh podcast RSS (Spotify/Apple).',
    model: `${MODEL_VIET}; giọng: MiniMax speech-02-hd`,
    prompt: ['libraries/nestjs-libraries/src/viral/viral.produce.prompts.ts — podcast (~161-189)'],
    skill: ['cong-thuc-podcast', 'giong-podcast', 'ho-so-truong-ngan', 'chinh-ta', 'cta-that'],
    do_duoc: 'Đủ: "dùng" = đã phát hành RSS.',
  },
  {
    ma: 'agent-chat',
    ten: 'Trang Agent / MCP — trợ lý lên lịch bằng chat',
    nhom: 'tao-bai',
    lam_gi: 'Chat yêu cầu tự nhiên ("lên 3 bài tuần sau…"), agent tự viết, tạo ảnh/video, lên lịch bài.',
    kich_hoat: 'Trang /agents trong Hub, hoặc MCP client (Claude Desktop…).',
    dau_ra: 'Bài trên Lịch (nháp / lên lịch / đăng ngay tuỳ yêu cầu).',
    model: 'Claude (ANTHROPIC_MODEL, Mastra agent)',
    prompt: [
      'libraries/nestjs-libraries/src/chat/load.tools.service.ts — instructions (~49-88)',
      'libraries/nestjs-libraries/src/chat/tools/* — mô tả từng công cụ',
    ],
    do_duoc: 'Đủ (từ 06/10/2026).',
  },
  {
    ma: 'excel-ai',
    ten: 'Nhập Excel — "AI chuốt"',
    nhom: 'tao-bai',
    lam_gi: 'Chuốt lại tiêu đề + nội dung các dòng trong file Excel lịch đăng trước khi lên lịch hàng loạt.',
    kich_hoat: 'Nút "AI chuốt" ở trang Agent → Nhập Excel.',
    dau_ra: 'Bài đã lên lịch trên Lịch.',
    model: 'Claude (ANTHROPIC_MODEL)',
    prompt: ['libraries/nestjs-libraries/src/database/prisma/content/bulk-import.service.ts — polish (~343-375)'],
    do_duoc: 'Đủ (từ 06/10/2026). Dòng KHÔNG bấm AI chuốt tính là "api" (người soạn).',
  },
  {
    ma: 'autopost-rss',
    ten: 'Autopost — đăng tự động từ RSS',
    nhom: 'tao-bai',
    lam_gi: 'Đọc bài mới từ nguồn RSS, viết lại thành bài mạng xã hội ngắn, tạo ảnh minh hoạ.',
    kich_hoat: 'Theo lịch Temporal cho từng nguồn RSS đã cài.',
    dau_ra: 'Bài trên Lịch.',
    model: 'OpenAI gpt-4.1 (chữ) + chatgpt-image-latest (ảnh)',
    prompt: ['libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts — chữ (~219-235), ảnh (~247-253)'],
    do_duoc: 'Đủ.',
  },

  // ── Hỗ trợ trong trình soạn (đổ chữ/ảnh vào bài người đang soạn) ─────────
  {
    ma: 'ai-caption',
    ten: 'Bút phép thuật — AI đọc ảnh & viết caption',
    nhom: 'ho-tro-soan',
    lam_gi: 'Nhìn các ảnh đính kèm, viết caption cho cả bài + chú thích (alt) cho từng ảnh.',
    kich_hoat: 'Nút đũa phép trong trình soạn.',
    dau_ra: 'Ghi đè nội dung bài đang soạn; alt từng ảnh.',
    model: 'Claude vision (luôn Claude)',
    prompt: ['libraries/nestjs-libraries/src/openai/openai.service.ts — generateCaptionsForImages (~455-496), VIET_ANH_SYSTEM (~31-34)'],
    tinh_nang: ['ai.viet-caption'],
    do_duoc: 'Số lần dùng + lỗi + thời gian AI trả lời ở /tinh-nang. Bài đăng sau đó tính là "thu-cong" ở /noi-dung.',
  },
  {
    ma: 'ai-tao-anh',
    ten: 'Tạo hình ảnh bằng AI',
    nhom: 'ho-tro-soan',
    lam_gi: 'AI viết prompt từ mô tả + phong cách, rồi tạo ảnh.',
    kich_hoat: 'Nút tạo ảnh AI trong trình soạn.',
    dau_ra: 'Ảnh mới trong thư viện, đính vào bài.',
    model: `${MODEL_VIET} (viết prompt); ảnh: OpenAI chatgpt-image-latest hoặc Fal flux/schnell (Cài đặt)`,
    prompt: ['libraries/nestjs-libraries/src/openai/openai.service.ts — generatePromptForPicture (~566-576)'],
    tinh_nang: ['ai.tao-anh'],
    do_duoc: 'Số lần dùng + lỗi ở /tinh-nang.',
  },
  {
    ma: 'ai-tao-video',
    ten: 'Tạo video bằng AI',
    nhom: 'ho-tro-soan',
    lam_gi: 'Tạo video ngắn (Veo3) hoặc video slide ảnh + giọng đọc từ nội dung.',
    kich_hoat: 'Nút tạo video AI trong trình soạn.',
    dau_ra: 'Video mới trong thư viện, đính vào bài.',
    model: 'kie.ai veo3_fast; slide: Claude/OpenRouter + Fal ideogram + ElevenLabs',
    prompt: ['libraries/nestjs-libraries/src/openai/openai.service.ts — generateSlidesFromText (~678-692), generateVoiceFromText (~579-589)'],
    tinh_nang: ['ai.tao-video'],
    do_duoc: 'Số lần dùng + lỗi ở /tinh-nang.',
  },
  {
    ma: 'youtube-ai',
    ten: 'YouTube AI — tiêu đề, mô tả, thumbnail',
    nhom: 'ho-tro-soan',
    lam_gi: 'Xem khung hình video, viết tiêu đề + mô tả YouTube, tạo ảnh thumbnail.',
    kich_hoat: 'Nút AI trong phần cài đặt kênh YouTube của bài.',
    dau_ra: 'Điền tiêu đề / mô tả / thumbnail của bài YouTube.',
    model: 'GPT-4o hoặc Gemini 2.5 Flash (chữ); Gemini 3 Pro Image hoặc OpenAI (thumbnail)',
    prompt: [
      'libraries/nestjs-libraries/src/openai/openai.service.ts — generateYoutubeContentFromImages (~525-563)',
      'libraries/nestjs-libraries/src/openai/gemini.service.ts (~217-226)',
    ],
    do_duoc: 'Chưa đo riêng.',
  },
  {
    ma: 'copilot',
    ten: 'Trợ lý trong trình soạn (Copilot)',
    nhom: 'ho-tro-soan',
    lam_gi: 'Chat ngay trong trình soạn để viết / sửa nội dung bài đang mở.',
    kich_hoat: 'Khung chat "Trợ lý của bạn" trong trình soạn.',
    dau_ra: 'Sửa trực tiếp nội dung bài đang soạn.',
    model: 'Claude (CopilotKit)',
    prompt: ['apps/frontend/src/components/new-launch/manage.modal.tsx — CopilotPopup instructions (~862-878)'],
    do_duoc: 'Chưa đo riêng.',
  },
  {
    ma: 'tach-thread',
    ten: 'Tách bài dài thành chuỗi (thread)',
    nhom: 'ho-tro-soan',
    lam_gi: 'Chia một nội dung dài thành nhiều phần vừa giới hạn ký tự của kênh.',
    kich_hoat: 'Nút tách bài trong trình soạn.',
    dau_ra: 'Các phần của chuỗi bài trong trình soạn.',
    model: MODEL_VIET,
    prompt: ['libraries/nestjs-libraries/src/openai/openai.service.ts — separatePosts (~641-675)'],
    do_duoc: 'Chưa đo riêng.',
  },

  // ── Phát hiện, chấm điểm, phân tích (không trực tiếp làm ra bài) ──────────
  {
    ma: 'viral-phat-hien',
    ten: 'Phát hiện — quét, phân tích, gom chủ đề, chấm điểm',
    nhom: 'phan-tich',
    lam_gi:
      'Quét bài viral (Facebook/TikTok/YouTube/báo), phân tích, gom các nguồn cùng chủ đề, tổng hợp thành 1 content gốc, phân loại cấp học, chấm điểm 100đ, gợi ý loại sản xuất + lead magnet.',
    kich_hoat: 'Lịch quét T2-T4-T6 19:00 (RUN_VIRAL_CRAWLER=1) hoặc bấm quét tay.',
    dau_ra: 'Thẻ bài / chủ đề chờ duyệt ở trang Phát hiện.',
    model: `${MODEL_VIET}; gom chủ đề: OpenAI text-embedding-3-small`,
    prompt: [
      'libraries/nestjs-libraries/src/openai/openai.service.ts — viralAnalyze (~697-747), viralScoreBatch (~798-849), viralClusterBatch (~880-910), viralSynthesizeTopic (~915-975), viralLeadMagnets (~980-1007)',
    ],
    skill: ['skill-phan-loai-viet-lai', 'skill-tong-hop-chu-de', 'nguyen-tac-chon-nhom', 'tieu-chi-cham-diem', 'skill-lead-magnet'],
    do_duoc: 'Chưa đưa vào API (số thẻ quét / duyệt / bỏ qua có trong DB Phát hiện).',
  },
  {
    ma: 'ban-tin-tuan',
    ten: 'Bản tin tuần + việc cần làm',
    nhom: 'phan-tich',
    lam_gi: 'Tổng hợp xu hướng tuần, việc cần làm, gửi Zalo/email.',
    kich_hoat: 'Sau mỗi lượt quét và Chủ nhật 20:00.',
    dau_ra: 'Bản tin gửi Zalo / email.',
    model: MODEL_VIET,
    prompt: ['libraries/nestjs-libraries/src/openai/openai.service.ts — viralWeeklyBrief (~1044-1098)'],
    skill: ['skill-ban-tin-tuan'],
    do_duoc: 'Chưa đo.',
  },
  {
    ma: 'phan-tich-kenh',
    ten: 'Phân tích kênh — bài thắng & hỏi đáp số liệu',
    nhom: 'phan-tich',
    lam_gi: 'Đọc số liệu kênh, chỉ ra bài nào thắng và vì sao; trả lời câu hỏi về số liệu.',
    kich_hoat: 'Trang Thống kê của từng kênh.',
    dau_ra: 'Nhận xét trên màn hình (lưu tạm 1 giờ).',
    model: `${MODEL_VIET}; hỏi đáp: luôn Claude`,
    prompt: ['libraries/nestjs-libraries/src/openai/openai.service.ts — analyzeChannelWinners (~1268-1306), analyzeYoutubeWinners (~1307-1346), answerAboutChannel (~1349-1384)'],
    do_duoc: 'Chưa đo riêng.',
  },
];
