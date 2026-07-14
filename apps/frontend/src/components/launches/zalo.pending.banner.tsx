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
    <div className="border border-amber-400/40 bg-amber-400/10 rounded-[8px] px-[16px] py-[10px] flex items-center gap-[10px] text-[14px] flex-wrap mobile:flex-nowrap mobile:px-[12px] mobile:py-[6px]">
      <span className="text-[16px]">⏳</span>
      <div className="flex-1 min-w-[240px] mobile:min-w-0 mobile:truncate">
        <b>{count}</b>{' '}
        {/* Mobile 1 dòng: câu dài đổi thành nhãn ngắn, bấm nút để xem chi tiết */}
        <span className="mobile:hidden">
          {t(
            'zalo_pending_banner',
            'posts from the Zalo group are awaiting approval — click a post with the amber border on the calendar to edit & schedule it.'
          )}
        </span>
        <span className="hidden mobile:inline">
          {t('zalo_pending_banner_short', 'Zalo posts awaiting approval')}
        </span>
      </div>
      <button
        onClick={goList}
        className="cursor-pointer h-[32px] px-[14px] rounded-[6px] bg-btnSimple text-btnText text-[13px] font-[600] mobile:shrink-0 mobile:h-[44px] mobile:px-[16px] tap-shrink"
      >
        {t('zalo_pending_view_list', 'View list')}
      </button>
    </div>
  );
};
