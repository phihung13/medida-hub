'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  bot,
  Card,
  DangerLink,
  FieldLabel,
  inputCls,
  PrimaryButton,
  SimpleButton,
  StatusChip,
  textareaCls,
} from './zalo.shared';

// ============================================================================
//  Tab "Token Facebook" — thay tab Token của dashboard bot: cấu hình App
//  Facebook (ID + Secret), bảng token theo Trang kèm hạn, dán user token để
//  tự phát hiện & cấp token VĨNH VIỄN cho mọi Trang quản lý.
// ============================================================================

type TokenInfo = {
  appId: string;
  hasSecret: boolean;
  pages: { page: string; fanpageId: string; env?: string; hasToken: boolean; expiresAt?: number | null }[];
};

const expiryText = (t: (k: string, d: string) => string, e?: number | null) => {
  if (e === 0) return { tone: 'ok' as const, text: t('zalo_token_forever', 'Permanent') };
  if (e == null) return { tone: 'wait' as const, text: '—' };
  const now = Date.now() / 1000;
  const d = new Date(e * 1000).toLocaleDateString('vi-VN');
  if (e < now) return { tone: 'off' as const, text: t('zalo_token_expired', 'Expired') };
  const days = Math.round((e - now) / 86400);
  return days < 14
    ? { tone: 'warn' as const, text: `${d} (${days} ${t('zalo_token_days', 'days')})` }
    : { tone: 'wait' as const, text: d };
};

export const ZaloTokenTab: FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const t = useT();
  const toast = useToaster();

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [editApp, setEditApp] = useState(false);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [userToken, setUserToken] = useState('');
  const [pageRefs, setPageRefs] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await bot('/api/token', undefined, 60000);
      if (r && Array.isArray(r.pages)) {
        setInfo(r);
        setAppId(r.appId || '');
      }
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const appOk = !!info?.appId && !!info?.hasSecret;
  const editing = !appOk || editApp;

  const saveApp = useCallback(async () => {
    if (!appId.trim() && !appSecret.trim()) {
      toast.show(t('zalo_token_need_app', 'Enter the App ID or Secret first'), 'warning');
      return;
    }
    setBusy(true);
    try {
      const r = await bot('/api/fb/app', {
        method: 'POST',
        body: JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim() }),
      });
      if (r?.error) toast.show(r.error, 'warning');
      else {
        toast.show(t('zalo_token_app_saved', 'Facebook App saved & locked'), 'success');
        setEditApp(false);
        setAppSecret('');
        load();
      }
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    } finally {
      setBusy(false);
    }
  }, [appId, appSecret, load, t]);

  const clearApp = useCallback(async () => {
    if (
      !(await deleteDialog(
        t('zalo_token_clear_app_confirm', 'Delete the Facebook App configuration? App ID + Secret will be cleared. Page tokens are kept.'),
        t('zalo_token_clear', 'Delete')
      ))
    )
      return;
    await bot('/api/fb/app', { method: 'POST', body: JSON.stringify({ clear: true }) });
    toast.show(t('zalo_token_app_cleared', 'Facebook App configuration deleted'), 'success');
    load();
  }, [load, t]);

  const refreshTokens = useCallback(async () => {
    if (!userToken.trim()) {
      toast.show(t('zalo_token_paste_first', 'Paste a Facebook user token first'), 'warning');
      return;
    }
    setBusy(true);
    setMsg(t('zalo_token_finding', 'Finding your Pages…'));
    try {
      const r = await bot(
        '/api/token/refresh',
        { method: 'POST', body: JSON.stringify({ userToken: userToken.trim(), pageRefs }) },
        120000
      );
      if (r?.error) {
        setMsg(`${r.error}${r.detail ? ` · ${r.detail}` : ''}`);
        toast.show(r.error, 'warning');
      } else {
        const names = (r.result || []).map((x: any) => x.name).join(', ');
        setMsg(
          t('zalo_token_found_n', 'Found {{n}} Pages: {{names}}')
            .replace('{{n}}', String((r.result || []).length))
            .replace('{{names}}', names)
        );
        toast.show(
          t('zalo_token_granted_n', 'Granted tokens for {{n}} Pages').replace('{{n}}', String((r.result || []).length)),
          'success'
        );
        setUserToken('');
        onChanged?.();
        load();
      }
    } catch {
      setMsg('');
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    } finally {
      setBusy(false);
    }
  }, [userToken, pageRefs, load, onChanged, t]);

  const deleteToken = useCallback(
    async (fanpageId: string, name: string) => {
      if (
        !(await deleteDialog(
          t('zalo_token_delete_confirm', 'Remove Page "{{name}}" from the list and delete its token?').replace('{{name}}', name),
          t('zalo_token_clear', 'Delete')
        ))
      )
        return;
      await bot('/api/token/delete', { method: 'POST', body: JSON.stringify({ fanpageId }) });
      toast.show(t('zalo_token_deleted', 'Page removed'), 'success');
      load();
    },
    [load, t]
  );

  if (info === null) {
    return (
      <div className="text-[13px] text-textItemBlur py-[30px] text-center">
        {t('zalo_token_loading', 'Loading token status from the bot…')}
      </div>
    );
  }

  const anyMissing = info.pages.some((p) => !p.hasToken);
  const anyExpiring = info.pages.some((p) => p.hasToken && p.expiresAt != null && p.expiresAt !== 0);

  return (
    <div className="flex flex-col gap-[14px]">
      {/* App Facebook */}
      <Card
        title={
          <div className="flex items-center gap-[10px] w-full">
            <span className="flex-1">{t('zalo_token_app', 'Facebook App')}</span>
            <StatusChip tone={appOk ? 'ok' : 'off'}>
              {appOk
                ? editing
                  ? t('zalo_token_editing', 'editing')
                  : t('zalo_token_locked', 'configured & locked')
                : t('zalo_token_not_configured', 'not configured')}
            </StatusChip>
          </div>
        }
      >
        <div className="text-[12.5px] text-textItemBlur leading-[1.6]">
          {editing
            ? t('zalo_token_app_hint_edit', 'Open your app page → Settings → Basic to get the App ID + App Secret.')
            : t('zalo_token_app_hint_locked', 'Configured and locked. Click "Change" to edit.')}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
          <div className="flex flex-col gap-[5px]">
            <FieldLabel>App ID</FieldLabel>
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              readOnly={!editing}
              placeholder="e.g. 1234567890"
              className={clsx(inputCls, !editing && 'opacity-60 cursor-not-allowed')}
            />
          </div>
          <div className="flex flex-col gap-[5px]">
            <FieldLabel>App Secret</FieldLabel>
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              readOnly={!editing}
              placeholder={
                info.hasSecret
                  ? t('zalo_token_secret_kept', '•••• saved (leave empty to keep)')
                  : t('zalo_token_secret_ph', 'App secret key')
              }
              className={clsx(inputCls, !editing && 'opacity-60 cursor-not-allowed')}
            />
          </div>
        </div>
        <div className="flex items-center gap-[8px] flex-wrap">
          {editing ? (
            <>
              <PrimaryButton className="!h-[36px] text-[13px]" disabled={busy} onClick={saveApp}>
                {t('zalo_token_save', 'Save')}
              </PrimaryButton>
              {appOk && (
                <SimpleButton className="!h-[36px] text-[13px]" onClick={() => setEditApp(false)}>
                  {t('zalo_token_cancel', 'Cancel')}
                </SimpleButton>
              )}
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noreferrer"
                className="text-[12.5px] font-[600] text-btnPrimary"
              >
                {t('zalo_token_open_devs', 'Open Facebook Developers')} ↗
              </a>
            </>
          ) : (
            <>
              <SimpleButton className="!h-[36px] text-[13px]" onClick={() => setEditApp(true)}>
                ✏️ {t('zalo_token_change', 'Change')}
              </SimpleButton>
              <div className="flex-1" />
              <DangerLink onClick={clearApp}>
                🗑 {t('zalo_token_clear_app', 'Delete configuration')}
              </DangerLink>
            </>
          )}
        </div>
      </Card>

      {/* Bảng token theo Trang */}
      <Card
        title={`${t('zalo_token_by_page', 'Token status by Page')} (${info.pages.length})`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-start text-[11.5px] uppercase tracking-[0.5px] text-textItemBlur">
                <th className="text-start py-[6px] pe-[10px]">{t('zalo_token_page_col', 'Page')}</th>
                <th className="text-start py-[6px] pe-[10px]">ID</th>
                <th className="text-start py-[6px] pe-[10px]">Token</th>
                <th className="text-start py-[6px] pe-[10px]">{t('zalo_token_expiry_col', 'Expires')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {info.pages.length ? (
                info.pages.map((p) => {
                  const ex = expiryText(t, p.expiresAt);
                  return (
                    <tr key={p.fanpageId} className="border-t border-newTableBorder">
                      <td className="py-[8px] pe-[10px] font-[600]">{p.page}</td>
                      <td className="py-[8px] pe-[10px] text-textItemBlur">{p.fanpageId}</td>
                      <td className="py-[8px] pe-[10px]">
                        <StatusChip tone={p.hasToken ? 'ok' : 'off'}>
                          {p.hasToken ? t('zalo_token_has', 'granted') : t('zalo_token_missing', 'missing')}
                        </StatusChip>
                      </td>
                      <td className="py-[8px] pe-[10px]">
                        <StatusChip tone={ex.tone}>{ex.text}</StatusChip>
                      </td>
                      <td className="py-[8px] text-end">
                        <DangerLink onClick={() => deleteToken(p.fanpageId, p.page)}>🗑</DangerLink>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr className="border-t border-newTableBorder">
                  <td colSpan={5} className="py-[10px] text-textItemBlur">
                    {t('zalo_token_no_pages', 'No Pages yet — paste a user token below.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-[12px] text-textItemBlur">
          {anyMissing && `⚠ ${t('zalo_token_some_missing', 'Some Pages have no token — grant below.')} `}
          {anyExpiring && `⚠ ${t('zalo_token_some_expiring', 'Some tokens will expire — consider re-granting.')} `}
          {!anyMissing && !anyExpiring && !!info.pages.length &&
            `✓ ${t('zalo_token_all_ok', 'All tokens are permanent — nothing to do.')}`}
        </div>
      </Card>

      {/* Cấp / làm mới token */}
      <Card title={t('zalo_token_add', 'Add / refresh tokens')}>
        <div className="flex flex-col gap-[5px]">
          <FieldLabel>1 · {t('zalo_token_user_token', 'Facebook User Token')}</FieldLabel>
          <textarea
            rows={3}
            value={userToken}
            onChange={(e) => setUserToken(e.target.value)}
            placeholder={t('zalo_token_user_ph', 'Paste the Facebook user token here…')}
            className={textareaCls}
          />
        </div>
        <div className="flex flex-col gap-[5px]">
          <FieldLabel
            hint={t(
              'zalo_token_refs_hint',
              'List the Pages you manage & want to post to. Pages inside Business Manager MUST be listed here (user tokens cannot enumerate them). Get the ID: Page → About → Page ID.'
            )}
          >
            2 · {t('zalo_token_page_refs', 'Pages to post to (ID or link — one per line)')}
          </FieldLabel>
          <textarea
            rows={2}
            value={pageRefs}
            onChange={(e) => setPageRefs(e.target.value)}
            placeholder="facebook.com/YourPage  ·  1234567890"
            className={textareaCls}
          />
        </div>
        <div className="flex items-center gap-[10px] flex-wrap">
          <PrimaryButton className="!h-[36px] text-[13px]" disabled={busy} onClick={refreshTokens}>
            {busy ? t('zalo_token_working', 'Working…') : t('zalo_token_grant', 'Grant / refresh tokens')}
          </PrimaryButton>
          <a
            href="https://developers.facebook.com/tools/explorer/"
            target="_blank"
            rel="noreferrer"
            className="text-[12.5px] font-[600] text-btnPrimary"
          >
            Graph Explorer ↗
          </a>
        </div>
        {!!msg && <div className="text-[12.5px] text-textItemBlur leading-[1.6]">{msg}</div>}
        <div>
          <span
            onClick={() => setGuideOpen((v) => !v)}
            className="text-[12.5px] font-[600] text-btnPrimary cursor-pointer"
          >
            {guideOpen ? '▾' : '▸'} {t('zalo_token_guide', 'How to get a token — 4 steps')}
          </span>
          {guideOpen && (
            <ol className="list-decimal ms-[18px] mt-[8px] flex flex-col gap-[4px] text-[12.5px] text-textItemBlur leading-[1.6]">
              <li>{t('zalo_token_guide_1', 'Open Graph Explorer (button above) and pick YOUR app at the top right.')}</li>
              <li>{t('zalo_token_guide_2', 'Click Permissions → add: pages_show_list, pages_manage_posts, pages_read_engagement.')}</li>
              <li>{t('zalo_token_guide_3', 'Click "Generate Access Token", sign in if asked, then copy the token string.')}</li>
              <li>{t('zalo_token_guide_4', 'Paste it above → the system finds every Page you manage and grants permanent tokens.')}</li>
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
};
