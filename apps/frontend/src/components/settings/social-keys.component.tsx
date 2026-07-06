'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ============================================================================
//  OAuth keys các kênh — nhập qua UI + hướng dẫn đăng ký từng nền tảng.
//  Dùng ở 2 chỗ: (1) Settings (danh sách đầy đủ), (2) popup khi bấm kết nối
//  kênh chưa cấu hình (add.provider.component).
//  Backend: GET/POST /settings/social-keys (ghi .env + hiệu lực ngay).
// ============================================================================

type Field = { env: string; label: string; placeholder?: string };
export type PlatformGuide = {
  name: string;
  icon: string;
  portal: string; // link trang developer
  portalLabel: string;
  fields: Field[];
  redirectPath?: string; // /integrations/social/<id> — copy vào phần cấu hình app
  steps: string[];
  note?: string;
  restart?: boolean; // cần khởi động lại sau khi lưu
};

const redirect = (id: string) => `/integrations/social/${id}`;

export const PLATFORM_GUIDES: Record<string, PlatformGuide> = {
  zalo: {
    name: 'Zalo OA',
    icon: '💙',
    portal: 'https://developers.zalo.me/',
    portalLabel: 'Open Zalo for Developers',
    fields: [
      { env: 'ZALO_APP_ID', label: 'App ID', placeholder: '1234567890123456789' },
      { env: 'ZALO_APP_SECRET', label: 'Secret Key' },
    ],
    redirectPath: redirect('zalo'),
    steps: [
      'developers.zalo.me → Create Application → copy App ID + Secret Key into the fields below',
      'In the app, add the "Official Account" product and link your VERIFIED OA',
      'Official Account → Settings → Callback URL: paste the URL below (copy button)',
      'The OA must be VERIFIED — only verified OAs can publish via the Article API',
    ],
    note: 'Posts are published as an Article on the OA. Requires a VERIFIED Official Account. Access token lasts 1h and refreshes automatically (refresh token ~3 months).',
  },
  telegram: {
    name: 'Telegram',
    icon: '✈️',
    portal: 'https://t.me/BotFather',
    portalLabel: 'Open @BotFather',
    fields: [
      { env: 'TELEGRAM_BOT_NAME', label: 'Bot username (without @)', placeholder: 'vietanh_media_bot' },
      { env: 'TELEGRAM_TOKEN', label: 'Bot token', placeholder: '123456:ABC-DEF...' },
    ],
    steps: [
      'Open Telegram, chat with @BotFather → type /newbot',
      'Set a display name, then set a username (must end with "bot")',
      'BotFather returns a TOKEN — paste the token + username into the fields below',
    ],
    note: 'Fastest (~2 minutes), no approval needed. After saving: restart once (Ctrl+C → start-postiz.bat) because the bot name is loaded at app startup.',
    restart: true,
  },
  facebook: {
    name: 'Facebook',
    icon: '📘',
    portal: 'https://developers.facebook.com/apps/',
    portalLabel: 'Open Facebook Developers',
    fields: [
      { env: 'FACEBOOK_APP_ID', label: 'App ID' },
      { env: 'FACEBOOK_APP_SECRET', label: 'App Secret' },
    ],
    redirectPath: redirect('facebook'),
    steps: [
      'developers.facebook.com → My Apps → Create App (Business type)',
      'Add the "Facebook Login for Business" product',
      'Facebook Login → Settings → paste "Valid OAuth Redirect URIs" (copy button below)',
      'App Settings → Basic → copy App ID + App Secret into the fields below',
    ],
    note: 'Development mode: only the app admin/tester accounts can connect (enough for a demo). Going public requires App Review + business verification.',
  },
  instagram: {
    name: 'Instagram',
    icon: '📸',
    portal: 'https://developers.facebook.com/apps/',
    portalLabel: 'Open Facebook Developers',
    fields: [
      { env: 'FACEBOOK_APP_ID', label: 'App ID (shared with the Facebook app)' },
      { env: 'FACEBOOK_APP_SECRET', label: 'App Secret' },
    ],
    redirectPath: redirect('instagram'),
    steps: [
      'Instagram SHARES the Facebook app (see the Facebook guide)',
      'In the Facebook app, add the "Instagram Graph API" product',
      'The Instagram account must be Business/Creator and linked to a Page',
    ],
  },
  'instagram-standalone': {
    name: 'Instagram (standalone)',
    icon: '📸',
    portal: 'https://developers.facebook.com/apps/',
    portalLabel: 'Open Facebook Developers',
    fields: [
      { env: 'FACEBOOK_APP_ID', label: 'App ID' },
      { env: 'FACEBOOK_APP_SECRET', label: 'App Secret' },
    ],
    redirectPath: redirect('instagram-standalone'),
    steps: ['Shares the Facebook app — see the Facebook guide'],
  },
  linkedin: {
    name: 'LinkedIn',
    icon: '💼',
    portal: 'https://www.linkedin.com/developers/apps',
    portalLabel: 'Open LinkedIn Developers',
    fields: [
      { env: 'LINKEDIN_CLIENT_ID', label: 'Client ID' },
      { env: 'LINKEDIN_CLIENT_SECRET', label: 'Client Secret' },
    ],
    redirectPath: redirect('linkedin'),
    steps: [
      'linkedin.com/developers → Create App (requires linking a LinkedIn Page)',
      'Auth tab → Authorized redirect URLs → paste the URL (copy button below)',
      'Products tab → request "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect"',
      'Auth tab → copy Client ID + Client Secret into the fields below',
    ],
  },
  'linkedin-page': {
    name: 'LinkedIn Page',
    icon: '💼',
    portal: 'https://www.linkedin.com/developers/apps',
    portalLabel: 'Open LinkedIn Developers',
    fields: [
      { env: 'LINKEDIN_CLIENT_ID', label: 'Client ID (shared with the LinkedIn app)' },
      { env: 'LINKEDIN_CLIENT_SECRET', label: 'Client Secret' },
    ],
    redirectPath: redirect('linkedin-page'),
    steps: [
      'Shares the LinkedIn app (see the LinkedIn guide)',
      'Add this redirect URL to the app\'s Auth tab',
    ],
  },
  gmb: {
    name: 'Google Business',
    icon: '📍',
    portal: 'https://console.cloud.google.com/apis/credentials',
    portalLabel: 'Open Google Cloud Console',
    fields: [
      { env: 'GOOGLE_GMB_CLIENT_ID', label: 'OAuth Client ID' },
      { env: 'GOOGLE_GMB_CLIENT_SECRET', label: 'OAuth Client Secret' },
    ],
    redirectPath: redirect('gmb'),
    steps: [
      'console.cloud.google.com → create a Project',
      'OAuth consent screen (External) → ADD your email to "Test users" (the "Access blocked" error is caused by skipping this step)',
      'Credentials → Create OAuth Client ID (Web) → paste the Redirect URI (copy button below)',
      'Copy Client ID + Secret into the fields below',
    ],
    note: '⚠️ The Google Business Profile API requires filing a separate access request form with Google and waiting for approval — the slowest of all the channels.',
  },
  youtube: {
    name: 'YouTube',
    icon: '▶️',
    portal: 'https://console.cloud.google.com/apis/credentials',
    portalLabel: 'Open Google Cloud Console',
    fields: [
      { env: 'YOUTUBE_CLIENT_ID', label: 'OAuth Client ID' },
      { env: 'YOUTUBE_CLIENT_SECRET', label: 'OAuth Client Secret' },
    ],
    redirectPath: redirect('youtube'),
    steps: [
      'Same Google Cloud project as Google Business (or create a new one)',
      'Enable "YouTube Data API v3" in the Library',
      'Credentials → OAuth Client (Web) → paste the Redirect URI below',
      'Remember to add your email to Test users on the OAuth consent screen',
    ],
  },
  discord: {
    name: 'Discord',
    icon: '🎮',
    portal: 'https://discord.com/developers/applications',
    portalLabel: 'Open Discord Developers',
    fields: [
      { env: 'DISCORD_CLIENT_ID', label: 'Client ID' },
      { env: 'DISCORD_CLIENT_SECRET', label: 'Client Secret' },
      { env: 'DISCORD_BOT_TOKEN_ID', label: 'Bot Token' },
    ],
    redirectPath: redirect('discord'),
    steps: [
      'discord.com/developers → New Application',
      'OAuth2 → Redirects → paste the URL (copy button below); copy Client ID + Secret',
      'Bot tab → Reset Token → copy the Bot Token',
      'Invite the bot to your server (OAuth2 URL Generator, bot scope)',
    ],
  },
  x: {
    name: 'X (Twitter)',
    icon: '🐦',
    portal: 'https://developer.x.com/en/portal/dashboard',
    portalLabel: 'Open X Developer Portal',
    fields: [
      { env: 'X_API_KEY', label: 'API Key' },
      { env: 'X_API_SECRET', label: 'API Secret' },
    ],
    redirectPath: redirect('x'),
    steps: [
      'developer.x.com → create a Project + App (the Free tier posts ~500 posts/month)',
      'User authentication settings → enable OAuth 1.0a, Read & Write permission',
      'Callback URI: paste the URL below; Website: enter anything',
      'Keys & tokens → copy API Key + Secret into the fields below',
    ],
  },
  tiktok: {
    name: 'TikTok',
    icon: '🎵',
    portal: 'https://developers.tiktok.com/',
    portalLabel: 'Open TikTok Developers',
    fields: [
      { env: 'TIKTOK_CLIENT_ID', label: 'Client Key' },
      { env: 'TIKTOK_CLIENT_SECRET', label: 'Client Secret' },
    ],
    redirectPath: redirect('tiktok'),
    steps: [
      'developers.tiktok.com → Manage apps → Create app',
      'Add the Login Kit + Content Posting API products',
      'Redirect URI: paste the URL below (TikTok requires HTTPS in production)',
      '⚠️ The app must be APPROVED by TikTok before you can post — allow a few days',
    ],
  },
  reddit: {
    name: 'Reddit',
    icon: '👽',
    portal: 'https://www.reddit.com/prefs/apps',
    portalLabel: 'Open Reddit Apps',
    fields: [
      { env: 'REDDIT_CLIENT_ID', label: 'Client ID' },
      { env: 'REDDIT_CLIENT_SECRET', label: 'Client Secret' },
    ],
    redirectPath: redirect('reddit'),
    steps: [
      'reddit.com/prefs/apps → create another app → choose "web app"',
      'redirect uri: paste the URL below',
      'Client ID = the string under the app name; Secret = the secret field',
    ],
  },
};

// ---- Form 1 nền tảng (dùng trong Settings + popup kết nối kênh) -----------

export const SocialKeyGuideForm: FC<{
  identifier: string;
  onSaved?: () => void;
}> = ({ identifier, onSaved }) => {
  const guide = PLATFORM_GUIDES[identifier];
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectUri = guide?.redirectPath ? `${origin}${guide.redirectPath}` : '';

  const load = useCallback(async () => {
    try {
      setStatus(await (await fetch('/settings/social-keys')).json());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    load();
  }, []);

  if (!guide) return null;

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.show(t('social_keys_copied_redirect', 'Redirect URI copied'), 'success');
    } catch {
      toast.show(redirectUri, 'warning');
    }
  };

  const save = async () => {
    const vars: Record<string, string> = {};
    for (const f of guide.fields) {
      if ((values[f.env] || '').trim()) vars[f.env] = values[f.env].trim();
    }
    if (!Object.keys(vars).length) return;
    setSaving(true);
    try {
      const r = await (
        await fetch('/settings/social-keys', {
          method: 'POST',
          body: JSON.stringify({ vars }),
        })
      ).json();
      if (r.ok) {
        toast.show(
          guide.restart
            ? t(
                'social_keys_saved_restart',
                'Saved! Restart (Ctrl+C → start-postiz.bat) then connect.'
              )
            : t(
                'social_keys_saved',
                'Saved! Click connect the channel again and it works.'
              ),
          'success'
        );
        setValues({});
        load();
        onSaved?.();
      } else toast.show(t('social_keys_save_error', 'Save failed'), 'warning');
    } catch {
      toast.show(
        t('social_keys_server_unreachable', 'Could not reach the server'),
        'warning'
      );
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-[14px] text-textColor">
      {/* các bước */}
      <div className="flex flex-col gap-[8px]">
        {guide.steps.map((s, i) => (
          <div key={i} className="flex gap-[10px] text-[13px] leading-[1.5]">
            <div className="w-[20px] h-[20px] rounded-full bg-forth flex items-center justify-center text-[11px] font-[700] shrink-0 mt-[1px]">
              {i + 1}
            </div>
            <div className="opacity-85">{s}</div>
          </div>
        ))}
      </div>

      {/* redirect uri */}
      {!!redirectUri && (
        <div className="bg-sixth border-fifth border rounded-[8px] p-[10px] flex items-center gap-[8px]">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] opacity-60 mb-[2px]">
              {t(
                'social_keys_redirect_uri_hint',
                'Redirect URI (paste into the app configuration):'
              )}
            </div>
            <div className="text-[12px] font-mono truncate">{redirectUri}</div>
          </div>
          <Button className="h-[34px] shrink-0" onClick={copyRedirect}>
            Copy
          </Button>
        </div>
      )}

      {!!guide.note && (
        <div className="text-[12px] opacity-60 leading-[1.5] border-l-2 border-fifth pl-[10px]">
          {guide.note}
        </div>
      )}

      {/* form keys */}
      <div className="flex flex-col gap-[8px]">
        {guide.fields.map((f) => (
          <div
            key={f.env}
            className="flex items-center gap-[8px] mobile:flex-col mobile:items-stretch mobile:gap-[4px]"
          >
            <div className="w-[190px] mobile:w-full text-[12.5px] opacity-80 shrink-0">
              {f.label}
              {status?.[f.env]?.has && (
                <span className="text-green-400"> ✓ ({status[f.env].masked})</span>
              )}
            </div>
            <div className="flex-1">
              <Input
                value={values[f.env] || ''}
                disableForm={true}
                removeError={true}
                type="password"
                onChange={(e: any) =>
                  setValues((v) => ({ ...v, [f.env]: e.target.value }))
                }
                name={f.env}
                label=""
                placeholder={
                  status?.[f.env]?.has
                    ? t('social_keys_placeholder_saved', 'saved — enter to replace')
                    : f.placeholder ||
                      t('social_keys_placeholder_paste', 'paste value...')
                }
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-[8px]">
        <a href={guide.portal} target="_blank" rel="noreferrer">
          <Button className="bg-transparent border border-fifth">
            {guide.portalLabel} ↗
          </Button>
        </a>
        <div className="flex-1" />
        <Button onClick={save} disabled={saving}>
          {saving
            ? t('social_keys_saving', 'Saving...')
            : t('social_keys_save_button', 'Save keys')}
        </Button>
      </div>
    </div>
  );
};

// ---- Danh sách đầy đủ trong Settings ---------------------------------------

const ORDER = [
  'zalo',
  'telegram',
  'facebook',
  'instagram',
  'linkedin',
  'gmb',
  'youtube',
  'discord',
  'x',
  'tiktok',
  'reddit',
];

export const SocialKeysComponent: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const [status, setStatus] = useState<any>({});
  const [open, setOpen] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus(await (await fetch('/settings/social-keys')).json());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    load();
  }, []);

  const configured = (id: string) =>
    PLATFORM_GUIDES[id]?.fields.every((f) => status?.[f.env]?.has);

  return (
    <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
      <h3 className="text-[18px] mb-[4px]">
        {t('social_keys_title', 'Connect channels — OAuth keys')}
      </h3>
      <div className="text-[13px] opacity-70 mb-[14px]">
        {t(
          'social_keys_description',
          'Each platform needs its own developer app (free). Click a channel to see the guide and enter the key right here — no file editing needed.'
        )}
      </div>
      <div className="flex flex-col gap-[8px]">
        {ORDER.map((id) => {
          const g = PLATFORM_GUIDES[id];
          if (!g) return null;
          const ok = configured(id);
          const isOpen = open === id;
          return (
            <div key={id} className="border-fifth border rounded-[8px] overflow-hidden">
              <div
                className="flex items-center gap-[10px] px-[14px] py-[11px] cursor-pointer hover:bg-fifth/30 select-none"
                onClick={() => setOpen(isOpen ? '' : id)}
              >
                <span className="text-[18px]">{g.icon}</span>
                <span className="text-[14px] font-[600] flex-1">{g.name}</span>
                <span
                  className={clsx(
                    'text-[11px] font-[700] px-[8px] py-[2px] rounded-full',
                    ok
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-fifth opacity-70'
                  )}
                >
                  {ok
                    ? t('social_keys_status_configured', 'CONFIGURED')
                    : t('social_keys_status_missing', 'NO KEY')}
                </span>
                <span className="opacity-50 text-[12px]">{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && (
                <div className="px-[14px] pb-[14px] pt-[4px] border-t border-fifth">
                  <SocialKeyGuideForm identifier={id} onSaved={load} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SocialKeysComponent;
