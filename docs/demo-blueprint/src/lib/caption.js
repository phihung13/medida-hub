// Sinh caption cho bài đăng.
//
// Nếu có ANTHROPIC_API_KEY trong môi trường -> gọi Claude thật (claude-sonnet-4-6),
// đúng như kế hoạch thay OpenAI -> Claude của dự án.
// Không có key (hoặc gọi lỗi) -> dùng caption mock tiếng Việt để demo vẫn chạy.

const MODEL = 'claude-sonnet-4-6';

export async function generateCaption(job, group) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const text = await claudeCaption(job, group, key);
      return { text, source: 'claude' };
    } catch (e) {
      return { text: mockCaption(job, group), source: 'mock', note: 'Claude lỗi: ' + e.message };
    }
  }
  return { text: mockCaption(job, group), source: 'mock' };
}

async function claudeCaption(job, group, key) {
  const system =
    'Bạn là chuyên viên truyền thông của Trường Việt Anh. ' +
    'Viết caption mạng xã hội bằng tiếng Việt, tự nhiên, ấm áp, đúng chuẩn mực giáo dục. ' +
    'Kèm 3-5 hashtag phù hợp. Không bịa thông tin không có trong mô tả.';
  const prompt =
    `Viết caption cho một bài đăng gồm ${job.mediaUrls.length} ${job.type === 'video' ? 'video' : 'ảnh'} ` +
    `vừa được chia sẻ trong "${group.name}". ` +
    `Tông giọng mong muốn: ${group.tone}. ` +
    `Bài sẽ đăng lên: ${group.channels.join(', ')}. ` +
    `Chỉ trả về nội dung caption, không giải thích.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('').trim();
  if (!text) throw new Error('rỗng');
  return text;
}

// ---- Caption mock (tiếng Việt, phân theo nhóm) --------------------------

function mockCaption(job, group) {
  const n = job.mediaUrls.length;
  const media = job.type === 'video' ? `${n} video` : `${n} khoảnh khắc`;
  const templates = {
    g_sukien: [
      `🎉 Một ngày thật đáng nhớ tại Trường Việt Anh! Cùng nhìn lại ${media} ấn tượng của sự kiện hôm nay. Cảm ơn quý phụ huynh và các em học sinh đã cùng nhau tạo nên những dấu ấn tuyệt vời. 💙\n\n#TruongVietAnh #SuKienVietAnh #TuHaoVietAnh #GiaoDucVietAnh`,
      `✨ Rực rỡ và tự hào — Trường Việt Anh vừa khép lại một sự kiện đầy cảm xúc với ${media} được ghi lại. Xin gửi lời cảm ơn đến toàn thể thầy cô, học sinh và phụ huynh! 🌟\n\n#TruongVietAnh #SuKien #MaiTruongVietAnh`,
    ],
    g_hoatdong: [
      `📚 Giờ học không chỉ có sách vở! Cùng ngắm ${media} tràn đầy năng lượng của các em học sinh Việt Anh trong hoạt động hôm nay. Học mà chơi, chơi mà học! 🌈\n\n#HocSinhVietAnh #HoatDongNgoaiKhoa #TruongVietAnh`,
      `🌟 Nụ cười, sự tự tin và tinh thần đồng đội — tất cả gói gọn trong ${media} này. Tự hào về các em học sinh Việt Anh! 💪\n\n#TruongVietAnh #HocSinhTichCuc #KyNangSong`,
    ],
    g_tuyensinh: [
      `📢 TUYỂN SINH 2026 — Trường Việt Anh chào đón các em học sinh mới! ${media} về ngôi trường thân yêu đang chờ các em khám phá. \n📞 Liên hệ ngay để được tư vấn!\n\n#TuyenSinh2026 #TruongVietAnh #DangKyNgay`,
    ],
  };
  const pool = templates[group.id] || templates.g_hoatdong;
  // chọn ổn định theo số media để demo không random giật
  return pool[n % pool.length];
}
