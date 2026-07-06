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
  const [starting, setStarting] = useState(false);

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

  const startLogin = useCallback(async () => {
    setStarting(true);
    await call('/api/gbp/login/start', t('zalo_gbp_browser_opened', 'Google login browser opened on the bot machine'));
    setStarting(false);
  }, [call, t]);

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
  const login = status.login || {};
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
        <div className="text-[12.5px] text-textItemBlur leading-[1.6]">
          {t(
            'zalo_gbp_session_hint',
            'Google Business posts through a saved Google login (Playwright). Google does not publish exact expiry; the estimate below is based on session cookies.'
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[8px] text-[13px]">
          <div className="flex justify-between border border-newTableBorder rounded-[8px] px-[12px] py-[8px]">
            <span className="text-textItemBlur">{t('zalo_gbp_updated', 'Last updated')}</span>
            <b>{sess.updatedAt ? fmtFull(sess.updatedAt) : '—'}</b>
          </div>
          <div className="flex justify-between border border-newTableBorder rounded-[8px] px-[12px] py-[8px]">
            <span className="text-textItemBlur">{t('zalo_gbp_expiry', 'Estimated expiry')}</span>
            <b>
              {sess.expiresAt
                ? `${new Date(sess.expiresAt).toLocaleDateString('vi-VN')}${expDays != null ? ` (${expDays} ${t('zalo_token_days', 'days')})` : ''}`
                : t('zalo_gbp_unknown', 'Unknown')}
            </b>
          </div>
        </div>
        <div className="flex items-center gap-[10px] flex-wrap">
          {login.active ? (
            <>
              <PrimaryButton className="!h-[36px] text-[13px]" disabled={busy} onClick={() => call('/api/gbp/login/save', t('zalo_gbp_session_saved', 'Google session saved'))}>
                {t('zalo_gbp_save_login', 'Save session (after logging in)')}
              </PrimaryButton>
              <DangerLink onClick={() => call('/api/gbp/login/cancel', t('zalo_gbp_login_cancelled', 'Login cancelled'))}>
                {t('zalo_token_cancel', 'Cancel')}
              </DangerLink>
            </>
          ) : (
            <PrimaryButton className="!h-[36px] text-[13px]" disabled={busy || starting} onClick={startLogin}>
              {starting
                ? t('zalo_gbp_starting', 'Opening browser… (10–15s, do not click again)')
                : sess.hasSession
                ? t('zalo_gbp_update_session', 'Update session')
                : t('zalo_gbp_open_login', 'Open Google login browser')}
            </PrimaryButton>
          )}
          <span onClick={load} className="cursor-pointer text-[12.5px] font-[600] text-btnPrimary">
            ↻ {t('zalo_refresh', 'Refresh')}
          </span>
        </div>
        <div className="text-[12px] text-textItemBlur leading-[1.6]">
          {t(
            'zalo_gbp_login_note',
            'The login browser opens ON THE MACHINE RUNNING THE BOT. If the bot runs on a headless VPS, log in on a local machine (npm run gbp:login → data/gbp-session.json) and upload the file here:'
          )}
        </div>
        <label className="inline-flex items-center gap-[6px] cursor-pointer text-[12.5px] font-[600] text-btnPrimary w-fit">
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              uploadSession(e.target.files);
              e.target.value = '';
            }}
          />
          📤 {t('zalo_gbp_upload_session', 'Upload session file (gbp-session.json)')}
        </label>
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
              className="cursor-pointer normal-case tracking-normal font-[600] text-btnPrimary text-[12.5px]"
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
                <DangerLink onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}>✕</DangerLink>
              </div>
            ))}
            <div className="flex items-center gap-[10px]">
              <SimpleButton className="!h-[34px] text-[13px]" onClick={() => setRows((cur) => [...cur, { name: '', id: '' }])}>
                + {t('zalo_gbp_add_profile', 'Add profile')}
              </SimpleButton>
              <PrimaryButton className="!h-[34px] text-[13px]" disabled={busy} onClick={saveBiz}>
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
