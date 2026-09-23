'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ZaloDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zalo.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Zalo OA có 2 dạng nội dung, provider tự chọn theo media đính kèm:
//  - Đính VIDEO  -> đăng "nội dung dạng Video" (lên mục Video của OA).
//                   Bắt buộc kèm 1 ảnh làm thumbnail.
//  - Chỉ có ẢNH  -> đăng "bài viết" (article type: normal), ảnh đầu làm bìa.
// Trần của Zalo: tiêu đề 150, tác giả 50, mô tả 300, ảnh 1MB/tấm,
// video .mp4/.avi tối đa 50MB và chỉ 1 video mỗi bài.
const ZaloSettings: FC = () => {
  const { register } = useSettings();
  const t = useT();

  return (
    <div className="flex flex-col gap-[10px]">
      <Input
        label={t('zalo_article_title', 'Tiêu đề bài viết')}
        placeholder={t(
          'zalo_article_title_ph',
          'Bỏ trống → lấy dòng đầu của nội dung'
        )}
        {...register('title')}
      />
      <Input
        label={t('zalo_article_author', 'Tác giả')}
        placeholder={t('zalo_article_author_ph', 'VD: Trường Việt Anh')}
        {...register('author')}
      />
      <Checkbox
        label={t('zalo_allow_comment', 'Cho phép bình luận trên bài')}
        {...register('allowComment')}
      />
      <div className="text-[12px] leading-[1.5] opacity-70">
        {t(
          'zalo_limits_hint',
          'Zalo giới hạn: ảnh tối đa 1MB mỗi tấm, video .mp4/.avi tối đa 50MB và chỉ 1 video mỗi bài. Đính video thì bài sẽ lên mục Video của OA và cần thêm 1 ảnh làm thumbnail. OA phải đã được xác minh mới đăng được.'
        )}
      </div>
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
