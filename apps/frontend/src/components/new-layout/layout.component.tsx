'use client';

import React, { ReactNode, useCallback } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { Plus_Jakarta_Sans } from 'next/font/google';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { resolveBaseUrl } from '@gitroom/helpers/utils/custom.fetch.func';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Impersonate } from '@gitroom/frontend/components/layout/impersonate';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { TrialTracker } from '@gitroom/frontend/components/layout/gtm.component';
import { MobileNav } from '@gitroom/frontend/components/new-layout/mobile.nav';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  if (!user) return null;

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={resolveBaseUrl(backendUrl) + '/copilot/chat'}
        showDevConsole={false}
      >
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <TrialTracker />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            {/* Mobile: edge-to-edge (p-0) — nội dung là trung tâm, không còn
                khung card bo tròn; chừa đáy đúng chiều cao tab bar mới qua
                --bottom-nav-h (global.scss). Desktop giữ nguyên p-[12px]. */}
            <div
              className={clsx(
                'flex flex-col min-h-screen w-full text-newTextColor p-[12px] mobile:p-0 mobile:pb-[var(--bottom-nav-h,64px)]',
                jakartaSans.className
              )}
            >
              {/* Thanh admin/impersonate của Postiz gốc (Import Debug Post,
                  View Errors...) — không dùng cho Social Hub, ẩn hẳn. */}
              <div />
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <MobileNav />
                  <div className="flex-1 flex gap-[8px]">
                    <Support />
                    <div className="flex flex-col bg-newBgColorInner w-[80px] rounded-[12px] mobile:hidden">
                      <div
                        id="left-menu"
                        className="fixed h-full w-[64px] start-[17px] flex flex-1 top-0"
                      >
                        <div className="flex flex-col h-full gap-[32px] flex-1 pt-[22px] pb-[12px]">
                          <Logo />
                          <TopMenu />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe mobile:rounded-none">
                      {/* Header mobile: 1 hàng 52px — CHỈ tiêu đề + chọn tổ chức
                          + chuông. Streak/Sáng-tối/Ngôn ngữ/Feedback dời vào
                          sheet "Thêm" của tab bar (mobile.nav.tsx). */}
                      <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center mobile:h-[calc(52px+env(safe-area-inset-top,0px))] mobile:px-[14px] mobile:pt-[env(safe-area-inset-top,0px)]">
                        <div className="text-[24px] font-[600] flex flex-1 mobile:text-[17px] mobile:min-w-0 mobile:[&>*]:truncate">
                          <Title />
                        </div>
                        <div className="flex gap-[20px] mobile:gap-[14px] text-textItemBlur items-center">
                          <div className="mobile:hidden empty:hidden">
                            <StreakComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator mobile:hidden" />
                          <OrganizationSelector />
                          <div className="hover:text-newTextColor mobile:hidden">
                            <ModeComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator mobile:hidden" />
                          <div className="mobile:hidden">
                            <LanguageComponent />
                          </div>
                          <div className="mobile:hidden empty:hidden">
                            <ChromeExtensionComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator mobile:hidden" />
                          <div className="mobile:hidden empty:hidden">
                            <AttachToFeedbackIcon />
                          </div>
                          <NotificationComponent />
                        </div>
                      </div>
                      <div className="flex flex-1 gap-[1px] mobile:flex-col">
                        {children}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};
