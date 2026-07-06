'use client';

import { FC } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import { MenuItem } from '@gitroom/frontend/components/new-layout/menu-item';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';

// ============================================================================
//  Thanh điều hướng DƯỚI cho mobile/tablet (≤1025px) — thay cho sidebar trái
//  (bị ẩn ở breakpoint này). Tái dùng nguyên useMenuItem() + <MenuItem/>
//  (icon trên, chữ dưới, cao ≥44px = đúng chuẩn chạm). Desktop: ẩn.
// ============================================================================

export const MobileNav: FC = () => {
  const user = useUser();
  const { all } = useMenuItem();
  const { billingEnabled } = useVariables();

  const items = all.filter((f) => {
    if (f.hide) {
      return false;
    }
    if (f.requireBilling && !billingEnabled) {
      return false;
    }
    if (f.name === 'Billing' && user?.isLifetime) {
      return false;
    }
    if (f.role) {
      return f.role.includes(user?.role!);
    }
    return true;
  });

  return (
    <nav className="hidden mobile:flex fixed bottom-0 inset-x-0 z-[150] bg-newBgColorInner border-t border-newBorder items-stretch overflow-x-auto pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => (
        <div key={item.name} className="flex-1 min-w-[64px]">
          <MenuItem
            path={item.path}
            label={item.name}
            icon={item.icon}
            onClick={item.onClick}
          />
        </div>
      ))}
    </nav>
  );
};
