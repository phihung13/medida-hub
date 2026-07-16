'use client';

import { create } from 'zustand';
import { FC } from 'react';
import clsx from 'clsx';
import { VideoOrImage } from '@gitroom/react/helpers/video.or.image';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';

// ============================================================================
//  BỐ CỤC ẢNH KIỂU FACEBOOK — dùng chung cho widget ảnh (chọn khung + kéo ô
//  đổi thứ tự) và khung Post Preview bên phải, để hai bên luôn khớp nhau.
//
//  LƯU Ý QUAN TRỌNG: đây chỉ là MÔ PHỎNG để ngắm trước. Facebook Graph API
//  không nhận tham số bố cục — FB tự dàn theo tỉ lệ ảnh đầu và số lượng ảnh,
//  nên khung chọn ở đây KHÔNG đổi được bài thật. Muốn ép bố cục thật thì phải
//  ghép nhiều ảnh thành MỘT file rồi đăng như ảnh đơn.
// ============================================================================

export type FrameVariant =
  | 'v2col' // 2 ảnh đứng cạnh nhau
  | 'v2row' // 2 ảnh ngang chồng nhau
  | 'topBig' // 1 TO trên + 2/3 nhỏ dưới (ảnh đầu ngang)
  | 'leftBig' // 1 TO trái + 2/3 nhỏ phải (ảnh đầu dọc)
  | 'cols3' // 3 cột đứng
  | 'grid22' // lưới 2×2
  | 'fiveTop2' // 2 TO trên + 3 nhỏ dưới (+N)
  | 'fiveTop1' // 1 TO trên + 4 nhỏ dưới (+N)
  | 'grid'; // lưới 3 cột đều (kiểu IG)

// Khung 5-ảnh chỉ hiện 5 ô đầu (đúng FB), ô thứ 5 phủ "+N".
export const FRAME_MAX_TILES = 5;

// Biến thể áp dụng được cho từng số ảnh — nút chọn hiện đúng nhóm này, và
// phần tử ĐẦU chính là mặc định (xem resolveFrameVariant).
export const frameVariantsFor = (n: number): FrameVariant[] => {
  if (n <= 1) return ['grid'];
  if (n === 2) return ['v2col', 'v2row', 'grid'];
  if (n === 3) return ['topBig', 'leftBig', 'cols3', 'grid'];
  if (n === 4) return ['topBig', 'leftBig', 'grid22', 'grid'];
  return ['fiveTop2', 'fiveTop1', 'grid'];
};

// Biến thể đang chọn có hợp với số ảnh hiện tại không; không thì lấy mặc định
// của nhóm. Nhờ vậy bài NHIỀU ẢNH (5+) luôn ra 'fiveTop2' = "2 top + 3 below".
export const resolveFrameVariant = (
  variant: FrameVariant,
  n: number
): FrameVariant => {
  const list = frameVariantsFor(n);
  return list.includes(variant) ? variant : list[0];
};

export const frameWrapCls = (variant: FrameVariant, n: number): string => {
  switch (variant) {
    case 'v2col': return 'grid grid-cols-2 gap-[3px]';
    case 'v2row': return 'grid grid-cols-1 gap-[3px]';
    case 'topBig': return n === 3 ? 'grid grid-cols-2 gap-[3px]' : 'grid grid-cols-3 gap-[3px]';
    case 'leftBig':
      return n === 3
        ? 'grid grid-cols-3 grid-rows-2 gap-[3px] h-[320px]'
        : 'grid grid-cols-3 grid-rows-3 gap-[3px] h-[390px]';
    case 'cols3': return 'grid grid-cols-3 gap-[3px]';
    case 'grid22': return 'grid grid-cols-2 gap-[3px]';
    case 'fiveTop2': return 'grid grid-cols-6 gap-[3px]';
    case 'fiveTop1': return 'grid grid-cols-4 gap-[3px]';
    default: return 'grid grid-cols-3 gap-[3px]'; // grid
  }
};

export const frameItemCls = (
  variant: FrameVariant,
  n: number,
  i: number
): string => {
  switch (variant) {
    case 'v2col': return 'aspect-[3/4]';
    case 'v2row': return 'aspect-[16/8]';
    case 'topBig':
      if (n === 3) return i === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-square';
      return i === 0 ? 'col-span-3 aspect-[16/8]' : 'aspect-square';
    case 'leftBig':
      if (n === 3) return i === 0 ? 'col-span-2 row-span-2 h-full min-h-0' : 'col-span-1 h-full min-h-0';
      return i === 0 ? 'col-span-2 row-span-3 h-full min-h-0' : 'col-span-1 row-span-1 h-full min-h-0';
    case 'cols3': return 'aspect-[3/4]';
    case 'grid22': return 'aspect-[4/3]';
    case 'fiveTop2': return i < 2 ? 'col-span-3 aspect-[4/3]' : 'col-span-2 aspect-square';
    case 'fiveTop1': return i === 0 ? 'col-span-4 aspect-[16/9]' : 'aspect-square';
    default: return 'aspect-square'; // grid
  }
};

// Biến thể người dùng đang chọn — để trong store nhỏ dùng chung vì widget ảnh
// (bên trái) và khung Post Preview (bên phải) là hai cây component tách rời.
// Mặc định 'topBig': hợp cho bài 3-4 ảnh, còn bài 5+ ảnh thì resolve xuống
// 'fiveTop2' đúng như yêu cầu "nhiều ảnh thì luôn 2 top + 3 below".
export const useFrameVariant = create<{
  variant: FrameVariant;
  setVariant: (variant: FrameVariant) => void;
}>((set) => ({
  variant: 'topBig',
  setVariant: (variant) => set({ variant }),
}));

// Bố cục CHỈ ĐỂ XEM (không kéo thả, không đánh số) — dùng trong Post Preview.
export const FrameCollage: FC<{
  media: Array<{ path: string }>;
  className?: string;
}> = ({ media, className }) => {
  const mediaDir = useMediaDirectory();
  const variant = useFrameVariant((state) => state.variant);
  const n = media.length;
  const active = resolveFrameVariant(variant, n);
  const isFive = active.startsWith('five');
  const shown = isFive ? media.slice(0, FRAME_MAX_TILES) : media;
  const hidden = isFive ? n - FRAME_MAX_TILES : 0;

  return (
    <div className={clsx('w-full overflow-hidden', frameWrapCls(active, n), className)}>
      {shown.map((m, i) => (
        <a
          key={`frame_${i}`}
          href={mediaDir.set(m.path)}
          target="_blank"
          className={clsx('relative overflow-hidden bg-newBgColor', frameItemCls(active, n, i))}
        >
          <VideoOrImage autoplay={true} src={mediaDir.set(m.path)} />
          {i === FRAME_MAX_TILES - 1 && hidden > 0 && (
            <div className="absolute inset-0 bg-black/55 grid place-items-center text-white text-[26px] font-[800]">
              +{hidden}
            </div>
          )}
        </a>
      ))}
    </div>
  );
};
