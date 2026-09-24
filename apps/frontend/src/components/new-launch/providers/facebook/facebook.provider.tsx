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

const postType = [
  {
    value: 'post',
    label: 'Post',
  },
  {
    value: 'story',
    label: 'Story',
  },
];

export const FacebookSettings = () => {
  const t = useT();
  const { register, watch } = useSettings();
  const postCurrentType = watch('post_type');

  return (
    <>
      <Select
        label="Post Type"
        {...register('post_type', {
          value: 'post',
        })}
      >
        <option value="">{t('select_post_type', 'Select Post Type...')}</option>
        {postType.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      {postCurrentType !== 'story' && (
        <Input
          label={'Embedded URL (only for text Post)'}
          {...register('url')}
        />
      )}

      {/* Chỉ có tác dụng ở khối BÌNH LUẬN (khối thứ 2 trở đi) — khối bài chính
          không gọi tới comment() nên cờ này bị bỏ qua. Ghi rõ trong nhãn vì
          component cài đặt không biết nó đang nằm ở khối thứ mấy. */}
      <Checkbox
        label={t(
          'facebook_reply_to_previous',
          'Trả lời bình luận phía trên (chỉ áp dụng cho khối bình luận)'
        )}
        {...register('replyToPrevious')}
      />
      <div className="text-[12px] leading-[1.5] opacity-70">
        {t(
          'facebook_reply_to_previous_hint',
          'Bỏ trống: mỗi khối là một bình luận riêng trên bài. Bật: bình luận này trở thành trả lời của bình luận ngay trước đó.'
        )}
      </div>
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
