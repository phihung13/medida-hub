'use client';

import { CSSProperties, FC, useCallback, useEffect, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ── Tour giới thiệu app cho member mới ──────────────────────────────────────
// Thay cho onboarding "Connect Channels + video tutorial" cũ: overlay tối,
// khoanh sáng (spotlight) từng mục menu, thẻ mô tả kèm nút Bỏ qua / Tiếp theo.
// Không dùng thư viện ngoài — spotlight = 1 div với box-shadow phủ toàn màn.

interface TourStep {
  selector?: string; // không có selector → thẻ đứng giữa màn hình
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
}

const STEPS: TourStep[] = [
  {
    titleKey: 'tour_welcome_title',
    titleFallback: 'Welcome to Social Hub 👋',
    descKey: 'tour_welcome_desc',
    descFallback:
      "Việt Anh School's social media hub: schedule posts to every channel, pull photos from Zalo groups and clone viral education posts. Press Next for a quick walkthrough.",
  },
  {
    selector: 'a[href="/launches"]',
    titleKey: 'tour_calendar_title',
    titleFallback: 'Calendar',
    descKey: 'tour_calendar_desc',
    descFallback:
      'See every post on a calendar, drag to reschedule, and click an empty slot to create a post for many channels at once.',
  },
  {
    selector: 'a[href="/zalo"]',
    titleKey: 'tour_zalo_title',
    titleFallback: 'Zalo',
    descKey: 'tour_zalo_desc',
    descFallback:
      'The Zalo bot collects photos and posts from the school Zalo groups — pick the good ones and push them straight into the media library.',
  },
  {
    selector: 'a[href="/viral"]',
    titleKey: 'tour_viral_title',
    titleFallback: 'Discover',
    descKey: 'tour_viral_desc',
    descFallback:
      'Capture viral education posts, dissect their formula and clone them into Việt Anh branded posts. Main metric: shares.',
  },
  {
    selector: 'a[href="/agents"]',
    titleKey: 'tour_agents_title',
    titleFallback: 'Agent',
    descKey: 'tour_agents_desc',
    descFallback: 'AI assistants that write captions and generate content on demand.',
  },
  {
    selector: 'a[href="/analytics"]',
    titleKey: 'tour_analytics_title',
    titleFallback: 'Analytics',
    descKey: 'tour_analytics_desc',
    descFallback: 'Channel numbers in one place: views, engagement and growth.',
  },
  {
    selector: 'a[href="/media"]',
    titleKey: 'tour_media_title',
    titleFallback: 'Media',
    descKey: 'tour_media_desc',
    descFallback: 'A shared library of photos & videos used across all posts.',
  },
  {
    selector: 'a[href="/settings"]',
    titleKey: 'tour_settings_title',
    titleFallback: 'Settings',
    descKey: 'tour_settings_desc',
    descFallback:
      'Change your display name and password. Admins manage members and create accounts here.',
  },
  {
    titleKey: 'tour_done_title',
    titleFallback: 'All set! 🎉',
    descKey: 'tour_done_desc',
    descFallback:
      'Start by creating your first post on the Calendar. Happy posting!',
  },
];

// Cùng một href có thể xuất hiện ở cả menu desktop lẫn menu mobile (ẩn) —
// phải lấy bản đang hiển thị (kích thước > 0), không lấy bản đầu tiên trong DOM.
const findVisible = (selector: string): Element | null => {
  const els = Array.from(document.querySelectorAll(selector));
  return (
    els.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) || null
  );
};

export const AppTour: FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Bỏ những bước mà mục menu không tồn tại (vd bị ẩn theo quyền).
  // Lọc trong effect vì `document` không có khi SSR.
  const [steps, setSteps] = useState<TourStep[]>([]);
  useEffect(() => {
    setSteps(STEPS.filter((s) => !s.selector || !!findVisible(s.selector)));
  }, []);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const el = findVisible(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [step]);

  const next = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [isLast, onClose, steps.length]);

  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onClose]);

  if (!step) return null;

  const PAD = 6;
  const cardStyle: CSSProperties = rect
    ? {
        left: Math.min(rect.right + 18, window.innerWidth - 372),
        top: Math.max(
          12,
          Math.min(
            rect.top + rect.height / 2 - 90,
            window.innerHeight - 250
          )
        ),
      }
    : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      };

  return (
    <>
      {/* chặn thao tác với trang phía sau */}
      <div className="fixed inset-0 z-[498]" onClick={next} />
      {/* spotlight: khoanh sáng phần tử, phần còn lại tối */}
      {rect ? (
        <div
          className="fixed z-[499] rounded-[14px] border-2 border-btnPrimary transition-all duration-300 pointer-events-none"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(6, 8, 14, 0.78)',
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[499] bg-[rgba(6,8,14,0.78)] pointer-events-none" />
      )}
      {/* thẻ mô tả */}
      <div
        className="fixed z-[500] w-[354px] mobile:w-[calc(100vw-24px)] bg-newBgColorInner border border-newTableBorder rounded-[16px] p-[20px] flex flex-col gap-[10px] shadow-2xl"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* mũi tên chỉ vào phần tử */}
        {rect && (
          <div
            className="absolute w-[12px] h-[12px] bg-newBgColorInner border-l border-b border-newTableBorder rotate-45 mobile:hidden"
            style={{
              left: -7,
              top: Math.max(
                14,
                Math.min(
                  rect.top + rect.height / 2 - (cardStyle.top as number) - 6,
                  190
                )
              ),
            }}
          />
        )}
        <div className="text-[17px] font-[650]">
          {t(step.titleKey, step.titleFallback)}
        </div>
        <div className="text-[13px] leading-[1.55] text-textItemBlur">
          {t(step.descKey, step.descFallback)}
        </div>
        {/* chấm tiến độ */}
        <div className="flex gap-[6px] mt-[4px]">
          {steps.map((_, i) => (
            <div
              key={i}
              className={
                'h-[6px] rounded-full transition-all ' +
                (i === index ? 'w-[18px] bg-btnPrimary' : 'w-[6px] bg-newTableBorder')
              }
            />
          ))}
        </div>
        <div className="flex items-center gap-[8px] mt-[8px]">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-textItemBlur hover:text-textColor px-[4px]"
          >
            {t('tour_skip', 'Skip')}
          </button>
          <div className="flex-1" />
          {index > 0 && (
            <Button secondary onClick={back} className="!h-[38px] rounded-[9px]">
              {t('tour_back', 'Back')}
            </Button>
          )}
          <Button onClick={next} className="!h-[38px] rounded-[9px]">
            {isLast ? t('tour_done', 'Finish') : t('tour_next', 'Next')}
          </Button>
        </div>
      </div>
    </>
  );
};
