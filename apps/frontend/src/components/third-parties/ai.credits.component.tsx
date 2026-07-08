'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type Provider = {
  value: string;
  label: string;
  auto: boolean;
  keyHint?: string;
};

// HeyGen có API lấy số dư → tự động. Các bên còn lại KHÔNG có API số dư công
// khai (Claude/Anthropic, OpenAI, Google AI Studio) → nhập số dư bằng tay.
const PROVIDERS: Provider[] = [
  { value: 'heygen', label: 'HeyGen', auto: true, keyHint: 'HeyGen X-Api-Key — fetches balance automatically.' },
  { value: 'minimax', label: 'MiniMax', auto: false },
  { value: 'openai', label: 'OpenAI', auto: false },
  { value: 'anthropic', label: 'Claude (Anthropic)', auto: false },
  { value: 'google', label: 'Google AI Studio', auto: false },
  { value: 'elevenlabs', label: 'ElevenLabs', auto: false },
  { value: 'other', label: 'Other', auto: false },
];

const providerLabel = (v: string) =>
  PROVIDERS.find((p) => p.value === v)?.label || v;

const AUTO_REFRESH_MS = 15 * 60 * 1000; // 15 phút

const useCredits = () => {
  const fetch = useFetch();
  return useSWR(
    'ai-credits',
    async () => {
      return (await (await fetch('/ai-credits')).json())?.items || [];
    },
    // Đọc lại số dư (từ DB) mỗi 15 phút khi trang đang mở.
    { refreshInterval: AUTO_REFRESH_MS, revalidateOnFocus: false }
  );
};

const CreditForm: FC<{ data?: any; onSaved: () => void }> = ({
  data,
  onSaved,
}) => {
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const t = useT();
  const [provider, setProvider] = useState<string>(data?.provider || 'heygen');
  const [label, setLabel] = useState<string>(data?.label || '');
  const [apiKey, setApiKey] = useState<string>('');
  const [balance, setBalance] = useState<string>(
    data?.balance != null ? String(data.balance) : ''
  );
  const [unit, setUnit] = useState<string>(data?.unit || 'credits');
  const [threshold, setThreshold] = useState<string>(
    data?.threshold != null ? String(data.threshold) : ''
  );
  const [saving, setSaving] = useState(false);

  const meta = PROVIDERS.find((p) => p.value === provider)!;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const body: any = {
        provider,
        label: label.trim() || providerLabel(provider),
        unit: unit.trim() || 'credits',
        threshold: threshold === '' ? null : parseFloat(threshold),
        auto: meta.auto,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      // Nhập số dư tay chỉ dùng cho nhà cung cấp KHÔNG tự lấy được.
      if (!meta.auto) body.balance = balance === '' ? null : parseFloat(balance);
      await fetch(data ? `/ai-credits/${data.id}` : '/ai-credits', {
        method: data ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      toast.show(t('saved', 'Saved'), 'success');
      onSaved();
      modal.closeCurrent();
    } finally {
      setSaving(false);
    }
  }, [provider, label, apiKey, balance, unit, threshold, meta, data]);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-[6px]">
        <div className="text-[13px]">{t('provider', 'Provider')}</div>
        <div className="flex flex-wrap gap-[8px]">
          {PROVIDERS.map((p) => (
            <div
              key={p.value}
              onClick={() => setProvider(p.value)}
              className={clsx(
                'cursor-pointer rounded-[6px] px-[12px] h-[34px] flex items-center text-[13px] border',
                provider === p.value
                  ? 'bg-[#1e6fd9] border-[#1e6fd9] text-white'
                  : 'bg-newColColor border-newBgLineColor'
              )}
            >
              {p.label}
              {p.auto ? ' ⚡' : ''}
            </div>
          ))}
        </div>
        <div className="text-[12px] opacity-60">
          {meta.auto
            ? t(
                'auto_balance_hint',
                'Balance is fetched automatically via API (paste the key below).'
              )
            : t(
                'manual_balance_hint',
                'No balance API — enter the remaining balance manually.'
              )}
        </div>
      </div>

      <Input
        value={label}
        disableForm
        removeError
        name="label"
        label={t('display_name', 'Display name')}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={providerLabel(provider)}
      />

      <Input
        value={apiKey}
        disableForm
        removeError
        type="password"
        name="apiKey"
        label={
          meta.auto
            ? t('api_key_auto', 'API key (to fetch balance automatically)')
            : t('api_key_optional', 'API key (optional)')
        }
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={
          data?.hasKey ? t('key_keep_hint', '•••• (leave empty to keep)') : ''
        }
      />

      {!meta.auto && (
        <div className="flex gap-[10px]">
          <div className="flex-1">
            <Input
              value={balance}
              disableForm
              removeError
              name="balance"
              label={t('remaining_balance', 'Remaining balance')}
              onChange={(e) => setBalance(e.target.value)}
              placeholder={t('balance_placeholder', 'e.g. 50')}
            />
          </div>
          <div className="w-[120px]">
            <Input
              value={unit}
              disableForm
              removeError
              name="unit"
              label={t('unit', 'Unit')}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="credits / USD"
            />
          </div>
        </div>
      )}

      <Input
        value={threshold}
        disableForm
        removeError
        name="threshold"
        label={t('alert_when_below', 'Alert when below')}
        onChange={(e) => setThreshold(e.target.value)}
        placeholder={t(
          'threshold_placeholder',
          'e.g. 10 — leave empty to disable alerts'
        )}
      />

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};

const CreditCard: FC<{ item: any; reload: () => void }> = ({ item, reload }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);

  const low =
    item.balance != null &&
    item.threshold != null &&
    item.balance <= item.threshold;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await (
        await fetch(`/ai-credits/${item.id}/refresh`, { method: 'POST' })
      ).json();
      if (res?.ok) {
        toast.show(t('balance_updated', 'Balance updated'), 'success');
      } else {
        toast.show(res?.error || t('cannot_fetch', 'Could not fetch balance'), 'warning');
      }
      reload();
    } finally {
      setRefreshing(false);
    }
  }, [item.id]);

  const edit = useCallback(() => {
    modal.openModal({
      title: t('edit_tool', 'Edit AI tool'),
      classNames: { modal: 'w-[100%] max-w-[520px]' },
      children: <CreditForm data={item} onSaved={reload} />,
    });
  }, [item]);

  const remove = useCallback(async () => {
    if (!(await deleteDialog(t('confirm_delete_tool', 'Remove this tool from the dashboard?'), t('delete', 'Delete')))) {
      return;
    }
    await fetch(`/ai-credits/${item.id}`, { method: 'DELETE' });
    reload();
  }, [item.id]);

  return (
    <div
      className={clsx(
        'rounded-[12px] border p-[18px] flex flex-col gap-[10px] bg-newBgColorInner',
        low ? 'border-red-500' : 'border-newBgLineColor'
      )}
    >
      <div className="flex items-center gap-[8px]">
        <div className="flex-1">
          <div className="text-[15px] font-[600]">{item.label}</div>
          <div className="text-[11px] opacity-60">
            {providerLabel(item.provider)}
            {item.supportsAuto
              ? ' · ⚡ ' + t('auto', 'automatic')
              : ' · ' + t('manual', 'manual')}
          </div>
        </div>
        {low && (
          <div className="text-[11px] font-[600] text-red-500 bg-red-500/10 rounded-[6px] px-[8px] py-[3px]">
            {t('low_balance', 'Running low')}
          </div>
        )}
      </div>

      <div className="flex items-end gap-[6px]">
        <div className={clsx('text-[28px] font-[700] leading-none', low && 'text-red-500')}>
          {item.balance != null ? item.balance : '—'}
        </div>
        <div className="text-[12px] opacity-60 mb-[3px]">{item.unit}</div>
      </div>

      {item.threshold != null && (
        <div className="text-[11px] opacity-60">
          {t('alert_below', 'Alert below')} {item.threshold} {item.unit}
        </div>
      )}
      {item.lastError && (
        <div className="text-[11px] text-red-400">⚠ {item.lastError}</div>
      )}

      <div className="flex items-center gap-[6px] mt-[4px]">
        {item.supportsAuto && (
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-[12px] rounded-[6px] px-[10px] py-[5px] bg-btnPrimary text-white disabled:opacity-50"
          >
            {refreshing ? '...' : t('refresh', 'Refresh')}
          </button>
        )}
        <button
          onClick={edit}
          className="text-[12px] rounded-[6px] px-[10px] py-[5px] bg-newColColor border border-newBgLineColor"
        >
          {t('edit', 'Edit')}
        </button>
        <button
          onClick={remove}
          className="text-[12px] rounded-[6px] px-[10px] py-[5px] text-red-500 hover:bg-red-500/10"
        >
          {t('delete', 'Delete')}
        </button>
      </div>
    </div>
  );
};

export const AiCreditsComponent: FC = () => {
  const { data, isLoading, mutate } = useCredits();
  const modal = useModals();
  const t = useT();
  const fetch = useFetch();

  // Cứ 15 phút (khi trang mở): tự gọi API lấy số dư cho các mục hỗ trợ auto
  // (HeyGen) rồi đọc lại. Các nhà cung cấp nhập tay không có API nên bỏ qua.
  const dataRef = useRef<any[]>([]);
  dataRef.current = data || [];
  useEffect(() => {
    const tick = async () => {
      const autoItems = (dataRef.current || []).filter(
        (i: any) => i.supportsAuto
      );
      if (!autoItems.length) return;
      await Promise.all(
        autoItems.map((i: any) =>
          fetch(`/ai-credits/${i.id}/refresh`, { method: 'POST' }).catch(
            () => {}
          )
        )
      );
      mutate();
    };
    const id = setInterval(tick, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetch, mutate]);

  const add = useCallback(() => {
    modal.openModal({
      title: t('add_tool', 'Add AI tool'),
      classNames: { modal: 'w-[100%] max-w-[520px]' },
      children: <CreditForm onSaved={mutate} />,
    });
  }, [mutate]);

  return (
    <div className="flex-1 bg-newBgColorInner p-[24px] mobile:p-[16px] overflow-auto flex flex-col">
      <div className="flex items-center gap-[12px] flex-wrap">
        <div className="flex-1">
          <h3 className="text-[22px] font-[600]">
            {t('ai_credits_title', 'AI tools & balances')}
          </h3>
          <div className="text-customColor18 mt-[4px] text-[13px] max-w-[720px]">
            {t(
              'ai_credits_desc',
              'Track the credits/balance of external AI tools and get alerts when they run low. HeyGen fetches its balance automatically via API; Claude, OpenAI and Google AI Studio have no balance API, so they are entered manually.'
            )}
          </div>
        </div>
        <Button onClick={add}>{t('add_tool_button', 'Add tool')}</Button>
      </div>

      {isLoading ? (
        <div className="mt-[24px] opacity-60 text-[13px]">{t('loading', 'Loading...')}</div>
      ) : !data?.length ? (
        <div className="mt-[24px] p-[24px] rounded-[12px] border border-dashed border-newBgLineColor text-center text-[13px] opacity-70">
          {t('no_tools', 'No tools yet — click "Add tool" to get started.')}
        </div>
      ) : (
        <div className="mt-[20px] grid grid-cols-3 mobile:grid-cols-1 tablet:grid-cols-2 gap-[16px]">
          {data.map((item: any) => (
            <CreditCard key={item.id} item={item} reload={mutate} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AiCreditsComponent;
