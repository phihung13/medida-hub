'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  KeyStatus,
  SettingsCardHeader,
  settingsPrimaryBtn,
} from '@gitroom/frontend/components/settings/settings-card.component';

// Cấu hình tạo ảnh AI: chọn nhà cung cấp (OpenAI / Fal) + dán key. Không có key
// thì nút "Generate AI Image" sẽ báo nhẹ thay vì tạo ảnh hỏng.
type Provider = 'openai' | 'fal';

// hintKey: key dịch đã có sẵn trong file vi → gợi ý hiện đúng tiếng Việt.
const PROVIDERS: {
  value: Provider;
  label: string;
  hint: string;
  hintKey: string;
  ph: string;
}[] = [
  {
    value: 'openai',
    label: 'OpenAI (DALL·E / GPT Image)',
    hint: 'Get your key at platform.openai.com. Billed per image.',
    hintKey: 'image_gen_openai_hint',
    ph: 'sk-...',
  },
  {
    value: 'fal',
    label: 'Fal.ai (Flux)',
    hint: 'Get your key at fal.ai/dashboard/keys. Cheaper, with more image models.',
    hintKey: 'image_gen_fal_hint',
    ph: 'key-id:key-secret',
  },
];

export const ImageGenComponent: FC = () => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const [provider, setProvider] = useState<Provider>('openai');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{
    provider: Provider;
    hasKey: boolean;
    masked: string;
  }>({ provider: 'openai', hasKey: false, masked: '' });

  const load = useCallback(async () => {
    try {
      const res = await (await fetch('/copilot/image-key')).json();
      setStatus(res);
      if (res?.provider) setProvider(res.provider);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const save = useCallback(async () => {
    const res = await fetch('/copilot/image-key', {
      method: 'POST',
      body: JSON.stringify({ provider, key: key.trim() }),
    });
    if (res.status >= 400) {
      toast.show(
        t(
          'image_gen_save_failed',
          'Could not save (system admin permission required).'
        ),
        'warning'
      );
      return;
    }
    setKey('');
    toast.show(
      t('image_gen_saved', 'AI image settings saved'),
      'success'
    );
    load();
  }, [provider, key]);

  const current = PROVIDERS.find((p) => p.value === provider)!;

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <SettingsCardHeader
        title={t('image_gen_title', 'AI Image Generation')}
        status={
          <KeyStatus
            ok={status.hasKey}
            okLabel={`${t('image_gen_using_prefix', 'Currently using')} ${
              status.provider === 'fal' ? 'Fal.ai' : 'OpenAI'
            }`}
          />
        }
      >
        <p>
          {t(
            'image_gen_description',
            'Used for the "Generate AI Image" button when composing (Claude does not generate images, so a separate provider is needed).'
          )}{' '}
          {status.hasKey
            ? t('image_gen_using_prefix', 'Currently using') +
              ` ${status.provider === 'fal' ? 'Fal.ai' : 'OpenAI'} (${
                status.masked
              }).`
            : t(
                'image_gen_no_key',
                'No key yet — the image button will prompt for configuration.'
              )}
        </p>
        <p>{t(current.hintKey, current.hint)}</p>
      </SettingsCardHeader>

      <div className="flex flex-col gap-[10px]">
        <div className="flex flex-wrap gap-[8px]">
          {PROVIDERS.map((p) => (
            // type="button": nằm trong <form> của SettingsPopup
            <button
              type="button"
              key={p.value}
              aria-pressed={provider === p.value}
              onClick={() => setProvider(p.value)}
              className={clsx(
                'rounded-[8px] px-[12px] h-[36px] flex items-center text-[13px] border transition-colors',
                provider === p.value
                  ? 'bg-btnPrimary border-btnPrimary text-white'
                  : 'bg-newBgColorInner border-newTableBorder hover:bg-boxHover'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-[8px] flex-wrap">
          <div className="flex-1">
            <Input
              value={key}
              disableForm={true}
              removeError={true}
              type="password"
              onChange={(e) => setKey(e.target.value)}
              name="imagegen"
              label=""
              placeholder={current.ph}
            />
          </div>
          <Button className={settingsPrimaryBtn} onClick={save} disabled={!key.trim()}>
            {t('image_gen_save', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImageGenComponent;
