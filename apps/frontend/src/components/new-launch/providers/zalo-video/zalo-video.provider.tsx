'use client';

import { FC, useCallback, useRef, useState } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ZaloVideoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/zalo-video.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { Input } from '@gitroom/react/form/input';
import { Slider } from '@gitroom/react/form/slider';

// Zalo Video: đúng 1 video, nội dung bài là phần mô tả (≤4000 ký tự). Các tuỳ
// chọn dưới đây khớp 1-1 với form đăng trên video.zalo.me — bot điền hộ:
//   - Ảnh bìa: Zalo chỉ cho chọn KHUNG HÌNH trong video (không tải ảnh riêng).
//   - Danh sách phát: chọn theo tên, chưa có thì bot tạo.
//   - Nội dung do AI tạo: công tắc nhãn của Zalo.
// ("Gắn nhãn video" của Zalo cần cấu hình Business trước — chưa làm.)

const VIDEO_RE = /\.(mp4|mov)(\?|$)/i;

const fmt = (s: number) => {
  const v = Math.max(0, s || 0);
  return `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`;
};

// Tua video để chọn khung làm ảnh bìa — bot bấm đúng giây đó trên dải khung
// hình của Zalo. Không cắt ảnh ở trình duyệt nên không vướng CORS.
const CoverPicker: FC<{
  src: string;
  value?: number;
  onChange: (seconds: number | undefined) => void;
}> = ({ src, value, onChange }) => {
  const t = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(value ?? 0);

  const seek = useCallback((s: number) => {
    setTime(s);
    if (ref.current) {
      ref.current.currentTime = s;
    }
  }, []);

  return (
    <div className="flex gap-[12px] items-center">
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration || 0;
          const start = Math.min(value ?? 0, d);
          setDuration(d);
          e.currentTarget.currentTime = start;
          setTime(start);
        }}
        className="w-[72px] h-[128px] rounded-[8px] bg-black object-cover shrink-0"
      />
      <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
        <div className="flex items-center justify-between text-[14px]">
          <span>{t('zalo_video_cover', 'Ảnh bìa')}</span>
          <span className="text-[12px] text-textItemBlur tabular-nums">
            {value === undefined
              ? t('zalo_video_cover_default', 'Khung đầu')
              : fmt(value)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          disabled={!duration}
          onChange={(e) => {
            const s = parseFloat(e.target.value);
            seek(s);
            onChange(Math.round(s * 10) / 10);
          }}
          aria-label={t('zalo_video_cover_pick', 'Chọn khung hình làm ảnh bìa')}
          className="w-full accent-btnPrimary cursor-pointer disabled:opacity-40 disabled:cursor-default"
        />
        <div className="flex justify-between text-[12px] text-textItemBlur tabular-nums">
          <span>{fmt(time)}</span>
          {value !== undefined ? (
            <button
              type="button"
              onClick={() => {
                seek(0);
                onChange(undefined);
              }}
              className="hover:text-textColor hover:underline underline-offset-2"
            >
              {t('zalo_video_cover_reset', 'Dùng khung đầu')}
            </button>
          ) : (
            <span>{fmt(duration)}</span>
          )}
        </div>
      </div>
    </div>
  );
};

const ZaloVideoSettings: FC = () => {
  const t = useT();
  const { register, watch, setValue } = useSettings();
  const { value } = useIntegration();
  const mediaDirectory = useMediaDirectory();
  const video = (value?.[0]?.image || []).find((m: any) =>
    VIDEO_RE.test(m?.path || '')
  );
  const coverTime = watch('coverTime');
  const aiGenerated = watch('aiGenerated');

  return (
    <div className="flex flex-col gap-[16px]">
      {video ? (
        <CoverPicker
          key={video.path}
          src={mediaDirectory.set(video.path)}
          value={typeof coverTime === 'number' ? coverTime : undefined}
          onChange={(s) =>
            setValue('coverTime', s, { shouldDirty: true, shouldValidate: true })
          }
        />
      ) : (
        <div className="text-[13px] text-textItemBlur">
          {t(
            'zalo_video_attach_first',
            'Đính kèm 1 video .mp4 (≤ 500MB) để chọn ảnh bìa.'
          )}
        </div>
      )}
      <Input
        label={t('zalo_video_playlist', 'Danh sách phát')}
        placeholder={t(
          'zalo_video_playlist_ph',
          'Tên danh sách — chưa có thì tự tạo'
        )}
        maxLength={40}
        {...register('playlist')}
      />
      <div className="flex items-center justify-between gap-[12px]">
        <span className="text-[14px]">
          {t('zalo_video_ai_label', 'Nội dung do AI tạo')}
        </span>
        <Slider
          fill
          ariaLabel={t('zalo_video_ai_label', 'Nội dung do AI tạo')}
          value={aiGenerated ? 'on' : 'off'}
          onChange={(v) =>
            setValue('aiGenerated', v === 'on', { shouldDirty: true })
          }
        />
      </div>
    </div>
  );
};

export default withProvider<ZaloVideoDto>({
  // Zalo Video chỉ có MỘT khối nội dung — tắt nút thêm bài/bình luận nối tiếp.
  comments: false,
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: ZaloVideoSettings,
  CustomPreviewComponent: undefined,
  dto: ZaloVideoDto,
  maximumCharacters: 4000,
});
