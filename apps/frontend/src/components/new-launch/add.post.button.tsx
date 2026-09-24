'use client';

import React, { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PostComment } from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
export const AddPostButton: FC<{
  onClick: () => void;
  num: number;
  postComment: PostComment;
}> = (props) => {
  const { onClick } = props;
  const t = useT();

  // Nút phụ: viền trung tính. Trước là khối hồng đặc (mã cứng #D82D7E) — một
  // màu nhấn THỨ HAI giành chú ý với nút Lên lịch màu xanh, trong khi thêm
  // bình luận là thao tác phụ. <button> thay cho <div onClick> để bàn phím tới
  // được.
  return (
    <div className="flex">
      <button
        type="button"
        onClick={onClick}
        className="select-none cursor-pointer h-[34px] rounded-[6px] flex border border-newSep bg-transparent hover:bg-boxHover transition-colors text-newTextColor gap-[8px] justify-center items-center ps-[12px] pe-[16px] text-[13px] font-[500] mt-[12px] outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8.00065 3.33301V12.6663M3.33398 7.99967H12.6673"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          {t(
            ...(props.postComment === PostComment.ALL
              ? ['add_comment_or_post', 'Add comment or post']
              : props.postComment === PostComment.POST
              ? ['add_post', 'Add post']
              : ['add_comment', 'Add comment'])
          )}
        </span>
      </button>
    </div>
  );
};
