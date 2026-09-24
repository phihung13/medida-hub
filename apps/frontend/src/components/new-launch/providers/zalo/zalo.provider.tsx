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

// Zalo OA đăng giống fanpage Facebook: một bài viết gồm CHỮ + ẢNH, ảnh đầu
// làm ảnh bìa. Chỉ ảnh — không đăng video (Zalo Video là sản phẩm khác, dành
// cho tài khoản cá nhân). Trần của Zalo: tiêu đề 150, tác giả 50, mô tả 300,
// và ảnh tối đa 1MB mỗi tấm.
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
      {/* Rút đoạn văn giới hạn còn các "chip" ngắn — người dùng đọc lướt được.
          Các giới hạn khác (không video, 1 khối, tiêu đề 150) đã được chặn và
          báo lỗi rõ ràng ngay lúc lên lịch (checkValidity) nên không cần in sẵn. */}
      <div className="flex flex-wrap gap-[6px] text-[12px] text-textItemBlur">
        <span className="rounded-[4px] border border-newBorder px-[6px] py-[2px]">
          {t('zalo_chip_images_only', 'Chỉ ảnh')}
        </span>
        <span className="rounded-[4px] border border-newBorder px-[6px] py-[2px]">
          {t('zalo_chip_max_1mb', '≤ 1MB / ảnh')}
        </span>
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
