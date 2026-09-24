'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { expandPosts } from '@gitroom/helpers/utils/posts.list.minify';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CloseIcon } from '@gitroom/frontend/components/ui/icons';

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

// Số bài Zalo đang chờ duyệt — dùng chung cho banner VÀ chấm đỏ trên thanh
// lọc (nút Danh sách, tab Bản nháp). Cùng khoá SWR 'zalo-pending-drafts' nên
// SWR gộp lại: gọi hook này ở nhiều nơi KHÔNG phát sinh thêm request nào.
export const useZaloPendingCount = () => {
  const { data } = useZaloPendingDrafts();
  return useMemo(
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
};

// Chấm đỏ có số — báo còn bài Zalo chờ duyệt kể cả khi đã ẩn banner.
//  - variant 'corner': đè lên góc nút icon (nút chế độ Danh sách).
//  - variant 'inline': nằm sau chữ (tab Bản nháp).
// Số thật cho trình đọc màn hình nằm trong sr-only; số hiển thị để aria-hidden
// cho khỏi đọc lặp. Quá 99 thì hiện "99+" để không làm phình chấm.
export const PendingBadge: FC<{
  count: number;
  variant?: 'corner' | 'inline';
}> = ({ count, variant = 'corner' }) => {
  const t = useT();
  if (!count) {
    return null;
  }
  const label = `${count} ${t(
    'zalo_pending_banner_short',
    'Zalo posts awaiting approval'
  )}`;
  return (
    <span
      data-tooltip-id="tooltip"
      data-tooltip-content={label}
      className={
        variant === 'corner'
          ? 'absolute -top-[6px] -end-[6px] z-[1] min-w-[18px] h-[18px] px-[5px] rounded-full bg-red-500 text-white text-[11px] font-[700] leading-[18px] text-center pointer-events-none'
          : 'inline-flex items-center justify-center ms-[6px] min-w-[18px] h-[18px] px-[5px] rounded-full bg-red-500 text-white text-[11px] font-[700] leading-none align-middle'
      }
    >
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
};

// Nhớ đã ẩn banner ở con số bao nhiêu (localStorage — chỉ là tuỳ chọn hiển
// thị của từng người, mất cũng không sao). Ẩn VĨNH VIỄN thì bài Zalo mới về
// sẽ không bao giờ được báo lại; nên chỉ ẩn tới khi số bài chờ duyệt TĂNG.
const DISMISS_KEY = 'zaloPendingBannerDismissedAt';
const readDismissed = () => {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
};
const writeDismissed = (n: number) => {
  try {
    localStorage.setItem(DISMISS_KEY, String(n));
  } catch {
    /* chế độ ẩn danh / bị chặn lưu trữ: ẩn trong phiên này thôi */
  }
};

export const ZaloPendingBanner: FC = () => {
  const t = useT();
  const count = useZaloPendingCount();
  const { reloadCalendarView, setFilters, startDate, endDate, customer, setListState } =
    useCalendar();

  const [dismissedAt, setDismissedAt] = useState(0);
  useEffect(() => {
    setDismissedAt(readDismissed());
  }, []);
  // Duyệt bớt bài thì hạ mốc theo — để bài mới về sau đó vẫn làm banner hiện lại.
  useEffect(() => {
    if (count < dismissedAt) {
      setDismissedAt(count);
      writeDismissed(count);
    }
  }, [count, dismissedAt]);
  const dismiss = useCallback(() => {
    setDismissedAt(count);
    writeDismissed(count);
  }, [count]);

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

  // Hook (kể cả effect reload calendar ở trên) vẫn chạy khi banner bị ẩn —
  // chỉ phần hiển thị bị bỏ, bài mới vẫn tự hiện lên lịch như cũ.
  if (!count || count <= dismissedAt) {
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
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('dismiss_notification', 'Dismiss')}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('dismiss_notification', 'Dismiss')}
        className="shrink-0 w-[32px] h-[32px] mobile:w-[44px] mobile:h-[44px] rounded-[6px] flex items-center justify-center text-textItemBlur hover:text-newTextColor hover:bg-boxHover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary"
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
};
