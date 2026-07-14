'use client';

import DevtoProvider from '@gitroom/frontend/components/new-launch/providers/devto/devto.provider';
import XProvider from '@gitroom/frontend/components/new-launch/providers/x/x.provider';
import LinkedinProvider from '@gitroom/frontend/components/new-launch/providers/linkedin/linkedin.provider';
import RedditProvider from '@gitroom/frontend/components/new-launch/providers/reddit/reddit.provider';
import MediumProvider from '@gitroom/frontend/components/new-launch/providers/medium/medium.provider';
import HashnodeProvider from '@gitroom/frontend/components/new-launch/providers/hashnode/hashnode.provider';
import FacebookProvider from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.provider';
import InstagramProvider from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.collaborators';
import YoutubeProvider from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.provider';
import TiktokProvider from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.provider';
import PinterestProvider from '@gitroom/frontend/components/new-launch/providers/pinterest/pinterest.provider';
import DribbbleProvider from '@gitroom/frontend/components/new-launch/providers/dribbble/dribbble.provider';
import ThreadsProvider from '@gitroom/frontend/components/new-launch/providers/threads/threads.provider';
import DiscordProvider from '@gitroom/frontend/components/new-launch/providers/discord/discord.provider';
import SlackProvider from '@gitroom/frontend/components/new-launch/providers/slack/slack.provider';
import KickProvider from '@gitroom/frontend/components/new-launch/providers/kick/kick.provider';
import TwitchProvider from '@gitroom/frontend/components/new-launch/providers/twitch/twitch.provider';
import MastodonProvider from '@gitroom/frontend/components/new-launch/providers/mastodon/mastodon.provider';
import BlueskyProvider from '@gitroom/frontend/components/new-launch/providers/bluesky/bluesky.provider';
import LemmyProvider from '@gitroom/frontend/components/new-launch/providers/lemmy/lemmy.provider';
import WarpcastProvider from '@gitroom/frontend/components/new-launch/providers/warpcast/warpcast.provider';
import TelegramProvider from '@gitroom/frontend/components/new-launch/providers/telegram/telegram.provider';
import NostrProvider from '@gitroom/frontend/components/new-launch/providers/nostr/nostr.provider';
import VkProvider from '@gitroom/frontend/components/new-launch/providers/vk/vk.provider';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import React, { FC, forwardRef, useEffect, useImperativeHandle } from 'react';
import clsx from 'clsx';
import { GeneralPreviewComponent } from '@gitroom/frontend/components/launches/general.preview.component';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PostComment } from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import WordpressProvider from '@gitroom/frontend/components/new-launch/providers/wordpress/wordpress.provider';
import ListmonkProvider from '@gitroom/frontend/components/new-launch/providers/listmonk/listmonk.provider';
import GmbProvider from '@gitroom/frontend/components/new-launch/providers/gmb/gmb.provider';
import MoltbookProvider from '@gitroom/frontend/components/new-launch/providers/moltbook/moltbook.provider';
import SkoolProvider from '@gitroom/frontend/components/new-launch/providers/skool/skool.provider';
import WhopProvider from '@gitroom/frontend/components/new-launch/providers/whop/whop.provider';
import MeweProvider from '@gitroom/frontend/components/new-launch/providers/mewe/mewe.provider';
import ZaloProvider from '@gitroom/frontend/components/new-launch/providers/zalo/zalo.provider';

export const Providers = [
  {
    identifier: 'zalo',
    component: ZaloProvider,
  },
  {
    identifier: 'devto',
    component: DevtoProvider,
  },
  {
    identifier: 'x',
    component: XProvider,
  },
  {
    identifier: 'linkedin',
    component: LinkedinProvider,
  },
  {
    identifier: 'linkedin-page',
    component: LinkedinProvider,
  },
  {
    identifier: 'reddit',
    component: RedditProvider,
  },
  {
    identifier: 'medium',
    component: MediumProvider,
  },
  {
    identifier: 'hashnode',
    component: HashnodeProvider,
  },
  {
    identifier: 'facebook',
    component: FacebookProvider,
  },
  {
    identifier: 'instagram',
    component: InstagramProvider,
  },
  {
    identifier: 'instagram-standalone',
    component: InstagramProvider,
  },
  {
    identifier: 'youtube',
    component: YoutubeProvider,
  },
  {
    identifier: 'tiktok',
    component: TiktokProvider,
  },
  {
    identifier: 'pinterest',
    component: PinterestProvider,
  },
  {
    identifier: 'dribbble',
    component: DribbbleProvider,
  },
  {
    identifier: 'threads',
    component: ThreadsProvider,
  },
  {
    identifier: 'discord',
    component: DiscordProvider,
  },
  {
    identifier: 'slack',
    component: SlackProvider,
  },
  {
    identifier: 'kick',
    component: KickProvider,
  },
  {
    identifier: 'twitch',
    component: TwitchProvider,
  },
  {
    identifier: 'mastodon',
    component: MastodonProvider,
  },
  {
    identifier: 'bluesky',
    component: BlueskyProvider,
  },
  {
    identifier: 'lemmy',
    component: LemmyProvider,
  },
  {
    identifier: 'wrapcast',
    component: WarpcastProvider,
  },
  {
    identifier: 'telegram',
    component: TelegramProvider,
  },
  {
    identifier: 'nostr',
    component: NostrProvider,
  },
  {
    identifier: 'vk',
    component: VkProvider,
  },
  {
    identifier: 'wordpress',
    component: WordpressProvider,
  },
  {
    identifier: 'listmonk',
    component: ListmonkProvider,
  },
  {
    identifier: 'gmb',
    component: GmbProvider,
  },
  {
    identifier: 'moltbook',
    component: MoltbookProvider,
  },
  {
    identifier: 'skool',
    component: SkoolProvider,
  },
  {
    identifier: 'whop',
    component: WhopProvider,
  },
  {
    identifier: 'mewe',
    component: MeweProvider,
  },
];
export const ShowAllProviders = forwardRef((props, ref) => {
  const { date, current, global, selectedIntegrations, allIntegrations } =
    useLaunchStore(
      useShallow((state) => ({
        date: state.date,
        selectedIntegrations: state.selectedIntegrations,
        allIntegrations: state.integrations,
        current: state.current,
        global: state.global,
      }))
    );

  const t = useT();

  useImperativeHandle(ref, () => ({
    checkAllValid: async () => {
      return Promise.all(
        selectedIntegrations.map(async (p) => await p.ref?.current.isValid())
      );
    },
    getAllValues: async () => {
      return Promise.all(
        selectedIntegrations.map(async (p) => await p.ref?.current.getValues())
      );
    },
    triggerAll: () => {
      return selectedIntegrations.map(
        async (p) => await p.ref?.current.trigger()
      );
    },
  }));

  return (
    <div className="w-full flex flex-col flex-1">
      {current === 'global' && (
        <IntegrationContext.Provider
          value={{
            date,
            integration:
              selectedIntegrations?.[0]?.integration || allIntegrations?.[0],
            allIntegrations: selectedIntegrations.map((p) => p.integration),
            value: global.map((p) => ({
              id: p.id,
              content: p.content,
              image: p.media,
            })),
          }}
        >
          {global?.[0]?.content?.length === 0 ? (
            <div>
              {t(
                'start_writing_your_post',
                'Start writing your post for a preview'
              )}
            </div>
          ) : (
            <>
              {/* Mobile: nhãn kênh dính đỉnh — định hướng khi cuộn preview dài */}
              {!!selectedIntegrations?.[0] && (
                <div className="hidden mobile:flex sticky top-0 z-[60] items-center gap-[8px] py-[6px] mb-[8px] bg-newBgColorInner">
                  <img
                    src={`/icons/platforms/${selectedIntegrations[0].integration.identifier}.png`}
                    className="w-[16px] h-[16px] rounded-[4px]"
                    alt={selectedIntegrations[0].integration.identifier}
                  />
                  <span className="text-[12px] font-[600] text-textItemBlur truncate">
                    {selectedIntegrations[0].integration.name}
                  </span>
                </div>
              )}
              <div className="border border-borderPreview rounded-[12px] shadow-previewShadow">
                <GeneralPreviewComponent maximumCharacters={100000000} />
              </div>
            </>
          )}
        </IntegrationContext.Provider>
      )}
      {selectedIntegrations.map((integration) => {
        const { component: ProviderComponent } = Providers.find(
          (provider) =>
            provider.identifier === integration.integration.identifier
        ) || {
          component: Empty,
        };

        // Provider tự ẩn khi không phải kênh đang xem (current) → nhãn cũng
        // chỉ vẽ cho kênh đang hiện, tránh chuỗi nhãn mồ côi
        const isShown = current === integration.integration.id;

        return (
          <div
            key={integration.integration.id}
            className={clsx(isShown && 'mobile:mb-[16px]')}
          >
            {isShown && (
              <div className="hidden mobile:flex sticky top-0 z-[60] items-center gap-[8px] py-[6px] mb-[8px] bg-newBgColorInner">
                <img
                  src={`/icons/platforms/${integration.integration.identifier}.png`}
                  className="w-[16px] h-[16px] rounded-[4px]"
                  alt={integration.integration.identifier}
                />
                <span className="text-[12px] font-[600] text-textItemBlur truncate">
                  {integration.integration.name}
                </span>
              </div>
            )}
            <ProviderComponent
              ref={integration.ref}
              id={integration.integration.id}
            />
          </div>
        );
      })}
    </div>
  );
});

export const Empty: FC = () => {
  return null;
};
