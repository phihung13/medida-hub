'use client';

import { FC, KeyboardEvent, useCallback } from 'react';
import clsx from 'clsx';
export const Slider: FC<{
  value: 'on' | 'off';
  fill?: boolean;
  onChange: (value: 'on' | 'off') => void;
}> = (props) => {
  const { value, onChange, fill } = props;
  const change = useCallback(() => {
    onChange(value === 'on' ? 'off' : 'on');
  }, [value]);

  // Bàn phím: Space/Enter gạt công tắc như công tắc thật.
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        change();
      }
    },
    [change]
  );

  return (
    // Trạng thái bật trước dùng bg-customColor4 (tím #8155dd — nhóm token
    // --color-custom* đã deprecated) nên là màu nhấn thứ hai giữa giao diện.
    // Giờ dùng màu nhấn chính. Núm gạt: customColor5 (#e9e9f1) -> #e9e9f1 viết
    // thẳng, cùng màu, bỏ phụ thuộc token deprecated.
    // role="switch"/aria-checked/tabIndex: trước là <div onClick> trần.
    <div
      role="switch"
      aria-checked={value === 'on'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={clsx(
        'w-[57px] h-[34px] p-[4px] border-fifth border rounded-[100px] cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary',
        value === 'on' && fill && 'bg-btnPrimary'
      )}
      onClick={change}
    >
      <div className="w-full h-full relative rounded-[100px]">
        <div
          className={clsx(
            'absolute left-0 top-0 w-[24px] h-[24px] bg-[#e9e9f1] rounded-full transition-all cursor-pointer',
            value === 'on' ? 'left-[100%] -translate-x-[100%]' : 'left-0'
          )}
        />
      </div>
    </div>
  );
};
