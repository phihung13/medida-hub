'use client';

import { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import copy from 'copy-to-clipboard';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { resolveBaseUrl } from '@gitroom/helpers/utils/custom.fetch.func';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  KeyStatus,
  SettingsCardHeader,
  settingsNeutralBtn,
  settingsPrimaryBtn,
} from '@gitroom/frontend/components/settings/settings-card.component';

// ============================================================================
//  Kết nối Major OS (chuẩn v2): Major OS tự gọi API chỉ đọc của Hub để lấy
//  báo cáo sử dụng & góp ý. Ở đây quản trị hệ thống tạo / thu hồi key và tải
//  file mô tả API (public/major-os-mo-ta.md) để dán vào Major OS → Kết nối app.
// ============================================================================

type MajorOsKey = {
  id: string;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const useMajorOsKeys = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/usage/major-os/keys')).json();
  }, []);
  return useSWR<MajorOsKey[]>('major-os-keys', load, {
    revalidateOnFocus: false,
  });
};

const codeCls =
  'flex-1 min-w-0 font-mono text-[13px] bg-newBgColorInner border border-newTableBorder rounded-[8px] h-[42px] px-[12px] flex items-center overflow-x-auto whitespace-nowrap select-all';

export const MajorOsComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const user = useUser();
  const { backendUrl } = useVariables();
  const { data: keys, mutate } = useMajorOsKeys();
  const [newKey, setNewKey] = useState('');
  const [creating, setCreating] = useState(false);

  const api = `${resolveBaseUrl(backendUrl)}/major-os/v1`;
  const active = Array.isArray(keys) ? keys : [];

  const copyText = useCallback((text: string) => {
    copy(text);
    toast.show(t('copied', 'Đã chép'), 'success');
  }, []);

  const createKey = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch('/usage/major-os/keys', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.key) {
        toast.show(
          data?.message ||
            t('major_os_key_failed', 'Chưa tạo được key, thử lại sau.'),
          'warning'
        );
        return;
      }
      setNewKey(data.key);
      mutate();
    } finally {
      setCreating(false);
    }
  }, [mutate]);

  const revoke = useCallback(
    async (k: MajorOsKey) => {
      if (
        !(await deleteDialog(
          t(
            'major_os_revoke_confirm',
            'Thu hồi key …{{last4}}? Major OS dùng key này sẽ không lấy được báo cáo nữa.'
          ).replace('{{last4}}', k.last4),
          t('major_os_revoke', 'Thu hồi')
        ))
      ) {
        return;
      }
      await fetch(`/usage/major-os/keys/${k.id}`, { method: 'DELETE' });
      toast.show(t('major_os_revoked', 'Đã thu hồi key'), 'success');
      mutate();
    },
    [mutate]
  );

  // File mô tả gửi Major OS — điền sẵn địa chỉ API thật của Hub này.
  const downloadSpec = useCallback(async () => {
    try {
      const res = await window.fetch('/major-os-mo-ta.md', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const text = (await res.text())
        .split('{{API}}')
        .join(api)
        .split('{{LIEN_HE}}')
        .join(
          [user?.name, user?.lastName].filter(Boolean).join(' ') +
            (user?.email ? ` <${user.email}>` : '')
        )
        .split('{{NGAY}}')
        .join(dayjs().format('DD/MM/YYYY'));
      const url = URL.createObjectURL(
        new Blob([text], { type: 'text/markdown;charset=utf-8' })
      );
      // Firefox chỉ tải khi <a> nằm trong trang; giải phóng URL ngay sau
      // click thì Safari/Firefox có thể huỷ tải -> chờ một nhịp.
      const a = document.createElement('a');
      a.href = url;
      a.download = 'media-hub-major-os.md';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.show(
        t('major_os_spec_failed', 'Không tải được file mô tả.'),
        'warning'
      );
    }
  }, [api, user]);

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <SettingsCardHeader
        title={t('major_os_title', 'Kết nối Major OS')}
        status={
          <KeyStatus
            ok={active.length > 0}
            okLabel={t('major_os_has_key', 'Đã có key')}
          />
        }
      >
        <p>
          {t(
            'major_os_help_1',
            'Major OS (os.truongvietanh.com) tự gọi các API dưới đây khoảng 15 phút/lần để lấy báo cáo sử dụng và góp ý của Hub.'
          )}
        </p>
        <p>
          {t(
            'major_os_help_2',
            'Cách nối: bấm "Tạo key" → vào Major OS → Kết nối app → Thêm app → dán địa chỉ API và key, tải file mô tả lên → bấm Thử kết nối.'
          )}
        </p>
        <p>
          {t(
            'major_os_help_3',
            'Key chỉ đọc báo cáo, thu hồi được bất cứ lúc nào. Đổi key: tạo key mới, dán vào Major OS, rồi thu hồi key cũ.'
          )}
        </p>
      </SettingsCardHeader>

      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[13px] font-[600]">
            {t('major_os_api', 'Địa chỉ API')}
          </div>
          <div className="flex gap-[8px]">
            <div className={codeCls}>{api}</div>
            <Button
              type="button"
              className={settingsNeutralBtn}
              onClick={() => copyText(api)}
            >
              {t('copy', 'Chép')}
            </Button>
          </div>
          <div className="text-[12px] text-newTextColor/60 leading-[1.6]">
            {t('major_os_auth_hint', 'Gửi key bằng header')}{' '}
            <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>
            {' · '}
            <code className="font-mono">/tinh-nang</code>,{' '}
            <code className="font-mono">/thoi-gian-dung</code>,{' '}
            <code className="font-mono">/gop-y</code>
          </div>
        </div>

        {!!newKey && (
          <div
            role="status"
            className="flex flex-col gap-[8px] p-[12px] rounded-[8px] border border-btnPrimary bg-newBgColorInner"
          >
            <div className="text-[13px] font-[600]">
              {t(
                'major_os_new_key',
                'Key mới — chỉ hiện đúng một lần, chép và dán vào Major OS ngay'
              )}
            </div>
            <div className="flex gap-[8px]">
              <div className={codeCls}>{newKey}</div>
              <Button
                type="button"
                className={settingsPrimaryBtn}
                onClick={() => copyText(newKey)}
              >
                {t('copy', 'Chép')}
              </Button>
            </div>
            <div className="flex items-center gap-[12px] text-[12px] text-newTextColor/60">
              <span className="flex-1">
                {t(
                  'major_os_key_warning',
                  'Không gửi key qua chat, Zalo, email — chỉ dán ở trang Kết nối app của Major OS.'
                )}
              </span>
              <button
                type="button"
                onClick={() => setNewKey('')}
                className="text-[13px] font-[600] text-btnPrimary hover:underline underline-offset-2"
              >
                {t('major_os_done', 'Đã chép xong')}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-[8px] flex-wrap">
          <Button
            type="button"
            className={settingsPrimaryBtn}
            loading={creating}
            onClick={createKey}
          >
            {t('major_os_create', 'Tạo key')}
          </Button>
          <Button
            type="button"
            className={settingsNeutralBtn}
            onClick={downloadSpec}
          >
            {t('major_os_download', 'Tải file mô tả')}
          </Button>
        </div>

        {active.length > 0 && (
          <ul className="flex flex-col border border-newTableBorder rounded-[8px] divide-y divide-newTableBorder">
            {active.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-[12px] px-[12px] py-[10px] text-[13px]"
              >
                <span className="font-mono shrink-0">…{k.last4}</span>
                <span className="flex-1 min-w-0 text-newTextColor/60 truncate">
                  {t('major_os_created', 'Tạo')}{' '}
                  {dayjs(k.createdAt).format('DD/MM/YYYY')}
                  {' · '}
                  {k.lastUsedAt
                    ? `${t('major_os_last_used', 'Major OS gọi lần cuối')} ${dayjs(
                        k.lastUsedAt
                      ).format('HH:mm DD/MM')}`
                    : t('major_os_unused', 'Major OS chưa gọi')}
                </span>
                <button
                  type="button"
                  onClick={() => revoke(k)}
                  className="shrink-0 text-[13px] font-[600] text-red-500 hover:underline underline-offset-2 mobile:min-h-[44px]"
                >
                  {t('major_os_revoke', 'Thu hồi')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
