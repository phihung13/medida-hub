'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { MagicWandIcon } from '@gitroom/frontend/components/ui/icons';

// ============================================================================
//  Nút "bút phép thuật" — AI đọc các ảnh đã đính kèm rồi:
//   1. Viết caption cho cả bài (đổ thẳng vào editor)
//   2. Viết chú thích riêng cho TỪNG ảnh (lưu vào alt của ảnh — xem/sửa khi
//      bấm vào ảnh → Media Settings; đăng kèm bài luôn)
//  Backend: POST /media/ai-caption (Claude vision).
// ============================================================================

const VIDEO_RE = /\.(mp4|mov|webm|mp3|wav|m4a)(\?|$)/i;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const MagicCaption: FC<{
  pictures: { id: string; path: string; alt?: string }[];
  context: string;
  num: number;
  onCaption: (html: string) => void;
}> = ({ pictures, context, num, onCaption }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const setLocked = useLaunchStore((state) => state.setLocked);
  const [loading, setLoading] = useState(false);

  const images = useMemo(
    () => (pictures || []).filter((p) => p?.id && !VIDEO_RE.test(p?.path || '')),
    [pictures]
  );

  const generate = useCallback(async () => {
    if (loading || !images.length) {
      return;
    }
    setLoading(true);
    setLocked(true);
    try {
      const res = await fetch('/media/ai-caption', {
        method: 'POST',
        body: JSON.stringify({
          mediaIds: images.map((p) => p.id),
          context: context || undefined,
        }),
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
            t(
              'magic_caption_failed',
              'Could not write caption — check your Claude key in Settings and try again.'
            ),
          'warning'
        );
        return;
      }

      const data = await res.json();

      // 1. Caption bài → editor
      const html = String(data.postCaption || '')
        .split('\n')
        .map((line: string) => `<p>${escapeHtml(line)}</p>`)
        .join('');
      if (html) {
        onCaption(html);
      }

      // 2. Caption từng ảnh → alt của media trong bài. Merge theo id trên
      // state MỚI NHẤT của store (không dùng snapshot `pictures` lúc bấm nút —
      // user có thể đã thêm/xoá ảnh trong lúc AI chạy, ghi đè sẽ mất ảnh).
      const byId = new Map<string, string>(
        (data.images || []).map((i: any) => [i.id, i.caption])
      );
      const st = useLaunchStore.getState();
      const intl = st.internal.find((p) => p.integration.id === st.current);
      const freshMedia =
        (intl ? intl.integrationValue[num]?.media : st.global[num]?.media) || [];
      const merged = freshMedia.map((m: any) =>
        byId.get(m.id) ? { ...m, alt: byId.get(m.id) } : m
      );
      if (intl) {
        st.setInternalValueMedia(st.current, num, merged);
      } else {
        st.setGlobalValueMedia(num, merged);
      }

      // 3. Lưu luôn vào thư viện media (best-effort, không chặn UI)
      Promise.allSettled(
        (data.images || [])
          .filter((i: any) => i?.caption)
          .map((i: any) =>
            fetch('/media/information', {
              method: 'POST',
              body: JSON.stringify({ id: i.id, alt: i.caption }),
            })
          )
      );

      toaster.show(
        t(
          'magic_caption_done',
          `Wrote the post caption + captions for ${
            (data.images || []).filter((i: any) => i?.caption).length
          } images (click each image to view/edit).`
        ),
        'success'
      );
    } catch {
      toaster.show(
        t('magic_caption_error', 'Error calling AI — please try again.'),
        'warning'
      );
    } finally {
      setLoading(false);
      setLocked(false);
    }
  }, [loading, images, context, num, onCaption]);

  return (
    <div
      data-tooltip-id="tooltip"
      data-tooltip-content={
        images.length
          ? t(
              'magic_caption_tooltip',
              'AI reads your images & writes captions (post + each image)'
            )
          : t(
              'magic_caption_tooltip_empty',
              'Add images first — AI will read them and write captions'
            )
      }
      onClick={generate}
      className={clsx(
        'select-none rounded-[6px] w-[30px] h-[30px] flex justify-center items-center transition-all',
        images.length && !loading
          ? 'cursor-pointer bg-ai text-white hover:opacity-80'
          : 'cursor-not-allowed bg-newColColor opacity-40'
      )}
    >
      {loading ? (
        <div className="animate-spin h-[14px] w-[14px] border-2 border-white border-t-transparent rounded-full" />
      ) : (
        <MagicWandIcon size={16} />
      )}
    </div>
  );
};
