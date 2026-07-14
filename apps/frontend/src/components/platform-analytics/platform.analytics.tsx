'use client';

import useSWR from 'swr';
import { useCallback, useMemo, useState } from 'react';
import { capitalize, orderBy } from 'lodash';
import clsx from 'clsx';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { RenderAnalytics } from '@gitroom/frontend/components/platform-analytics/render.analytics';
import { OverviewAnalytics } from '@gitroom/frontend/components/platform-analytics/overview.analytics';
import { Select } from '@gitroom/react/form/select';
import { Button } from '@gitroom/react/form/button';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import useCookie from 'react-use-cookie';
import { SVGLine } from '@gitroom/frontend/components/launches/launches.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
const allowedIntegrations = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin-page',
  'tiktok',
  'youtube',
  'gmb',
  'pinterest',
  'threads',
  'x',
];
export const PlatformAnalytics = () => {
  const fetch = useFetch();
  const t = useT();
  const router = useRouter();
  const { disableXAnalytics } = useVariables();

  // current = -1 → tab "Tổng quan mọi kênh" (mặc định, kiểu Business Suite)
  const [current, setCurrent] = useState(-1);
  const [key, setKey] = useState(7);
  const [refresh, setRefresh] = useState(false);
  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  const toaster = useToaster();
  const load = useCallback(async () => {
    const int = (
      await (await fetch('/integrations/list')).json()
    ).integrations.filter((f: any) => {
      if (f.identifier === 'x' && disableXAnalytics) {
        return false;
      }
      return true;
    });
    return int.filter((f: any) => allowedIntegrations.includes(f.identifier));
  }, []);
  const { data, isLoading } = useSWR('analytics-list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
  const sortedIntegrations = useMemo(() => {
    return orderBy(
      data,
      ['type', 'disabled', 'identifier'],
      ['desc', 'asc', 'asc']
    );
  }, [data]);
  const currentIntegration = useMemo(() => {
    return current >= 0 ? sortedIntegrations[current] : undefined;
  }, [current, sortedIntegrations]);
  const options = useMemo(() => {
    if (!currentIntegration) {
      return [];
    }
    const arr = [];
    if (
      [
        'facebook',
        'instagram',
        'instagram-standalone',
        'linkedin-page',
        'pinterest',
        'youtube',
        'threads',
        'gmb',
        'x',
        'tiktok',
      ].indexOf(currentIntegration.identifier) !== -1
    ) {
      arr.push({
        key: 7,
        value: t('7_days', '7 Days'),
      });
    }
    if (
      [
        'facebook',
        'instagram',
        'instagram-standalone',
        'linkedin-page',
        'pinterest',
        'youtube',
        'threads',
        'gmb',
        'x',
        'tiktok',
      ].indexOf(currentIntegration.identifier) !== -1
    ) {
      arr.push({
        key: 30,
        value: t('30_days', '30 Days'),
      });
    }
    if (
      ['facebook', 'linkedin-page', 'pinterest', 'youtube', 'x', 'gmb'].indexOf(
        currentIntegration.identifier
      ) !== -1
    ) {
      arr.push({
        key: 90,
        value: t('90_days', '90 Days'),
      });
    }
    return arr;
  }, [currentIntegration]);
  const keys = useMemo(() => {
    if (!currentIntegration) {
      return 7;
    }
    if (options.find((p) => p.key === key)) {
      return key;
    }
    return options[0]?.key;
  }, [key, currentIntegration]);

  // Chọn kênh — dùng chung cho sidebar desktop và thanh chip mobile.
  const pickIntegration = useCallback(
    (index: number, integration: any) => {
      if (integration.refreshNeeded) {
        toaster.show(
          'Please refresh the integration from the calendar',
          'warning'
        );
        return;
      }
      setRefresh(true);
      setTimeout(() => {
        setRefresh(false);
      }, 10);
      setCurrent(index);
    },
    [toaster]
  );

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  if (!sortedIntegrations.length && !isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all flex-1 justify-center items-center text-center">
        <div>
          <img src="/peoplemarketplace.svg" />
        </div>
        <div className="text-[48px] mobile:text-[30px] mobile:leading-[1.3]">
          {t('can_t_show_analytics_yet', "Can't show analytics yet")}
          <br />
          {t(
            'you_have_to_add_social_media_channels',
            'You have to add Social Media channels'
          )}
        </div>
        <div className="text-[20px] mobile:text-[14px]">
          {t('supported', 'Supported:')}
          {allowedIntegrations.map((p) => capitalize(p)).join(', ')}
        </div>
        <Button onClick={() => router.push('/launches')}>
          {t(
            'go_to_the_calendar_to_add_channels',
            'Go to the calendar to add channels'
          )}
        </Button>
      </div>
    );
  }
  return (
    <>
      {/* Mobile: sidebar kênh → 1 hàng chip ngang cuộn có đà (desktop ẩn) */}
      <div className="hidden mobile:flex bg-newBgColorInner px-[12px] py-[10px] gap-[8px] items-center mobile-hscroll shrink-0">
        <button
          type="button"
          onClick={() => setCurrent(-1)}
          className={clsx(
            'tap-shrink shrink-0 flex items-center gap-[8px] h-[44px] ps-[7px] pe-[14px] rounded-full border',
            current === -1
              ? 'border-btnPrimary bg-boxFocused'
              : 'border-newTableBorder opacity-70'
          )}
        >
          <span className="w-[32px] h-[32px] rounded-full bg-boxHover grid place-items-center text-[15px]">
            📊
          </span>
          <span className="text-[13px] font-[600] whitespace-nowrap">
            {t('overview_menu', 'Tổng quan')}
          </span>
        </button>
        {sortedIntegrations.map((integration, index) => (
          <button
            key={integration.id}
            type="button"
            onClick={() => pickIntegration(index, integration)}
            className={clsx(
              'tap-shrink shrink-0 relative flex items-center gap-[8px] h-[44px] ps-[5px] pe-[12px] rounded-full border',
              currentIntegration?.id === integration.id
                ? 'border-btnPrimary bg-boxFocused'
                : 'border-newTableBorder opacity-70',
              integration.disabled && 'opacity-40'
            )}
          >
            <ImageWithFallback
              fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
              src={integration.picture}
              className="rounded-full"
              alt={integration.identifier}
              width={34}
              height={34}
            />
            <span className="text-[13px] whitespace-nowrap max-w-[96px] truncate">
              {integration.name}
            </span>
            {(integration.inBetweenSteps || integration.refreshNeeded) && (
              <span className="absolute top-[1px] end-[1px] w-[10px] h-[10px] rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>
      <div
        className={clsx(
          'bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all mobile:hidden',
          collapseMenu === '1' ? 'group sidebar w-[100px]' : 'w-[260px]'
        )}
      >
        <div className="flex gap-[12px] flex-col">
          <div className="flex items-center">
            <h2 className="group-[.sidebar]:hidden flex-1 text-[20px] font-[500]">
              {t('channels')}
            </h2>
            <div
              onClick={() => setCollapseMenu(collapseMenu === '1' ? '0' : '1')}
              className="group-[.sidebar]:rotate-[180deg] group-[.sidebar]:mx-auto text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] flex items-center justify-center cursor-pointer select-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="7"
                height="13"
                viewBox="0 0 7 13"
                fill="none"
              >
                <path
                  d="M6 11.5L1 6.5L6 1.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          {/* Tab Tổng quan mọi kênh — mặc định khi mở trang */}
          <div
            onClick={() => setCurrent(-1)}
            className={clsx(
              'flex gap-[12px] items-center group/profile hover:bg-boxHover rounded-e-[8px] transition-opacity py-[6px]',
              current !== -1 && 'opacity-65 hover:opacity-100 cursor-pointer'
            )}
          >
            <div
              className={clsx(
                'h-[34px] w-[4px] -ms-[12px] rounded-s-[3px]',
                current === -1 ? 'opacity-100' : 'opacity-0'
              )}
            >
              <SVGLine />
            </div>
            <div className="w-[36px] h-[36px] rounded-[8px] bg-[#1e6fd9]/15 border border-[#1e6fd9]/40 grid place-items-center text-[17px]">
              📊
            </div>
            <div className="flex-1 whitespace-nowrap text-ellipsis overflow-hidden group-[.sidebar]:hidden font-[600]">
              {t('overview_menu', 'Tổng quan')}
            </div>
          </div>
          {sortedIntegrations.map((integration, index) => (
            <div
              key={integration.id}
              onClick={() => pickIntegration(index, integration)}
              className={clsx(
                'flex gap-[12px] items-center group/profile justify-center hover:bg-boxHover rounded-e-[8px] transition-opacity',
                currentIntegration?.id !== integration.id &&
                  'opacity-65 hover:opacity-100 cursor-pointer'
              )}
            >
              <div
                className={clsx(
                  'relative rounded-full flex justify-center items-center gap-[6px]',
                  integration.disabled && 'opacity-50'
                )}
              >
                {(integration.inBetweenSteps || integration.refreshNeeded) && (
                  <div className="absolute start-0 top-0 w-[39px] h-[46px] cursor-pointer">
                    <div className="bg-red-500 w-[15px] h-[15px] rounded-full start-0 -top-[5px] absolute z-[200] text-[10px] flex justify-center items-center">
                      !
                    </div>
                    <div className="bg-primary/60 w-[39px] h-[46px] start-0 top-0 absolute rounded-full z-[199]" />
                  </div>
                )}
                <div
                  className={clsx(
                    'h-full w-[4px] -ms-[12px] rounded-s-[3px] group-hover/profile:opacity-100 transition-opacity',
                    currentIntegration?.id === integration.id
                      ? 'opacity-100'
                      : 'opacity-0'
                  )}
                >
                  <SVGLine />
                </div>
                <ImageWithFallback
                  fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
                  src={integration.picture}
                  className="rounded-[8px]"
                  alt={integration.identifier}
                  width={36}
                  height={36}
                />
                <SafeImage
                  src={`/icons/platforms/${integration.identifier}.png`}
                  className="rounded-[8px] absolute z-10 bottom-[5px] -end-[5px] border border-fifth"
                  alt={integration.identifier}
                  width={18.41}
                  height={18.41}
                />
              </div>
              <div
                className={clsx(
                  'flex-1 whitespace-nowrap text-ellipsis overflow-hidden group-[.sidebar]:hidden',
                  integration.disabled && 'opacity-50'
                )}
              >
                {integration.name}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px] mobile:p-[12px]">
        {current === -1 && (
          <OverviewAnalytics
            onOpenChannel={(id) => {
              const idx = sortedIntegrations.findIndex(
                (i: any) => i.id === id
              );
              if (idx >= 0) {
                setRefresh(true);
                setTimeout(() => setRefresh(false), 10);
                setCurrent(idx);
              }
            }}
          />
        )}
        {current !== -1 && !!options.length && (
          <div className="flex-1 flex flex-col gap-[14px]">
            <div className="max-w-[200px]">
              <Select
                label=""
                name="date"
                disableForm={true}
                hideErrors={true}
                onChange={(e) => setKey(+e.target.value)}
              >
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.value}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              {!!keys && !!currentIntegration && !refresh && (
                <RenderAnalytics integration={currentIntegration} date={keys} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
