'use client';

import { FC, useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { expandPosts } from '@gitroom/helpers/utils/posts.list.minify';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ============================================================================
//  Banner "chờ duyệt" trên trang Calendar: đếm bài DRAFT gắn tag "Zalo"
//  (do bot Zalo đẩy vào) trong cửa sổ ±7 ngày, tự refresh mỗi 60s.
//  Có bài mới → tự reload calendar để bài hiện ngay, không cần F5.
// ============================================================================

// Hook SWR riêng (đúng rules-of-hooks): quét draft quanh hôm nay.
const useZaloPendingDrafts = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const params = new URLSearchParams({
      display: 'week',
      customer: '',
      startDate: newDayjs().subtract(7, 'day').startOf('day').utc().format(),
      endDate: newDayjs().add(7, 'day').endOf('day').utc().format(),
    }).toString();
    const data = await (await fetch(`/posts?${params}`)).json();
    return expandPosts(data);
  }, []);

  return useSWR('zalo-pending-drafts', load, {
    refreshInterval: 60000,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
  });
};

export const ZaloPendingBanner: FC = () => {
  const t = useT();
  const { data } = useZaloPendingDrafts();
  const { reloadCalendarView, setFilters, startDate, endDate, customer, setListState } =
    useCalendar();

  const count = useMemo(
    () =>
      (data?.posts || []).filter(
        (p: any) =>
          p.state === 'DRAFT' &&
          p.tags?.some(
            (tg: any) => tg?.tag?.name?.toLowerCase() === 'zalo'
          )
      ).length,
    [data]
  );

  // Bài mới từ Zalo → reload calendar cho hiện ngay.
  const prev = useRef(-1);
  useEffect(() => {
    if (prev.current >= 0 && count > prev.current) {
      reloadCalendarView();
    }
    prev.current = count;
  }, [count, reloadCalendarView]);

  const goList = useCallback(() => {
    setListState('draft');
    setFilters({
      startDate,
      endDate,
      display: 'list',
      customer,
    });
  }, [setListState, setFilters, startDate, endDate, customer]);

  if (!count) {
    return null;
  }

  return (
    // Trước là một câu dài ("…bấm vào bài viền vàng trên lịch để sửa & lên
    // lịch") + emoji ⏳. Viền vàng trên thẻ bài đã tự nói "chờ duyệt", và nút
    // bên phải đã là lối vào — banner chỉ cần con số. Dùng luôn nhãn ngắn vốn
    // chỉ dành cho mobile, cho mọi kích thước màn hình.
    <div className="border border-amber-400/40 bg-amber-400/10 rounded-[8px] px-[16px] py-[8px] flex items-center gap-[10px] text-[14px] flex-nowrap mobile:px-[12px] mobile:py-[6px]">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-amber-400 shrink-0"
        aria-hidden="true"
      >
        <path d="M6 2h12M6 22h12M7 2c0 5 10 5 10 10S7 17 7 22M17 2c0 5-10 5-10 10s10 5 10 10" />
      </svg>
      <div className="flex-1 min-w-0 truncate">
        <b>{count}</b>{' '}
        {t('zalo_pending_banner_short', 'Zalo posts awaiting approval')}
      </div>
      <button
        type="button"
        onClick={goList}
        className="cursor-pointer h-[32px] px-[14px] rounded-[6px] bg-btnSimple text-btnText text-[13px] font-[600] mobile:shrink-0 mobile:h-[44px] mobile:px-[16px] tap-shrink"
      >
        {t('zalo_pending_view_list', 'View list')}
      </button>
    </div>
  );
};
