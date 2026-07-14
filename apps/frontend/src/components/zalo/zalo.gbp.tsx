'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  bot,
  Card,
  DangerLink,
  fmtFull,
  GbpBusiness,
  GbpStatus,
  inputCls,
  PrimaryButton,
  SimpleButton,
  StatusChip,
} from './zalo.shared';

// ============================================================================
//  Tab "Google Business" — thay tab GBP của dashboard bot: trạng thái session
//  Playwright, đăng nhập Google (mở trình duyệt trên máy chạy bot / upload
//  session JSON cho VPS không màn hình), danh sách hồ sơ Business dùng ở tab
//  Nhóm → Trang.
// ============================================================================

export const ZaloGbpTab: FC = () => {
  const t = useT();
  const toast = useToaster();

  const [status, setStatus] = useState<GbpStatus | null>(null);
  const [rows, setRows] = useState<GbpBusiness[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vncSrc, setVncSrc] = useState<string | null>(null);
  const [vncBusy, setVncBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Mở màn hình ảo: xin vé từ bot → dựng iframe noVNC (qua nginx /botvnc, hỗ
  // trợ WebSocket) → mở luôn trình duyệt đăng nhập Google trên bot.
  const openVirtualScreen = useCallback(async () => {
    setVncBusy(true);
    try {
      const r = await bot('/api/gbp/vnc-ticket', { method: 'POST' }, 30000);
      if (!r?.ticket) {
        toast.show(r?.error || t('zalo_gbp_vnc_fail', 'Bot chưa bật được màn hình ảo'), 'warning');
        return;
      }
      // Path noVNC có thể cần chỉnh theo layout thật trên VPS (xem vnc-debug).
      setVncSrc(
        `/botvnc/vnc/vnc.html?path=botvnc/vnc/websockify&autoconnect=true&resize=scale&ticket=${r.ticket}`
      );
      bot('/api/gbp/login/start', { method: 'POST', body: '{}' }, 60000).catch(() => {});
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    } finally {
      setVncBusy(false);
    }
  }, [t]);

  const load = useCallback(async () => {
    try {
      const s = await bot('/api/gbp/status', undefined, 30000);
      if (s) {
        setStatus(s);
        if (!editing) setRows(s.businesses || []);
      }
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
  }, [editing, t]);

  useEffect(() => {
    load();
  }, [load]);

  const call = useCallback(
    async (path: string, okMsg: string, body?: any) => {
      setBusy(true);
      try {
        const r = await bot(path, { method: 'POST', body: JSON.stringify(body || {}) }, 60000);
        if (r?.error) toast.show(r.error, 'warning');
        else {
          toast.show(okMsg, 'success');
          load();
        }
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      } finally {
        setBusy(false);
      }
    },
    [load, t]
  );


  const uploadSession = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      try {
        const session = JSON.parse(await f.text());
        await call('/api/gbp/session/upload', t('zalo_gbp_session_uploaded', 'Session uploaded — Google Business is ready'), { session });
      } catch {
        toast.show(t('zalo_gbp_bad_file', 'Invalid session file'), 'warning');
      }
    },
    [call, t]
  );

  const saveBiz = useCallback(async () => {
    const businesses = rows.map((b) => ({ name: (b.name || '').trim(), id: String(b.id || '').trim() })).filter((b) => b.id);
    await call('/api/gbp/businesses', t('zalo_gbp_biz_saved', 'Google Business profiles saved'), { businesses });
    setEditing(false);
  }, [rows, call, t]);

  if (status === null) {
    return (
      <div className="text-[13px] text-textItemBlur py-[30px] text-center">
        {t('zalo_gbp_loading', 'Loading Google Business status…')}
      </div>
    );
  }

  const sess = status.session || {};
  const expDays = sess.expiresAt ? Math.round((sess.expiresAt - Date.now()) / 86400000) : null;

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Session */}
      <Card
        title={
          <div className="flex items-center gap-[10px] w-full">
            <span className="flex-1">{t('zalo_gbp_session', 'Google login session')}</span>
            <StatusChip tone={sess.hasSession ? (sess.expired ? 'warn' : 'ok') : 'off'}>
              {sess.hasSession
                ? sess.expired
                  ? t('zalo_gbp_maybe_expired', 'may be expired')
                  : t('zalo_gbp_has_session', 'session saved')
                : t('zalo_gbp_no_session', 'no session')}
            </StatusChip>
          </div>
        }
      >
        {/* Số liệu session gọn 1 dòng */}
        <div className="flex gap-[8px] text-[12.5px] flex-wrap">
          <span className="border border-newTableBorder rounded-[8px] px-[10px] py-[6px]">
            {t('zalo_gbp_updated', 'Cập nhật')}:{' '}
            <b>{sess.updatedAt ? fmtFull(sess.updatedAt) : '—'}</b>
          </span>
          <span className="border border-newTableBorder rounded-[8px] px-[10px] py-[6px]">
            {t('zalo_gbp_expiry', 'Hết hạn ước tính')}:{' '}
            <b>
              {sess.expiresAt
                ? `${new Date(sess.expiresAt).toLocaleDateString('vi-VN')}${expDays != null ? ` (${expDays}${t('zalo_token_days_short', 'ngày')})` : ''}`
                : t('zalo_gbp_unknown', '—')}
            </b>
          </span>
        </div>

        {/* Màn hình ảo — cách chính để đăng nhập Google ngay trên web */}
        {vncSrc ? (
          <div className="flex flex-col gap-[8px]">
            <div className="rounded-[10px] overflow-hidden border border-newTableBorder bg-black">
              <iframe
                src={vncSrc}
                title="Google login virtual screen"
                className="w-full h-[520px] mobile:h-[70dvh] block"
              />
            </div>
            <div className="hidden mobile:block text-[11.5px] text-textItemBlur leading-[1.5]">
              💻{' '}
              {t(
                'zalo_gbp_easier_desktop',
                'Mẹo: thao tác đăng nhập trên màn hình ảo này dễ hơn trên máy tính.'
              )}
            </div>
            <div className="flex items-center gap-[10px] flex-wrap">
              <PrimaryButton className="!h-[36px] mobile:!h-[44px] text-[13px]" disabled={busy} onClick={() => call('/api/gbp/login/save', t('zalo_gbp_session_saved', 'Đã lưu session Google'))}>
                ✓ {t('zalo_gbp_done_login', 'Đã đăng nhập xong — Lưu')}
              </PrimaryButton>
              <DangerLink onClick={() => { setVncSrc(null); call('/api/gbp/login/cancel', t('zalo_gbp_login_cancelled', 'Đã hủy')); }}>
                {t('zalo_token_cancel', 'Đóng')}
              </DangerLink>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-[10px] flex-wrap">
            <PrimaryButton className="!h-[36px] mobile:!h-[44px] text-[13px]" disabled={vncBusy} onClick={openVirtualScreen}>
              {vncBusy
                ? t('zalo_gbp_opening_screen', 'Đang mở màn hình…')
                : sess.hasSession
                ? t('zalo_gbp_update_session', 'Đăng nhập lại Google')
                : t('zalo_gbp_open_screen', '🖥 Đăng nhập Google ngay trên web')}
            </PrimaryButton>
            <span onClick={load} className="cursor-pointer text-[12.5px] font-[600] text-btnPrimary mobile:min-h-[40px] mobile:inline-flex mobile:items-center">
              ↻ {t('zalo_refresh', 'Làm mới')}
            </span>
            <span onClick={() => setShowUpload((v) => !v)} className="cursor-pointer text-[12px] text-textItemBlur hover:text-newTextColor mobile:min-h-[40px] mobile:inline-flex mobile:items-center">
              {t('zalo_gbp_other_way', 'Cách khác: tải file session…')}
            </span>
          </div>
        )}

        {/* Fallback: upload session file (thu gọn) */}
        {showUpload && !vncSrc && (
          <label className="inline-flex items-center gap-[6px] cursor-pointer text-[12.5px] font-[600] text-btnPrimary w-fit mobile:min-h-[44px]">
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                uploadSession(e.target.files);
                e.target.value = '';
              }}
            />
            📤 {t('zalo_gbp_upload_session', 'Tải file session (gbp-session.json) — đăng nhập ở máy local: npm run gbp:login')}
          </label>
        )}
      </Card>

      {/* Hồ sơ Business */}
      <Card
        title={
          <div className="flex items-center gap-[10px] w-full">
            <span className="flex-1">{t('zalo_gbp_profiles', 'Google Business profiles')}</span>
            <span
              onClick={() => {
                if (editing) setRows(status.businesses || []);
                setEditing((v) => !v);
              }}
              className="cursor-pointer normal-case tracking-normal font-[600] text-btnPrimary text-[12.5px] mobile:min-h-[40px] mobile:inline-flex mobile:items-center"
            >
              {editing ? t('zalo_gbp_close_edit', 'Close editing') : `✏️ ${t('zalo_gbp_edit', 'Edit')}`}
            </span>
          </div>
        }
      >
        <div className="text-[12.5px] text-textItemBlur leading-[1.6]">
          {t(
            'zalo_gbp_profiles_hint',
            'Save each name + Business/Profile ID once. The Groups → Pages tab then picks them from a dropdown. The ID is the long number in Google Business Advanced settings.'
          )}
        </div>
        {editing ? (
          <div className="flex flex-col gap-[8px]">
            {rows.map((b, i) => (
              <div key={i} className="flex items-center gap-[8px] flex-wrap">
                <input
                  value={b.name || ''}
                  onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder={t('zalo_gbp_name_ph', 'Display name, e.g. Việt Anh School')}
                  className={inputCls + ' flex-1 min-w-[160px] !w-auto'}
                />
                <input
                  value={b.id || ''}
                  onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
                  placeholder="Business/Profile ID"
                  className={inputCls + ' flex-1 min-w-[160px] !w-auto'}
                />
                <DangerLink className="mobile:min-w-[40px] mobile:justify-center" onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}>✕</DangerLink>
              </div>
            ))}
            <div className="flex items-center gap-[10px]">
              <SimpleButton className="!h-[34px] mobile:!h-[44px] text-[13px]" onClick={() => setRows((cur) => [...cur, { name: '', id: '' }])}>
                + {t('zalo_gbp_add_profile', 'Add profile')}
              </SimpleButton>
              <PrimaryButton className="!h-[34px] mobile:!h-[44px] text-[13px]" disabled={busy} onClick={saveBiz}>
                {t('zalo_gbp_save_list', 'Save list')}
              </PrimaryButton>
            </div>
          </div>
        ) : (status.businesses || []).length ? (
          <div className="flex flex-col">
            {(status.businesses || []).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-[8px] border-b border-newTableBorder last:border-b-0 text-[13px]">
                <b>{b.name || '—'}</b>
                <span className="text-textItemBlur">{b.id}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[13px] text-textItemBlur">
            {t('zalo_gbp_no_profiles', 'No profiles yet. Click "Edit" to add your Google Business IDs.')}
          </div>
        )}
      </Card>
    </div>
  );
};
