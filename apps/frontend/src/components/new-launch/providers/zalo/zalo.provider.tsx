'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ZaloDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zalo.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Bài Zalo OA đăng dạng "bài viết" (Article). Hai ô tùy chọn: tiêu đề + tác giả.
// Bỏ trống → tiêu đề = dòng đầu caption, tác giả = tên OA.
const ZaloSettings: FC = () => {
  const { register } = useSettings();
  const t = useT();

  return (
    <div className="flex flex-col gap-[10px]">
      <Input
        label={t('zalo_article_title', 'Article title (optional)')}
        placeholder={t(
          'zalo_article_title_ph',
          'Leave empty → first line of the caption'
        )}
        {...register('title')}
      />
      <Input
        label={t('zalo_article_author', 'Author (optional)')}
        placeholder={t('zalo_article_author_ph', 'e.g. Trường Việt Anh')}
        {...register('author')}
      />
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: ZaloSettings,
  CustomPreviewComponent: undefined,
  dto: ZaloDto,
  maximumCharacters: 20000,
});
