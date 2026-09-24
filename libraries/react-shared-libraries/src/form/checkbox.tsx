'use client';

import { FC, KeyboardEvent, forwardRef, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useFormContext, useWatch } from 'react-hook-form';
export const Checkbox = forwardRef<
  null,
  {
    checked?: boolean;
    disableForm?: boolean;
    name?: string;
    className?: string;
    label?: string;
    onChange?: (event: {
      target: {
        name?: string;
        value: boolean;
      };
    }) => void;
    variant?: 'default' | 'hollow';
  }
>((props, ref: any) => {
  const { checked, className, label, disableForm, variant } = props;
  const form = useFormContext();
  const register = disableForm ? {} : form.register(props.name!);
  const watch = disableForm ? false : form.watch(props.name!);
  const val = watch || checked;

  const changeStatus = useCallback(() => {
    props?.onChange?.({
      target: {
        name: props.name!,
        value: !val,
      },
    });
    if (!disableForm) {
      // @ts-ignore
      register?.onChange?.({
        target: {
          name: props.name!,
          value: !val,
        },
      });
    }
  }, [val]);

  // Bàn phím: Space/Enter bật tắt như ô tích thật.
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        changeStatus();
      }
    },
    [changeStatus]
  );

  const isDefault = variant === 'default' || !variant;

  return (
    <div className="flex gap-[10px] items-center">
      {/* Kiểu mặc định trước đây LUÔN là khối tím đặc (bg-forth #612ad5) dù tích
          hay chưa — chỉ khác nhau ở dấu ✓, nên ô chưa tích trông như đã chọn;
          tím còn là một màu nhấn thứ hai giữa giao diện. Giờ: chưa tích = khung
          viền trung tính, đã tích = nền màu nhấn chính (btnPrimary).
          role/aria-checked/tabIndex: trước là <div onClick> trần, bàn phím và
          trình đọc màn hình không dùng được. Các thuộc tính này đặt SAU spread
          register để không đè lên onChange/name/ref của react-hook-form. */}
      <div
        ref={ref}
        {...disableForm ? {} : form.register(props.name!)}
        onClick={changeStatus}
        role="checkbox"
        aria-checked={!!val}
        aria-label={label || undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={clsx(
          'cursor-pointer rounded-[4px] select-none w-[24px] h-[24px] min-w-[24px] justify-center items-center flex text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary focus-visible:ring-offset-1',
          isDefault
            ? val
              ? 'bg-btnPrimary'
              : 'border-2 border-newSep bg-transparent'
            : 'border-customColor1 border-2 bg-customColor2',
          className
        )}
      >
        {val && (
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        )}
      </div>
      {/* Bấm vào chữ nhãn cũng tích được — trước đây phải bấm trúng ô 24px.
          aria-hidden vì ô tích đã mang aria-label, tránh đọc lặp hai lần. */}
      {!!label && (
        <div
          aria-hidden="true"
          onClick={changeStatus}
          className="cursor-pointer select-none"
        >
          {label}
        </div>
      )}
    </div>
  );
});
