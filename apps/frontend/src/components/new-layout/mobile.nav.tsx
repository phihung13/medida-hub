'use client';

import { FC, ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  { ssr: false }
);

// ============================================================================
//  Tab bar DƯỚI kiểu iOS cho mobile (≤1025px) — đại tu 2026-07.
//  Trước: nhồi TOÀN BỘ ~10 mục menu vào 1 hàng overflow-x-auto (mục cuối phải
//  cuộn ngang mới thấy). Giờ: 4 tab chính cố định + "Thêm" mở bottom sheet
//  chứa phần còn lại (Agent, Phương tiện, Công cụ AI, Cài đặt, Billing...)
//  kèm hàng đổi giao diện sáng/tối + ngôn ngữ (đã rút khỏi header mobile).
//  Desktop: ẩn hoàn toàn (hidden mobile:flex) — không đổi gì.
// ============================================================================

// Thứ tự tab chính — 4 trang dùng nhiều nhất, ngón cái với tới không cần sheet.
const PRIMARY_PATHS = ['/launches', '/zalo', '/viral', '/analytics'];

type Item = {
  name: string;
  path: string;
  icon: ReactNode;
  onClick?: () => void;
};

const TabButton: FC<{
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick?: () => void;
  href?: string;
}> = ({ label, icon, active, onClick, href }) => {
  const cls = clsx(
    'flex flex-col items-center justify-center gap-[2px] h-full w-full tap-shrink select-none',
    active ? 'text-btnPrimary' : 'text-textItemBlur'
  );
  const inner = (
    <>
      <div className="[&_svg]:w-[22px] [&_svg]:h-[22px]">{icon}</div>
      <div className="text-[10px] font-[600] leading-[1.1] max-w-full truncate px-[2px]">
        {label}
      </div>
    </>
  );
  if (href) {
    return (
      <Link prefetch href={href} className={cls} aria-label={label}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {inner}
    </button>
  );
};

export const MobileNav: FC = () => {
  const user = useUser();
  const t = useT();
  const { all } = useMenuItem();
  const { billingEnabled } = useVariables();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Điều kiện ẩn/hiện giữ NGUYÊN như bản cũ (đồng bộ với TopMenu desktop).
  const items: Item[] = useMemo(
    () =>
      all.filter((f: any) => {
        if (f.hide) return false;
        if (f.requireBilling && !billingEnabled) return false;
        if (f.name === 'Billing' && user?.isLifetime) return false;
        if (f.role) return f.role.includes(user?.role!);
        return true;
      }),
    [all, billingEnabled, user]
  );

  const primary = useMemo(
    () =>
      PRIMARY_PATHS.map((p) => items.find((i) => i.path === p)).filter(
        Boolean
      ) as Item[],
    [items]
  );
  const rest = useMemo(
    () => items.filter((i) => !PRIMARY_PATHS.includes(i.path)),
    [items]
  );

  // Đổi trang thì tự đóng sheet.
  useEffect(() => setMoreOpen(false), [pathname]);

  // Mở sheet "Thêm" thì khóa cuộn nền (không để vuốt trong sheet trôi cả trang).
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const isActive = (path: string) =>
    path !== '#' && !!path && pathname.indexOf(path) === 0;
  const moreActive = rest.some((i) => isActive(i.path));

  return (
    <>
      <nav
        className="hidden mobile:grid fixed bottom-0 inset-x-0 z-[150] h-[calc(56px+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] grid-cols-5 bg-newBgColorInner/95 backdrop-blur-[14px] border-t border-newBorder"
        aria-label="Điều hướng chính"
      >
        {primary.map((item) => (
          <TabButton
            key={item.path}
            label={item.name}
            icon={item.icon}
            active={!moreOpen && isActive(item.path)}
            href={item.path}
          />
        ))}
        <TabButton
          label={t('mobile_nav_more', 'Thêm')}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="5" cy="12" r="2" fill="currentColor" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <circle cx="19" cy="12" r="2" fill="currentColor" />
            </svg>
          }
          active={moreOpen || moreActive}
          onClick={() => setMoreOpen((o) => !o)}
        />
      </nav>

      {/* ---- Sheet "Thêm": các mục còn lại + giao diện/ngôn ngữ ------------- */}
      {moreOpen && (
        <div className="hidden mobile:block">
          <div
            className="fixed inset-0 z-[178] bg-popup animate-sheetBackdrop"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 inset-x-0 z-[179] bg-newBgColorInner rounded-t-[20px] animate-sheetIn pb-[calc(env(safe-area-inset-bottom,0px)+10px)] max-h-[75dvh] overflow-y-auto">
            <div className="flex justify-center pt-[8px] pb-[4px]">
              <div className="w-[36px] h-[5px] rounded-full bg-newTextColor/20" />
            </div>
            <div className="px-[10px] pt-[4px] flex flex-col">
              {rest.map((item) =>
                item.onClick ? (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      item.onClick?.();
                    }}
                    className="flex items-center gap-[14px] h-[52px] px-[12px] rounded-[12px] text-start tap-shrink hover:bg-boxHover text-newTextColor"
                  >
                    <span className="text-textItemBlur [&_svg]:w-[22px] [&_svg]:h-[22px]">
                      {item.icon}
                    </span>
                    <span className="text-[15px] font-[600]">{item.name}</span>
                  </button>
                ) : (
                  <Link
                    key={item.path}
                    href={item.path}
                    prefetch
                    onClick={() => setMoreOpen(false)}
                    {...(item.path.indexOf('http') === 0 && {
                      target: '_blank',
                    })}
                    className={clsx(
                      'flex items-center gap-[14px] h-[52px] px-[12px] rounded-[12px] tap-shrink hover:bg-boxHover',
                      isActive(item.path)
                        ? 'text-btnPrimary bg-boxFocused'
                        : 'text-newTextColor'
                    )}
                  >
                    <span
                      className={clsx(
                        '[&_svg]:w-[22px] [&_svg]:h-[22px]',
                        isActive(item.path)
                          ? 'text-btnPrimary'
                          : 'text-textItemBlur'
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="text-[15px] font-[600]">{item.name}</span>
                  </Link>
                )
              )}
              {/* Giao diện sáng/tối + ngôn ngữ — rút từ header mobile về đây */}
              <div className="flex items-center gap-[14px] h-[52px] px-[12px] mt-[4px] border-t border-newTableBorder text-textItemBlur">
                <span className="text-[13px] font-[600] flex-1">
                  {t('mobile_nav_appearance', 'Giao diện & ngôn ngữ')}
                </span>
                <ModeComponent />
                <LanguageComponent />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
