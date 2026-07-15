'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Nhập key Google AI Studio (Gemini) ngay trong UI Settings — không cần sửa
// .env. Dùng cho: YouTube "xem video" viết tiêu đề/mô tả + tạo thumbnail
// "nano banana" (gemini-2.5-flash-image). Lấy key miễn phí tại
// aistudio.google.com/apikey.
export const GeminiComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{
    hasKey: boolean;
    masked: string;
    imageModel?: string;
  }>({
    hasKey: false,
    masked: '',
  });
  const [savingModel, setSavingModel] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await (await fetch('/copilot/gemini-key')).json();
      setStatus(res);
    } catch {
      /* ignore */
    }
  }, []);

  // Model tạo ảnh (nano banana) — đổi ngay, không cần nhập lại key.
  const IMAGE_MODELS = [
    { id: 'gemini-3-pro-image', label: 'Nano Banana Pro — chữ tốt nhất (~$0.13/ảnh)' },
    { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 — cân bằng (~$0.067/ảnh)' },
    { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite — rẻ nhất (~$0.034/ảnh)' },
    { id: 'gemini-2.5-flash-image', label: 'Nano Banana (2.5) — đời cũ' },
  ];
  const saveModel = useCallback(async (imageModel: string) => {
    setSavingModel(true);
    try {
      const res = await fetch('/copilot/gemini-key', {
        method: 'POST',
        body: JSON.stringify({ imageModel }),
      });
      if (res.status >= 400) {
        toast.show(t('gemini_model_error', 'Không đổi được model'), 'warning');
        return;
      }
      toast.show(t('gemini_model_saved', 'Đã đổi model tạo ảnh'), 'success');
      load();
    } finally {
      setSavingModel(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const save = useCallback(async () => {
    const k = key.trim();
    if (!k) return;
    const res = await fetch('/copilot/gemini-key', {
      method: 'POST',
      body: JSON.stringify({ key: k }),
    });
    if (res.status >= 400) {
      toast.show(t('gemini_save_error', 'Không lưu được key'), 'warning');
      return;
    }
    setKey('');
    toast.show(t('gemini_key_saved', 'Đã lưu key Gemini'), 'success');
    load();
  }, [key]);

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <h3 className="text-[18px] mb-[4px]">
        {t('gemini_title', 'Gemini API key (xem video + thumbnail nano banana)')}
      </h3>
      <div className="text-[13px] opacity-70 mb-[12px]">
        {t(
          'gemini_description',
          'Dùng cho YouTube: AI xem video viết tiêu đề/mô tả và tạo thumbnail nano banana. Lấy key miễn phí tại aistudio.google.com/apikey.'
        )}
        {status.hasKey
          ? ` — ${t('gemini_saved_masked', 'Đã lưu')} (${status.masked}). ${t(
              'gemini_leave_empty',
              'Để trống để giữ nguyên.'
            )}`
          : ` — ${t('gemini_no_key', 'Chưa có key.')}`}
      </div>
      <div className="flex items-center gap-[8px] flex-wrap">
        <div className="flex-1">
          <Input
            value={key}
            disableForm={true}
            removeError={true}
            type="password"
            onChange={(e) => setKey(e.target.value)}
            name="gemini"
            label=""
            placeholder="AIza..."
          />
        </div>
        <Button className="h-[44px]" onClick={save} disabled={!key.trim()}>
          {t('gemini_save', 'Lưu')}
        </Button>
      </div>

      {/* Chọn model tạo ảnh (infographic/thumbnail) — đổi ngay, lưu bền qua restart */}
      <div className="mt-[16px] pt-[16px] border-t border-fifth">
        <div className="text-[14px] font-[600] mb-[4px]">
          {t('gemini_image_model', 'Model tạo ảnh (infographic / thumbnail)')}
        </div>
        <div className="text-[13px] opacity-70 mb-[8px]">
          {t(
            'gemini_image_model_desc',
            'Model càng mới render chữ tiếng Việt có dấu càng ít lỗi. Nano Banana Pro đúng chính tả nhất; bản Lite/2.5 rẻ hơn nhưng dễ sai chữ hơn. Tất cả đều tính phí theo Google.'
          )}
        </div>
        <select
          value={status.imageModel || 'gemini-3-pro-image'}
          disabled={savingModel}
          onChange={(e) => saveModel(e.target.value)}
          className="bg-input border-fifth border rounded-[4px] h-[44px] px-[12px] text-inputText outline-none w-full max-w-[420px] disabled:opacity-50"
        >
          {IMAGE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default GeminiComponent;
