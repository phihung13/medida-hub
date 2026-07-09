'use client';

import { FC, useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

// ============================================================================
//  Nút "Nhập từ Drive / URL" trên thanh công cụ media của composer.
//  Dán link Google Drive (đã để "Anyone with the link") hoặc URL công khai →
//  tải file về thư viện media rồi đính vào bài đang soạn. Dùng cho video
//  YouTube: chỉ cần dán link Drive là có video để đăng.
//  Backend: POST /media/upload-from-url → trả { id, path, name }.
// ============================================================================

export const MediaFromUrl: FC<{
  onMedia: (media: { id: string; path: string }) => void;
}> = ({ onMedia }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const setLocked = useLaunchStore((state) => state.setLocked);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(async () => {
    const clean = url.trim();
    if (loading || !clean) {
      return;
    }
    setLoading(true);
    setLocked(true);
    try {
      const res = await fetch('/media/upload-from-url', {
        method: 'POST',
        body: JSON.stringify({ url: clean }),
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
              'media_from_url_failed',
              'Không tải được file — kiểm tra link đã công khai chưa.'
            ),
          'warning'
        );
        return;
      }

      const data = await res.json();
      if (data?.id && data?.path) {
        onMedia({ id: data.id, path: data.path });
        toaster.show(
          t('media_from_url_done', 'Đã tải file và đính vào bài.'),
          'success'
        );
        setUrl('');
        setOpen(false);
      } else {
        toaster.show(
          t('media_from_url_empty', 'Máy chủ không trả về file hợp lệ.'),
          'warning'
        );
      }
    } catch {
      toaster.show(
        t('media_from_url_error', 'Lỗi khi tải file — thử lại.'),
        'warning'
      );
    } finally {
      setLoading(false);
      setLocked(false);
    }
  }, [url, loading, onMedia]);

  return (
    <div className="relative">
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content={t(
          'media_from_url_tooltip',
          'Nhập từ Google Drive / URL — dán link video để đính vào bài'
        )}
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={clsx(
          'select-none rounded-[6px] w-[30px] h-[30px] flex justify-center items-center transition-all cursor-pointer hover:opacity-80',
          open ? 'bg-forth text-white' : 'bg-newColColor'
        )}
      >
        {loading ? (
          <div className="animate-spin h-[14px] w-[14px] border-2 border-current border-t-transparent rounded-full" />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
      </div>

      {open && (
        <div className="absolute z-[50] top-[36px] left-0 w-[320px] max-w-[80vw] bg-newBgColorInner border border-tableBorder rounded-[8px] p-[10px] shadow-lg flex flex-col gap-[8px]">
          <div className="text-[12px] text-textColor/70">
            {t(
              'media_from_url_hint',
              'Dán link Google Drive (đặt "Anyone with the link") hoặc URL file công khai:'
            )}
          </div>
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="https://drive.google.com/file/d/..."
            className="w-full h-[34px] px-[10px] rounded-[6px] bg-newBgLineColor text-[13px] outline-none"
          />
          <div className="flex gap-[8px] justify-end">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setUrl('');
              }}
              className="h-[30px] px-[12px] rounded-[6px] bg-newColColor text-[12px] hover:opacity-80"
            >
              {t('cancel', 'Huỷ')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading || !url.trim()}
              className={clsx(
                'h-[30px] px-[14px] rounded-[6px] text-white text-[12px] transition-all',
                loading || !url.trim()
                  ? 'bg-newColColor opacity-40 cursor-not-allowed'
                  : 'bg-forth hover:opacity-80'
              )}
            >
              {loading ? t('downloading', 'Đang tải...') : t('import', 'Tải về')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
