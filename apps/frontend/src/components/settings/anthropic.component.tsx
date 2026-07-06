'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Nhập Claude (Anthropic) API key ngay trong UI Settings — không cần sửa .env.
// Dùng cho AI viết bài + Agent của Postiz.
export const AnthropicComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ hasKey: boolean; masked: string }>({
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
    </div>
  );
};

export default AnthropicComponent;
