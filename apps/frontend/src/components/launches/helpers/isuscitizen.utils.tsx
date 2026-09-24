import { cookieName } from '@gitroom/react/translation/i18n.config';

// Ngôn ngữ GIAO DIỆN hiện tại — đọc từ cookie mà i18next dùng để nhớ lựa chọn.
const uiLanguage = () => {
  try {
    const m = document.cookie.match(
      new RegExp('(?:^|; )' + cookieName + '=([^;]*)')
    );
    return m ? decodeURIComponent(m[1]).toLowerCase() : '';
  } catch {
    return '';
  }
};

export const isUSCitizen = () => {
  // Người dùng đã tự chọn định dạng thì giữ nguyên lựa chọn đó.
  const override = localStorage.getItem('isUS');
  if (override) {
    return override === 'US';
  }

  // Trước đây CHỈ nhìn ngôn ngữ trình duyệt: trình duyệt để en-US là ra định
  // dạng Mỹ, kể cả khi giao diện app đang là tiếng Việt — thành ra ngày ghép
  // lộn xộn kiểu "thứ năm, tháng 9 24, 2026" và giờ "09/24/2026 01:40 PM".
  // Giao diện không phải tiếng Anh thì không có lý do dùng định dạng Mỹ.
  const ui = uiLanguage();
  if (ui && !ui.startsWith('en')) {
    return false;
  }

  return (navigator.language || navigator.languages[0]).startsWith('en-US');
};
