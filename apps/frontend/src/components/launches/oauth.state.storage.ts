// ============================================================================
//  Giữ tạm `state` của vòng OAuth ở phía trình duyệt.
//
//  Vì sao cần: backend sinh URL cấp quyền có kèm `state`, rồi lưu
//  `login:<state>` (code_verifier PKCE) + `organization:<state>` vào Redis.
//  Khi nền tảng gọi callback về, backend tra Redis bằng chính `state` đó.
//
//  Vấn đề: KHÔNG PHẢI nền tảng nào cũng trả `state` về. Zalo OA chỉ redirect
//  `?oa_id=...&code=...` — mất state là backend không tra được code_verifier,
//  DTO lại bắt buộc có `state` nên rơi thẳng vào lỗi 400 validation.
//
//  Cách vá: ngay trước khi rời trang sang nền tảng, tách `state` ra khỏi URL
//  cấp quyền và cất vào localStorage. Trang callback nào không thấy `state`
//  trên URL thì lấy bản cất này ra dùng.
//
//  Dùng localStorage (không phải sessionStorage) vì vòng OAuth có thể mở ở
//  tab/cửa sổ khác — sessionStorage không chia sẻ sang tab mới.
// ============================================================================

const KEY_PREFIX = 'oauth_state:';
// Quá hạn thì bỏ: state cũ còn sót lại chỉ khiến backend báo "Invalid or
// expired state" một cách khó hiểu thay vì báo đúng là chưa bắt đầu luồng nào.
const MAX_AGE_MS = 60 * 60 * 1000; // 1 giờ

export const rememberOauthState = (identifier: string, authUrl: string) => {
  try {
    const state = new URL(authUrl).searchParams.get('state');
    if (!state) {
      return;
    }
    localStorage.setItem(
      `${KEY_PREFIX}${identifier}`,
      JSON.stringify({ state, at: Date.now() })
    );
  } catch {
    // URL lạ hoặc localStorage bị chặn (chế độ ẩn danh, chặn cookie bên thứ ba)
    // → bỏ qua. Nền tảng nào trả state về đàng hoàng thì vẫn chạy bình thường.
  }
};

export const recallOauthState = (identifier: string): string => {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${identifier}`);
    if (!raw) {
      return '';
    }
    const { state, at } = JSON.parse(raw);
    if (!state || Date.now() - Number(at) > MAX_AGE_MS) {
      localStorage.removeItem(`${KEY_PREFIX}${identifier}`);
      return '';
    }
    return String(state);
  } catch {
    return '';
  }
};

export const forgetOauthState = (identifier: string) => {
  try {
    localStorage.removeItem(`${KEY_PREFIX}${identifier}`);
  } catch {
    /* không sao */
  }
};
