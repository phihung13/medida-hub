'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ChevronRightIcon, ResetIcon } from '@gitroom/frontend/components/ui/icons';
import {
  bot,
  BotRoute,
  BotRoutesFile,
  channelLabel,
  DangerLink,
  FieldLabel,
  HubChannel,
  inputCls,
  isGathering,
  isSupportedChannel,
  LinkButton,
  liveText,
  LiveThread,
  PrimaryButton,
  Toggle,
  WarningIcon,
  ZaloGroup,
} from './zalo.shared';

// ============================================================================
//  Tab "Nhóm Zalo" — NƠI DUY NHẤT cấu hình nhóm (trước bị chia đôi: ô chọn
//  kênh ở Tổng quan + tab "Nhóm → Trang" với cả nút Lưu riêng). Mỗi nhóm là
//  một thẻ: tên, trạng thái gom ảnh trực tiếp, kênh nhận bài, công tắc nghe.
//  Bấm thẻ mở chi tiết. Mọi thay đổi TỰ LƯU (ghi nguyên routes.json của bot).
//
//  Bài từ nhóm thành bản nháp chờ duyệt trên Lịch của các kênh đã chọn; Hub tự
//  chèn CHÂN BÀI của kênh. Facebook/Google Business không còn đăng thẳng từ bot.
// ============================================================================

// Kênh đích của nhóm (chuẩn hoá): mảng mới postizIntegrationIds, fallback về
// field cũ postizIntegrationId (routes.json bản trước chỉ lưu 1 kênh).
const routeChannelIds = (r: BotRoute): string[] => {
  if (Array.isArray(r.postizIntegrationIds) && r.postizIntegrationIds.length) {
    return r.postizIntegrationIds.filter(Boolean);
  }
  return r.postizIntegrationId ? [r.postizIntegrationId] : [];
};

// Chuẩn hoá trước khi ghi routes.json — giữ nguyên các luật của bản cũ:
// - Facebook không còn đăng thẳng từ bot, chân bài route bỏ (Hub tự chèn).
// - Dọn cấu hình Google Business kiểu cũ (Playwright) để bot thôi tự đăng.
// - Giữ postizIntegrationId = kênh đầu cho bot bản cũ còn đọc field đơn.
// - "Tối đa mỗi bài" không được nhỏ hơn "gom khi im lặng" — tự nâng thay vì
//   chặn lưu như trước.
const normalize = (f: BotRoutesFile): BotRoutesFile => ({
  ...f,
  routes: f.routes
    .filter((r) => !!r.threadId)
    .map((r) => {
      const chIds = routeChannelIds(r);
      const debounceMs = r.debounceMs || 600000;
      return {
        ...r,
        fanpageId: '',
        fanpageTokenEnv: '',
        facebookAutoPublish: false,
        captionFooter: '',
        gbpLocationIds: [],
        gbpLocationId: '',
        gbpAutoPublish: false,
        postizIntegrationIds: chIds,
        postizIntegrationId: chIds[0] || '',
        debounceMs,
        maxWaitMs: Math.max(r.maxWaitMs || 1800000, debounceMs),
      };
    }),
});

const minutes = (ms: number | undefined, fallback: number) =>
  Math.round(((ms || fallback) / 60000) * 10) / 10;

// Ô nhập số phút: gõ tự do, chỉ lưu khi rời ô/Enter (ép giá trị ngay lúc gõ
// làm xoá-gõ-lại bị nhảy số).
const MinutesInput: FC<{
  valueMs: number | undefined;
  fallbackMs: number;
  minMs: number;
  ariaLabel: string;
  onCommit: (ms: number) => void;
}> = ({ valueMs, fallbackMs, minMs, ariaLabel, onCommit }) => {
  const [text, setText] = useState(String(minutes(valueMs, fallbackMs)));
  useEffect(() => setText(String(minutes(valueMs, fallbackMs))), [valueMs, fallbackMs]);
  const commit = () => {
    const n = Number(String(text).replace(',', '.'));
    const ms = Number.isFinite(n) && n > 0 ? Math.max(minMs, Math.round(n * 60000)) : valueMs || fallbackMs;
    setText(String(minutes(ms, fallbackMs)));
    if (ms !== valueMs) onCommit(ms);
  };
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={clsx(inputCls, '!w-[72px] text-center tabular-nums')}
    />
  );
};

export const ZaloRoutesTab: FC<{
  zaloLogged: boolean;
  live: LiveThread[];
  onCloseSession: (threadId: string, name: string) => void;
  onChanged?: () => void;
}> = ({ zaloLogged, live, onCloseSession, onChanged }) => {
  const t = useT();
  const toast = useToaster();

  const [file, setFile] = useState<BotRoutesFile | null>(null);
  const [groups, setGroups] = useState<ZaloGroup[] | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [channels, setChannels] = useState<HubChannel[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [legacyGbp, setLegacyGbp] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<BotRoutesFile | null>(null);

  const load = useCallback(async () => {
    try {
      const f = await bot('/api/routes');
      if (f && Array.isArray(f.routes)) {
        const defs = f.defaults || {};
        f.routes.forEach((r: BotRoute) => {
          if (r.debounceMs == null) r.debounceMs = defs.debounceMs ?? 600000;
          if (r.maxWaitMs == null) r.maxWaitMs = defs.maxWaitMs ?? 1800000;
          if (!Array.isArray(r.postizIntegrationIds)) {
            r.postizIntegrationIds = r.postizIntegrationId ? [r.postizIntegrationId] : [];
          }
        });
        setLegacyGbp(
          f.routes.filter(
            (r: BotRoute) => r.gbpLocationIds?.length || r.gbpLocationId || r.gbpAutoPublish
          ).length
        );
        setFile(f);
      }
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
    bot('/api/postiz/integrations')
      .then((r) => r?.ok && setChannels(r.integrations || []))
      .catch(() => {});
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Danh sách nhóm Zalo — LẦN ĐẦU chậm (bot lấy tên từng nhóm qua zca-js).
  const loadGroups = useCallback(async (force?: boolean) => {
    setGroupsLoading(true);
    try {
      const g = await bot(`/api/postiz/groups${force ? '?force=1' : ''}`, undefined, 60000);
      if (Array.isArray(g)) setGroups(g);
    } catch {
      setGroups((cur) => cur || []);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (zaloLogged && groups === null) loadGroups();
  }, [zaloLogged, groups, loadGroups]);

  // ---- lưu tự động ------------------------------------------------------------
  const persist = useCallback(
    async (f: BotRoutesFile) => {
      setSaveState('saving');
      try {
        const r = await bot('/api/routes', { method: 'POST', body: JSON.stringify(normalize(f)) }, 30000);
        if (r?.error) {
          setSaveState('error');
          toast.show(r.error, 'warning');
          return;
        }
        setSaveState('saved');
        setLegacyGbp(0);
        onChanged?.();
      } catch {
        setSaveState('error');
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      }
    },
    [onChanged, t]
  );

  // Gõ chữ/số thì gom 0.8s rồi mới lưu; bật/tắt, chọn kênh, thêm/bỏ nhóm lưu ngay.
  const update = useCallback(
    (next: BotRoutesFile, immediate?: boolean) => {
      setFile(next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      if (immediate) {
        pending.current = null;
        persist(next);
        return;
      }
      setSaveState('saving');
      timer.current = setTimeout(() => {
        const f = pending.current;
        pending.current = null;
        if (f) persist(f);
      }, 800);
    },
    [persist]
  );

  // Rời tab khi còn thay đổi chưa kịp lưu -> lưu luôn.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) persistRef.current(pending.current);
    },
    []
  );

  const routes = file?.routes || [];

  const patch = useCallback(
    (threadId: string, p: Partial<BotRoute>, immediate?: boolean) => {
      if (!file) return;
      update(
        {
          ...file,
          routes: file.routes.map((r) => (String(r.threadId) === String(threadId) ? { ...r, ...p } : r)),
        },
        immediate
      );
    },
    [file, update]
  );

  const toggleOpen = (threadId: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });

  const addGroup = useCallback(
    (g: ZaloGroup) => {
      if (!file || file.routes.some((r) => String(r.threadId) === String(g.threadId))) return;
      const route: BotRoute = {
        threadId: String(g.threadId),
        label: g.name,
        enabled: true,
        curateImages: true,
        autoHashtags: true,
        postizIntegrationIds: [],
        postizIntegrationId: '',
        debounceMs: file.defaults?.debounceMs ?? 600000,
        maxWaitMs: file.defaults?.maxWaitMs ?? 1800000,
      };
      update({ ...file, routes: [route, ...file.routes] }, true);
      // Mở sẵn chi tiết để chọn kênh — bước còn lại duy nhất.
      setOpen((cur) => new Set([...cur, String(g.threadId)]));
      setAdding(false);
      setSearch('');
      toast.show(
        t('zalo_group_added', 'Đã thêm "{{name}}" — chọn kênh nhận bài bên dưới.').replace('{{name}}', g.name),
        'success'
      );
    },
    [file, update, t]
  );

  const remove = useCallback(
    async (r: BotRoute) => {
      if (!file) return;
      const name = r.label || r.threadId;
      if (
        !(await deleteDialog(
          t(
            'zalo_group_remove_confirm',
            'Bỏ nhóm "{{name}}"? Bot sẽ thôi nhận ảnh từ nhóm này. Bài đã tạo không bị ảnh hưởng.'
          ).replace('{{name}}', name),
          t('zalo_group_remove', 'Bỏ nhóm')
        ))
      )
        return;
      update({ ...file, routes: file.routes.filter((x) => x !== r) }, true);
    },
    [file, update, t]
  );

  const liveByThread = useMemo(() => {
    const m = new Map<string, LiveThread>();
    live.forEach((x) => m.set(String(x.threadId), x));
    return m;
  }, [live]);
  const channelById = useMemo(() => {
    const m = new Map<string, HubChannel>();
    channels.forEach((c) => m.set(c.id, c));
    return m;
  }, [channels]);
  const pickable = useMemo(() => channels.filter((ch) => isSupportedChannel(ch.identifier)), [channels]);
  const used = useMemo(() => new Set(routes.map((r) => String(r.threadId))), [routes]);
  const addable = useMemo(
    () =>
      (groups || []).filter(
        (g) =>
          !used.has(String(g.threadId)) &&
          (!search.trim() || g.name.toLowerCase().includes(search.trim().toLowerCase()))
      ),
    [groups, used, search]
  );

  if (file === null) {
    return (
      <div className="text-[13px] text-textItemBlur py-[30px] text-center">
        {t('zalo_routes_loading', 'Loading configuration from the bot…')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px] max-w-[880px]">
      {!!legacyGbp && (
        <div className="flex items-start gap-[10px] text-[12.5px] leading-[1.6] text-amber-700 dark:text-amber-400 border border-amber-400/40 bg-amber-400/10 rounded-[12px] px-[14px] py-[10px]">
          <WarningIcon size={15} className="mt-[3px]" />
          <span className="flex-1">
            {t(
              'zalo_groups_legacy_gbp',
              '{{n}} nhóm còn cấu hình Google Business kiểu cũ — bot vẫn tự đăng lên Google bằng trình duyệt ngầm. Muốn đăng Google Business thì chọn kênh Google Business trong nhóm.'
            ).replace('{{n}}', String(legacyGbp))}
          </span>
          <LinkButton onClick={() => persist(file)}>{t('zalo_groups_legacy_clean', 'Dọn ngay')}</LinkButton>
        </div>
      )}

      {/* Thanh hành động + trạng thái lưu */}
      <div className="flex items-center gap-[12px] flex-wrap">
        <PrimaryButton className="!h-[38px] mobile:!h-[44px] text-[13.5px]" onClick={() => setAdding((v) => !v)}>
          + {t('zalo_group_add', 'Thêm nhóm')}
        </PrimaryButton>
        <span aria-live="polite" className="text-[12.5px] text-textItemBlur">
          {saveState === 'saving'
            ? t('zalo_autosave_saving', 'Đang lưu…')
            : saveState === 'saved'
            ? t('zalo_autosave_saved', 'Đã lưu')
            : saveState === 'error'
            ? t('zalo_autosave_error', 'Chưa lưu được — kiểm tra kết nối bot')
            : t('zalo_autosave_hint', 'Thay đổi được lưu tự động')}
        </span>
      </div>

      {/* Thêm nhóm: tìm nhóm Zalo -> bấm "Chọn" -> chọn kênh (thẻ mở sẵn) */}
      {adding && (
        <div className="border border-btnPrimary/40 rounded-[12px] p-[14px] flex flex-col gap-[10px]">
          {!zaloLogged ? (
            <div className="text-[13px] text-textItemBlur">
              {t('zalo_group_add_login_first', 'Đăng nhập Zalo ở tab Tổng quan trước để thấy danh sách nhóm.')}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-[8px]">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('zalo_search_group', 'Search groups…')}
                  aria-label={t('zalo_search_group', 'Search groups…')}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => loadGroups(true)}
                  aria-label={t('zalo_refresh', 'Refresh')}
                  title={t('zalo_refresh', 'Refresh')}
                  className="w-[38px] h-[38px] mobile:w-[44px] mobile:h-[44px] shrink-0 rounded-[8px] border border-newTableBorder flex items-center justify-center text-textItemBlur hover:text-newTextColor hover:bg-boxHover outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary"
                >
                  <ResetIcon size={15} aria-hidden="true" className={clsx(groupsLoading && 'animate-spin')} />
                </button>
              </div>
              <div className="max-h-[280px] overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner flex flex-col">
                {groups === null || (groupsLoading && !groups.length) ? (
                  <div className="text-[12.5px] text-textItemBlur py-[6px]">
                    {t('zalo_groups_loading', 'Loading the Zalo group list — the first time can take 10–30 seconds…')}
                  </div>
                ) : addable.length ? (
                  addable.map((g) => (
                    <div
                      key={g.threadId}
                      className="flex items-center gap-[12px] py-[6px] border-b border-newTableBorder last:border-b-0"
                    >
                      <div className="flex-1 min-w-0 text-[13.5px] truncate">{g.name}</div>
                      <LinkButton onClick={() => addGroup(g)}>{t('zalo_group_pick', 'Chọn')}</LinkButton>
                    </div>
                  ))
                ) : (
                  <div className="text-[12.5px] text-textItemBlur py-[6px]">
                    {search.trim()
                      ? t('zalo_no_matching_groups', 'No more groups match your search.')
                      : t('zalo_group_all_added', 'Đã thêm hết các nhóm. Không thấy nhóm mới? Nhắn một tin vào nhóm đó rồi bấm làm mới.')}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!routes.length && !adding && (
        <div className="text-[13px] text-textItemBlur border border-dashed border-newTableBorder rounded-[12px] px-[16px] py-[18px] text-center">
          {t('zalo_groups_empty', 'Chưa có nhóm nào. Bấm "+ Thêm nhóm" để chọn nhóm Zalo bot sẽ lấy ảnh.')}
        </div>
      )}

      {routes.map((r) => {
        const tid = String(r.threadId);
        const name = r.label || tid;
        const lt = liveByThread.get(tid);
        const listening = r.enabled !== false;
        const gathering = listening && isGathering(lt);
        const busy = gathering || lt?.phase === 'processing';
        const ids = routeChannelIds(r);
        const isOpen = open.has(tid);
        const toggleChannel = (id: string) =>
          patch(tid, { postizIntegrationIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }, true);
        return (
          <div key={tid} className="border border-newTableBorder rounded-[12px]">
            {/* Hàng chính: tên + trạng thái | Chốt ngay | công tắc nghe */}
            <div className="flex items-center gap-[12px] px-[14px] pt-[12px] pb-[8px] mobile:flex-wrap">
              <button
                type="button"
                onClick={() => toggleOpen(tid)}
                aria-expanded={isOpen}
                className="flex items-center gap-[10px] flex-1 min-w-0 text-start cursor-pointer rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary mobile:min-h-[44px]"
              >
                <ChevronRightIcon
                  size={14}
                  aria-hidden="true"
                  className={clsx('shrink-0 text-textItemBlur transition-transform', isOpen && 'rotate-90')}
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-[600] truncate">{name}</span>
                  <span
                    className={clsx(
                      'block text-[12px]',
                      busy ? 'text-btnPrimary font-[600]' : 'text-textItemBlur'
                    )}
                  >
                    {listening ? liveText(t, lt) : t('zalo_listening_off', 'Listening off')}
                  </span>
                </span>
              </button>
              {gathering && (
                <LinkButton onClick={() => onCloseSession(tid, name)}>
                  {t('zalo_close_now_short', 'Chốt ngay')}
                </LinkButton>
              )}
              <Toggle
                small
                on={listening}
                ariaLabel={t('zalo_group_listen_aria', 'Nghe nhóm {{name}}').replace('{{name}}', name)}
                onChange={() => patch(tid, { enabled: !listening }, true)}
              />
            </div>

            {/* Kênh nhận bài: nhìn là biết bài nhóm này đi đâu */}
            <div className="flex flex-wrap items-center gap-[6px] px-[14px] pb-[12px] ps-[38px]">
              {ids.length ? (
                ids.map((id) => {
                  const ch = channelById.get(id);
                  return (
                    <span
                      key={id}
                      className={clsx(
                        'inline-flex items-center h-[24px] px-[9px] rounded-full text-[12px] border max-w-[260px] truncate',
                        ch ? 'border-newTableBorder text-textItemBlur' : 'border-amber-400/50 text-amber-700 dark:text-amber-400'
                      )}
                    >
                      {ch ? channelLabel(ch) : t('zalo_channel_missing', 'Kênh đã bị gỡ')}
                    </span>
                  );
                })
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen((cur) => new Set([...cur, tid]))}
                  className="inline-flex items-center gap-[6px] h-[26px] px-[10px] rounded-full text-[12px] font-[600] border border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-400 mobile:h-[36px]"
                >
                  <WarningIcon size={13} />
                  {t('zalo_group_no_channel', 'Chưa chọn kênh nhận bài')}
                </button>
              )}
            </div>

            {isOpen && (
              <div className="border-t border-newTableBorder p-[14px] ps-[38px] mobile:ps-[14px] flex flex-col gap-[16px]">
                {/* Kênh nhận bài (chọn nhiều) */}
                <div className="flex flex-col gap-[8px]">
                  <FieldLabel
                    hint={t(
                      'zalo_group_channels_hint',
                      'Ảnh từ nhóm thành bản nháp chờ duyệt trên Lịch của các kênh đã chọn.'
                    )}
                  >
                    {t('zalo_group_channels', 'Kênh nhận bài')}
                  </FieldLabel>
                  {pickable.length ? (
                    <div className="flex gap-[8px] flex-wrap">
                      {pickable.map((ch) => {
                        const on = ids.includes(ch.id);
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleChannel(ch.id)}
                            className={clsx(
                              'inline-flex items-center gap-[6px] text-[12.5px] font-[600] border rounded-[8px] px-[10px] h-[32px] mobile:h-[44px] mobile:px-[14px] cursor-pointer tap-shrink outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary',
                              on
                                ? 'border-btnPrimary text-btnPrimary bg-btnPrimary/10'
                                : 'border-newTableBorder text-textItemBlur hover:text-newTextColor'
                            )}
                          >
                            {on && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                            {channelLabel(ch)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-textItemBlur">
                      {t('zalo_routes_no_channels', 'Chưa có kênh nào — kết nối kênh ở Lịch → Add Channel.')}
                    </div>
                  )}
                </div>

                {/* Tên hiển thị */}
                <div className="flex flex-col gap-[6px] max-w-[420px]">
                  <FieldLabel>{t('zalo_group_label', 'Tên hiển thị')}</FieldLabel>
                  <input
                    value={r.label || ''}
                    onChange={(e) => patch(tid, { label: e.target.value })}
                    className={inputCls}
                  />
                </div>

                {/* Công tắc */}
                <div className="flex flex-col gap-[10px]">
                  <label className="flex items-center gap-[10px] text-[13px] cursor-pointer w-fit mobile:min-h-[44px]">
                    <Toggle
                      small
                      on={r.curateImages !== false}
                      onChange={() => patch(tid, { curateImages: !(r.curateImages !== false) }, true)}
                    />
                    {t('zalo_group_curate', 'Tự bỏ ảnh trùng, mờ, tối')}
                  </label>
                  <label className="flex items-center gap-[10px] text-[13px] cursor-pointer w-fit mobile:min-h-[44px]">
                    <Toggle
                      small
                      on={r.autoHashtags !== false}
                      onChange={() => patch(tid, { autoHashtags: !(r.autoHashtags !== false) }, true)}
                    />
                    {t('zalo_group_hashtags', 'Thêm 5 hashtag cuối bài')}
                  </label>
                </div>

                {/* Thời gian gom bài — viết thành câu thay cho 2 ô "debounce/maxWait" */}
                <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[6px] text-[13px] leading-[1.6]">
                  <span>{t('zalo_group_timing_1', 'Chốt bài khi nhóm im lặng')}</span>
                  <MinutesInput
                    valueMs={r.debounceMs}
                    fallbackMs={600000}
                    minMs={30000}
                    ariaLabel={t('zalo_group_timing_quiet_aria', 'Số phút im lặng thì chốt bài')}
                    onCommit={(ms) => patch(tid, { debounceMs: ms }, true)}
                  />
                  <span>{t('zalo_group_timing_2', 'phút, mỗi bài gom tối đa')}</span>
                  <MinutesInput
                    valueMs={r.maxWaitMs}
                    fallbackMs={1800000}
                    minMs={60000}
                    ariaLabel={t('zalo_group_timing_max_aria', 'Số phút tối đa mỗi bài')}
                    onCommit={(ms) => patch(tid, { maxWaitMs: ms }, true)}
                  />
                  <span>{t('zalo_group_timing_3', 'phút.')}</span>
                </div>

                <div className="text-[12px] text-textItemBlur leading-[1.6]">
                  {t(
                    'zalo_group_footer_note',
                    'Chân bài (hotline, địa chỉ) cài một lần cho từng kênh ở trang Lịch — bấm avatar kênh.'
                  )}
                </div>

                <div>
                  <DangerLink onClick={() => remove(r)}>{t('zalo_group_remove', 'Bỏ nhóm')}</DangerLink>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
