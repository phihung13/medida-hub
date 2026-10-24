'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import { isPathActive } from '@gitroom/frontend/components/new-layout/menu-item';
export const Title = () => {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();
  const currentTitle = useMemo(() => {
    // Ưu tiên khớp theo đoạn đường dẫn (/media-board ≠ /media); giữ cách cũ làm dự phòng.
    return (
      menuItems.find((item) => isPathActive(path, item.path)) ||
      menuItems.find((item) => path.indexOf(item.path) > -1)
    )?.name;
  }, [path]);

  return <h1>{currentTitle}</h1>;
};
