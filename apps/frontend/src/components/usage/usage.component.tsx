'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  normalizePath,
  setUsageSender,
  startUsageTracking,
  trackFeature,
  trackPageView,
} from '@gitroom/frontend/components/usage/usage.tracker';

// Câu thông báo bắt buộc của chuẩn Major OS (mục 9) — giữ nguyên văn.
export const USAGE_NOTICE =
  'Ứng dụng ghi nhận thời gian và tính năng sử dụng để cải thiện sản phẩm.';
const NOTICE_KEY = 'hub_usage_notice_v1';

/** Gắn một lần trong layout: bật phiên/nhịp, ghi xem trang, nối hàm gửi. */
export const UsageTracker: FC = () => {
  const fetch = useFetch();
  const pathname = usePathname();

  useEffect(() => {
    setUsageSender(async (events, keepalive) => {
      try {
        const res = await fetch('/usage/events', {
          method: 'POST',
          body: JSON.stringify({ events }),
          keepalive,
        });
        // 429 / 5xx -> gửi lại sau; 2xx/4xx khác -> xong (gửi lại y hệt vô ích).
        return res.status !== 429 && res.status < 500;
      } catch {
        return false;
      }
    });
    const stop = startUsageTracking();
    return () => {
      stop();
      setUsageSender(null);
    };
  }, [fetch]);

  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  return <UsageNotice />;
};

// Dải nhỏ hiện MỘT lần mỗi trình duyệt. Câu này còn nằm cố định ở cuối
// khung "Góp ý" để ai cũng xem lại được.
const UsageNotice: FC = () => {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(!localStorage.getItem(NOTICE_KEY));
    } catch {
      setShow(false);
    }
  }, []);

  const close = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(NOTICE_KEY, '1');
    } catch {
      /* chế độ riêng tư — lần sau hiện lại, chấp nhận */
    }
  }, []);

  if (!show) return null;
  return (
    <div
      role="status"
      className="fixed z-[160] start-[16px] bottom-[16px] max-w-[420px] mobile:start-[12px] mobile:end-[12px] mobile:max-w-none mobile:bottom-[calc(var(--bottom-nav-h,64px)+8px)] flex items-center gap-[12px] bg-newBgColorInner border border-newTableBorder rounded-[12px] shadow-lg px-[14px] py-[10px] text-[13px] leading-[1.5] text-newTextColor"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-textItemBlur">
        <path d="M3 3v18h18" />
        <path d="m7 15 4-4 3 3 5-6" />
      </svg>
      <span className="flex-1">{t('usage_notice', USAGE_NOTICE)}</span>
      <button
        type="button"
        onClick={close}
        className="shrink-0 h-[32px] mobile:h-[40px] px-[12px] rounded-[8px] bg-btnSimple text-btnText text-[13px] font-[600] outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary"
      >
        {t('usage_notice_ok', 'Đã hiểu')}
      </button>
    </div>
  );
};

const FEEDBACK_TYPES = [
  { value: 'loi', label: 'Báo lỗi' },
  { value: 'de_xuat', label: 'Đề xuất' },
  { value: 'khen', label: 'Khen' },
  { value: 'khac', label: 'Khác' },
] as const;
const MAX_LEN = 4000;

const FeedbackForm: FC<{ close: () => void; page: string }> = ({
  close,
  page,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [type, setType] = useState<string>('de_xuat');
  const [text, setText] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/usage/feedback', {
        method: 'POST',
        body: JSON.stringify({
          loai: type,
          noi_dung: text.trim(),
          trang: page,
          ...(rating ? { muc_hai_long: rating } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        trackFeature('gop-y.gui', { extra: { loai: type } });
        toaster.show(t('feedback_sent', 'Đã gửi góp ý — cảm ơn bạn!'), 'success');
        close();
        return;
      }
      setError(data?.error || t('feedback_failed', 'Chưa gửi được, thử lại sau ít phút.'));
    } catch {
      setError(t('feedback_failed', 'Chưa gửi được, thử lại sau ít phút.'));
    } finally {
      setSending(false);
    }
  }, [text, type, rating, page, sending]);

  return (
    <div className="flex flex-col gap-[16px] text-newTextColor">
      <div
        role="radiogroup"
        aria-label={t('feedback_type', 'Loại góp ý')}
        className="flex flex-wrap gap-[8px]"
      >
        {FEEDBACK_TYPES.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={type === o.value}
            onClick={() => setType(o.value)}
            className={clsx(
              'h-[34px] mobile:h-[44px] px-[14px] rounded-full border text-[13px] font-[600] outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary',
              type === o.value
                ? 'bg-btnPrimary border-btnPrimary text-white'
                : 'bg-btnSimple border-newTableBorder text-btnText'
            )}
          >
            {t(`feedback_type_${o.value}`, o.label)}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="text-[12.5px] font-[600]">
          {t('feedback_content', 'Nội dung')}
        </span>
        <textarea
          autoFocus
          value={text}
          maxLength={MAX_LEN}
          rows={5}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            type === 'loi'
              ? t('feedback_ph_bug', 'Bạn đang làm gì thì gặp lỗi? Lỗi hiện ra thế nào?')
              : t('feedback_ph', 'Bạn muốn Hub làm tốt hơn ở đâu?')
          }
          className="bg-newBgColorInner border-newTableBorder border rounded-[8px] p-[12px] text-[13px] leading-[1.6] outline-none resize-y w-full focus:border-btnPrimary"
        />
        <span className="flex justify-between gap-[8px] text-[11.5px] text-textItemBlur">
          <span>
            {t('feedback_privacy', 'Đừng ghi tên hay số điện thoại học sinh vào góp ý.')}
          </span>
          <span className="tabular-nums shrink-0">
            {text.length}/{MAX_LEN}
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-[6px]">
        <span className="text-[12.5px] font-[600]" id="feedback-rating">
          {t('feedback_rating', 'Mức hài lòng với Hub')}{' '}
          <span className="font-[400] text-textItemBlur">
            {t('feedback_optional', '(không bắt buộc)')}
          </span>
        </span>
        <div
          className="flex gap-[6px]"
          role="group"
          aria-labelledby="feedback-rating"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating === n}
              aria-label={`${n}/5`}
              onClick={() => setRating(rating === n ? null : n)}
              className={clsx(
                'w-[40px] h-[36px] mobile:w-[44px] mobile:h-[44px] rounded-[8px] border text-[14px] font-[700] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary',
                rating !== null && n <= rating
                  ? 'bg-btnPrimary border-btnPrimary text-white'
                  : 'bg-btnSimple border-newTableBorder text-btnText'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {!!error && (
        <div role="alert" className="text-[13px] text-red-500">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-[8px]">
        <button
          type="button"
          onClick={close}
          className="h-[40px] px-[18px] rounded-[8px] bg-btnSimple text-btnText text-[14px] font-[600]"
        >
          {t('cancel', 'Huỷ')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || sending}
          className="h-[40px] px-[18px] rounded-[8px] bg-btnPrimary text-white text-[14px] font-[600] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending
            ? t('feedback_sending', 'Đang gửi…')
            : t('feedback_send', 'Gửi góp ý')}
        </button>
      </div>

      <div className="text-[11.5px] text-textItemBlur border-t border-newTableBorder pt-[10px]">
        {t('usage_notice', USAGE_NOTICE)}
      </div>
    </div>
  );
};

/** Mở khung góp ý (dùng ở nút thanh trên desktop và sheet "Thêm" mobile). */
export const useOpenFeedback = () => {
  const modals = useModals();
  const t = useT();
  const pathname = usePathname();
  return useCallback(() => {
    modals.openModal({
      id: 'hub-feedback',
      title: t('feedback_title', 'Góp ý cho Media Hub'),
      closeOnClickOutside: false,
      children: (close: () => void) => (
        <FeedbackForm close={close} page={normalizePath(pathname || '/')} />
      ),
    });
  }, [pathname]);
};

export const FeedbackIcon: FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 9h8" />
    <path d="M8 13h5" />
  </svg>
);

export const FeedbackButton: FC = () => {
  const t = useT();
  const open = useOpenFeedback();
  const label = t('feedback_title', 'Góp ý cho Media Hub');
  return (
    <button
      type="button"
      onClick={open}
      aria-label={label}
      data-tooltip-id="tooltip"
      data-tooltip-content={label}
      className="hover:text-newTextColor rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary"
    >
      <FeedbackIcon size={24} />
    </button>
  );
};
