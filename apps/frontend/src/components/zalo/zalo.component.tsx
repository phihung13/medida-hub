'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  bot,
  BridgeConfig,
  Card,
  fmtTime,
  getBotUrl,
  isGathering,
  LinkButton,
  liveText,
  LiveThread,
  Overview,
  PrimaryButton,
  SimpleButton,
  StatusItem,
  StatusSummary,
  StepBadge,
  Toggle,
  WarningIcon,
  ZaloGap,
} from './zalo.shared';
import { ZaloPostsTab } from './zalo.posts';
import { ZaloRoutesTab } from './zalo.routes';
import { ZaloLogsTab, ZaloSettingsTab } from './zalo.settings';
import { ZaloRecoverCard } from './zalo.recover.card';

// ============================================================================
//  Trang Zalo — TRUNG TÂM ĐIỀU KHIỂN thay thế hoàn toàn dashboard bot :8088.
//  Bot CHỈ lo Zalo. 3 tab:
//   - Hôm nay: trạng thái + 2 công tắc, banner "mất phiên -> lấy lại ảnh",
//     checklist thiết lập / QR khi bị đăng xuất, nhóm đang gom ảnh, BÀI VIẾT.
//   - Nhóm Zalo: nơi DUY NHẤT cấu hình nhóm (kênh, nghe, thời gian gom).
//   - Cài đặt: tài khoản, lấy lại tin, Zalo Video, nhật ký.
//  Mọi API đi qua proxy /botapi (JWT + HUB_BOT_TOKEN).
//
//  Google Business ĐÃ RỜI trang này: trước phải lách bằng phiên Playwright trên
//  máy bot vì chưa xin được API; nay nối thẳng bằng GMB API chính thức nên nó
//  là một kênh bình thường — thêm ở Add Channel, đăng qua Lịch như kênh khác.
// ============================================================================

type TabKey = 'overview' | 'groups' | 'settings';

const TAB_HASH: Record<TabKey, string> = {
  overview: 'hom-nay',
  groups: 'nhom',
  settings: 'cai-dat',
};
// Link cũ (#tong-quan, #nhom-trang) vẫn mở đúng tab.
const LEGACY_HASH: Record<string, TabKey> = { 'tong-quan': 'overview', 'nhom-trang': 'groups' };

const GAP_DISMISS_KEY = 'zaloGapDismissed';

export const ZaloComponent: FC = () => {
  const t = useT();
  const toast = useToaster();
  const hubFetch = useFetch();

  const [tab, setTab] = useState<TabKey>('overview');
  const [online, setOnline] = useState<boolean | null>(null);
  const [claude, setClaude] = useState({ hasKey: false, masked: '' });
  const [claudeKeyOk, setClaudeKeyOk] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<BridgeConfig>({
    enabled: false,
    apiUrl: 'http://localhost:3000',
    hasKey: false,
    masked: '',
    integrationId: '',
  });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [live, setLive] = useState<LiveThread[]>([]);
  const [postizKey, setPostizKey] = useState('');
  const [qrTick, setQrTick] = useState(0);
  const [qrBroken, setQrBroken] = useState(false);
  // Banner "Bot mất phiên …": đã ẩn khoảng nào (lưu theo mốc bắt đầu) + đang
  // mở ô lấy lại cho khoảng nào.
  const [dismissedGaps, setDismissedGaps] = useState<number[]>([]);
  const [recoverGap, setRecoverGap] = useState<ZaloGap | null>(null);

  const zaloLogged = !!(overview?.zaloConnected ?? cfg.zaloConnected);
  const running = online === true && cfg.enabled && cfg.hasKey && zaloLogged;

  const bridgeBlocker = useMemo(() => {
    if (running) return '';
    if (online !== true) return t('zalo_blocker_bot_offline', 'the bot is not running');
    if (!zaloLogged) return t('zalo_blocker_not_logged_in', 'Zalo is not logged in');
    if (!cfg.hasKey) return t('zalo_blocker_no_key', 'the Media Hub API key is not saved');
    if (!cfg.enabled) return t('zalo_blocker_toggle_off', 'the automatic bridge is turned off');
    return '';
  }, [running, online, zaloLogged, cfg.hasKey, cfg.enabled, t]);

  const [botUrl, setBotUrl] = useState('/botapi');
  useEffect(() => {
    setBotUrl(getBotUrl());
    // Deep-link tab qua hash (#nhom, #cai-dat…), kể cả link cũ.
    const h = window.location.hash.replace(/^#/, '');
    const fromHash =
      ((Object.entries(TAB_HASH).find(([, v]) => v === h) || [])[0] as TabKey | undefined) ||
      LEGACY_HASH[h];
    if (fromHash) setTab(fromHash);
    try {
      setDismissedGaps(JSON.parse(localStorage.getItem(GAP_DISMISS_KEY) || '[]'));
    } catch {}
  }, []);

  const switchTab = useCallback((k: TabKey) => {
    setTab(k);
    try {
      window.history.replaceState(null, '', `#${TAB_HASH[k]}`);
    } catch {}
  }, []);

  // ---- nạp dữ liệu định kỳ (trạng thái + tổng quan) ---------------------------
  const loadAll = useCallback(async () => {
    try {
      const s = await bot('/api/postiz/status');
      setOnline(true);
      setCfg(s);
      const [c, o, lv] = await Promise.all([
        bot('/api/claude/status').catch(() => null),
        bot('/api/postiz/overview').catch(() => null),
        bot('/api/postiz/live').catch(() => null),
      ]);
      if (c) setClaude(c);
      if (o) {
        setOverview(o);
        if (o.hasQr) setQrBroken(false);
      }
      if (lv && Array.isArray(lv.threads)) setLive(lv.threads);
      setQrTick((v) => v + 1);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    // App nền (mobile hay để tab chạy ngầm) thì bỏ tick — đỡ hao pin/4G
    const i = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll();
    }, 8000);
    return () => clearInterval(i);
  }, []);

  // Claude dùng CHUNG key của Media Hub — tự đồng bộ ngầm sang bot khi cần.
  const keySynced = useRef(false);
  useEffect(() => {
    if (online !== true || keySynced.current) return;
    if (claude.hasKey && claudeKeyOk !== false) return;
    keySynced.current = true;
    (async () => {
      try {
        const hub = await (await hubFetch('/copilot/anthropic-key')).json();
        if (!hub?.hasKey) {
          keySynced.current = false;
          return;
        }
        const res = await hubFetch('/copilot/anthropic-key/sync-zalo-bot', { method: 'POST' });
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

  // Đảm bảo tag "Zalo" tồn tại trong Media Hub (calendar nhận diện bài bot).
  const ensureZaloTag = useCallback(async () => {
    try {
      const { tags } = await (await hubFetch('/posts/tags')).json();
      const exists = (tags || []).some(
        (x: any) => String(x?.name || '').toLowerCase() === 'zalo'
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

  const tagEnsured = useRef(false);
  useEffect(() => {
    if (cfg.enabled && !tagEnsured.current) {
      tagEnsured.current = true;
      ensureZaloTag();
    }
  }, [cfg.enabled, ensureZaloTag]);

  const save = useCallback(
    async (enabled?: boolean) => {
      try {
        const body: any = {
          apiUrl: cfg.apiUrl || 'http://localhost:3000',
          enabled: enabled === undefined ? cfg.enabled : enabled,
        };
        if (postizKey.trim()) body.key = postizKey.trim();
        const r = await bot('/api/postiz/config', { method: 'POST', body: JSON.stringify(body) });
        if (r.ok) {
          if (body.enabled) ensureZaloTag();
          toast.show(t('zalo_bridge_config_saved', 'Zalo → Media Hub bridge settings saved'), 'success');
          setPostizKey('');
          loadAll();
        } else toast.show(r.error || t('zalo_save_error', 'Save failed'), 'warning');
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      }
    },
    [cfg, postizKey, ensureZaloTag]
  );

  const closeSession = useCallback(async (threadId: string, name: string) => {
    try {
      const r = await bot('/api/postiz/live/close', {
        method: 'POST',
        body: JSON.stringify({ threadId }),
      });
      if (r.ok)
        toast.show(
          t('zalo_closing_session', 'Closing the collection session for "{{name}}" — processing now').replace('{{name}}', name),
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
      toast.show(t('zalo_generating_qr', 'Generating a new QR code — please wait a few seconds…'), 'success');
      setQrBroken(false);
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
  }, []);

  const togglePause = useCallback(async () => {
    try {
      const next = !overview?.paused;
      await bot('/api/postiz/settings', { method: 'POST', body: JSON.stringify({ paused: next }) });
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

  // ---- dữ liệu dẫn xuất ----------------------------------------------------------
  const routes = overview?.routes || [];
  const liveByThread = useMemo(() => {
    const m = new Map<string, LiveThread>();
    live.forEach((x) => m.set(String(x.threadId), x));
    return m;
  }, [live]);
  const unroutedListening = routes.filter((r) => r.enabled && !r.postizIntegrationId).length;
  // Nhóm đang gom ảnh / đang tạo bản nháp — hiện nổi trên Hôm nay.
  const activeGroups = routes
    .filter((r) => r.enabled)
    .map((r) => ({ r, lt: liveByThread.get(String(r.threadId)) }))
    .filter(({ lt }) => isGathering(lt) || lt?.phase === 'processing');

  // Khoảng mất phiên gần nhất (7 ngày) chưa ẩn -> banner lấy lại ảnh.
  const latestGap = useMemo(() => {
    const list = (overview?.gaps || []).filter(
      (g) => Date.now() - g.to < 7 * 24 * 3600 * 1000 && !dismissedGaps.includes(g.from)
    );
    return list.length ? list[list.length - 1] : null;
  }, [overview?.gaps, dismissedGaps]);

  const dismissGap = useCallback((g: ZaloGap) => {
    setDismissedGaps((cur) => {
      const next = [...cur, g.from].slice(-20);
      try {
        localStorage.setItem(GAP_DISMISS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setRecoverGap(null);
  }, []);

  const gapText = (g: ZaloGap) => {
    const sameDay = new Date(g.from).toDateString() === new Date(g.to).toDateString();
    const end = sameDay
      ? new Date(g.to).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : fmtTime(g.to);
    return `${fmtTime(g.from)} – ${end}`;
  };

  // Checklist thiết lập: đủ 3 bước thì ẩn hẳn.
  const stepZalo = zaloLogged;
  // Bước 2 chỉ cần đã có key: tắt "Tự tạo bản nháp" là chủ ý, dải trạng thái
  // đã báo — không bật lại cả checklist làm phiền.
  const stepHub = cfg.hasKey;
  const stepGroups = routes.some((r) => r.enabled && !!r.postizIntegrationId);
  const setupDone = stepZalo && stepHub && stepGroups;

  // ============================ RENDER =========================================

  if (online === false) {
    return (
      <div className="bg-newBgColorInner flex-1 flex flex-col p-[20px] items-center justify-center gap-[14px]">
        <div className="w-[64px] h-[64px] rounded-full bg-btnSimple flex items-center justify-center text-textItemBlur">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v8" />
            <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
          </svg>
        </div>
        <div className="text-[20px] font-[600]">
          {t('zalo_bot_not_running', 'The Zalo bot is not running')}
        </div>
        <div className="text-[14px] text-textItemBlur max-w-[480px] text-center leading-[1.6]">
          {t(
            'zalo_bot_offline_hint',
            'Bot nhận ảnh từ nhóm Zalo đang không phản hồi — có thể đang khởi động lại (vd vừa cập nhật). Đợi một chút rồi thử lại; nếu vẫn vậy, báo người quản trị máy chủ.'
          )}
        </div>
        <PrimaryButton onClick={loadAll}>{t('zalo_retry', 'Retry')}</PrimaryButton>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'overview', label: t('zalo_tab_today', 'Hôm nay') },
    // Badge = số nhóm đang nghe mà chưa chọn kênh (ảnh sẽ không đi đâu).
    { key: 'groups', label: t('zalo_tab_groups', 'Nhóm Zalo'), badge: unroutedListening || undefined },
    { key: 'settings', label: t('zalo_tab_settings', 'Settings') },
  ];

  // Trạng thái gộp — thứ tự = ưu tiên: lỗi đầu tiên được nêu trên nút.
  const statusItems: StatusItem[] = [
    {
      ok: online,
      onLabel: t('zalo_bot_running', 'Bot running'),
      offLabel: t('zalo_bot_not_running_pill', 'Bot not running'),
    },
    {
      ok: online === null ? null : zaloLogged,
      onLabel: t('zalo_logged_in', 'Zalo logged in'),
      offLabel: t('zalo_not_logged_in', 'Zalo not logged in'),
    },
    {
      ok: online === null ? null : running,
      onLabel: t('zalo_auto_drafts_on', 'Đang tự tạo bản nháp'),
      offLabel: t('zalo_auto_drafts_off', 'Chưa tự tạo bản nháp'),
      tone: 'warn',
      hint:
        !running && bridgeBlocker
          ? t('zalo_bridge_off_because', 'Off because: {{reason}}').replace('{{reason}}', bridgeBlocker)
          : undefined,
    },
  ];
  if (overview?.paused) {
    statusItems.push({
      ok: false,
      onLabel: '',
      offLabel: t('zalo_bot_paused_pill', 'Bot is PAUSED'),
      tone: 'warn',
    });
  }

  const [pendingPre = '', pendingPost = ''] = t('zalo_pending_count', '{{n}} bài chờ duyệt').split('{{n}}');

  // Ô QR đăng nhập — dùng cho bước 1 checklist và khi bị đăng xuất giữa chừng.
  const qrBlock = (
    <div className="flex gap-[16px] items-center flex-wrap">
      <div className="w-[160px] h-[160px] rounded-[10px] bg-white flex items-center justify-center overflow-hidden shrink-0">
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
      <div className="flex-1 min-w-[220px] flex flex-col gap-[10px]">
        <div className="text-[13px] text-textItemBlur leading-[1.6]">
          {t('zalo_scan_qr_hint', 'Open Zalo on your phone → the QR icon → scan the code beside it.')}
        </div>
        <div>
          <SimpleButton className="!h-[36px] mobile:!h-[44px] text-[13px]" onClick={reconnectZalo}>
            {t('zalo_generate_qr', 'Generate new QR')}
          </SimpleButton>
        </div>
      </div>
    </div>
  );

  const step = (n: string, done: boolean, title: string, body?: ReactNode) => (
    <li className="flex gap-[12px]">
      <StepBadge step={n} done={done} />
      <div className="flex-1 min-w-0 flex flex-col gap-[10px] pt-[3px]">
        <div className={clsx('text-[14px] font-[600]', done && 'text-textItemBlur')}>{title}</div>
        {!done && body}
      </div>
    </li>
  );

  return (
    <div className="bg-newBgColorInner flex-1 flex flex-col p-[20px] mobile:p-[12px] gap-[16px] min-w-0">
      {/* --- Dải trạng thái + 2 công tắc chính (trước nằm lẻ ở cuối Tổng quan
          và lặp lại trong Cài đặt) --- */}
      <div className="flex items-start gap-x-[16px] gap-y-[10px] flex-wrap">
        <StatusSummary items={statusItems} okLabel={t('zalo_status_all_ok', 'Hoạt động bình thường')} />
        <div className="flex items-center gap-x-[18px] gap-y-[4px] flex-wrap ms-auto text-[13px] mobile:ms-0">
          <label
            className={clsx(
              'flex items-center gap-[8px] select-none mobile:min-h-[44px]',
              cfg.hasKey ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
            )}
            title={
              cfg.hasKey
                ? t('zalo_auto_drafts_hint', 'Ảnh mới từ các nhóm đang nghe tự thành bản nháp chờ duyệt trên Lịch.')
                : t('zalo_connect_hub_first', 'Connect Media Hub first')
            }
          >
            <Toggle small on={cfg.enabled} disabled={!cfg.hasKey} onChange={() => cfg.hasKey && save(!cfg.enabled)} />
            <span className={cfg.enabled ? 'font-[600]' : 'text-textItemBlur'}>
              {t('zalo_auto_drafts', 'Tự tạo bản nháp')}
            </span>
          </label>
          <label className="flex items-center gap-[8px] cursor-pointer select-none mobile:min-h-[44px]">
            <Toggle small on={!!overview?.paused} onChange={togglePause} />
            <span className={overview?.paused ? 'text-red-500 font-[600]' : 'text-textItemBlur'}>
              {overview?.paused ? t('zalo_paused_now', 'Đang tạm dừng') : t('zalo_pause_bot', 'Pause bot')}
            </span>
          </label>
        </div>
      </div>

      {/* --- Thanh tab: desktop = gạch chân, mobile = pill 44px dính đỉnh --- */}
      <div
        role="tablist"
        className="flex gap-[4px] border-b border-newTableBorder overflow-x-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner -mx-[4px] px-[4px] mobile-hscroll mobile:sticky mobile:top-[env(safe-area-inset-top,0px)] mobile:z-[5] mobile:bg-newBgColorInner mobile:border-b-0 mobile:gap-[8px] mobile:-mx-[12px] mobile:px-[12px] mobile:py-[6px]"
      >
        {TABS.map(({ key, label, badge }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={clsx(
              'h-[38px] px-[14px] text-[13px] font-[600] whitespace-nowrap cursor-pointer border-b-2 -mb-[1px] flex items-center gap-[6px] outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary rounded-t-[6px] mobile:h-[44px] mobile:px-[16px] mobile:text-[14px] mobile:rounded-full mobile:border-b-0 mobile:mb-0 tap-shrink',
              tab === key
                ? 'border-btnPrimary text-newTextColor mobile:bg-btnPrimary mobile:text-white'
                : 'border-transparent text-textItemBlur hover:text-newTextColor mobile:bg-boxFocused'
            )}
          >
            {label}
            {!!badge && (
              <span
                aria-label={t('zalo_tab_badge_unrouted', '{{n}} nhóm chưa chọn kênh').replace('{{n}}', String(badge))}
                className="min-w-[18px] h-[18px] px-[5px] rounded-full bg-amber-400 text-black text-[11px] font-[700] inline-flex items-center justify-center"
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ============================ HÔM NAY ============================ */}
      {tab === 'overview' && (
        <>
          {/* Bot vừa mất phiên Zalo -> ảnh lúc đó chưa vào: lấy lại 1 chạm */}
          {latestGap && (
            <div className="flex flex-col gap-[12px]">
              <div className="flex items-center gap-[10px] flex-wrap rounded-[12px] border border-amber-400/40 bg-amber-400/10 px-[14px] py-[10px]">
                <WarningIcon size={15} className="text-amber-600 dark:text-amber-400" />
                <span className="flex-1 min-w-[200px] text-[13px] leading-[1.5]">
                  {t('zalo_gap_text', 'Bot mất phiên Zalo {{range}} — ảnh gửi vào nhóm lúc đó chưa vào bot.').replace(
                    '{{range}}',
                    gapText(latestGap)
                  )}
                </span>
                {recoverGap?.from !== latestGap.from && (
                  <PrimaryButton
                    className="!h-[34px] mobile:!h-[44px] text-[13px]"
                    onClick={() => setRecoverGap(latestGap)}
                  >
                    {t('zalo_gap_recover', 'Lấy lại ảnh bị lỡ')}
                  </PrimaryButton>
                )}
                <button
                  type="button"
                  onClick={() => dismissGap(latestGap)}
                  aria-label={t('zalo_gap_dismiss', 'Ẩn thông báo này')}
                  title={t('zalo_gap_dismiss', 'Ẩn thông báo này')}
                  className="w-[32px] h-[32px] mobile:w-[44px] mobile:h-[44px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-newTextColor hover:bg-boxHover outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {recoverGap?.from === latestGap.from && (
                <ZaloRecoverCard
                  initialFrom={latestGap.from - 2 * 60 * 1000}
                  initialTo={latestGap.to}
                  autoPreview
                  onDone={() => dismissGap(latestGap)}
                />
              )}
            </div>
          )}

          {/* Thiết lập lần đầu: 3 bước, xong thì ẩn. Đã thiết lập mà chỉ bị
              đăng xuất Zalo -> chỉ hiện ô QR. */}
          {online === true && !setupDone && (stepHub && stepGroups ? (
            <div className="border border-amber-400/40 bg-amber-400/10 rounded-[12px] p-[16px] flex flex-col gap-[12px]">
              <div className="text-[15px] font-[600]">
                {t('zalo_relogin_title', 'Zalo đã đăng xuất — quét QR để bot nhận ảnh tiếp')}
              </div>
              {qrBlock}
            </div>
          ) : (
            <Card title={t('zalo_setup_title', 'Bắt đầu')}>
              <ol className="flex flex-col gap-[16px]">
                {step('1', stepZalo, t('zalo_setup_step_zalo', 'Đăng nhập Zalo'), qrBlock)}
                {step(
                  '2',
                  stepHub,
                  t('zalo_setup_step_hub', 'Kết nối Media Hub'),
                  (
                    <div className="flex flex-col gap-[8px]">
                      <div className="text-[12.5px] text-textItemBlur leading-[1.6]">
                        {t(
                          'zalo_setup_key_hint',
                          'Tạo API key ở Cài đặt → Public API của Media Hub rồi dán vào đây.'
                        )}
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
                            aria-label={t('zalo_key_placeholder', 'paste Media Hub API key…')}
                            placeholder={t('zalo_key_placeholder', 'paste Media Hub API key…')}
                          />
                        </div>
                        <PrimaryButton onClick={() => save(true)} disabled={!postizKey.trim()}>
                          {t('zalo_save_key', 'Save key')}
                        </PrimaryButton>
                      </div>
                    </div>
                  )
                )}
                {step(
                  '3',
                  stepGroups,
                  t('zalo_setup_step_groups', 'Chọn nhóm Zalo và kênh nhận bài'),
                  <div>
                    <SimpleButton className="!h-[36px] mobile:!h-[44px] text-[13px]" onClick={() => switchTab('groups')}>
                      {t('zalo_setup_open_groups', 'Mở Nhóm Zalo')}
                    </SimpleButton>
                  </div>
                )}
              </ol>
            </Card>
          ))}

          {/* Nhóm đang nghe mà chưa có kênh: ảnh sẽ không được đẩy đi */}
          {stepGroups && !!unroutedListening && (
            <div className="flex items-center gap-[8px] flex-wrap text-[12.5px] text-amber-700 dark:text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-[10px] px-[12px] py-[8px] leading-[1.5]">
              <WarningIcon size={14} />
              <span className="flex-1 min-w-[200px]">
                {t(
                  'zalo_unrouted_short',
                  '{{n}} nhóm đang nghe chưa chọn kênh — ảnh từ các nhóm này sẽ không được đẩy đi.'
                ).replace('{{n}}', String(unroutedListening))}
              </span>
              <LinkButton onClick={() => switchTab('groups')}>{t('zalo_pick_channel_short', 'Chọn kênh')}</LinkButton>
            </div>
          )}

          {/* Nhóm đang gom ảnh / đang tạo bản nháp */}
          {!!activeGroups.length && (
            <div className="flex flex-wrap gap-[8px]">
              {activeGroups.map(({ r, lt }) => (
                <div
                  key={r.threadId}
                  className="inline-flex items-center gap-[8px] min-h-[34px] px-[12px] rounded-full border border-btnPrimary/40 bg-btnPrimary/10 text-[13px] max-w-full"
                >
                  <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full bg-btnPrimary motion-safe:animate-pulse shrink-0" />
                  <span className="font-[600] truncate max-w-[180px]">{r.label || r.threadId}</span>
                  <span className="text-textItemBlur whitespace-nowrap">{liveText(t, lt)}</span>
                  {isGathering(lt) && (
                    <LinkButton onClick={() => closeSession(r.threadId, r.label || r.threadId)}>
                      {t('zalo_close_now_short', 'Chốt ngay')}
                    </LinkButton>
                  )}
                </div>
              ))}
            </div>
          )}

          {!!overview?.pendingCount && (
            <div className="flex items-center gap-[8px] text-[13.5px] font-[600]">
              {!!pendingPre.trim() && <span>{pendingPre.trim()}</span>}
              <span className="min-w-[22px] h-[22px] px-[7px] rounded-full bg-btnPrimary text-white text-[12px] font-[700] inline-flex items-center justify-center">
                {overview.pendingCount}
              </span>
              {!!pendingPost.trim() && <span>{pendingPost.trim()}</span>}
            </div>
          )}

          {/* Bài viết — việc dùng nhiều nhất, nay ở ngay đầu màn hình */}
          <ZaloPostsTab onChanged={loadAll} />
        </>
      )}

      {/* ============================ CÁC TAB KHÁC ============================ */}
      {tab === 'groups' && (
        <ZaloRoutesTab zaloLogged={zaloLogged} live={live} onCloseSession={closeSession} onChanged={loadAll} />
      )}
      {tab === 'settings' && (
        <>
          <ZaloSettingsTab onChanged={loadAll} onOpenToday={() => switchTab('overview')} />
          <div className="mt-[20px] pt-[16px] border-t border-newTableBorder">
            <div className="text-[14px] font-[600] mb-[10px]">{t('zalo_tab_logs', 'Log')}</div>
            <ZaloLogsTab />
          </div>
        </>
      )}
    </div>
  );
};

export default ZaloComponent;
