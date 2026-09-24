'use client';

import { FC, useCallback, useEffect, useId, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  KeyStatus,
  ModelNotes,
  ModelOption,
  ModelOptions,
  SettingsCardHeader,
  settingsNeutralBtn,
  settingsPrimaryBtn,
  settingsSelect,
} from '@gitroom/frontend/components/settings/settings-card.component';

// Nhập Claude (Anthropic) API key ngay trong UI Settings — không cần sửa .env.
// Dùng cho AI viết bài + Agent của Postiz.
// Model khả dụng (khớp ANTHROPIC_MODELS phía backend).
// `id` = value đã lưu — KHÔNG đổi. `name` = nhãn gọn trong dropdown,
// `note` hiện trong phần ⓘ.
const MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', note: 'cân bằng', recommended: true },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', note: 'nhanh, rẻ' },
  { id: 'claude-opus-4-8', name: 'Opus 4.8', note: 'mạnh nhất' },
];
// Model DeepSeek trên OpenRouter (khớp OPENROUTER_MODELS phía backend).
// (bỏ cả dòng R1 — 'deepseek-r1' và 'deepseek-r1-0528': OpenRouter đẩy sang
//  endpoint Azure hỏng, 404 no_callers, không tự đổi provider — xem
//  RETIRED_OPENROUTER_MODELS bên backend)
const OR_MODELS: ModelOption[] = [
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', note: '4/2026 — nhanh, ngữ cảnh 1M', recommended: true },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', note: '4/2026 — mạnh nhất, đắt hơn' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', note: '12/2025 — rẻ, tốt' },
  { id: 'deepseek/deepseek-v3.2-speciale', name: 'DeepSeek V3.2 Speciale', note: 'bản mạnh hơn cho việc khó' },
  { id: 'deepseek/deepseek-v3.1-terminus', name: 'DeepSeek V3.1 Terminus', note: '9/2025' },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek V3.1', note: '8/2025' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', note: 'deepseek-chat — đời cũ' },
  { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3 0324', note: 'đời cũ' },
];

export const AnthropicComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [key, setKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [status, setStatus] = useState<{
    hasKey: boolean;
    masked: string;
    model?: string;
    provider?: string;
    openrouter?: { hasKey: boolean; masked: string; model?: string };
  }>({
    hasKey: false,
    masked: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await (await fetch('/copilot/anthropic-key')).json();
      setStatus(res);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const save = useCallback(async () => {
    const k = key.trim();
    if (!k) return;
    const res = await fetch('/copilot/anthropic-key', {
      method: 'POST',
      body: JSON.stringify({ key: k }),
    });
    if (res.status >= 400) {
      toast.show(
        t(
          'anthropic_invalid_key',
          'Invalid key (must start with sk-ant-)'
        ),
        'warning'
      );
      return;
    }
    setKey('');
    toast.show(t('anthropic_key_saved', 'Claude API key saved'), 'success');
    load();
  }, [key]);

  // Gửi 1 phần cấu hình nhà cung cấp (provider / openrouterKey / openrouterModel)
  const postConfig = useCallback(async (payload: any, okMsg: string) => {
    const res = await fetch('/copilot/anthropic-key', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.status >= 400) {
      const d = await res.json().catch(() => null);
      toast.show(d?.msg || t('anthropic_save_error', 'Could not save'), 'warning');
      return false;
    }
    toast.show(okMsg, 'success');
    load();
    return true;
  }, []);

  const saveOrKey = useCallback(async () => {
    const k = orKey.trim();
    if (!k) return;
    const ok = await postConfig(
      { openrouterKey: k },
      t('or_key_saved', 'OpenRouter key saved')
    );
    if (ok) setOrKey('');
  }, [orKey, postConfig]);

  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await (await fetch('/copilot/anthropic-key/test')).json();
      if (res.ok) {
        toast.show(
          t('anthropic_key_working', 'Key working') +
            ' ✓ (model: ' +
            (res.model || 'claude') +
            ')',
          'success'
        );
      } else {
        toast.show(
          t('anthropic_key_error', 'Key error') +
            ': ' +
            (res.error || t('anthropic_unknown', 'unknown')),
          'warning'
        );
      }
    } catch {
      toast.show(
        t('anthropic_server_unreachable', 'Could not reach server to check'),
        'warning'
      );
    }
    setChecking(false);
  }, []);

  const providerId = useId();
  const orModelId = useId();
  const modelId = useId();

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <SettingsCardHeader
        title={t('anthropic_title', 'Claude API key (Media Hub AI)')}
        status={<KeyStatus ok={status.hasKey} />}
      >
        <p>
          {t(
            'anthropic_description',
            'Used for AI writing and Agent features. Get one at console.anthropic.com.'
          )}
          {status.hasKey
            ? ` — ${t('anthropic_saved_masked', 'Saved')} (${
                status.masked
              }). ${t('anthropic_leave_empty', 'Leave empty to keep it.')}`
            : ` — ${t('anthropic_no_key', 'No key yet.')}`}
        </p>
        <p>
          {t(
            'ai_provider_hint',
            'Chỉ đổi phần AI viết bài của Phát hiện/Sản xuất. Đọc ảnh/video (vision) và Copilot/Chat vẫn dùng Claude nên vẫn cần key Claude bên dưới.'
          )}
        </p>
        <ModelNotes models={MODELS} />
        <p>
          {t('anthropic_model_hint', 'Applies immediately — no restart needed.')}
        </p>
      </SettingsCardHeader>

      {/* Nhà cung cấp AI viết bài (khối Phát hiện/Sản xuất) — Claude hoặc
          OpenRouter (DeepSeek). Vision + Copilot/Chat luôn dùng Claude. */}
      <div className="flex items-center gap-[10px] flex-wrap mb-[16px] p-[12px] rounded-[8px] bg-newBgColorInner border border-newTableBorder">
        <label htmlFor={providerId} className="text-[13px] font-[600] flex-1">
          {t('ai_provider', 'AI viết bài (Phát hiện/Sản xuất)')}
        </label>
        <select
          id={providerId}
          value={status.provider || 'anthropic'}
          onChange={(e) =>
            postConfig(
              { provider: e.target.value },
              t('ai_provider_saved', 'Đã đổi nhà cung cấp AI viết bài')
            )
          }
          className={clsx(settingsSelect, 'min-w-[240px]')}
        >
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="openrouter">OpenRouter (DeepSeek…)</option>
        </select>
      </div>

      {/* Khối OpenRouter — chỉ hiện khi chọn nhà cung cấp OpenRouter */}
      {status.provider === 'openrouter' && (
        <div className="mb-[16px] p-[14px] rounded-[8px] border border-newTableBorder">
          <SettingsCardHeader
            level="section"
            title={t('or_title', 'OpenRouter API key (DeepSeek)')}
            status={<KeyStatus ok={!!status.openrouter?.hasKey} />}
          >
            <p>
              {t('or_desc', 'Lấy key tại openrouter.ai/keys (bắt đầu bằng sk-or-).')}
              {status.openrouter?.hasKey
                ? ` — ${t('anthropic_saved_masked', 'Saved')} (${status.openrouter.masked}). ${t('anthropic_leave_empty', 'Leave empty to keep it.')}`
                : ` — ${t('anthropic_no_key', 'No key yet.')}`}
            </p>
            <ModelNotes models={OR_MODELS} />
            {/* Lưu ý tĩnh (không phải lỗi đang xảy ra) → gập chung vào ⓘ */}
            <p className="border-s-2 border-newSep ps-[10px]">
              {t('or_caveat', 'Lưu ý: DeepSeek xuất tối đa ~8k token/lần nên bài blog RẤT DÀI (2.000–2.500 từ) có thể bị cắt — nếu hay báo "vượt trần" khi viết blog thì đổi lại Claude cho định dạng đó.')}
            </p>
          </SettingsCardHeader>
          <div className="flex items-center gap-[8px] flex-wrap">
            <div className="flex-1">
              <Input
                value={orKey}
                disableForm={true}
                removeError={true}
                type="password"
                onChange={(e) => setOrKey(e.target.value)}
                name="openrouter"
                label=""
                placeholder="sk-or-..."
              />
            </div>
            <Button className={settingsPrimaryBtn} onClick={saveOrKey} disabled={!orKey.trim()}>
              {t('anthropic_save', 'Save')}
            </Button>
            <Button
              className={settingsNeutralBtn}
              onClick={check}
              disabled={checking}
            >
              {checking ? t('anthropic_checking', 'Checking...') : t('anthropic_check_key', 'Check key')}
            </Button>
          </div>
          <div className="flex items-center gap-[10px] flex-wrap mt-[12px]">
            <label htmlFor={orModelId} className="text-[13px] font-[600]">
              {t('anthropic_model', 'Model')}
            </label>
            <select
              id={orModelId}
              value={status.openrouter?.model || 'deepseek/deepseek-v4-flash'}
              onChange={(e) =>
                postConfig(
                  { openrouterModel: e.target.value },
                  t('anthropic_model_saved_or', 'Đã lưu model DeepSeek')
                )
              }
              className={clsx(settingsSelect, 'min-w-[240px]')}
            >
              <ModelOptions models={OR_MODELS} />
            </select>
          </div>
        </div>
      )}

      <h4 className="text-[14px] font-[600] mb-[8px]">
        {t('claude_section', 'Claude (Anthropic) — vision + Copilot/Chat + dự phòng')}
      </h4>
      <div className="flex items-center gap-[8px] flex-wrap">
        <div className="flex-1">
          <Input
            value={key}
            disableForm={true}
            removeError={true}
            type="password"
            onChange={(e) => setKey(e.target.value)}
            name="anthropic"
            label=""
            placeholder="sk-ant-..."
          />
        </div>
        <Button className={settingsPrimaryBtn} onClick={save} disabled={!key.trim()}>
          {t('anthropic_save', 'Save')}
        </Button>
        <Button
          className={settingsNeutralBtn}
          onClick={check}
          disabled={checking}
        >
          {checking
            ? t('anthropic_checking', 'Checking...')
            : t('anthropic_check_key', 'Check key')}
        </Button>
      </div>
      {/* Chọn model — dùng cho AI viết bài + Agent + caption bot Zalo (tự đồng bộ). */}
      <div className="flex items-center gap-[10px] flex-wrap mt-[14px]">
        <label htmlFor={modelId} className="text-[13px] font-[600]">
          {t('anthropic_model', 'Model')}
        </label>
        <select
          id={modelId}
          value={status.model || 'claude-sonnet-4-6'}
          onChange={async (e) => {
            const model = e.target.value;
            const res = await fetch('/copilot/anthropic-key', {
              method: 'POST',
              body: JSON.stringify({ model }),
            });
            if (res.status >= 400) {
              toast.show(t('anthropic_model_error', 'Could not save the model'), 'warning');
              return;
            }
            setStatus((cur) => ({ ...cur, model }));
            toast.show(
              t('anthropic_model_saved', 'Model saved — applies to AI writing, Agent and the Zalo bot'),
              'success'
            );
          }}
          className={clsx(settingsSelect, 'min-w-[240px]')}
        >
          <ModelOptions models={MODELS} />
        </select>
      </div>
    </div>
  );
};

export default AnthropicComponent;
