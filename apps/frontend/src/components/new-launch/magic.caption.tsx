'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { MagicWandIcon } from '@gitroom/frontend/components/ui/icons';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';

// ============================================================================
//  Nút "bút phép thuật" — AI đọc các ảnh đã đính kèm rồi:
//   1. Viết caption cho cả bài (đổ thẳng vào editor)
//   2. Viết chú thích riêng cho TỪNG ảnh (lưu vào alt của ảnh — xem/sửa khi
//      bấm vào ảnh → Media Settings; đăng kèm bài luôn)
//  Backend: POST /media/ai-caption (Claude vision).
// ============================================================================

const VIDEO_RE = /\.(mp4|mov|webm|mp3|wav|m4a)(\?|$)/i;

// Trần backend (GenerateAiCaptionDto: @ArrayMaxSize(20)). Đính nhiều hơn 20 ảnh
// là bài đăng bình thường, nhưng gửi HẾT lên thì API trả lỗi "mediaIds must
// contain no more than 20 elements" và người dùng chỉ thấy báo lỗi khó hiểu.
// Cắt sẵn ở đây: AI chỉ cần NHÌN một phần là đủ để viết caption cho cả bài.
const AI_CAPTION_MAX_IMAGES = 20;

// Hạn giờ cho lời gọi AI. KHÔNG phải để "cho chắc": custom.fetch.func.ts trả về
// `new Promise(() => {})` — một promise KHÔNG BAO GIỜ settle — khi backend đáp
// 406 (hết hạn dùng thử) hoặc 402 mà người dùng đóng hộp thanh toán. Không có
// hạn giờ thì `finally` không bao giờ chạy, `locked` kẹt ở true và cả composer
// (nút Đăng/Lên lịch, chọn kênh) chết cứng cho tới khi tải lại trang — mất bài.
const AI_CAPTION_TIMEOUT_MS = 90_000;

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

  // Ảnh ĐANG ẨN sẽ không được đăng (lọc ở post.activity.ts lúc đăng thật) nên
  // cũng không được để AI nhìn — caption sẽ tả thứ người xem không thấy.
  const images = useMemo(
    () =>
      (pictures || []).filter(
        (p) =>
          p?.id && !(p as any).hidden && !VIDEO_RE.test(p?.path || '')
      ),
    [pictures]
  );

  const generate = useCallback(async () => {
    if (loading || !images.length) {
      return;
    }
    // AI GHI ĐÈ TOÀN BỘ nội dung đang có (setContent), không có undo nào ngoài
    // Ctrl+Z. Ai lỡ bấm nút đũa phép sau khi viết 10 phút thì mất sạch → hỏi.
    if ((context || '').trim().length > 0) {
      const ok = await deleteDialog(
        t(
          'magic_caption_overwrite',
          'AI sẽ viết lại toàn bộ nội dung bài, phần bạn đang viết sẽ bị thay thế. Tiếp tục?'
        ),
        t('magic_caption_overwrite_yes', 'Viết lại bằng AI')
      );
      if (!ok) {
        return;
      }
    }
    setLoading(true);
    setLocked(true);
    try {
      const sent = images.slice(0, AI_CAPTION_MAX_IMAGES);
      if (images.length > sent.length) {
        toaster.show(
          t(
            'magic_caption_capped',
            `Too many images — AI is reading the first ${AI_CAPTION_MAX_IMAGES} to write the caption.`
          ),
          'warning'
        );
      }
      const res = await Promise.race([
        fetch('/media/ai-caption', {
          method: 'POST',
          body: JSON.stringify({
            mediaIds: sent.map((p) => p.id),
            context: context || undefined,
          }),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('AI_CAPTION_TIMEOUT')),
            AI_CAPTION_TIMEOUT_MS
          )
        ),
      ]);

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
    } catch (err) {
      toaster.show(
        (err as any)?.message === 'AI_CAPTION_TIMEOUT'
          ? t(
              'magic_caption_timeout',
              'AI không phản hồi — bài của bạn vẫn còn nguyên, thử lại sau.'
            )
          : t('magic_caption_error', 'Error calling AI — please try again.'),
        'warning'
      );
    } finally {
      setLoading(false);
      setLocked(false);
    }
  }, [loading, images, context, num, onCaption, fetch, t, toaster, setLocked]);

  return (
    // <button> chứ không phải <div onClick>: bàn phím phải tới được và trình
    // đọc màn hình phải biết đây là nút (tooltip không phải tên gọi hợp lệ).
    <button
      type="button"
      disabled={!images.length || loading}
      aria-label={t('magic_caption_label', 'AI viết caption từ ảnh')}
      aria-busy={loading}
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
    </button>
  );
};
