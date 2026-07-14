'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';

// ============================================================================
//  FAB (floating action button) — hành động CHÍNH của từng trang trên mobile,
//  nổi góc dưới-phải NGAY TRÊN bottom tab bar (neo bằng --bottom-nav-h, xem
//  global.scss). Desktop: ẩn — trang giữ nút gốc của nó.
//  Dùng: <MobileFab onClick={...} label="Đăng bài" /> (label = aria, không vẽ)
// ============================================================================

export const MobileFab: FC<{
  onClick: () => void;
  label: string;
  icon?: ReactNode;
  className?: string;
}> = ({ onClick, label, icon, className }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={clsx(
      'hidden mobile:flex fixed end-[16px] z-[160] w-[56px] h-[56px] rounded-full',
      'bottom-[calc(var(--bottom-nav-h,64px)+16px)]',
      'bg-btnPrimary text-white items-center justify-center',
      'shadow-[0_6px_20px_rgba(30,111,217,0.45)] tap-shrink',
      className
    )}
  >
    {icon || (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    )}
  </button>
);
