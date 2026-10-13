'use client';

import { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import clsx from 'clsx';
import copy from 'copy-to-clipboard';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { resolveBaseUrl } from '@gitroom/helpers/utils/custom.fetch.func';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  KeyStatus,
  SettingsCardHeader,
  settingsNeutralBtn,
  settingsPrimaryBtn,
  settingsSelect,
} from '@gitroom/frontend/components/settings/settings-card.component';

// ============================================================================
//  Kết nối agent MCP: quản trị viên tổ chức tạo khoá MCP riêng cho agent ngoài
//  (Hermes…) với một mức quyền, xem lần dùng cuối, thu hồi. Khoá gốc chỉ hiện
//  đúng một lần. Danh sách công cụ: docs/MCP_HUB.md.
// ============================================================================

type Level = 'doc' | 'nhap' | 'dang';

type McpKey = {
  id: string;
  name: string;
  level: Level;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const useMcpKeys = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/mcp-keys')).json();
  }, []);
  return useSWR<McpKey[]>('mcp-keys', load, { revalidateOnFocus: false });
};

const codeCls =
  'flex-1 min-w-0 font-mono text-[13px] bg-newBgColorInner border border-newTableBorder rounded-[8px] h-[42px] px-[12px] flex items-center overflow-x-auto whitespace-nowrap select-all';

export const McpKeysComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const { backendUrl, mcpUrl } = useVariables();
  const { data: keys, mutate } = useMcpKeys();
  const [name, setName] = useState('Hermes');
  const [level, setLevel] = useState<Level>('nhap');
  const [newKey, setNewKey] = useState('');
  const [creating, setCreating] = useState(false);

  const endpoint = `${resolveBaseUrl(mcpUrl || backendUrl)}/mcp`;
  const active = Array.isArray(keys) ? keys : [];

  const levels: Record<Level, { label: string; hint: string }> = {
    doc: {
      label: t('mcp_level_doc', 'Chỉ đọc'),
      hint: t(
        'mcp_level_doc_hint',
        'Xem lịch, bài, số liệu, hàng chờ Zalo, viral. Không tạo/sửa gì.'
      ),
    },
    nhap: {
      label: t('mcp_level_nhap', 'Tạo nháp'),
      hint: t(
        'mcp_level_nhap_hint',
        'Thêm: tạo/sửa bài NHÁP, chạy AI, tải media, đẩy bài Zalo sang Lịch. Người duyệt vẫn bấm đăng.'
      ),
    },
    dang: {
      label: t('mcp_level_dang', 'Được đăng'),
      hint: t(
        'mcp_level_dang_hint',
        'Thêm: lên lịch, đăng ngay, duyệt đăng Zalo/Facebook, gửi tin Zalo, đổi cấu hình, xoá. Agent tự đăng ra ngoài được.'
      ),
    },
  };

  const copyText = useCallback((text: string) => {
    copy(text);
    toast.show(t('copied', 'Đã chép'), 'success');
  }, []);

  const createKey = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch('/mcp-keys', {
        method: 'POST',
        body: JSON.stringify({ name, level }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.key) {
        toast.show(
          data?.message || t('mcp_key_failed', 'Chưa tạo được khoá, thử lại sau.'),
          'warning'
        );
        return;
      }
      setNewKey(data.key);
      mutate();
    } finally {
      setCreating(false);
    }
  }, [name, level, mutate]);

  const revoke = useCallback(
    async (k: McpKey) => {
      if (
        !(await deleteDialog(
          t(
            'mcp_revoke_confirm',
            'Thu hồi khoá "{{name}}" (…{{last4}})? Agent dùng khoá này sẽ mất kết nối ngay.'
          )
            .replace('{{name}}', k.name)
            .replace('{{last4}}', k.last4),
          t('mcp_revoke', 'Thu hồi')
        ))
      ) {
        return;
      }
      await fetch(`/mcp-keys/${k.id}`, { method: 'DELETE' });
      toast.show(t('mcp_revoked', 'Đã thu hồi khoá'), 'success');
      mutate();
    },
    [mutate]
  );

  const config = newKey
    ? JSON.stringify(
        {
          mcpServers: {
            'media-hub': {
              type: 'http',
              url: endpoint,
              headers: { Authorization: `Bearer ${newKey}` },
            },
          },
        },
        null,
        2
      )
    : '';

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <SettingsCardHeader
        title={t('mcp_keys_title', 'Kết nối agent MCP')}
        status={
          <KeyStatus
            ok={active.length > 0}
            okLabel={t('mcp_keys_has', '{{n}} khoá').replace(
              '{{n}}',
              String(active.length)
            )}
            missingLabel={t('mcp_keys_none', 'Chưa có khoá')}
          />
        }
      >
        <p>
          {t(
            'mcp_keys_help_1',
            'Cho agent bên ngoài (Hermes agentic OS, Claude, Cursor…) điều khiển Hub qua MCP: lịch đăng, Zalo, đăng tự động, nhập Excel, viral, số liệu, media.'
          )}
        </p>
        <p>
          {t(
            'mcp_keys_help_2',
            'Mỗi agent một khoá, chọn mức quyền vừa đủ. Bắt đầu bằng "Tạo nháp": agent soạn sẵn, người duyệt bấm đăng. Thu hồi được bất cứ lúc nào.'
          )}
        </p>
        <p>
          {t(
            'mcp_keys_help_3',
            'Agent gửi khoá bằng header Authorization: Bearer <khoá>. Client không gửi được header thì dùng địa chỉ /mcp/<khoá>.'
          )}
        </p>
      </SettingsCardHeader>

      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[13px] font-[600]">
            {t('mcp_endpoint', 'Địa chỉ MCP (Streamable HTTP)')}
          </div>
          <div className="flex gap-[8px]">
            <div className={codeCls}>{endpoint}</div>
            <Button
              type="button"
              className={settingsNeutralBtn}
              onClick={() => copyText(endpoint)}
            >
              {t('copy', 'Chép')}
            </Button>
          </div>
        </div>

        {!!newKey && (
          <div
            role="status"
            className="flex flex-col gap-[8px] p-[12px] rounded-[8px] border border-btnPrimary bg-newBgColorInner"
          >
            <div className="text-[13px] font-[600]">
              {t(
                'mcp_new_key',
                'Khoá mới — chỉ hiện đúng một lần, chép vào cấu hình agent ngay'
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
            <div className="text-[12px] text-newTextColor/60">
              {t('mcp_config_hint', 'Cấu hình mẫu (định dạng mcpServers):')}
            </div>
            <pre className="font-mono text-[12px] bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px] overflow-x-auto whitespace-pre">
              {config}
            </pre>
            <div className="flex items-center gap-[12px] text-[12px] text-newTextColor/60 flex-wrap">
              <span className="flex-1 min-w-[200px]">
                {t(
                  'mcp_key_warning',
                  'Không gửi khoá qua chat, Zalo, email — dán thẳng vào cấu hình của agent.'
                )}
              </span>
              <Button
                type="button"
                className={settingsNeutralBtn}
                onClick={() => copyText(config)}
              >
                {t('mcp_copy_config', 'Chép cấu hình')}
              </Button>
              <button
                type="button"
                onClick={() => setNewKey('')}
                className="text-[13px] font-[600] text-btnPrimary hover:underline underline-offset-2"
              >
                {t('mcp_done', 'Đã chép xong')}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-[8px]">
          <div className="flex items-end gap-[8px] flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <Input
                value={name}
                disableForm={true}
                removeError={true}
                onChange={(e) => setName(e.target.value)}
                name="mcp-key-name"
                label={t('mcp_key_name', 'Tên agent')}
                placeholder="Hermes"
                maxLength={60}
              />
            </div>
            <label className="flex flex-col gap-[6px] text-[14px]">
              <span>{t('mcp_key_level', 'Mức quyền')}</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                className={clsx(settingsSelect, 'min-w-[160px]')}
              >
                {(Object.keys(levels) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {levels[l].label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              className={settingsPrimaryBtn}
              loading={creating}
              disabled={!name.trim()}
              onClick={createKey}
            >
              {t('mcp_create', 'Tạo khoá')}
            </Button>
          </div>
          <div
            className={clsx(
              'text-[12px] leading-[1.6]',
              level === 'dang' ? 'text-red-500' : 'text-newTextColor/60'
            )}
          >
            {levels[level].hint}
          </div>
        </div>

        {active.length > 0 && (
          <ul className="flex flex-col border border-newTableBorder rounded-[8px] divide-y divide-newTableBorder">
            {active.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-[12px] px-[12px] py-[10px] text-[13px]"
              >
                <span className="font-[600] shrink-0 max-w-[140px] truncate">
                  {k.name}
                </span>
                <span className="shrink-0 px-[8px] py-[2px] rounded-full border border-newTableBorder text-[12px]">
                  {levels[k.level]?.label || k.level}
                </span>
                <span className="font-mono shrink-0">…{k.last4}</span>
                <span className="flex-1 min-w-0 text-newTextColor/60 truncate">
                  {t('mcp_created', 'Tạo')}{' '}
                  {dayjs(k.createdAt).format('DD/MM/YYYY')}
                  {' · '}
                  {k.lastUsedAt
                    ? `${t('mcp_last_used', 'dùng lần cuối')} ${dayjs(
                        k.lastUsedAt
                      ).format('HH:mm DD/MM')}`
                    : t('mcp_unused', 'chưa dùng')}
                </span>
                <button
                  type="button"
                  onClick={() => revoke(k)}
                  className="shrink-0 text-[13px] font-[600] text-red-500 hover:underline underline-offset-2 mobile:min-h-[44px]"
                >
                  {t('mcp_revoke', 'Thu hồi')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
