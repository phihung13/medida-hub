'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FacebookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.dto';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { FacebookPreview } from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const FacebookSettings = () => {
  const t = useT();
  const { register, watch } = useSettings();
  const postCurrentType = watch('post_type');

  return (
    <>
      {/* Nhãn trước đây viết cứng tiếng Anh ("Post Type", "Post", "Story",
          "Embedded URL (only for text Post)") nên lọt tiếng Anh giữa giao diện
          tiếng Việt. Giá trị option (post/story) GIỮ NGUYÊN — đã lưu trong bài cũ. */}
      <Select
        label={t('post_type', 'Post Type')}
        {...register('post_type', {
          value: 'post',
        })}
      >
        <option value="">{t('select_post_type', 'Select Post Type...')}</option>
        <option value="post">{t('post', 'Post')}</option>
        <option value="story">{t('story', 'Story')}</option>
      </Select>

      {postCurrentType !== 'story' && (
        <Input
          label={t('embedded_url_text_only', 'Embedded URL (text posts only)')}
          {...register('url')}
        />
      )}

      {/* Cài đặt này theo KÊNH, không theo từng khối: bật thì MỌI bình luận của
          kênh này nối thành chuỗi (mỗi cái trả lời cái trước), tắt thì ngang hàng
          trên bài. Khối bài chính không gọi comment() nên không bị ảnh hưởng. */}
      <Checkbox
        label={t('facebook_reply_chain', 'Chain comments as replies')}
        {...register('replyToPrevious')}
      />
    </>
  );
};

export default withProvider<FacebookDto>({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: FacebookSettings,
  CustomPreviewComponent: FacebookPreview,
  dto: FacebookDto,
  maximumCharacters: 63206,
});
