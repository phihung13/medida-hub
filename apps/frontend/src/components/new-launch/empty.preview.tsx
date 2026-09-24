'use client';

import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Khung xem trước khi chưa có nội dung. Trước là một câu chữ trắng đặt trên
// cùng bên trái trông như nội dung thật; giờ là trạng thái rỗng: icon mờ ở
// giữa + một dòng ngắn — nhìn là biết "chưa có gì", không cần đọc.
export const EmptyPreview: FC = () => {
  const t = useT();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[10px] py-[48px] text-textItemBlur">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <path d="M10 18.5h4" />
      </svg>
      <span className="text-[13px]">
        {t('start_writing_your_post', 'Start writing your post for a preview')}
      </span>
    </div>
  );
};
