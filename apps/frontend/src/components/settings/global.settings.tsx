'use client';

import React from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import dynamic from 'next/dynamic';
import EmailNotificationsComponent from '@gitroom/frontend/components/settings/email-notifications.component';
import ShortlinkPreferenceComponent from '@gitroom/frontend/components/settings/shortlink-preference.component';
import { AnthropicComponent } from '@gitroom/frontend/components/settings/anthropic.component';
import { GeminiComponent } from '@gitroom/frontend/components/settings/gemini.component';
import { ImageGenComponent } from '@gitroom/frontend/components/settings/image.gen.component';
import { SocialKeysComponent } from '@gitroom/frontend/components/settings/social-keys.component';
import { EmailSmtpComponent } from '@gitroom/frontend/components/settings/email-smtp.component';
import { MajorOsComponent } from '@gitroom/frontend/components/settings/major-os.component';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

const MetricComponent = dynamic(
  () => import('@gitroom/frontend/components/settings/metric.component'),
  {
    ssr: false,
  }
);

export const GlobalSettings = () => {
  const t = useT();
  const user = useUser();
  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('global_settings', 'Global Settings')}</h3>
      <AnthropicComponent />
      <GeminiComponent />
      <ImageGenComponent />
      <SocialKeysComponent />
      <EmailSmtpComponent />
      <MetricComponent />
      <EmailNotificationsComponent />
      <ShortlinkPreferenceComponent />
      {/* Key đọc được dữ liệu của mọi người dùng → chỉ quản trị hệ thống */}
      {!!user?.isSuperAdmin && <MajorOsComponent />}
    </div>
  );
};
