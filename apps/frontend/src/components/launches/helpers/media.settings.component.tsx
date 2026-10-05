'use client';

import { resolveBaseUrl } from '@gitroom/helpers/utils/custom.fetch.func';
import { EventEmitter } from 'events';
import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TopTitle } from '@gitroom/frontend/components/launches/helpers/top.title.component';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
const postUrlEmitter = new EventEmitter();

export const MediaSettingsLayout = () => {
  const [showPostSelector, setShowPostSelector] = useState(false);
  const [media, setMedia] = useState(undefined);
  const [callback, setCallback] = useState<{
    callback: (tag: {
      id: string;
      name: string;
      path: string;
      thumbnail: string;
      alt: string;
    }) => void;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  } | null>({
    callback: (params: {
      id: string;
      name: string;
      path: string;
      thumbnail: string;
      alt: string;
    }) => {},
  } as any);
  useEffect(() => {
    postUrlEmitter.on(
      'show',
      (params: {
        media: any;
        callback: (url: {
          id: string;
          name: string;
          path: string;
          thumbnail: string;
          alt: string;
        }) => void;
      }) => {
        setCallback(params);
        setMedia(params.media);
        setShowPostSelector(true);
      }
    );
    return () => {
      setShowPostSelector(false);
      setCallback(null);
      setMedia(undefined);
      postUrlEmitter.removeAllListeners();
    };
  }, []);
  const close = useCallback(() => {
    setShowPostSelector(false);
    setCallback(null);
    setMedia(undefined);
  }, []);
  if (!showPostSelector) {
    return <></>;
  }
  return (
    <MediaComponentInner
      media={media}
      onClose={close}
      onSelect={callback?.callback!}
    />
  );
};

export const useMediaSettings = () => {
  return useCallback((media: any) => {
    return new Promise((resolve) => {
      postUrlEmitter.emit('show', {
        media,
        callback: (value: any) => {
          resolve(value);
        },
      });
    });
  }, []);
};

const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // khớp giới hạn ảnh của /media/upload-simple

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const CreateThumbnail: FC<{
  onSelect: (blob: Blob, timestampMs: number) => void;
  media:
    | {
        id: string;
        name: string;
        path: string;
        thumbnail?: string;
        alt?: string;
      }
    | undefined;
  altText?: string;
  onAltTextChange?: (altText: string) => void;
}> = (props) => {
  const { onSelect, media } = props;
  const t = useT();
  const toaster = useToaster();
  const { backendUrl } = useVariables();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Đang kéo thanh trượt: bỏ qua timeupdate của video, nếu không nút kéo bị
  // giật ngược về vị trí cũ trong lúc video còn đang tua.
  const dragging = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Video cùng tên miền với Hub (/uploads): đọc thẳng — nginx tự hỗ trợ tua
  // (Range) và canvas không bị chặn CORS. Nguồn ngoài: qua proxy /public/stream.
  const src = useMemo(() => {
    if (!media?.path) return '';
    try {
      if (
        typeof window !== 'undefined' &&
        new URL(media.path, window.location.href).origin ===
          window.location.origin
      ) {
        return media.path;
      }
    } catch {
      /* đường dẫn lạ — dùng proxy */
    }
    return (
      resolveBaseUrl(backendUrl) +
      '/public/stream?url=' +
      encodeURIComponent(media.path)
    );
  }, [media?.path, backendUrl]);

  const handleLoadedMetadata = useCallback(() => {
    setDuration(videoRef.current?.duration || 0);
    setIsLoaded(true);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (!dragging.current && videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const seek = useCallback((time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  const stopDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setIsCapturing(true);
    try {
      // Đợi video tua xong, nếu không sẽ cắt nhầm khung cũ.
      if (video.seeking) {
        await new Promise((resolve) =>
          video.addEventListener('seeked', resolve, { once: true })
        );
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const timestampMs = Math.round(video.currentTime * 1000);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85)
      );
      if (!blob) throw new Error('no-blob');
      onSelect(blob, timestampMs);
    } catch (error) {
      console.error('Error capturing frame:', error);
      toaster.show(
        t(
          'thumbnail_capture_failed',
          'Không cắt được khung hình từ video này — thử "Tải ảnh lên" thay thế.'
        ),
        'warning'
      );
    } finally {
      setIsCapturing(false);
    }
  }, [onSelect]);

  if (!media) return null;

  const percent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col space-y-4">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-[200px] object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleTimeUpdate}
          muted
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {!isLoaded && (
        <div className="text-sm text-textColor/70 text-center">
          {t('thumbnail_loading_video', 'Đang tải video…')}
        </div>
      )}

      {isLoaded && (
        <>
          <div className="flex flex-col space-y-2">
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={currentTime}
              aria-label={t('thumbnail_frame_position', 'Vị trí khung hình')}
              onPointerDown={() => (dragging.current = true)}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              onBlur={stopDrag}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer slider touch-none"
              style={{
                background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${percent}%, #374151 ${percent}%, #374151 100%)`,
              }}
            />
            <div className="flex justify-between text-sm text-textColor">
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={captureFrame}
              disabled={isCapturing}
              className="bg-forth text-white px-6 py-2 rounded-lg hover:bg-opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCapturing
                ? t('thumbnail_capturing', 'Đang cắt khung…')
                : t('thumbnail_select_frame', 'Chọn khung này')}
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: grab;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: grab;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
};

export const MediaComponentInner: FC<{
  onClose: () => void;
  onSelect: (media: {
    id: string;
    name: string;
    path: string;
    thumbnail: string;
    alt: string;
  }) => void;
  media:
    | {
        id: string;
        name: string;
        path: string;
        thumbnail: string;
        alt: string;
        thumbnailTimestamp?: number;
      }
    | undefined;
}> = (props) => {
  const { onClose, onSelect, media } = props;
  const t = useT();
  const toaster = useToaster();
  const setActivateExitButton = useLaunchStore((e) => e.setActivateExitButton);
  const newFetch = useFetch();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newThumbnail, setNewThumbnail] = useState<string | null>(null);
  const [isEditingThumbnail, setIsEditingThumbnail] = useState(false);
  const [altText, setAltText] = useState<string>(media?.alt || '');
  const [loading, setLoading] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(
    props.media?.thumbnail || null
  );
  // null = ảnh bìa TẢI LÊN (không cắt từ video) — xem reelCover (Instagram),
  // coverTime (Zalo Video) phía backend.
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState<number | null>(
    props.media?.thumbnailTimestamp ?? null
  );

  useEffect(() => {
    setActivateExitButton(false);
    return () => {
      setActivateExitButton(true);
    };
  }, []);

  const onPickImage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!IMAGE_TYPES.test(file.type)) {
        toaster.show(
          t('thumbnail_upload_type', 'Chỉ nhận ảnh JPG, PNG hoặc WEBP.'),
          'warning'
        );
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toaster.show(
          t('thumbnail_upload_size', 'Ảnh bìa tối đa 10 MB.'),
          'warning'
        );
        return;
      }
      setNewThumbnail(URL.createObjectURL(file));
      setThumbnailTimestamp(null);
    },
    []
  );

  const save = useCallback(async () => {
    setLoading(true);
    try {
      let path = thumbnail || '';
      if (newThumbnail) {
        const blob = await (await fetch(newThumbnail)).blob();
        const ext =
          blob.type === 'image/png'
            ? 'png'
            : blob.type === 'image/webp'
            ? 'webp'
            : 'jpg';
        const formData = new FormData();
        formData.append('file', blob, `media.${ext}`);
        formData.append('preventSave', 'true');
        const data = await (
          await newFetch('/media/upload-simple', {
            method: 'POST',
            body: formData,
          })
        )
          .json()
          .catch(() => null);
        if (!data?.path) {
          toaster.show(
            t('thumbnail_upload_failed', 'Chưa tải được ảnh bìa lên, thử lại.'),
            'warning'
          );
          return;
        }
        path = data.path;
      }

      const saved = await (
        await newFetch('/media/information', {
          method: 'POST',
          body: JSON.stringify({
            id: props.media.id,
            alt: altText,
            thumbnail: path,
            thumbnailTimestamp: thumbnailTimestamp,
          }),
        })
      ).json();

      onSelect(saved);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [altText, newThumbnail, thumbnail, thumbnailTimestamp]);

  const hasThumbnail = !!(newThumbnail || thumbnail);

  return (
    <div className="mt-[10px] flex flex-col gap-[20px]">
      <div className="flex flex-col space-y-2">
        <label className="text-sm text-textColor font-medium">
          {t('media_alt_text', 'Mô tả ảnh/video (alt text)')}
        </label>
        <input
          type="text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          placeholder={t(
            'media_alt_placeholder',
            'Mô tả nội dung ảnh/video…'
          )}
          className="w-full px-3 py-2 bg-fifth border border-tableBorder rounded-lg text-textColor placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forth focus:border-transparent"
        />
      </div>
      {hasExtension(media?.path, 'mp4') && (
        <>
          <div>
            {!isEditingThumbnail ? (
              <div className="flex flex-col gap-[10px]">
                {hasThumbnail && (
                  <div className="flex flex-col space-y-2">
                    <span className="text-sm text-textColor">
                      {t('thumbnail_current', 'Ảnh bìa hiện tại:')}
                      {thumbnailTimestamp == null && (
                        <span className="text-textColor/60">
                          {' '}
                          {t('thumbnail_uploaded_tag', '(ảnh tải lên)')}
                        </span>
                      )}
                    </span>
                    <img
                      src={newThumbnail || thumbnail}
                      alt={t('thumbnail_current_alt', 'Ảnh bìa hiện tại')}
                      className="max-w-full max-h-[500px] object-contain rounded-lg border border-tableBorder"
                    />
                  </div>
                )}

                <div className="flex gap-[8px] flex-wrap">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setIsEditingThumbnail(true)}
                    className="bg-third text-textColor px-6 py-2 rounded-lg hover:bg-opacity-80 transition-all flex-1 border border-tableBorder whitespace-nowrap"
                  >
                    {hasThumbnail
                      ? t('thumbnail_reselect_frame', 'Chọn lại khung từ video')
                      : t('thumbnail_select_from_video', 'Chọn khung từ video')}
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => fileRef.current?.click()}
                    className="bg-third text-textColor px-6 py-2 rounded-lg hover:bg-opacity-80 transition-all flex-1 border border-tableBorder whitespace-nowrap"
                  >
                    {t('thumbnail_upload', 'Tải ảnh lên')}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onPickImage}
                  />
                  {hasThumbnail && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setNewThumbnail(null);
                        setThumbnail(null);
                      }}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-opacity-80 transition-all flex-1 border border-red-700 whitespace-nowrap"
                    >
                      {t('thumbnail_clear', 'Xoá ảnh bìa')}
                    </button>
                  )}
                </div>
                <p className="text-[12px] leading-[1.6] text-textColor/60">
                  {t(
                    'thumbnail_upload_hint',
                    'Ảnh tải lên dùng được cho Instagram Reels và Reddit. Zalo Video và TikTok chỉ nhận khung cắt từ chính video — với hai kênh này hãy dùng "Chọn khung từ video".'
                  )}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setIsEditingThumbnail(false)}
                    className="text-textColor hover:text-white transition-colors flex items-center space-x-2"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M19 12H5M12 19L5 12L12 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{t('back', 'Quay lại')}</span>
                  </button>
                </div>

                <CreateThumbnail
                  onSelect={(blob: Blob, timestampMs: number) => {
                    setNewThumbnail(URL.createObjectURL(blob));
                    setThumbnailTimestamp(timestampMs);
                    setIsEditingThumbnail(false);
                  }}
                  media={media}
                  altText={altText}
                  onAltTextChange={setAltText}
                />
              </div>
            )}
          </div>
        </>
      )}

      {!isEditingThumbnail && (
        <div className="flex space-x-2 !mt-[20px]">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-opacity-80 transition-all"
          >
            {t('cancel', 'Huỷ')}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={save}
            className="flex-1 bg-forth text-white px-6 py-2 rounded-lg hover:bg-opacity-80 transition-all disabled:opacity-50"
          >
            {loading
              ? t('saving', 'Đang lưu…')
              : t('save_changes', 'Lưu thay đổi')}
          </button>
        </div>
      )}
    </div>
  );
};
