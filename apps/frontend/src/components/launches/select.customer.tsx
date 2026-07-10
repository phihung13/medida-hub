'use client';

import { uniqBy } from 'lodash';
import React, { FC, useCallback, useMemo, useRef, useState } from 'react';
import {
  Integrations,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { UserIcon, DropdownArrowIcon } from '@gitroom/frontend/components/ui/icons';

// Chọn KHÁCH HÀNG (nhóm kênh) hoặc TỪNG PAGE/kênh — chọn page thì lịch chỉ
// hiện bài của page đó (lọc client-side qua calendar.context.channel).
export const SelectCustomer: FC<{
  onChange: (value: string) => void;
  integrations: Integrations[];
  customer?: string;
}> = (props) => {
  const { onChange, integrations, customer: currentCustomer } = props;
  const { setCurrent } = useLaunchStore(
    useShallow((state) => ({
      setCurrent: state.setCurrent,
    }))
  );
  const { channel, setChannel } = useCalendar();
  const toaster = useToaster();
  const t = useT();
  const [customer, setCustomer] = useState(currentCustomer || '');
  const [pos, setPos] = useState<any>({});
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => {
    if (open) {
      setOpen(false);
    }
  });

  const openClose = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    const { x, y, width, height } = ref.current?.getBoundingClientRect();
    setPos({ top: y + height, left: x });
    setOpen(true);
  }, [open]);

  const totalCustomers = useMemo(() => {
    return uniqBy(integrations, (i) => i?.customer?.id).length;
  }, [integrations]);
  const selectedChannel = useMemo(
    () => integrations.find((i: any) => i.id === channel) as any,
    [integrations, channel]
  );
  // Vẫn hiện khi chỉ 1 customer — vì còn dùng để chọn từng page.
  if (totalCustomers <= 1 && integrations.length <= 1) {
    return null;
  }

  return (
    <div className="relative select-none z-[500]" ref={ref}>
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content={t('select_customer_or_page_tooltip', 'Select customer or a single page')}
        onClick={openClose}
        className={clsx(
          'relative z-[20] cursor-pointer h-[42px] rounded-[8px] pl-[16px] pr-[12px] gap-[8px] border flex items-center',
          open ? 'border-[#1e6fd9]' : selectedChannel ? 'border-btnPrimary/60' : 'border-newColColor'
        )}
      >
        {selectedChannel ? (
          <div className="flex items-center gap-[7px] max-w-[170px]">
            {(selectedChannel as any).picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(selectedChannel as any).picture} alt="" className="w-[22px] h-[22px] rounded-full object-cover" />
            ) : (
              <span className="w-[22px] h-[22px] rounded-full bg-btnPrimary/25 grid place-items-center text-[11px] font-[800]">
                {String(selectedChannel.name || '?').charAt(0)}
              </span>
            )}
            <span className="text-[13px] font-[600] truncate">{selectedChannel.name}</span>
          </div>
        ) : (
          <div>
            <UserIcon />
          </div>
        )}
        <div>
          <DropdownArrowIcon rotated={open} />
        </div>
      </div>
      {open && (
        <div
          style={pos}
          className="flex flex-col fixed pt-[12px] pb-[8px] bg-newBgColorInner menu-shadow min-w-[270px] max-h-[420px] overflow-auto"
        >
          {/* Bỏ lọc — xem mọi kênh */}
          <div
            onClick={() => {
              setChannel(null);
              setCustomer('');
              onChange('');
              setOpen(false);
              setCurrent('global');
            }}
            className={clsx(
              'p-[12px] hover:bg-newBgColor text-[14px] font-[600] h-[36px] flex items-center gap-[8px]',
              !channel && !customer && 'text-btnPrimary'
            )}
          >
            🌐 {t('all_channels', 'All channels')}
          </div>

          {totalCustomers > 1 && (
            <>
              <div className="text-[11px] font-[700] uppercase tracking-[0.05em] text-textItemBlur px-[12px] mt-[6px] mb-[4px]">
                {t('customers', 'Customers')}
              </div>
              {uniqBy(integrations, (u) => u?.customer?.name)
                .filter((f) => f.customer?.name)
                .map((p) => (
                  <div
                    onClick={() => {
                      toaster.show(
                        t('customer_socials_selected', 'Customer socials selected'),
                        'success'
                      );
                      setChannel(null); // chọn khách hàng → bỏ lọc page
                      setCustomer(p.customer?.id);
                      onChange(p.customer?.id);
                      setOpen(false);
                      setCurrent('global');
                    }}
                    key={p.customer?.id}
                    className="p-[12px] hover:bg-newBgColor text-[14px] font-[500] h-[32px] flex items-center"
                  >
                    {p.customer?.name}
                  </div>
                ))}
            </>
          )}

          {/* Từng page/kênh — chọn để xem lịch riêng của page đó */}
          <div className="text-[11px] font-[700] uppercase tracking-[0.05em] text-textItemBlur px-[12px] mt-[6px] mb-[4px]">
            {t('single_pages', 'Single pages')}
          </div>
          {integrations.map((p: any) => (
            <div
              key={p.id}
              onClick={() => {
                setChannel(p.id);
                setOpen(false);
                toaster.show(
                  `${t('page_calendar_selected', 'Showing calendar for')}: ${p.name}`,
                  'success'
                );
              }}
              className={clsx(
                'px-[12px] py-[7px] hover:bg-newBgColor text-[13.5px] font-[500] flex items-center gap-[9px]',
                channel === p.id && 'text-btnPrimary font-[700]'
              )}
            >
              {p.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.picture} alt="" className="w-[24px] h-[24px] rounded-full object-cover" />
              ) : (
                <span className="w-[24px] h-[24px] rounded-full bg-btnPrimary/25 grid place-items-center text-[11px] font-[800]">
                  {String(p.name || '?').charAt(0)}
                </span>
              )}
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[10.5px] text-textItemBlur uppercase">{p.identifier}</span>
              {channel === p.id && <span>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
