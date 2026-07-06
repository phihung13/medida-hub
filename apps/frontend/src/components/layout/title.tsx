'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const Title = () => {
  const path = usePathname();
  const t = useT();
  const { all: menuItems } = useMenuItem();
  const currentTitle = useMemo(() => {
    return menuItems.find((item) => path.indexOf(item.path) > -1)?.name;
  }, [path]);

  // Trang Bài Thắng: hiện luôn mô tả ngắn dưới tiêu đề (bỏ khối tiêu đề trong trang)
  if (path.indexOf('/viral') > -1) {
    return (
      <div className="flex flex-col justify-center">
        <h1>{currentTitle}</h1>
        <div className="text-[12.5px] font-[400] leading-[1.35] text-textItemBlur mobile:hidden">
          {t(
            'viral_subtitle_prefix',
            'Capture viral education posts, dissect the formula and clone them into Việt Anh posts. Main metric:'
          )}{' '}
          <b className="text-[#FFC53D]">
            {t('viral_subtitle_metric', 'share count')}
          </b>
          .
        </div>
      </div>
    );
  }

  return <h1>{currentTitle}</h1>;
};
