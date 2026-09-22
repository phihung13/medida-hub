import { FC, useCallback } from 'react';
import clsx from 'clsx';
import { ChevronUpIcon } from '@gitroom/frontend/components/ui/icons';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const Arrow: FC<{
  flip: boolean;
}> = (props) => {
  const { flip } = props;
  return (
    <ChevronUpIcon
      style={{
        transform: !flip ? 'rotate(180deg)' : '',
      }}
    />
  );
};
export const UpDownArrow: FC<{
  isUp: boolean;
  isDown: boolean;
  onChange: (type: 'up' | 'down') => void;
}> = (props) => {
  const { isUp, isDown, onChange } = props;
  const t = useT();
  const changePosition = useCallback(
    (type: 'up' | 'down') => () => {
      onChange(type);
    },
    [onChange]
  );

  // WCAG 2.2 "Target Size (Minimum)" cần 24x24px, và nút chỉ có icon thì phải
  // có tên đọc được (aria-label) — trước đây là 20x20 và không có nhãn nào.
  // Dùng `disabled` thay cho pointer-events-none để trình đọc màn hình biết
  // nút đang không bấm được thay vì mời người dùng bấm vào chỗ chết.
  const buttonClass =
    'outline-none w-[24px] h-[24px] flex justify-center items-center rounded-[4px] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:text-textColor disabled:cursor-default';

  return (
    <div className="flex flex-col gap-[8px] pt-[8px]">
      <button
        type="button"
        disabled={!isUp}
        onClick={changePosition('up')}
        aria-label={t('move_post_up', 'Move up')}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('move_post_up', 'Move up')}
        className={clsx(buttonClass, isUp && 'cursor-pointer')}
      >
        <Arrow flip={true} />
      </button>
      <button
        type="button"
        disabled={!isDown}
        onClick={changePosition('down')}
        aria-label={t('move_post_down', 'Move down')}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('move_post_down', 'Move down')}
        className={clsx(buttonClass, isDown && 'cursor-pointer')}
      >
        <Arrow flip={false} />
      </button>
    </div>
  );
};
