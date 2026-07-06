'use client';

import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ============================================================================
//  Trang Zalo — TOÀN BỘ vận hành bot Zalo ngay trong Media Hub (không cần mở
//  dashboard :8088 cho việc hằng ngày): QR đăng nhập, nhóm nghe + trạng thái
//  gom ảnh realtime, hàng chờ của bot (sửa caption / AI viết lại / đăng FB /
//  đẩy sang Hub / từ chối), tạm dừng bot, đổi tài khoản, nhật ký.
//  Giao diện theo design system mới (panel bg-newBgColorInner, token new*).
// ============================================================================

// Bot Zalo (:8088) luôn được truy cập QUA proxy same-origin /botapi (Next
// rewrite → 127.0.0.1:8088, proxy.ts verify JWT). Same-origin → cookie 'auth'
// tự đi kèm mọi fetch/img, chạy giống nhau ở localhost / LAN / tunnel. Bot chỉ
// bind 127.0.0.1 nên KHÔNG gọi thẳng IP:8088 được — đây là lối duy nhất.
const getBotUrl = () =>
  typeof window === 'undefined' ? '/botapi' : `${window.location.origin}/botapi`;

// Kênh mà bot đẩy bài vào được KHÔNG kèm settings (mọi field settings optional).
// Kênh ngoài danh sách này (YouTube, Instagram, Pinterest, Slack, Discord...)
// bắt buộc có settings riêng → bài bot đẩy sẽ bị 400, nên chặn ngay từ dropdown.
const BOT_SUPPORTED_PROVIDERS = new Set([
  'facebook',
  'linkedin',
  'linkedin-page',
  'threads',
  'mastodon',
  'bluesky',
  'telegram',
  'x',
  'vk',
  'gmb',
  'farcaster',
  'wrapcast',
  'kick',
  'twitch',
  'tiktok',
  'mewe',
  'nostr',
  'listmonk',
]);

async function bot(path: string, init?: RequestInit, timeoutMs = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBotUrl()}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---- Kiểu dữ liệu từ bot ---------------------------------------------------

type Overview = {
  zaloConnected: boolean;
  zaloRelogging: boolean;
  hasQr: boolean;
  paused: boolean;
  pendingCount: number;
  routes: {
    threadId: string;
    label: string;
    enabled: boolean;
    // Kênh Media Hub riêng của nhóm; '' = dùng kênh mặc định
    postizIntegrationId?: string;
  }[];
};

type BridgeConfig = {
  enabled: boolean;
  apiUrl: string;
  hasKey: boolean;
  masked: string;
  integrationId: string;
  zaloConnected?: boolean;
  zaloRelogging?: boolean;
};

type LiveThread = {
  threadId: string;
  label: string;
  phase: 'idle' | 'prelisten' | 'listening' | 'processing' | 'done';
  counts: { image: number; video: number; text: number };
  proc?: { stage?: string } | null;
};

type PendingDraft = {
  id: string;
  routeLabel: string;
  caption: string;
  imageCaptions: string[];
  createdAt: number;
  scheduledAt: number | null;
  imageCount: number;
  videoCount: number;
  approvals: any;
  hasFbToken: boolean;
  gbpCount: number;
  pushedToHub?: boolean;
};

// ---- UI helpers (token mới) -------------------------------------------------

const Pill: FC<{
  ok: boolean | null;
  onLabel: string;
  offLabel: string;
  title?: string;
}> = ({ ok, onLabel, offLabel, title }) => {
  const t = useT();
  return (
    <div
      title={title}
      className={clsx(
        'flex items-center gap-[7px] text-[12px] font-[600] px-[12px] h-[28px] rounded-full border',
        title && 'cursor-help',
        ok === true && 'border-green-500/40 bg-green-500/10 text-green-500',
        ok === false && 'border-red-500/40 bg-red-500/10 text-red-500',
        ok === null && 'border-newTableBorder text-textItemBlur'
      )}
    >
      <span
        className={clsx(
          'w-[8px] h-[8px] rounded-full',
          ok === true && 'bg-green-500',
          ok === false && 'bg-red-500',
          ok === null && 'bg-textItemBlur animate-pulse'
        )}
      />
      {ok === true
        ? onLabel
        : ok === false
        ? offLabel
        : t('zalo_checking', 'Checking…')}
    </div>
  );
};

const Card: FC<{ title?: ReactNode; className?: string; children: ReactNode }> = ({
  title,
  className,
  children,
}) => (
  <div
    className={clsx(
      'border border-newTableBorder rounded-[12px] p-[20px] flex flex-col gap-[14px]',
      className
    )}
  >
    {!!title && (
      <div className="text-[13px] font-[700] text-textItemBlur uppercase tracking-[0.5px]">
        {title}
      </div>
    )}
    {children}
  </div>
);

const StepBadge: FC<{ step: string; done?: boolean; warn?: boolean }> = ({
  step,
  done,
  warn,
}) => (
  <div
    className={clsx(
      'w-[28px] h-[28px] rounded-full flex items-center justify-center text-[13px] font-[700] shrink-0',
      warn
        ? 'bg-red-500 text-white'
        : done
        ? 'bg-green-500 text-white'
        : 'bg-btnSimple text-btnText'
    )}
  >
    {warn ? '!' : done ? '✓' : step}
  </div>
);

const PrimaryButton: FC<{
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}> = ({ onClick, disabled, className, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={clsx(
      'h-[40px] px-[18px] rounded-[8px] bg-btnPrimary text-white text-[14px] font-[600] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap',
      className
    )}
  >
    {children}
  </button>
);

const SimpleButton: FC<{
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}> = ({ onClick, disabled, className, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={clsx(
      'h-[40px] px-[18px] rounded-[8px] bg-btnSimple text-btnText text-[14px] font-[600] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap',
      className
    )}
  >
    {children}
  </button>
);

const Toggle: FC<{
  on: boolean;
  onChange: () => void;
  small?: boolean;
  disabled?: boolean;
  title?: string;
}> = ({ on, onChange, small, disabled, title }) => (
  <div
    onClick={disabled ? undefined : onChange}
    title={title}
    aria-disabled={disabled || undefined}
    className={clsx(
      'rounded-full relative transition-all border shrink-0',
      small ? 'w-[38px] h-[22px]' : 'w-[46px] h-[26px]',
      disabled
        ? 'opacity-50 cursor-not-allowed'
        : 'cursor-pointer',
      on ? 'bg-btnPrimary border-btnPrimary' : 'bg-btnSimple border-newTableBorder'
    )}
  >
    <div
      className={clsx(
        'rounded-full bg-white absolute transition-all shadow',
        small ? 'w-[16px] h-[16px] top-[2px]' : 'w-[19px] h-[19px] top-[3px]',
        on
          ? small
            ? 'start-[18px]'
            : 'start-[23px]'
          : small
          ? 'start-[2px]'
          : 'start-[3px]'
      )}
    />
  </div>
);

const fmtTime = (t: number) =>
  new Date(t).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

const isSupportedChannel = (identifier: string) =>
  BOT_SUPPORTED_PROVIDERS.has(identifier) ||
  BOT_SUPPORTED_PROVIDERS.has(String(identifier || '').split('-')[0]);

// ---- Component chính --------------------------------------------------------

export const ZaloComponent: FC = () => {
  const t = useT();
  const toast = useToaster();
  const hubFetch = useFetch();

  const [online, setOnline] = useState<boolean | null>(null);
  const [claude, setClaude] = useState({ hasKey: false, masked: '' });
  // null = chưa kiểm tra; false = key ĐÃ LƯU nhưng Anthropic từ chối (sai/hết hạn)
  const [claudeKeyOk, setClaudeKeyOk] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<BridgeConfig>({
    enabled: false,
    apiUrl: 'http://localhost:3000',
    hasKey: false,
    masked: '',
    integrationId: '',
  });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [channels, setChannels] = useState<
    { id: string; name: string; identifier: string }[]
  >([]);
  const [groups, setGroups] = useState<{ threadId: string; name: string }[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [logs, setLogs] = useState<{ t: number; line: string }[]>([]);
  const [live, setLive] = useState<LiveThread[]>([]);
  const [pending, setPending] = useState<PendingDraft[]>([]);
  const [postizKey, setPostizKey] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrTick, setQrTick] = useState(0);
  const [qrBroken, setQrBroken] = useState(false);
  // Sửa caption bài trong hàng chờ của bot
  const [editId, setEditId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [draftBusy, setDraftBusy] = useState<string | null>(null);

  const zaloLogged = !!(overview?.zaloConnected ?? cfg.zaloConnected);
  // "Đang hoạt động" = bot chạy + đã đăng nhập Zalo + có API key Media Hub + đã
  // bật cầu nối. Kênh giờ chọn theo TỪNG nhóm (không còn kênh mặc định bắt buộc).
  const running = online === true && cfg.enabled && cfg.hasKey && zaloLogged;

  // Cầu nối cần đủ 4 điều kiện. Khi tắt, chỉ ra điều kiện đầu tiên chưa đạt để
  // hiện trong tooltip của pill "Bridge off" (không còn trạng thái đỏ vô nghĩa).
  const bridgeBlocker = useMemo(() => {
    if (running) return '';
    if (online !== true) return t('zalo_blocker_bot_offline', 'the bot is not running');
    if (!zaloLogged) return t('zalo_blocker_not_logged_in', 'Zalo is not logged in');
    if (!cfg.hasKey)
      return t('zalo_blocker_no_key', 'the Media Hub API key is not saved');
    if (!cfg.enabled)
      return t('zalo_blocker_toggle_off', 'the automatic bridge is turned off');
    return '';
  }, [running, online, zaloLogged, cfg.hasKey, cfg.enabled, t]);

  // URL bot cho các href/src trong JSX — set sau mount để SSR/client render
  // giống nhau (tránh hydration mismatch), rồi tự đổi theo hostname trang.
  const [botUrl, setBotUrl] = useState('/botapi');
  const [isServerHost, setIsServerHost] = useState(false);
  useEffect(() => {
    setBotUrl(getBotUrl());
    const h = window.location.hostname;
    setIsServerHost(h === 'localhost' || h === '127.0.0.1');
  }, []);

  // ---- nạp dữ liệu định kỳ --------------------------------------------------
  const loadAll = useCallback(async () => {
    try {
      const s = await bot('/api/postiz/status');
      setOnline(true);
      setCfg(s);
      const [c, o, l, lv, pd] = await Promise.all([
        bot('/api/claude/status').catch(() => null),
        bot('/api/postiz/overview').catch(() => null),
        bot('/api/postiz/logs').catch(() => null),
        bot('/api/postiz/live').catch(() => null),
        bot('/api/postiz/pending').catch(() => null),
      ]);
      if (c) setClaude(c);
      if (o) {
        setOverview(o);
        // QR đã sẵn sàng trên đĩa → cho <img> mount lại (tự hồi phục sau 404).
        if (o.hasQr) setQrBroken(false);
      }
      if (Array.isArray(l)) setLogs(l);
      if (lv && Array.isArray(lv.threads)) setLive(lv.threads);
      if (Array.isArray(pd)) setPending(pd);
      setQrTick((t) => t + 1);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const i = setInterval(loadAll, 8000);
    return () => clearInterval(i);
  }, []);

  // Danh sách nhóm Zalo — nạp khi đã đăng nhập Zalo. LẦN ĐẦU chậm: bot phải lấy
  // tên từng nhóm qua zca-js (có thể >8s nếu nhiều nhóm) → timeout dài 60s, nếu
  // không request bị hủy giữa chừng và trang tưởng "không có nhóm nào".
  const loadGroups = useCallback(async (force?: boolean) => {
    setGroupsLoading(true);
    try {
      // force=true (nút Refresh): bỏ qua cache của bot, lấy danh sách MỚI theo
      // tài khoản Zalo đang đăng nhập — cần thiết sau khi đổi nick.
      const g = await bot(
        `/api/postiz/groups${force ? '?force=1' : ''}`,
        undefined,
        60000
      );
      if (Array.isArray(g)) {
        setGroups(g);
      }
    } catch {
      /* Zalo chưa kết nối hoặc tải quá lâu — giữ danh sách cũ */
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (zaloLogged) {
      loadGroups();
    }
  }, [zaloLogged]);

  // Tự tải danh sách kênh khi đã có API key (cho dropdown kênh mặc định +
  // dropdown kênh riêng từng nhóm) — không cần bấm "Tải kênh" thủ công.
  const channelsLoaded = useRef(false);
  useEffect(() => {
    if (online === true && cfg.hasKey && !channelsLoaded.current) {
      channelsLoaded.current = true;
      bot('/api/postiz/integrations')
        .then((r) => {
          if (r?.ok) setChannels(r.integrations || []);
        })
        .catch(() => {
          channelsLoaded.current = false; // thử lại lượt poll sau
        });
    }
  }, [online, cfg.hasKey]);

  // Claude dùng CHUNG key của Media Hub (đã cấu hình ở Settings) — người dùng
  // không phải quản lý key riêng cho bot nữa. Tự đồng bộ NGẦM một lần khi vào
  // trang: nếu Hub có key mà bot chưa có / key cũ bị từ chối → đẩy key sang bot.
  const keySynced = useRef(false);
  useEffect(() => {
    if (online !== true || keySynced.current) return;
    // Bot đã có key hợp lệ (chưa test-fail) → không cần đụng.
    if (claude.hasKey && claudeKeyOk !== false) return;
    keySynced.current = true;
    (async () => {
      try {
        const hub = await (await hubFetch('/copilot/anthropic-key')).json();
        if (!hub?.hasKey) {
          keySynced.current = false; // Hub chưa có key — để lượt sau thử lại
          return;
        }
        const res = await hubFetch('/copilot/anthropic-key/sync-zalo-bot', {
          method: 'POST',
        });
        const r = await res.json().catch(() => ({}));
        if (res.ok && r.ok) {
          setClaudeKeyOk(true);
          loadAll();
        }
      } catch {
        keySynced.current = false;
      }
    })();
  }, [online, claude.hasKey, claudeKeyOk]);

  // Đảm bảo tag "Zalo" tồn tại trong Media Hub — để bài bot đẩy vào được gắn
  // tag (calendar nhận diện & hiện "Chờ duyệt" viền vàng). Best-effort.
  const ensureZaloTag = useCallback(async () => {
    try {
      const { tags } = await (await hubFetch('/posts/tags')).json();
      const exists = (tags || []).some(
        (t: any) => String(t?.name || '').toLowerCase() === 'zalo'
      );
      if (!exists) {
        await hubFetch('/posts/tags', {
          method: 'POST',
          body: JSON.stringify({ name: 'Zalo', color: '#0068FF' }),
        });
      }
    } catch {
      /* không chặn luồng chính */
    }
  }, []);

  // Cầu nối đã bật (kể cả bật từ dashboard bot, không qua nút Lưu ở đây) →
  // vẫn phải đảm bảo tag "Zalo" tồn tại, nếu không bài đẩy vào mất nhận diện.
  const tagEnsured = useRef(false);
  useEffect(() => {
    if (cfg.enabled && !tagEnsured.current) {
      tagEnsured.current = true;
      ensureZaloTag();
    }
  }, [cfg.enabled, ensureZaloTag]);

  // Lưu API key Media Hub + bật/tắt cầu nối. Kênh KHÔNG lưu ở đây nữa —
  // mỗi nhóm tự chọn kênh riêng ở danh sách bên dưới.
  const save = useCallback(
    async (enabled?: boolean) => {
      try {
        const body: any = {
          apiUrl: cfg.apiUrl || 'http://localhost:3000',
          enabled: enabled === undefined ? cfg.enabled : enabled,
        };
        if (postizKey.trim()) body.key = postizKey.trim();
        const r = await bot('/api/postiz/config', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (r.ok) {
          if (body.enabled) {
            ensureZaloTag();
          }
          // Có key mới → tải luôn danh sách kênh cho dropdown từng nhóm.
          if (postizKey.trim()) {
            channelsLoaded.current = false;
            bot('/api/postiz/integrations')
              .then((res) => res?.ok && setChannels(res.integrations || []))
              .catch(() => {});
          }
          toast.show(
            t('zalo_bridge_config_saved', 'Zalo → Media Hub bridge settings saved'),
            'success'
          );
          setPostizKey('');
          loadAll();
        } else
          toast.show(r.error || t('zalo_save_error', 'Save failed'), 'warning');
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      }
    },
    [cfg, postizKey, ensureZaloTag]
  );

  // ---- hành động: nhóm / tài khoản / bot -------------------------------------
  const toggleGroup = useCallback(
    async (threadId: string, name: string, enabled: boolean) => {
      try {
        const r = await bot('/api/postiz/routes', {
          method: 'POST',
          body: JSON.stringify({ threadId, name, enabled }),
        });
        if (r.ok) {
          toast.show(
            enabled
              ? t('zalo_listening_group', 'Now listening to group "{{name}}"').replace(
                  '{{name}}',
                  name
                )
              : t('zalo_stopped_listening_group', 'Stopped listening to group "{{name}}"').replace(
                  '{{name}}',
                  name
                ),
            'success'
          );
          loadAll();
        } else toast.show(r.error || t('zalo_error', 'Error'), 'warning');
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      }
    },
    []
  );

  // Chọn kênh Media Hub RIÊNG cho 1 nhóm ('' = quay về kênh mặc định).
  const setGroupChannel = useCallback(
    async (threadId: string, name: string, integrationId: string) => {
      try {
        const r = await bot('/api/postiz/routes', {
          method: 'POST',
          body: JSON.stringify({ threadId, name, integrationId }),
        });
        if (r.ok) {
          toast.show(
            integrationId
              ? t(
                  'zalo_group_uses_own_channel',
                  'Group "{{name}}" will publish to the selected channel'
                ).replace('{{name}}', name)
              : t('zalo_group_uses_default_channel', 'Group "{{name}}" uses the default channel').replace(
                  '{{name}}',
                  name
                ),
            'success'
          );
          loadAll();
        } else toast.show(r.error || t('zalo_error', 'Error'), 'warning');
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      }
    },
    []
  );

  const closeSession = useCallback(async (threadId: string, name: string) => {
    try {
      const r = await bot('/api/postiz/live/close', {
        method: 'POST',
        body: JSON.stringify({ threadId }),
      });
      if (r.ok)
        toast.show(
          t('zalo_closing_session', 'Closing the collection session for "{{name}}" — processing now').replace(
            '{{name}}',
            name
          ),
          'success'
        );
      else toast.show(r.error || t('zalo_error', 'Error'), 'warning');
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
  }, []);

  const reconnectZalo = useCallback(async () => {
    try {
      await bot('/api/postiz/zalo/reconnect', { method: 'POST', body: '{}' });
      toast.show(
        t('zalo_generating_qr', 'Generating a new QR code — please wait a few seconds…'),
        'success'
      );
      setQrBroken(false);
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
  }, []);

  const logoutZalo = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'zalo_logout_confirm',
          'Log out of the current Zalo account? The bot will show a new QR code to scan another account.'
        ),
        t('zalo_logout', 'Log out')
      ))
    )
      return;
    try {
      const r = await bot('/api/postiz/zalo/logout', { method: 'POST', body: '{}' });
      if (r.ok)
        toast.show(
          t('zalo_logged_out', 'Logged out — scan the new QR code above to log in again'),
          'success'
        );
      else toast.show(r.error || t('zalo_error', 'Error'), 'warning');
      loadAll();
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
  }, []);

  const togglePause = useCallback(async () => {
    try {
      const next = !(overview?.paused);
      await bot('/api/postiz/settings', {
        method: 'POST',
        body: JSON.stringify({ paused: next }),
      });
      toast.show(
        next
          ? t('zalo_bot_paused_toast', 'Bot PAUSED (no new images will be collected)')
          : t('zalo_bot_resumed_toast', 'Bot is running again'),
        'success'
      );
      loadAll();
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
  }, [overview?.paused]);

  // ---- hành động: hàng chờ của bot -------------------------------------------
  // Đẩy media sang Hub / đăng FB có thể mất cả phút → timeout dài (120s).
  const draftAction = useCallback(
    async (
      id: string,
      path: string,
      body: any,
      okMsg: string,
      confirmMsg?: string
    ): Promise<boolean> => {
      if (confirmMsg && !(await deleteDialog(confirmMsg, t('zalo_agree', 'Confirm'))))
        return false;
      setDraftBusy(id);
      try {
        const r = await bot(
          `/api/postiz/pending/${id}/${path}`,
          { method: 'POST', body: JSON.stringify(body || {}) },
          120000
        );
        if (r?.error) {
          toast.show(r.error, 'warning');
          return false;
        }
        toast.show(okMsg, 'success');
        loadAll();
        return true;
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
        return false;
      } finally {
        setDraftBusy(null);
      }
    },
    []
  );

  const rewriteDraft = useCallback(
    async (id: string) => {
      setDraftBusy(id);
      try {
        const r = await bot(
          `/api/postiz/pending/${id}/rewrite`,
          {
            method: 'POST',
            body: JSON.stringify({ caption: editId === id ? editCaption : undefined }),
          },
          120000
        );
        if (r?.ok && r.caption) {
          setEditId(id);
          setEditCaption(r.caption);
          toast.show(
            t('zalo_ai_rewrote', 'AI rewrote it — review and click "Save caption" if you like it'),
            'success'
          );
        } else
          toast.show(
            r?.error || t('zalo_ai_rewrite_failed', 'AI could not rewrite it'),
            'warning'
          );
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      }
      setDraftBusy(null);
    },
    [editId, editCaption]
  );

  // ---- dữ liệu dẫn xuất -------------------------------------------------------
  const routes = overview?.routes || [];
  const routeIds = useMemo(
    () => new Set(routes.map((r) => String(r.threadId))),
    [routes]
  );
  const liveByThread = useMemo(() => {
    const m = new Map<string, LiveThread>();
    live.forEach((t) => m.set(String(t.threadId), t));
    return m;
  }, [live]);
  const unlistenedGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          !routeIds.has(String(g.threadId)) &&
          (!groupSearch.trim() ||
            g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()))
      ),
    [groups, routeIds, groupSearch]
  );
  const listeningCount = routes.filter((r) => r.enabled).length;
  // Nhóm đang nghe mà CHƯA gán kênh → ảnh sẽ không đẩy đi được, cần cảnh báo.
  const unroutedListening = routes.filter(
    (r) => r.enabled && !r.postizIntegrationId
  ).length;

  const liveLabel = (lt?: LiveThread) => {
    if (!lt || lt.phase === 'idle') return t('zalo_waiting_images', 'Waiting for new images');
    if (lt.phase === 'prelisten' || lt.phase === 'listening')
      return t('zalo_collecting', 'Collecting: {{img}} images, {{vid}} videos')
        .replace('{{img}}', String(lt.counts?.image || 0))
        .replace('{{vid}}', String(lt.counts?.video || 0));
    if (lt.phase === 'processing')
      return lt.proc?.stage || t('zalo_processing', 'Processing…');
    if (lt.phase === 'done')
      return t('zalo_draft_created', 'Draft created — see the queue below');
    return t('zalo_waiting_images', 'Waiting for new images');
  };

  // ============================ RENDER =========================================

  // Bot chưa chạy — một panel duy nhất, hướng dẫn khởi động.
  if (online === false) {
    return (
      <div className="bg-newBgColorInner flex-1 flex flex-col p-[20px] items-center justify-center gap-[14px]">
        <div className="text-[44px]">🤖</div>
        <div className="text-[20px] font-[600]">
          {t('zalo_bot_not_running', 'The Zalo bot is not running')}
        </div>
        <div className="text-[14px] text-textItemBlur max-w-[480px] text-center leading-[1.6]">
          {t(
            'zalo_bot_not_running_hint_1',
            'The bot listens for images from Zalo groups — normally it starts together with'
          )}{' '}
          <b>start-postiz.bat</b>.{' '}
          {t('zalo_bot_not_running_hint_2', 'Check the log window (the')}{' '}
          <b>[zalo]</b>{' '}
          {t('zalo_bot_not_running_hint_3', 'section) or open')}{' '}
          <b>D:\Zalo bot group\start.bat</b>{' '}
          {t('zalo_bot_not_running_hint_4', 'manually, then try again.')}
        </div>
        <PrimaryButton onClick={loadAll}>{t('zalo_retry', 'Retry')}</PrimaryButton>
      </div>
    );
  }

  return (
    <>
      {/* ===================== PANEL CHÍNH ===================== */}
      <div className="bg-newBgColorInner flex-1 flex flex-col p-[20px] gap-[16px] min-w-0">
        {/* --- Phụ đề trang: giải thích ngắn gọn Zalo dùng để làm gì --- */}
        <div className="text-[13px] text-textItemBlur leading-[1.5] -mb-[4px] max-w-[640px]">
          {t(
            'zalo_page_subtitle',
            'Turn images posted in your Zalo groups into draft posts awaiting review on the Calendar.'
          )}
        </div>
        {/* --- Thanh trạng thái --- */}
        <div className="flex items-center gap-[8px] flex-wrap">
          <Pill
            ok={online}
            onLabel={t('zalo_bot_running', 'Bot running')}
            offLabel={t('zalo_bot_not_running_pill', 'Bot not running')}
          />
          <Pill
            ok={online === null ? null : zaloLogged}
            onLabel={t('zalo_logged_in', 'Zalo logged in')}
            offLabel={t('zalo_not_logged_in', 'Zalo not logged in')}
          />
          <Pill
            ok={online === null ? null : running}
            onLabel={t('zalo_bridge_active', 'Bridge active')}
            offLabel={t('zalo_bridge_off', 'Bridge off')}
            title={
              !running && bridgeBlocker
                ? t('zalo_bridge_off_because', 'Off because: {{reason}}').replace(
                    '{{reason}}',
                    bridgeBlocker
                  )
                : undefined
            }
          />
          {overview?.paused && (
            <Pill
              ok={false}
              onLabel=""
              offLabel={t('zalo_bot_paused_pill', 'Bot is PAUSED')}
            />
          )}
          <div className="flex-1" />
          {running && (
            <a href="/launches">
              <SimpleButton className="!h-[32px] text-[13px]">
                {t('zalo_open_calendar_review', 'Open Calendar to review posts')}
              </SimpleButton>
            </a>
          )}
        </div>

        {/* Luồng tinh gọn — thay khối "Luồng hoạt động" dài dòng */}
        <div className="flex items-center gap-[8px] text-[12.5px] text-textItemBlur flex-wrap -mt-[6px]">
          <span>{t('zalo_flow_group', 'Zalo group')}</span>
          <span className="text-btnPrimary">→</span>
          <span>{t('zalo_flow_ai_caption', 'AI writes caption')}</span>
          <span className="text-btnPrimary">→</span>
          <span>{t('zalo_flow_review_calendar', 'Awaiting review on Calendar')}</span>
        </div>

        {/* --- QR đăng nhập Zalo (khi chưa đăng nhập) --- */}
        {online === true && !zaloLogged && (
          <div className="border border-amber-400/40 bg-amber-400/10 rounded-[12px] p-[20px] flex gap-[20px] items-center flex-wrap">
            <div className="w-[168px] h-[168px] rounded-[10px] bg-white flex items-center justify-center overflow-hidden shrink-0">
              {!qrBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={qrTick}
                  src={`${botUrl}/api/postiz/qr?t=${qrTick}`}
                  alt={t('zalo_qr_alt', 'Zalo login QR code')}
                  className="w-full h-full object-contain"
                  onError={() => setQrBroken(true)}
                />
              ) : (
                <div className="text-[12px] text-black/60 text-center px-[10px]">
                  {t('zalo_no_qr', 'No QR code yet — click "Generate new QR"')}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-[240px] flex flex-col gap-[10px]">
              <div className="text-[17px] font-[600]">
                {t('zalo_scan_qr_title', 'Scan the QR code to log in to Zalo')}
              </div>
              <div className="text-[13px] text-textItemBlur leading-[1.6]">
                {t(
                  'zalo_scan_qr_hint',
                  'Open Zalo on your phone → the QR icon → scan the code beside it.'
                )}
              </div>
              <div>
                <SimpleButton onClick={reconnectZalo}>
                  {t('zalo_generate_qr', 'Generate new QR')}
                </SimpleButton>
              </div>
            </div>
          </div>
        )}

        {/* --- Kết nối Media Hub: CHỈ hiện khi CHƯA có API key. Đã kết nối rồi
               thì ẩn hẳn (key nằm ở Settings, không cần nhắc lại). --- */}
        {!cfg.hasKey && (
          <Card>
            <div className="flex items-center gap-[12px]">
              <StepBadge step="1" />
              <div className="flex-1">
                <div className="text-[15px] font-[600]">
                  {t('zalo_connect_media_hub', 'Connect to Media Hub')}
                </div>
                <div className="text-[12.5px] text-textItemBlur mt-[2px]">
                  {t('zalo_connect_hint_1', 'Paste the Media Hub API key (')}
                  <b>
                    {t('zalo_connect_hint_path', 'Settings → Public API → create key')}
                  </b>
                  {t(
                    'zalo_connect_hint_2',
                    '). The publishing channel is chosen per group below.'
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-[8px] flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <Input
                  value={postizKey}
                  disableForm={true}
                  removeError={true}
                  type="password"
                  onChange={(e: any) => setPostizKey(e.target.value)}
                  name="postizKey"
                  label=""
                  placeholder={t('zalo_key_placeholder', 'paste Media Hub API key…')}
                />
              </div>
              <PrimaryButton
                onClick={() => save()}
                disabled={busy || !postizKey.trim()}
              >
                {t('zalo_save_key', 'Save key')}
              </PrimaryButton>
            </div>
          </Card>
        )}

        {/* --- Bật cầu nối --- */}
        <Card>
          <div className="flex items-center gap-[14px] flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="text-[15px] font-[600]">
                {t('zalo_auto_bridge', 'Automatic bridge')}
              </div>
              <div className="text-[12.5px] text-textItemBlur mt-[2px]">
                {t(
                  'zalo_auto_bridge_hint',
                  'New images from listened groups → posts awaiting review on Calendar.'
                )}
              </div>
            </div>
            <div className="flex items-center gap-[10px]">
              <div
                className={clsx(
                  'text-[13.5px] font-[600]',
                  cfg.enabled ? 'text-green-500' : 'text-textItemBlur'
                )}
              >
                {cfg.enabled
                  ? t('zalo_on', 'On')
                  : t('zalo_off', 'Off')}
              </div>
              <Toggle
                on={cfg.enabled}
                disabled={!cfg.hasKey}
                title={
                  !cfg.hasKey
                    ? t('zalo_connect_hub_first', 'Connect Media Hub first')
                    : undefined
                }
                onChange={() => save(!cfg.enabled)}
              />
            </div>
          </div>
        </Card>

        {/* --- Nhóm Zalo + trạng thái gom ảnh realtime --- */}
        <Card
          title={
            <div className="flex items-center w-full gap-[10px]">
              <span className="flex-1">
                {t('zalo_listening_groups', 'Zalo groups being listened to')} (
                {listeningCount}/{routes.length})
              </span>
              {zaloLogged && (
                <span
                  onClick={() => loadGroups(true)}
                  className="cursor-pointer normal-case tracking-normal font-[600] text-btnPrimary"
                >
                  ↻ {t('zalo_refresh', 'Refresh')}
                </span>
              )}
            </div>
          }
        >
          {!routes.length && !groups.length && (
            <div className="text-[13px] text-textItemBlur leading-[1.6]">
              {!zaloLogged
                ? t(
                    'zalo_login_first',
                    'Log in to Zalo (scan the QR above), then come back here to choose groups to listen to.'
                  )
                : groupsLoading
                ? t(
                    'zalo_groups_loading',
                    'Loading the Zalo group list — the first time can take 10–30 seconds…'
                  )
                : t(
                    'zalo_no_groups_yet',
                    'No groups found yet. Send any message into a Zalo group so the bot can see it, then click "Refresh".'
                  )}
            </div>
          )}

          {!!unroutedListening && (
            <div className="text-[12.5px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-[8px] px-[12px] py-[8px] leading-[1.5]">
              ⚠ {t('zalo_unrouted_warn_1', 'There are')} <b>{unroutedListening}</b>{' '}
              {t(
                'zalo_unrouted_warn_2',
                'listened groups without a publishing channel selected — their images will not be pushed anywhere. Pick a channel in the box on the right of each group.'
              )}
            </div>
          )}

          {!!routes.length && (
            <div className="flex flex-col">
              {routes.map((r) => {
                const lt = liveByThread.get(String(r.threadId));
                const gathering =
                  lt && (lt.phase === 'listening' || lt.phase === 'prelisten') &&
                  ((lt.counts?.image || 0) + (lt.counts?.video || 0) > 0);
                return (
                  <div
                    key={r.threadId}
                    className="flex items-center gap-[12px] py-[9px] border-b border-newTableBorder last:border-b-0 hover:bg-boxHover px-[8px] -mx-[8px] rounded-[6px] flex-wrap"
                  >
                    <div className="w-[34px] h-[34px] rounded-[8px] bg-btnSimple flex items-center justify-center text-[15px] shrink-0">
                      💬
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-[600] truncate">
                        {r.label || r.threadId}
                      </div>
                      <div
                        className={clsx(
                          'text-[11.5px]',
                          gathering || lt?.phase === 'processing'
                            ? 'text-btnPrimary font-[600]'
                            : 'text-textItemBlur'
                        )}
                      >
                        {r.enabled
                          ? liveLabel(lt)
                          : t('zalo_listening_off', 'Listening off')}
                      </div>
                    </div>
                    {gathering && (
                      <span
                        onClick={() => closeSession(r.threadId, r.label || r.threadId)}
                        className="cursor-pointer text-[12.5px] font-[600] text-btnPrimary whitespace-nowrap"
                      >
                        {t('zalo_close_now', 'Close now →')}
                      </span>
                    )}
                    {!!channels.length && (
                      <select
                        value={r.postizIntegrationId || ''}
                        onChange={(e) =>
                          setGroupChannel(
                            r.threadId,
                            r.label || r.threadId,
                            e.target.value
                          )
                        }
                        title={t(
                          'zalo_channel_select_title',
                          "The Media Hub channel that receives this group's posts"
                        )}
                        className={clsx(
                          'border rounded-[6px] h-[30px] mobile:h-[36px] px-[6px] text-[12px] outline-none cursor-pointer max-w-[180px] shrink-0 mobile:max-w-none mobile:w-full mobile:order-last',
                          r.enabled && !r.postizIntegrationId
                            ? 'bg-amber-400/10 border-amber-400/50 text-amber-400'
                            : 'bg-newBgColorInner border-newTableBorder'
                        )}
                      >
                        <option value="">
                          {r.enabled
                            ? t('zalo_pick_channel', '⚠ Pick a channel…')
                            : t('zalo_no_channel_selected', '— No channel selected —')}
                        </option>
                        {channels
                          .filter((ch) => isSupportedChannel(ch.identifier))
                          .map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              → {ch.name || ch.id}
                            </option>
                          ))}
                      </select>
                    )}
                    <Toggle
                      small
                      on={r.enabled}
                      onChange={() =>
                        toggleGroup(r.threadId, r.label || r.threadId, !r.enabled)
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}

          {zaloLogged && !!groups.length && (
            <div className="flex flex-col gap-[8px]">
              <div className="text-[12.5px] font-[600] text-textItemBlur">
                {t('zalo_add_group_to_listen', 'Add a group to listen to:')}
              </div>
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder={t('zalo_search_group', 'Search groups…')}
                className="bg-newBgColorInner border-newTableBorder border rounded-[8px] h-[38px] px-[12px] text-[13px] outline-none"
              />
              <div className="max-h-[220px] overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner flex flex-col">
                {unlistenedGroups.map((g) => (
                  <div
                    key={g.threadId}
                    className="flex items-center gap-[12px] py-[8px] border-b border-newTableBorder last:border-b-0 px-[8px] -mx-[8px] hover:bg-boxHover rounded-[6px]"
                  >
                    <div className="flex-1 min-w-0 text-[13.5px] truncate">
                      {g.name}
                    </div>
                    <span
                      onClick={() => toggleGroup(g.threadId, g.name, true)}
                      className="cursor-pointer text-[13px] font-[600] text-btnPrimary whitespace-nowrap"
                    >
                      + {t('zalo_listen_this_group', 'Listen to this group')}
                    </span>
                  </div>
                ))}
                {!unlistenedGroups.length && (
                  <div className="text-[12.5px] text-textItemBlur py-[6px]">
                    {t('zalo_no_matching_groups', 'No more groups match your search.')}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* --- Hàng chờ của bot (duyệt đăng thẳng FB / đẩy sang Hub) --- */}
        {!!pending.length && (
          <Card
            title={`${t('zalo_bot_queue', 'Bot queue')} (${pending.length})`}
          >
            <div className="text-[12.5px] text-textItemBlur -mt-[6px]">
              {t(
                'zalo_bot_queue_hint',
                'Posts the bot has finished processing, awaiting your decision: push to Media Hub to review on Calendar, publish straight to Facebook, or discard.'
              )}
            </div>
            <div className="flex flex-col gap-[14px]">
              {pending.map((d) => (
                <div
                  key={d.id}
                  className="border border-newTableBorder rounded-[10px] p-[14px] flex flex-col gap-[10px]"
                >
                  <div className="flex items-center gap-[10px] flex-wrap">
                    <div className="text-[13.5px] font-[600] flex-1 min-w-[160px] truncate">
                      {d.routeLabel || d.id}
                    </div>
                    <div className="text-[11.5px] text-textItemBlur">
                      {fmtTime(d.createdAt)} · {d.imageCount}{' '}
                      {t('zalo_images_unit', 'images')}
                      {d.videoCount
                        ? ` · ${d.videoCount} ${t('zalo_videos_unit', 'videos')}`
                        : ''}
                    </div>
                  </div>

                  {!!d.imageCount && (
                    <div className="flex gap-[8px] overflow-x-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner pb-[4px]">
                      {Array.from({ length: Math.min(d.imageCount, 8) }).map((_, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={`${botUrl}/api/postiz/draft-image/${encodeURIComponent(d.id)}/${i}`}
                          alt={
                            d.imageCaptions?.[i] ||
                            t('zalo_image_alt', 'Image {{n}}').replace(
                              '{{n}}',
                              String(i + 1)
                            )
                          }
                          title={d.imageCaptions?.[i] || ''}
                          className="h-[74px] w-[74px] object-cover rounded-[8px] border border-newTableBorder shrink-0"
                          loading="lazy"
                        />
                      ))}
                      {d.imageCount > 8 && (
                        <div className="h-[74px] w-[74px] rounded-[8px] bg-btnSimple flex items-center justify-center text-[12px] font-[600] shrink-0">
                          +{d.imageCount - 8}
                        </div>
                      )}
                    </div>
                  )}

                  {editId === d.id ? (
                    <div className="flex flex-col gap-[8px]">
                      <textarea
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        rows={6}
                        className="bg-newBgColorInner border-newTableBorder border rounded-[8px] p-[12px] text-[13.5px] leading-[1.6] outline-none resize-y"
                      />
                      <div className="flex gap-[8px] flex-wrap">
                        <PrimaryButton
                          className="!h-[34px] text-[13px]"
                          disabled={draftBusy === d.id}
                          onClick={async () => {
                            const ok = await draftAction(
                              d.id,
                              'save',
                              { caption: editCaption },
                              t('zalo_caption_saved', 'Caption saved')
                            );
                            if (ok) setEditId(null);
                          }}
                        >
                          {t('zalo_save_caption', 'Save caption')}
                        </PrimaryButton>
                        <SimpleButton
                          className="!h-[34px] text-[13px]"
                          disabled={draftBusy === d.id}
                          onClick={() => rewriteDraft(d.id)}
                        >
                          ✨ {t('zalo_ai_rewrite', 'AI rewrite')}
                        </SimpleButton>
                        <SimpleButton
                          className="!h-[34px] text-[13px]"
                          onClick={() => setEditId(null)}
                        >
                          {t('zalo_close', 'Close')}
                        </SimpleButton>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setEditId(d.id);
                        setEditCaption(d.caption || '');
                      }}
                      className="text-[13px] leading-[1.6] whitespace-pre-wrap line-clamp-4 cursor-text hover:bg-boxHover rounded-[6px] p-[8px] -m-[8px]"
                      title={t('zalo_click_to_edit_caption', 'Click to edit the caption')}
                    >
                      {d.caption || (
                        <span className="text-textItemBlur">
                          {t('zalo_no_caption_yet', '(no caption yet — click to write)')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex gap-[8px] flex-wrap items-center">
                    {d.pushedToHub ? (
                      <div className="flex items-center gap-[6px] text-[13px] text-green-500 font-[600] h-[34px]">
                        ✓ {t('zalo_in_media_hub', 'In Media Hub — review on Calendar')}
                      </div>
                    ) : (
                      <PrimaryButton
                        className="!h-[34px] text-[13px]"
                        disabled={draftBusy === d.id || !cfg.enabled}
                        onClick={() =>
                          draftAction(
                            d.id,
                            'push-hub',
                            {},
                            t(
                              'zalo_pushed_to_hub',
                              'Pushed to Media Hub — open Calendar to review & schedule'
                            )
                          )
                        }
                      >
                        📥 {t('zalo_push_to_hub', 'Push to Media Hub')}
                      </PrimaryButton>
                    )}
                    {d.hasFbToken && (
                      <SimpleButton
                        className="!h-[34px] text-[13px]"
                        disabled={draftBusy === d.id}
                        onClick={() =>
                          draftAction(
                            d.id,
                            'approve',
                            { published: true },
                            t('zalo_fb_published', 'Published publicly to Facebook'),
                            t(
                              'zalo_fb_publish_confirm',
                              'Publish this post PUBLICLY to Facebook now?'
                            )
                          )
                        }
                      >
                        {t('zalo_publish_facebook', 'Publish to Facebook now')}
                      </SimpleButton>
                    )}
                    <div className="flex-1" />
                    <span
                      onClick={() =>
                        draftAction(
                          d.id,
                          'reject',
                          {},
                          t('zalo_removed_from_queue', 'Removed the post from the queue'),
                          t(
                            'zalo_reject_confirm',
                            'Discard this post? Its images will be deleted from the bot.'
                          )
                        )
                      }
                      className="cursor-pointer text-[13px] font-[600] text-red-500"
                    >
                      {t('zalo_reject', 'Reject')}
                    </span>
                  </div>
                  {!cfg.enabled && (
                    <div className="text-[11.5px] text-textItemBlur -mt-[4px]">
                      {t(
                        'zalo_enable_bridge_hint',
                        'Turn on the bridge above to push to Media Hub.'
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* --- Điều khiển phụ: tinh gọn ở cuối (ít dùng) --- */}
        <div className="flex items-center gap-[16px] flex-wrap pt-[4px] text-[13px] text-textItemBlur">
          <div
            onClick={togglePause}
            className="flex items-center gap-[8px] cursor-pointer select-none"
          >
            <Toggle small on={!!overview?.paused} onChange={togglePause} />
            <span className={overview?.paused ? 'text-red-500 font-[600]' : ''}>
              {overview?.paused
                ? t('zalo_paused', 'Paused')
                : t('zalo_pause_bot', 'Pause bot')}
            </span>
          </div>
          <div className="w-[1px] h-[16px] bg-newTableBorder" />
          <span
            onClick={logoutZalo}
            title={t(
              'zalo_logout_switch_title',
              'Fully logs out the current Zalo account, then shows a QR code to log in with another account.'
            )}
            className="cursor-pointer hover:text-newTextColor"
          >
            {t('zalo_logout_switch_account', 'Log out / switch account')}
          </span>
          {isServerHost && (
            <>
              <div className="w-[1px] h-[16px] bg-newTableBorder" />
              <a
                href="http://localhost:8088"
                target="_blank"
                rel="noreferrer"
                title={t(
                  'zalo_fb_gbp_tokens_title',
                  'Opens the bot dashboard in a new tab to manage Facebook / Google Business tokens.'
                )}
                className="hover:text-newTextColor inline-flex items-center gap-[4px]"
              >
                {t('zalo_fb_gbp_tokens', 'Facebook / Google Business tokens')}
                <span aria-hidden="true">↗</span>
              </a>
              <span className="text-textItemBlur/70 text-[11.5px]">
                {t('zalo_fb_gbp_tokens_caption', '(opens the bot dashboard in a new tab)')}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ZaloComponent;
