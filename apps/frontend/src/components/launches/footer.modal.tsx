'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Chân bài cố định cho 1 kênh: hotline / địa chỉ / giới thiệu... tự chèn DƯỚI
// caption và TRÊN hashtag khi đăng bài lên kênh này.
export const FooterModal: FC<{
  integration: any;
  onClose: () => void;
}> = ({ integration, onClose }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const [footer, setFooter] = useState<string>(integration?.postFooter || '');
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/integrations/${integration.id}/footer`, {
        method: 'POST',
        body: JSON.stringify({ footer }),
      });
      toast.show(t('footer_saved', 'Post footer saved'), 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  }, [footer, integration?.id]);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[13px] opacity-70">
        {t(
          'footer_desc',
          'Fixed content (hotline, address, branch info…) is automatically inserted below the caption and above the hashtags every time you post to this channel. Leave empty = nothing inserted.'
        )}
      </div>
      <textarea
        value={footer}
        onChange={(e) => setFooter(e.target.value)}
        placeholder={t(
          'footer_placeholder',
          '— — —\n☎ Hotline: 0123 456 789\n📍 123 ABC Street, District 1\n🌐 truongvietanh.com'
        )}
        className="bg-input min-h-[170px] p-[16px] outline-none border-fifth border rounded-[4px] text-inputText placeholder-inputText"
      />
      <div className="flex justify-end gap-[8px]">
        <Button onClick={save} disabled={saving}>
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};

export default FooterModal;
