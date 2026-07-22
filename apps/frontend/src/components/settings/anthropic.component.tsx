'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Nhập Claude (Anthropic) API key ngay trong UI Settings — không cần sửa .env.
// Dùng cho AI viết bài + Agent của Postiz.
// Model khả dụng (khớp ANTHROPIC_MODELS phía backend).
const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — cân bằng (khuyên dùng)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — nhanh, rẻ' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8 — mạnh nhất' },
];
// Model DeepSeek trên OpenRouter (khớp OPENROUTER_MODELS phía backend).
const OR_MODELS = [
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (deepseek-chat) — rẻ, tốt (khuyên dùng)' },
  { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3 0324' },
  { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1 — suy luận (chậm/đắt hơn)' },
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

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <h3 className="text-[18px] mb-[4px]">
        {t('anthropic_title', 'Claude API key (Media Hub AI)')}
      </h3>
      <div className="text-[13px] opacity-70 mb-[12px]">
        {t(
          'anthropic_description',
          'Used for AI writing and Agent features. Get one at console.anthropic.com.'
        )}
        {status.hasKey
          ? ` — ${t('anthropic_saved_masked', 'Saved')} (${
              status.masked
            }). ${t('anthropic_leave_empty', 'Leave empty to keep it.')}`
          : ` — ${t('anthropic_no_key', 'No key yet.')}`}
      </div>
      {/* Nhà cung cấp AI viết bài (khối Phát hiện/Sản xuất) — Claude hoặc
          OpenRouter (DeepSeek). Vision + Copilot/Chat luôn dùng Claude. */}
      <div className="flex items-center gap-[10px] flex-wrap mb-[14px] p-[12px] rounded-[6px] bg-newColColor/40 border border-fifth">
        <div className="text-[13px] font-[700]">
          {t('ai_provider', 'AI viết bài (Phát hiện/Sản xuất)')}
        </div>
        <select
          value={status.provider || 'anthropic'}
          onChange={(e) =>
            postConfig(
              { provider: e.target.value },
              t('ai_provider_saved', 'Đã đổi nhà cung cấp AI viết bài')
            )
          }
          className="bg-sixth border-fifth border rounded-[4px] h-[40px] px-[10px] text-[13px] outline-none cursor-pointer min-w-[240px]"
        >
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="openrouter">OpenRouter (DeepSeek…)</option>
        </select>
        <div className="text-[12px] opacity-70 basis-full">
          {t(
            'ai_provider_hint',
            'Chỉ đổi phần AI viết bài của Phát hiện/Sản xuất. Đọc ảnh/video (vision) và Copilot/Chat vẫn dùng Claude nên vẫn cần key Claude bên dưới.'
          )}
        </div>
      </div>

      {/* Khối OpenRouter — chỉ hiện khi chọn nhà cung cấp OpenRouter */}
      {status.provider === 'openrouter' && (
        <div className="mb-[16px] p-[14px] rounded-[6px] border border-fifth">
          <div className="text-[14px] font-[700] mb-[4px]">
            {t('or_title', 'OpenRouter API key (DeepSeek)')}
          </div>
          <div className="text-[13px] opacity-70 mb-[10px]">
            {t('or_desc', 'Lấy key tại openrouter.ai/keys (bắt đầu bằng sk-or-).')}
            {status.openrouter?.hasKey
              ? ` — ${t('anthropic_saved_masked', 'Saved')} (${status.openrouter.masked}). ${t('anthropic_leave_empty', 'Leave empty to keep it.')}`
              : ` — ${t('anthropic_no_key', 'No key yet.')}`}
          </div>
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
            <Button className="h-[44px]" onClick={saveOrKey} disabled={!orKey.trim()}>
              {t('anthropic_save', 'Save')}
            </Button>
            <Button
              className="h-[44px] bg-transparent border border-fifth"
              onClick={check}
              disabled={checking}
            >
              {checking ? t('anthropic_checking', 'Checking...') : t('anthropic_check_key', 'Check key')}
            </Button>
          </div>
          <div className="flex items-center gap-[10px] flex-wrap mt-[12px]">
            <div className="text-[13px] font-[600]">{t('anthropic_model', 'Model')}</div>
            <select
              value={status.openrouter?.model || 'deepseek/deepseek-chat'}
              onChange={(e) =>
                postConfig(
                  { openrouterModel: e.target.value },
                  t('anthropic_model_saved_or', 'Đã lưu model DeepSeek')
                )
              }
              className="bg-sixth border-fifth border rounded-[4px] h-[40px] px-[10px] text-[13px] outline-none cursor-pointer min-w-[280px]"
            >
              {OR_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[12px] text-[#FFC53D] mt-[10px] leading-[1.5]">
            ⚠ {t('or_caveat', 'Lưu ý: DeepSeek xuất tối đa ~8k token/lần nên bài blog RẤT DÀI (2.000–2.500 từ) có thể bị cắt — nếu hay báo "vượt trần" khi viết blog thì đổi lại Claude cho định dạng đó.')}
          </div>
        </div>
      )}

      <div className="text-[14px] font-[700] mb-[6px]">
        {t('claude_section', 'Claude (Anthropic) — vision + Copilot/Chat + dự phòng')}
      </div>
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
        <Button className="h-[44px]" onClick={save} disabled={!key.trim()}>
          {t('anthropic_save', 'Save')}
        </Button>
        <Button
          className="h-[44px] bg-transparent border border-fifth"
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
        <div className="text-[13px] font-[600]">
          {t('anthropic_model', 'Model')}
        </div>
        <select
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
          className="bg-sixth border-fifth border rounded-[4px] h-[40px] px-[10px] text-[13px] outline-none cursor-pointer min-w-[250px]"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="text-[12px] opacity-70">
          {t('anthropic_model_hint', 'Applies immediately — no restart needed.')}
        </div>
      </div>
    </div>
  );
};

export default AnthropicComponent;
