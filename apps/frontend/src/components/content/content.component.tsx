'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ============================================================================
//  Trang Content — toàn cảnh nội dung mọi kênh, kiểu tab Content của Meta
//  Business Suite: Đã đăng / Hẹn giờ / Nháp. Gộp bài của app (Post) + bài
//  sync từ nền tảng (ExternalPost) — gồm bài đăng tay & hẹn giờ NGOÀI app.
// ============================================================================

type TabType = 'published' | 'scheduled' | 'draft';

interface ContentItem {
  id: string;
  source: 'app' | 'platform';
  state: string;
  platform: string;
  integrationId: string;
  integrationName: string;
  integrationPicture: string | null;
  content: string;
  mediaUrls: { type: string; url: string }[];
  image: string | null;
  permalink: string | null;
  publishDate: string;
  insights: Record<string, number | null> | null;
}

const useContentList = (type: TabType, integrationId: string) => {
  const fetch = useFetch();
  return useSWR(
    `/content/list?type=${type}${
      integrationId ? `&integrationId=${integrationId}` : ''
    }`,
    async (u: string) => (await fetch(u)).json(),
    { revalidateOnFocus: false }
  );
};

const useIntegrationsList = () => {
  const fetch = useFetch();
  return useSWR(
    '/integrations/list',
    async (u: string) => (await fetch(u)).json(),
    { revalidateOnFocus: false }
  );
};

const nice = (n: number) =>
  n >= 1000000
    ? (n / 1000000).toFixed(1).replace('.0', '') + 'M'
    : n >= 1000
    ? (n / 1000).toFixed(1).replace('.0', '') + 'K'
    : String(n);

const platformEmoji = (platform: string) =>
  platform === 'facebook' ? '📘' : platform === 'instagram' ? '📸' : '📄';

const ContentCard: FC<{ item: ContentItem; tab: TabType }> = ({
  item,
  tab,
}) => {
  const t = useT();
  const router = useRouter();
  const date = new Date(item.publishDate);
  const dateStr = `${date.toLocaleDateString('vi-VN')} ${date
    .toTimeString()
    .slice(0, 5)}`;

  const openItem = useCallback(() => {
    if (item.source === 'app' && (tab === 'draft' || tab === 'scheduled')) {
      // Bài của app: mở thẳng trình soạn trên Calendar (cơ chế openpost có sẵn)
      router.push(`/launches?openpost=${item.id}`);
      return;
    }
    if (item.permalink) {
      window.open(item.permalink, '_blank');
    }
  }, [item, tab, router]);

  const clickable =
    (item.source === 'app' && (tab === 'draft' || tab === 'scheduled')) ||
    !!item.permalink;

  return (
    <div
      onClick={clickable ? openItem : undefined}
      className={`group/card relative bg-newTableHeader border border-newTableBorder rounded-[12px] overflow-hidden flex flex-col transition-all${
        clickable
          ? ' hover:border-[#1e6fd9] hover:shadow-[0_2px_12px_rgba(30,111,217,0.18)] cursor-pointer'
          : ''
      }`}
    >
      <div className="relative aspect-[16/8] bg-newBgColorInner/60">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[24px] opacity-40">
            {platformEmoji(item.platform)}
          </div>
        )}
        {/* Chip nguồn: bài của app hay bài trên nền tảng (đăng/hẹn ngoài app) */}
        <span
          className={`absolute top-[8px] left-[8px] text-[10.5px] font-[800] px-[8px] py-[2px] rounded-[6px] text-white ${
            item.source === 'platform' ? 'bg-[#7f56d9]/90' : 'bg-[#1e6fd9]/90'
          }`}
        >
          {item.source === 'platform'
            ? tab === 'scheduled'
              ? t('content_source_meta_scheduled', 'Hẹn trên Meta')
              : t('content_source_platform', 'Ngoài app')
            : 'Hub'}
        </span>
        <span className="absolute top-[8px] right-[8px] text-[13px]">
          {platformEmoji(item.platform)}
        </span>
      </div>
      <div className="p-[12px] flex flex-col gap-[8px] flex-1">
        <div className="flex items-center gap-[6px] text-[11px] text-newTableText/60">
          {item.integrationPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.integrationPicture}
              alt=""
              className="w-[16px] h-[16px] rounded-full"
            />
          ) : null}
          <span className="truncate">{item.integrationName}</span>
          <span className="ms-auto tabular-nums whitespace-nowrap">
            {tab === 'scheduled' ? '🕑 ' : ''}
            {dateStr}
          </span>
        </div>
        <div className="text-[12.5px] leading-[1.5] line-clamp-3 min-h-[54px]">
          {item.content || t('content_no_text', '(bài không có chữ)')}
        </div>
        {item.insights && (
          <div className="flex gap-[11px] text-[12px] text-newTableText/70 tabular-nums mt-auto items-center flex-wrap">
            {item.insights.reactions != null && (
              <span>
                👍{' '}
                <b className="text-newTableText">
                  {nice(item.insights.reactions)}
                </b>
              </span>
            )}
            {item.insights.comments != null && (
              <span>
                💬{' '}
                <b className="text-newTableText">
                  {nice(item.insights.comments)}
                </b>
              </span>
            )}
            {item.insights.shares != null && (
              <span className="text-[#FFC53D]">
                ↗ <b className="font-[800]">{nice(item.insights.shares)}</b>
              </span>
            )}
          </div>
        )}
        {item.source === 'platform' && tab === 'scheduled' && (
          <div className="text-[11px] text-newTableText/50">
            {t(
              'content_meta_scheduled_note',
              'Sửa/hủy bài này trong Meta Business Suite'
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ContentComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const [tab, setTab] = useState<TabType>('published');
  const [integrationId, setIntegrationId] = useState('');
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, mutate } = useContentList(tab, integrationId);
  const { data: integrationsData } = useIntegrationsList();

  const integrations = useMemo(
    () =>
      (integrationsData?.integrations || []).filter((i: any) =>
        ['facebook', 'instagram'].includes(i.identifier)
      ),
    [integrationsData]
  );

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/content/sync?force=true', { method: 'POST' });
      await mutate();
    } finally {
      setSyncing(false);
    }
  }, [fetch, mutate]);

  const items: ContentItem[] = data?.items || [];

  const TABS: { key: TabType; label: string }[] = [
    { key: 'published', label: t('content_tab_published', 'Đã đăng') },
    { key: 'scheduled', label: t('content_tab_scheduled', 'Hẹn giờ') },
    { key: 'draft', label: t('content_tab_draft', 'Nháp') },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-[12px] flex-wrap">
        <div className="flex flex-col">
          <div className="text-[20px] font-[650]">
            {t('content_title', 'Content')}
          </div>
          <div className="text-[12px] text-newTableText/60">
            {t(
              'content_subtitle',
              'Toàn bộ bài của mọi kênh — gồm cả bài đăng tay & hẹn giờ ngoài app (đồng bộ từ Meta)'
            )}
          </div>
        </div>
        <div className="ms-auto flex items-center gap-[8px]">
          <select
            value={integrationId}
            onChange={(e) => setIntegrationId(e.target.value)}
            className="bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[10px] py-[7px] text-[13px] outline-none"
          >
            <option value="">
              {t('content_all_channels', 'Tất cả kênh')}
            </option>
            {integrations.map((i: any) => (
              <option key={i.id} value={i.id}>
                {platformEmoji(i.identifier)} {i.name}
              </option>
            ))}
          </select>
          <button
            onClick={doSync}
            disabled={syncing}
            className="bg-[#1e6fd9] hover:bg-[#1a5fc0] disabled:opacity-50 text-white text-[13px] font-[600] px-[14px] py-[7px] rounded-[8px] transition-all whitespace-nowrap"
          >
            {syncing
              ? t('content_syncing', 'Đang đồng bộ…')
              : t('content_sync', '⟳ Đồng bộ từ Meta')}
          </button>
        </div>
      </div>

      <div className="flex gap-[4px] border-b border-newTableBorder">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-[16px] py-[9px] text-[13.5px] font-[600] border-b-[2px] -mb-[1px] transition-all ${
              tab === key
                ? 'border-[#1e6fd9] text-newTableText'
                : 'border-transparent text-newTableText/50 hover:text-newTableText/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-[13px] text-newTableText/60 p-[16px]">
          {t('loading', 'Loading...')}
        </div>
      ) : !items.length ? (
        <div className="text-[13px] text-newTableText/60 bg-newTableHeader border border-newTableBorder rounded-[10px] p-[16px]">
          {tab === 'published'
            ? t(
                'content_empty_published',
                'Chưa có bài nào — bấm "Đồng bộ từ Meta" để kéo bài của Trang về.'
              )
            : tab === 'scheduled'
            ? t(
                'content_empty_scheduled',
                'Không có bài hẹn giờ nào (ở app lẫn trên Meta).'
              )
            : t('content_empty_draft', 'Chưa có bài nháp nào.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px]">
          {items.map((item) => (
            <ContentCard key={item.id} item={item} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
};
