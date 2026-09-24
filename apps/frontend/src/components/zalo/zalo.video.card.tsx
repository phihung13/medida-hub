'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  bot,
  Card,
  SimpleButton,
} from '@gitroom/frontend/components/zalo/zalo.shared';

// Thẻ quản lý phiên Zalo Video. Zalo không có API cho Zalo Video nên bot đăng
// hộ bằng phiên trình duyệt; quét QR đăng nhập bắt buộc phải có màn hình nên
// đăng nhập ở máy tính rồi TẢI FILE PHIÊN lên đây (bot chỉ mở cổng nội bộ,
// không ra internet — phải đi qua Hub).

type SessionInfo = {
  hasSession: boolean;
  expiresAt: number | null;
  expired: boolean | null;
  updatedAt: number | null;
};

const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('vi-VN') : '';

export const ZaloVideoCard: FC = () => {
  const t = useT();
  const toaster = useToaster();
  const fileRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'check'>('');
  const [channel, setChannel] = useState<string>('');
  const [showHelp, setShowHelp] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await bot('/api/zalovideo/status');
      if (r?.ok) setSession(r.session);
    } catch {
      /* bot tạm không phản hồi — giữ trạng thái cũ */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      setBusy('upload');
      try {
        const text = await f.text();
        const r = await bot('/api/zalovideo/session/upload', {
          method: 'POST',
          body: JSON.stringify({ session: text }),
        });
        if (!r?.ok) throw new Error(r?.error || 'Tải phiên lên thất bại');
        setSession(r.session);
        setChannel('');
        toaster.show(t('zalo_video_session_uploaded', 'Đã tải phiên Zalo Video lên bot'), 'success');
      } catch (err: any) {
        toaster.show(err?.message || 'Tải phiên lên thất bại', 'warning');
      } finally {
        setBusy('');
      }
    },
    [toaster, t]
  );

  // Mở trình duyệt thật trên bot để kiểm tra — mất vài chục giây.
  const check = useCallback(async () => {
    setBusy('check');
    try {
      const r = await bot('/api/zalovideo/channel', { method: 'POST', body: '{}' }, 150000);
      if (!r?.ok) throw new Error(r?.error || 'Phiên không dùng được');
      setChannel(r.channel?.name || '');
      toaster.show(
        `${t('zalo_video_session_ok', 'Phiên dùng được')}: ${r.channel?.name || ''}`,
        'success'
      );
      load();
    } catch (err: any) {
      setChannel('');
      toaster.show(err?.message || 'Phiên không dùng được', 'warning');
    } finally {
      setBusy('');
    }
  }, [toaster, t, load]);

  const has = !!session?.hasSession && session?.expired !== true;

  return (
    <Card
      title={
        <span className="flex items-center gap-[8px]">
          Zalo Video
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            aria-expanded={showHelp}
            aria-label={t('zalo_video_help', 'Hướng dẫn')}
            className="w-[20px] h-[20px] rounded-full border border-newSep text-[11px] leading-none normal-case flex items-center justify-center hover:bg-boxHover"
          >
            i
          </button>
        </span>
      }
    >
      <div className="flex items-center gap-[8px] text-[13.5px]">
        <span
          aria-hidden="true"
          className={
            has
              ? 'w-[8px] h-[8px] rounded-full bg-green-500'
              : 'w-[8px] h-[8px] rounded-full border-2 border-textItemBlur'
          }
        />
        {session === null
          ? t('zalo_video_loading', 'Đang kiểm tra…')
          : has
          ? `${t('zalo_video_has_session', 'Đã có phiên')}${
              channel ? ` · ${channel}` : ''
            }${session?.expiresAt ? ` · ${t('zalo_video_until', 'hạn tới')} ${fmtDate(session.expiresAt)}` : ''}`
          : t('zalo_video_no_session', 'Chưa có phiên — tải file phiên lên để bắt đầu')}
      </div>

      {showHelp && (
        <div className="text-[13px] text-textItemBlur leading-[1.55] border-s-2 border-newSep ps-[10px]">
          {t(
            'zalo_video_help_text',
            'Trên máy có màn hình: mở thư mục apps/zalo-bot, chạy "npm run zalovideo:login", đăng nhập Zalo bằng tài khoản quản trị kênh video. Xong sẽ có file data/zalo-video-session.json — tải file đó lên đây. Sau đó bot tự giữ phiên, không cần đăng nhập lại.'
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-[8px]">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onPick}
        />
        <SimpleButton onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === 'upload'
            ? t('zalo_video_uploading', 'Đang tải…')
            : t('zalo_video_upload', 'Tải file phiên lên')}
        </SimpleButton>
        <SimpleButton onClick={check} disabled={!!busy || !session?.hasSession}>
          {busy === 'check'
            ? t('zalo_video_checking', 'Đang kiểm tra…')
            : t('zalo_video_check', 'Kiểm tra')}
        </SimpleButton>
      </div>
    </Card>
  );
};
