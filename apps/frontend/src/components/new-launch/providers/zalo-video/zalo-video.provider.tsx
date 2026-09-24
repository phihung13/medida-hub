'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ZaloVideoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zalo-video.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Zalo Video: đúng 1 video, nội dung bài là phần mô tả (≤4000 ký tự). Không có
// tuỳ chọn nào để chỉnh — chỉ nhắc luật bằng vài nhãn ngắn. Vi phạm (thêm ảnh,
// 2 video, sai định dạng) bị chặn và báo rõ ngay lúc lên lịch (checkValidity).
const ZaloVideoSettings: FC = () => {
  const t = useT();
  const chip =
    'rounded-[4px] border border-newBorder px-[6px] py-[2px] text-[12px] text-textItemBlur';
  return (
    <div className="flex flex-wrap gap-[6px]">
      <span className={chip}>{t('zalo_video_chip_one_video', '1 video')}</span>
      <span className={chip}>.mp4 / .mov</span>
      <span className={chip}>≤ 500MB</span>
      <span className={chip}>
        {t('zalo_video_chip_no_images', 'Không kèm ảnh')}
      </span>
    </div>
  );
};

export default withProvider<ZaloVideoDto>({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: ZaloVideoSettings,
  CustomPreviewComponent: undefined,
  dto: ZaloVideoDto,
  maximumCharacters: 4000,
});
