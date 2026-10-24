'use client';

import { FC, ReactNode, useEffect } from 'react';
import clsx from 'clsx';
import type { Alert, Sev } from '@gitroom/frontend/components/media-board/logic';

// Bảng màu cảnh báo dùng chung (khớp tông đỏ/xanh lá các trang Hub khác).
export const SEV_CLS: Record<string, string> = {
  red: 'bg-[#FF5A52]/15 text-[#FF5A52]',
  amber: 'bg-[#E8A33D]/15 text-[#D08A22]',
  green: 'bg-[#2FB37A]/15 text-[#2FB37A]',
  '': 'bg-newBgColor text-textColor',
};

export const inputCls =
  'h-[36px] px-[10px] text-[13.5px] bg-newBgColorInner text-textColor border border-newBgLineColor rounded-[8px] min-w-0 outline-none focus:border-btnPrimary';

export const btnCls = (kind: 'default' | 'primary' | 'danger' = 'default', sm = false) =>
  clsx(
    'inline-flex items-center justify-center gap-[6px] rounded-[8px] font-[600] whitespace-nowrap border transition-colors disabled:opacity-50',
    sm ? 'h-[28px] px-[9px] text-[12px]' : 'h-[36px] px-[12px] text-[13px]',
    kind === 'primary' && 'bg-btnPrimary border-btnPrimary text-white hover:opacity-90',
    kind === 'danger' && 'bg-transparent border-[#FF5A52]/40 text-[#FF5A52] hover:border-[#FF5A52]',
    kind === 'default' && 'bg-newBgColorInner border-newBgLineColor text-textColor hover:border-btnPrimary'
  );

export const AlertList: FC<{ alerts: Alert[] }> = ({ alerts }) =>
  alerts.length ? (
    <div className="flex flex-col gap-[3px]">
      {alerts.map((x, i) => (
        <div key={i} className={clsx('text-[11.5px] font-[600] px-[7px] py-[3px] rounded-[4px]', SEV_CLS[x[0]])}>
          {x[1]}
        </div>
      ))}
    </div>
  ) : null;

export const Pill: FC<{ sev: Sev | 'green' | ''; children: ReactNode }> = ({ sev, children }) => (
  <span className={clsx('inline-block text-[11px] font-[600] px-[7px] py-[1px] rounded-full whitespace-nowrap', SEV_CLS[sev])}>
    {children}
  </span>
);

export const ExtLink: FC<{ href: string; children: ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-btnPrimary font-[600] hover:underline">
    {children}
  </a>
);

export const Field: FC<{ label: string; htmlFor?: string; help?: ReactNode; className?: string; children: ReactNode }> = ({
  label,
  htmlFor,
  help,
  className,
  children,
}) => (
  <div className={clsx('flex flex-col gap-[4px] min-w-0', className)}>
    <label htmlFor={htmlFor} className="text-[12px] font-[600] text-textItemBlur">
      {label}
    </label>
    {children}
    {help ? <span className="text-[11.5px] text-textItemBlur">{help}</span> : null}
  </div>
);

export const Fieldset: FC<{ legend: string; children: ReactNode }> = ({ legend, children }) => (
  <fieldset className="border border-newBgLineColor rounded-[8px] p-[12px] m-0 flex flex-col gap-[12px] min-w-0">
    <legend className="text-[12px] font-[700] uppercase tracking-[.05em] px-[6px] text-btnPrimary">{legend}</legend>
    {children}
  </fieldset>
);

// Sheet trượt bên phải (thay .scrim/.sheet bản gốc). Esc hoặc bấm nền để đóng.
export const Sheet: FC<{ onClose: () => void; wide?: boolean; children: ReactNode }> = ({ onClose, wide, children }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[300] bg-black/45 flex justify-end"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'bg-newBgColorInner text-textColor h-full overflow-y-auto p-[20px] flex flex-col gap-[14px] w-full',
          wide ? 'max-w-[860px]' : 'max-w-[580px]'
        )}
      >
        {children}
      </div>
    </div>
  );
};
