'use client';

import { FC, useEffect } from 'react';

// Next.js dev mode biến MỌI console.error/warn của thư viện bên thứ 3 thành
// popup lỗi đỏ che màn hình — dù đó chỉ là cảnh báo vô hại. Lọc một allow-list
// nhỏ các dòng đã biết là LÀNH để không bung popup; lỗi thật vẫn hiện bình thường.
const BENIGN = [
  'ThumbnailGenerator', // Uppy: file removed before thumbnail — vô hại
  'file was removed before a thumbnail',
  'i18next is maintained with support from Locize', // quảng cáo Locize
  'was created with unknown prop', // cảnh báo prop từ vài lib UI
];

function isBenign(args: any[]): boolean {
  const text = args
    .map((a) => (typeof a === 'string' ? a : a?.message || ''))
    .join(' ');
  return BENIGN.some((b) => text.includes(b));
}

export const SuppressDevWarnings: FC = () => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...args: any[]) => {
      if (isBenign(args)) return;
      origError(...args);
    };
    console.warn = (...args: any[]) => {
      if (isBenign(args)) return;
      origWarn(...args);
    };
    return () => {
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);
  return null;
};

export default SuppressDevWarnings;
