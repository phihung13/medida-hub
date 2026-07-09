'use client';

import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { extractVideoFrames } from '@gitroom/frontend/components/new-launch/providers/youtube/extract.frames';

const VIDEO_RE = /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i;

const stripHtml = (s: string) =>
  (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);

const useCurrentVideo = () => {
  const { value } = useIntegration();
  const media = value?.[0]?.image || [];
  const video = media.find((m) => VIDEO_RE.test(m?.path || '')) || media[0];
  const context = stripHtml(value?.[0]?.content || '');
  return { video, context };
};

// ---- Nút: AI viết tiêu đề + mô tả (xem video) ------------------------------
export const YoutubeAiContent: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const { backendUrl } = useVariables();
  const { setValue } = useSettings();
  const { video, context } = useCurrentVideo();
  const setLocked = useLaunchStore((state) => state.setLocked);
  const [engine, setEngine] = useState<'chatgpt' | 'gemini'>('chatgpt');
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    if (loading) return;
    if (!video?.path) {
      toaster.show(
        t('youtube_ai_no_video', 'Hãy thêm video vào bài trước khi để AI viết.'),
        'warning'
      );
      return;
    }
    setLoading(true);
    setLocked(true);
    try {
      let body: any;
      if (engine === 'gemini') {
        body = { engine: 'gemini', videoPath: video.path, context };
      } else {
        toaster.show(
          t('youtube_ai_extracting', 'Đang lấy khung hình từ video...'),
          'success'
        );
        const frames = await extractVideoFrames(backendUrl, video.path, 6);
        if (!frames.length) {
          throw new Error(t('youtube_ai_no_frames', 'Không cắt được khung hình.'));
        }
        body = { engine: 'chatgpt', frames, context };
      }

      const res = await fetch('/media/youtube-ai-content', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = '';
        try {
          message = (await res.json())?.message || '';
        } catch {
          /* ignore */
        }
        toaster.show(
          message ||
            t('youtube_ai_failed', 'AI không viết được — kiểm tra key & thử lại.'),
          'warning'
        );
        return;
      }
      const data = await res.json();
      if (data?.title) {
        setValue('title', String(data.title).slice(0, 100), {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
      if (data?.description) {
        setValue('description', String(data.description), {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
      toaster.show(
        t('youtube_ai_done', 'AI đã viết xong tiêu đề & mô tả.'),
        'success'
      );
    } catch (e: any) {
      toaster.show(
        e?.message || t('youtube_ai_error', 'Lỗi khi gọi AI — thử lại.'),
        'warning'
      );
    } finally {
      setLoading(false);
      setLocked(false);
    }
  }, [loading, video, context, engine, backendUrl]);

  return (
    <div className="flex flex-col gap-[8px] my-[10px] p-[12px] rounded-[8px] bg-newBgLineColor">
      <div className="text-[13px] font-[500]">
        {t('youtube_ai_title', '✨ AI viết tiêu đề & mô tả từ video')}
      </div>
      <div className="flex gap-[8px] items-center flex-wrap">
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value as any)}
          className="h-[34px] px-[8px] rounded-[6px] bg-newBgColorInner text-[13px] outline-none"
        >
          <option value="chatgpt">
            {t('engine_chatgpt', 'ChatGPT (đọc khung hình)')}
          </option>
          <option value="gemini">
            {t('engine_gemini', 'Gemini (xem cả video)')}
          </option>
        </select>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className={clsx(
            'h-[34px] px-[16px] rounded-[6px] text-white text-[13px] transition-all',
            loading ? 'bg-newColColor opacity-50 cursor-wait' : 'bg-ai hover:opacity-80'
          )}
        >
          {loading
            ? t('youtube_ai_working', 'Đang viết...')
            : t('youtube_ai_write', 'Viết bằng AI')}
        </button>
      </div>
      {engine === 'gemini' && (
        <div className="text-[11px] text-textColor/60">
          {t(
            'youtube_ai_gemini_hint',
            'Gemini tải video lên để xem — video lớn sẽ lâu hơn. Cần key Gemini trong Cài đặt.'
          )}
        </div>
      )}
    </div>
  );
};

// ---- Nút: AI tạo thumbnail -------------------------------------------------
export const YoutubeAiThumbnail: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const { setValue, getValues } = useSettings();
  const { context } = useCurrentVideo();
  const setLocked = useLaunchStore((state) => state.setLocked);
  const [engine, setEngine] = useState<'gemini' | 'openai'>('gemini');
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    if (loading) return;
    const values = getValues();
    const prompt = [values?.title, values?.description, context]
      .filter(Boolean)
      .join('. ')
      .slice(0, 800);
    if (!prompt.trim()) {
      toaster.show(
        t(
          'youtube_thumb_no_prompt',
          'Hãy có tiêu đề/mô tả (hoặc để AI viết trước) để tạo thumbnail.'
        ),
        'warning'
      );
      return;
    }
    setLoading(true);
    setLocked(true);
    try {
      const res = await fetch('/media/youtube-thumbnail', {
        method: 'POST',
        body: JSON.stringify({ engine, prompt }),
      });
      if (!res.ok) {
        let message = '';
        try {
          message = (await res.json())?.message || '';
        } catch {
          /* ignore */
        }
        toaster.show(
          message ||
            t('youtube_thumb_failed', 'Không tạo được thumbnail — kiểm tra key.'),
          'warning'
        );
        return;
      }
      const data = await res.json();
      if (data?.id && data?.path) {
        setValue('thumbnail', { id: data.id, path: data.path }, {
          shouldValidate: true,
          shouldDirty: true,
        });
        toaster.show(
          t('youtube_thumb_done', 'Đã tạo thumbnail bằng AI.'),
          'success'
        );
      } else {
        toaster.show(
          t('youtube_thumb_empty', 'AI không trả về ảnh.'),
          'warning'
        );
      }
    } catch (e: any) {
      toaster.show(
        e?.message || t('youtube_thumb_error', 'Lỗi khi tạo thumbnail — thử lại.'),
        'warning'
      );
    } finally {
      setLoading(false);
      setLocked(false);
    }
  }, [loading, engine, context]);

  return (
    <div className="flex gap-[8px] items-center flex-wrap mt-[8px]">
      <select
        value={engine}
        onChange={(e) => setEngine(e.target.value as any)}
        className="h-[34px] px-[8px] rounded-[6px] bg-newBgColorInner text-[13px] outline-none"
      >
        <option value="gemini">
          {t('thumb_gemini', 'Gemini nano banana')}
        </option>
        <option value="openai">{t('thumb_openai', 'OpenAI (ChatGPT)')}</option>
      </select>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className={clsx(
          'h-[34px] px-[16px] rounded-[6px] text-white text-[13px] transition-all',
          loading ? 'bg-newColColor opacity-50 cursor-wait' : 'bg-ai hover:opacity-80'
        )}
      >
        {loading
          ? t('youtube_thumb_working', 'Đang tạo...')
          : t('youtube_thumb_create', '✨ Tạo thumbnail bằng AI')}
      </button>
    </div>
  );
};
