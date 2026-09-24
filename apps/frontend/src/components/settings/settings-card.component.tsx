'use client';

import { FC, ReactNode, useId, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Khung dùng chung cho các khối API key ở tab "Cài đặt toàn cục":
// 1 dòng tiêu đề (tên dịch vụ + trạng thái + nút ⓘ). Đoạn giải thích dài
// được GẬP vào disclosure — không xoá chữ nào, chỉ giấu bớt cho gọn.

// Button dùng chung (@gitroom/react/form/button) mặc định là `bg-forth` (tím).
// Tailwind xếp các class cùng plugin theo alphabet nên `bg-btnPrimary` /
// `bg-btnSimple` luôn thua `bg-forth` → bắt buộc dùng `!` mới đè được.
export const settingsPrimaryBtn = '!bg-btnPrimary rounded-[8px] h-[42px]';
export const settingsNeutralBtn =
  '!bg-btnSimple !text-btnText rounded-[8px] h-[42px]';
// Cùng chiều cao / bo góc / màu nền với <Input /> để hàng điều khiển thẳng nhau.
export const settingsSelect =
  'bg-newBgColorInner border border-newTableBorder rounded-[8px] h-[42px] px-[12px] text-[14px] text-textColor outline-none cursor-pointer disabled:opacity-50';

const InfoIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M10 9V13.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="10" cy="6.5" r="0.9" fill="currentColor" />
  </svg>
);

// Trạng thái key: chấm + chữ (không chỉ dựa vào màu).
export const KeyStatus: FC<{
  ok: boolean;
  okLabel?: string;
  missingLabel?: string;
}> = ({ ok, okLabel, missingLabel }) => {
  const t = useT();
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-[6px] text-[12px] font-[600] whitespace-nowrap shrink-0',
        ok ? 'text-newTextColor' : 'text-newTextColor/60'
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'w-[8px] h-[8px] rounded-full shrink-0',
          ok ? 'bg-btnPrimary' : 'border-[1.5px] border-current'
        )}
      />
      {ok
        ? okLabel || t('key_status_saved', 'Đã lưu')
        : missingLabel || t('key_status_missing', 'Chưa có key')}
    </span>
  );
};

// Tiêu đề khối + nút ⓘ mở/đóng phần hướng dẫn (children).
// level="section" dùng cho khối con bên trong 1 card.
export const SettingsCardHeader: FC<{
  title: ReactNode;
  status?: ReactNode;
  level?: 'card' | 'section';
  children?: ReactNode;
}> = ({ title, status, level = 'card', children }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Heading = level === 'card' ? 'h3' : 'h4';
  const helpLabel = t('settings_help', 'Hướng dẫn');
  return (
    <div className={level === 'card' ? 'mb-[16px]' : 'mb-[12px]'}>
      <div className="flex items-center gap-[10px] min-h-[32px]">
        <Heading
          className={clsx(
            'flex-1 min-w-0',
            level === 'card' ? 'text-[18px]' : 'text-[14px] font-[600]'
          )}
        >
          {title}
        </Heading>
        {status}
        {!!children && (
          // type="button": khối này nằm trong <form> của SettingsPopup —
          // thiếu type sẽ submit form.
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={helpLabel}
            title={helpLabel}
            onClick={() => setOpen((o) => !o)}
            className={clsx(
              'w-[32px] h-[32px] shrink-0 rounded-[8px] flex items-center justify-center transition-colors hover:bg-boxHover',
              open
                ? 'text-btnPrimary'
                : 'text-newTextColor/60 hover:text-newTextColor'
            )}
          >
            <InfoIcon />
          </button>
        )}
      </div>
      {!!children && (
        <div
          id={panelId}
          hidden={!open}
          // Toggle cả class: `flex` (utility) đè được [hidden] của preflight.
          className={clsx(
            'mt-[10px] p-[12px] rounded-[8px] bg-newBgColorInner border border-newTableBorder text-[13px] leading-[1.6] text-newTextColor/70 flex-col gap-[8px]',
            open ? 'flex' : 'hidden'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// Danh sách model: nhãn trong dropdown chỉ còn tên model; ghi chú (đời, giá,
// điểm mạnh) chuyển vào phần ⓘ qua <ModelNotes />. `id` = value đã lưu ở
// backend — KHÔNG được đổi.
export type ModelOption = {
  id: string;
  name: string;
  note?: string;
  recommended?: boolean;
};

export const ModelOptions: FC<{ models: ModelOption[] }> = ({ models }) => {
  const t = useT();
  const rec = t('model_recommended', 'Khuyên dùng');
  return (
    <>
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.recommended ? `${m.name} · ${rec}` : m.name}
        </option>
      ))}
    </>
  );
};

export const ModelNotes: FC<{ models: ModelOption[] }> = ({ models }) => (
  <ul className="flex flex-col gap-[2px]">
    {models
      .filter((m) => !!m.note)
      .map((m) => (
        <li key={m.id}>
          <span className="text-newTextColor">{m.name}</span> — {m.note}
        </li>
      ))}
  </ul>
);
