'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  bot,
  BotRoute,
  BotRoutesFile,
  Card,
  DangerLink,
  FbPage,
  FieldLabel,
  GbpBusiness,
  HubChannel,
  inputCls,
  isSupportedChannel,
  PrimaryButton,
  selectCls,
  SimpleButton,
  StatusChip,
  textareaCls,
  Toggle,
  ZaloGroup,
} from './zalo.shared';

// ============================================================================
//  Tab "Nhóm → Trang" — thay thế tab Routes của dashboard bot: mỗi nhóm Zalo
//  nguồn nối tới Trang Facebook / Google Business / kênh Media Hub, kèm đầy đủ
//  cài đặt: thời gian chờ gom ảnh, bình luận tự động, CHÂN BÀI, hướng dẫn viết
//  cho AI, hashtag, lọc ảnh, tự đăng. Lưu = ghi nguyên file routes.json của bot
//  (bot tự áp chân bài mới vào các bài đang chờ duyệt).
// ============================================================================

const newRoute = (): BotRoute => ({
  threadId: '',
  label: '',
  folder: '',
  fanpageId: '',
  fanpageTokenEnv: '',
  published: false,
  facebookAutoPublish: false,
  gbpAutoPublish: false,
  enabled: true,
  curateImages: true,
  autoHashtags: true,
  comment: '',
  captionFooter: '',
  writeGuide: '',
  gbpLocationIds: [],
  postizIntegrationId: '',
  debounceMs: 600000,
  maxWaitMs: 1800000,
});

export const ZaloRoutesTab: FC<{ zaloLogged: boolean; onChanged?: () => void }> = ({
  zaloLogged,
  onChanged,
}) => {
  const t = useT();
  const toast = useToaster();

  const [file, setFile] = useState<BotRoutesFile | null>(null);
  const [groups, setGroups] = useState<ZaloGroup[] | null>(null);
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [businesses, setBusinesses] = useState<GbpBusiness[]>([]);
  const [channels, setChannels] = useState<HubChannel[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [adv, setAdv] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const f = await bot('/api/routes');
      if (f && Array.isArray(f.routes)) {
        const defs = f.defaults || {};
        f.routes.forEach((r: BotRoute) => {
          if (r.debounceMs == null) r.debounceMs = defs.debounceMs ?? 600000;
          if (r.maxWaitMs == null) r.maxWaitMs = defs.maxWaitMs ?? 1800000;
          if (!Array.isArray(r.gbpLocationIds))
            r.gbpLocationIds = r.gbpLocationId ? [String(r.gbpLocationId)] : [];
          if (r.writeGuide == null) r.writeGuide = r.styleSample || '';
        });
        setFile(f);
        setDirty(false);
        // Nhóm chưa đủ thông tin (thiếu nhóm nguồn) thì tự mở sẵn để điền tiếp.
        setOpen(new Set(f.routes.map((r: BotRoute, i: number) => (!r.threadId ? i : -1)).filter((i: number) => i >= 0)));
      }
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    }
    bot('/api/fb/pages?force=1', undefined, 30000).then((p) => Array.isArray(p) && setPages(p)).catch(() => setPages([]));
    bot('/api/gbp/businesses').then((b) => Array.isArray(b) && setBusinesses(b)).catch(() => {});
    bot('/api/postiz/integrations')
      .then((r) => r?.ok && setChannels(r.integrations || []))
      .catch(() => {});
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (zaloLogged && groups === null) {
      bot('/api/zalo/groups', undefined, 60000)
        .then((g) => setGroups(Array.isArray(g) ? g : []))
        .catch(() => setGroups([]));
    }
  }, [zaloLogged, groups]);

  const routes = file?.routes || [];

  const patch = useCallback((i: number, p: Partial<BotRoute>) => {
    setFile((cur) => {
      if (!cur) return cur;
      const next = { ...cur, routes: cur.routes.map((r, j) => (j === i ? { ...r, ...p } : r)) };
      return next;
    });
    setDirty(true);
  }, []);

  const usedThreadIds = useMemo(() => new Set(routes.map((r) => String(r.threadId))), [routes]);

  const save = useCallback(async () => {
    if (!file) return;
    // Chuẩn hoá + kiểm tra như dashboard cũ (nhưng Trang FB nay là TUỲ CHỌN —
    // nhóm có thể chỉ đẩy vào Media Hub).
    for (let i = 0; i < file.routes.length; i++) {
      const r = file.routes[i];
      r.facebookAutoPublish = !!r.facebookAutoPublish;
      r.gbpLocationIds = (r.gbpLocationIds || []).map(String).filter(Boolean);
      r.gbpLocationId = r.gbpLocationIds[0] || '';
      r.gbpAutoPublish = !!(r.gbpLocationIds.length && r.gbpAutoPublish);
      if (r.facebookAutoPublish) r.published = true;
      if (!r.threadId) {
        toast.show(
          t('zalo_routes_missing_thread', 'Route {{n}} ({{name}}) has no Zalo group selected')
            .replace('{{n}}', String(i + 1))
            .replace('{{name}}', r.label || t('zalo_routes_unnamed', 'unnamed')),
          'warning'
        );
        return;
      }
      if (r.fanpageId && pages) {
        const pg = pages.find((x) => x.fanpageId === r.fanpageId);
        if (pg && !pg.hasToken) {
          toast.show(
            t('zalo_routes_page_no_token2', 'Page "{{name}}" has no usable token — reconnect it in Add Channel.').replace('{{name}}', pg.name),
            'warning'
          );
          return;
        }
      }
      if (r.debounceMs && r.maxWaitMs && r.maxWaitMs < r.debounceMs) {
        toast.show(
          t('zalo_routes_maxwait_lt', 'Route {{n}}: "Max per session" must be ≥ "Close after silence".').replace('{{n}}', String(i + 1)),
          'warning'
        );
        return;
      }
    }
    setSaving(true);
    try {
      const r = await bot('/api/routes', { method: 'POST', body: JSON.stringify(file) }, 30000);
      if (r?.error) toast.show(r.error, 'warning');
      else {
        toast.show(
          r.footerUpdated
            ? t('zalo_routes_saved_footer', 'Saved — footer refreshed on {{n}} pending posts').replace('{{n}}', String(r.footerUpdated))
            : t('zalo_routes_saved', 'Configuration saved'),
          'success'
        );
        setDirty(false);
        onChanged?.();
        load();
      }
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [file, pages, load, onChanged, t]);

  const remove = useCallback(
    async (i: number) => {
      const r = routes[i];
      if (
        !(await deleteDialog(
          t('zalo_routes_delete_confirm', 'Delete "{{name}}" from the configuration? Published posts are not affected.').replace(
            '{{name}}',
            r?.label || `#${i + 1}`
          ),
          t('zalo_routes_delete', 'Delete route')
        ))
      )
        return;
      setFile((cur) => (cur ? { ...cur, routes: cur.routes.filter((_, j) => j !== i) } : cur));
      setDirty(true);
    },
    [routes, t]
  );

  if (file === null) {
    return (
      <div className="text-[13px] text-textItemBlur py-[30px] text-center">
        {t('zalo_routes_loading', 'Loading configuration from the bot…')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="text-[13px] text-textItemBlur leading-[1.6] max-w-[720px]">
        {t(
          'zalo_routes_intro',
          'Each row connects a source Zalo group to where its posts go: a Facebook Page, Google Business, and/or a Media Hub channel. Remember to press "Save configuration" when done.'
        )}
      </div>

      {!routes.length && (
        <Card>
          <div className="text-[13.5px] leading-[1.7] text-textItemBlur">
            <b className="text-newTextColor">{t('zalo_routes_empty_title', 'No group connected yet')}</b>
            <ol className="list-decimal ms-[18px] mt-[6px] flex flex-col gap-[4px]">
              <li>{t('zalo_routes_empty_1', 'Click "+ Add group" below.')}</li>
              <li>{t('zalo_routes_empty_2', 'Pick the source Zalo group and the destination Facebook Page / Google Business / Media Hub channel.')}</li>
              <li>{t('zalo_routes_empty_3b', 'Facebook Pages come from Add Channel (connect once) — then enable auto-publish here if you want.')}</li>
            </ol>
          </div>
        </Card>
      )}

      {routes.map((r, i) => {
        const gbpIds = r.gbpLocationIds || [];
        const isOpen = open.has(i);
        const advOpen = adv.has(i);
        return (
          <div key={i} className="border border-newTableBorder rounded-[12px] overflow-hidden">
            {/* Header thẻ route */}
            <div
              onClick={() =>
                setOpen((cur) => {
                  const next = new Set(cur);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              className="flex items-center gap-[10px] p-[14px] cursor-pointer hover:bg-boxHover flex-wrap"
            >
              <b className="text-[14px] flex-1 min-w-[140px] truncate">
                {r.label || t('zalo_routes_route_n', 'Route {{n}}').replace('{{n}}', String(i + 1))}
              </b>
              <StatusChip tone={r.enabled !== false ? 'ok' : 'off'}>
                {r.enabled !== false ? t('zalo_on', 'On') : t('zalo_off', 'Off')}
              </StatusChip>
              <StatusChip tone={r.facebookAutoPublish ? 'warn' : 'wait'}>
                {r.facebookAutoPublish
                  ? t('zalo_routes_fb_auto', 'FB auto-publish')
                  : t('zalo_routes_fb_review', 'FB reviewed')}
              </StatusChip>
              {!!gbpIds.length && (
                <StatusChip tone={r.gbpAutoPublish ? 'warn' : 'wait'}>
                  {(r.gbpAutoPublish
                    ? t('zalo_routes_gbp_auto', 'GBP auto-publish')
                    : t('zalo_routes_gbp_review', 'GBP reviewed')) + ` (${gbpIds.length})`}
                </StatusChip>
              )}
              <span className="text-textItemBlur text-[12px]">{isOpen ? '▾' : '▸'}</span>
            </div>

            {isOpen && (
              <div className="p-[14px] pt-0 flex flex-col gap-[12px]">
                {/* Tên + mục */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
                  <div className="flex flex-col gap-[5px]">
                    <FieldLabel>{t('zalo_routes_label', 'Display name')}</FieldLabel>
                    <input
                      value={r.label || ''}
                      onChange={(e) => patch(i, { label: e.target.value })}
                      placeholder={t('zalo_routes_label_ph', 'e.g. Kindergarten class → Việt Anh Page')}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-[5px]">
                    <FieldLabel
                      hint={t('zalo_routes_folder_hint', 'Group pages of the same person into one section — the Posts tab filters by it.')}
                    >
                      {t('zalo_routes_folder', 'Section / person in charge')}
                    </FieldLabel>
                    <input
                      value={r.folder || ''}
                      onChange={(e) => patch(i, { folder: e.target.value })}
                      placeholder={t('zalo_routes_folder_ph', 'e.g. Ms. Lan · Brand A')}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Nguồn + đích */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[10px]">
                  <div className="flex flex-col gap-[5px]">
                    <FieldLabel hint={t('zalo_routes_group_hint', 'The group whose images are collected.')}>
                      {t('zalo_routes_group', 'Zalo group (source)')}
                    </FieldLabel>
                    {groups && groups.length ? (
                      <select
                        value={r.threadId || ''}
                        onChange={(e) => {
                          const g = groups.find((x) => String(x.threadId) === e.target.value);
                          patch(i, {
                            threadId: e.target.value,
                            label: r.label || g?.name || '',
                          });
                        }}
                        className={selectCls}
                      >
                        <option value="">{t('zalo_routes_pick_group', '— Pick a group —')}</option>
                        {r.threadId && !groups.some((g) => String(g.threadId) === String(r.threadId)) && (
                          <option value={r.threadId}>{r.label || r.threadId}</option>
                        )}
                        {groups.map((g) => (
                          <option
                            key={g.threadId}
                            value={g.threadId}
                            disabled={usedThreadIds.has(String(g.threadId)) && String(g.threadId) !== String(r.threadId)}
                          >
                            {g.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={r.threadId || ''}
                        onChange={(e) => patch(i, { threadId: e.target.value })}
                        placeholder={t('zalo_routes_thread_ph', 'Group ID (threadId)')}
                        className={inputCls}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-[5px]">
                    <FieldLabel
                      hint={t('zalo_routes_page_hint2', "Don't see the Page? Connect it once in Add Channel — the bot picks up its token automatically.")}
                    >
                      {t('zalo_routes_page', 'Facebook Page (optional)')}
                    </FieldLabel>
                    <select
                      value={r.fanpageId || ''}
                      onChange={(e) => {
                        const pg = (pages || []).find((x) => x.fanpageId === e.target.value);
                        patch(i, {
                          fanpageId: e.target.value,
                          fanpageTokenEnv: pg?.envName || r.fanpageTokenEnv || '',
                        });
                      }}
                      className={selectCls}
                    >
                      <option value="">{t('zalo_routes_no_page', '— No Facebook —')}</option>
                      {r.fanpageId && !(pages || []).some((p) => p.fanpageId === r.fanpageId) && (
                        <option value={r.fanpageId}>{r.fanpageId}</option>
                      )}
                      {(pages || []).map((p) => (
                        <option key={p.fanpageId} value={p.fanpageId}>
                          {p.name}
                          {p.hasToken ? '' : ` (${t('zalo_routes_no_token', 'no token')})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-[5px]">
                    <FieldLabel
                      hint={t('zalo_routes_hub_hint', 'Posts also become Media Hub drafts on the Calendar for this channel.')}
                    >
                      {t('zalo_routes_hub_channel', 'Media Hub channel')}
                    </FieldLabel>
                    <select
                      value={r.postizIntegrationId || ''}
                      onChange={(e) => patch(i, { postizIntegrationId: e.target.value })}
                      className={selectCls}
                    >
                      <option value="">{t('zalo_no_channel_selected', '— No channel selected —')}</option>
                      {channels
                        .filter((ch) => isSupportedChannel(ch.identifier))
                        .map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            → {ch.name || ch.id}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Google Business multi-select */}
                <div className="flex flex-col gap-[5px]">
                  <FieldLabel
                    hint={t('zalo_routes_gbp_hint', 'Profiles saved in the Google Business tab. Leave empty to skip Google.')}
                  >
                    Google Business
                  </FieldLabel>
                  {businesses.length ? (
                    <div className="flex gap-[10px] flex-wrap">
                      {businesses.map((b) => {
                        const on = gbpIds.includes(String(b.id));
                        return (
                          <label
                            key={b.id}
                            className={clsx(
                              'flex items-center gap-[6px] text-[12.5px] font-[600] border rounded-[8px] px-[10px] h-[32px] cursor-pointer',
                              on ? 'border-btnPrimary text-btnPrimary bg-btnPrimary/10' : 'border-newTableBorder text-textItemBlur'
                            )}
                          >
                            <input
                              type="checkbox"
                              hidden
                              checked={on}
                              onChange={(e) =>
                                patch(i, {
                                  gbpLocationIds: e.target.checked
                                    ? [...gbpIds, String(b.id)]
                                    : gbpIds.filter((x) => x !== String(b.id)),
                                })
                              }
                            />
                            {on ? '✓ ' : ''}
                            {b.name || b.id}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[12px] text-textItemBlur">
                      {t('zalo_routes_no_gbp', 'No Google Business profile saved yet — add them in the Google Business tab.')}
                    </div>
                  )}
                </div>

                {/* Công tắc chính */}
                <div className="flex items-center gap-[18px] flex-wrap">
                  <label className="flex items-center gap-[8px] text-[13px] font-[600] cursor-pointer">
                    <Toggle small on={r.enabled !== false} onChange={() => patch(i, { enabled: !(r.enabled !== false) })} />
                    {t('zalo_routes_enabled', 'Listen to this group')}
                  </label>
                  <label
                    className="flex items-center gap-[8px] text-[13px] font-[600] cursor-pointer"
                    title={t('zalo_routes_curate_title', 'On: AI drops duplicate/blurry/dark images and picks the best ones. Off: keep every image.')}
                  >
                    <Toggle small on={r.curateImages !== false} onChange={() => patch(i, { curateImages: !(r.curateImages !== false) })} />
                    {t('zalo_routes_curate', 'Curate images')}
                  </label>
                  <label className="flex items-center gap-[8px] text-[13px] font-[600] cursor-pointer text-amber-400">
                    <Toggle
                      small
                      on={!!r.facebookAutoPublish}
                      onChange={() =>
                        patch(i, {
                          facebookAutoPublish: !r.facebookAutoPublish,
                          published: !r.facebookAutoPublish ? true : r.published,
                        })
                      }
                    />
                    {t('zalo_routes_fb_autopublish', 'Facebook auto-publish (skip review)')}
                  </label>
                  <label
                    className={clsx(
                      'flex items-center gap-[8px] text-[13px] font-[600] text-amber-400',
                      gbpIds.length ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <Toggle
                      small
                      disabled={!gbpIds.length}
                      on={!!r.gbpAutoPublish}
                      onChange={() => patch(i, { gbpAutoPublish: !r.gbpAutoPublish })}
                    />
                    {t('zalo_routes_gbp_autopublish', 'Google Business auto-publish')}
                  </label>
                </div>

                {/* Nâng cao: thời gian · bình luận · chân bài · hướng dẫn viết · hashtag */}
                <div
                  onClick={() =>
                    setAdv((cur) => {
                      const next = new Set(cur);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className="border-t border-newTableBorder pt-[10px] flex items-center justify-between cursor-pointer"
                >
                  <b className="text-[13px]">{t('zalo_routes_advanced', 'Advanced settings')}</b>
                  <span className="text-[11.5px] text-textItemBlur">
                    {t('zalo_routes_advanced_sub', 'timing · auto-comment · footer · writing guide · hashtags')}{' '}
                    {advOpen ? '▾' : '▸'}
                  </span>
                </div>
                {advOpen && (
                  <div className="flex flex-col gap-[12px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
                      <div className="flex flex-col gap-[5px]">
                        <FieldLabel
                          hint={t('zalo_routes_debounce_hint', 'After the group goes quiet this long, the batch closes and a draft is created.')}
                        >
                          {t('zalo_routes_debounce', 'Close after silence (minutes)')}
                        </FieldLabel>
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={Math.round(((r.debounceMs || 600000) / 60000) * 10) / 10}
                          onChange={(e) =>
                            patch(i, { debounceMs: Math.max(5000, Math.round(Number(e.target.value || 0) * 60000)) })
                          }
                          className={inputCls}
                        />
                      </div>
                      <div className="flex flex-col gap-[5px]">
                        <FieldLabel
                          hint={t('zalo_routes_maxwait_hint', 'Hard cap — the batch always closes after this long even if images keep coming.')}
                        >
                          {t('zalo_routes_maxwait', 'Max per session (minutes)')}
                        </FieldLabel>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={Math.round((r.maxWaitMs || 1800000) / 60000)}
                          onChange={(e) =>
                            patch(i, { maxWaitMs: Math.max(30000, Math.round(Number(e.target.value || 0) * 60000)) })
                          }
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-[5px]">
                      <FieldLabel hint={t('zalo_routes_comment_hint', 'Automatically commented right under each published post.')}>
                        {t('zalo_routes_comment', 'Automatic first comment (optional)')}
                      </FieldLabel>
                      <input
                        value={r.comment || ''}
                        onChange={(e) => patch(i, { comment: e.target.value })}
                        placeholder={t('zalo_routes_comment_ph', 'e.g. ☎ 0902 095 956 · Address…')}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-[5px]">
                      <FieldLabel
                        hint={t('zalo_routes_footer_hint', 'Inserted verbatim at the end of every post (hotline, address, hashtags, Google Maps…).')}
                      >
                        {t('zalo_routes_footer', 'Fixed footer (hotline + address)')}
                        {(r.captionFooter || '').length ? ` · ${(r.captionFooter || '').length} ${t('zalo_routes_chars', 'chars')}` : ''}
                      </FieldLabel>
                      <textarea
                        rows={5}
                        value={r.captionFooter || ''}
                        onChange={(e) => patch(i, { captionFooter: e.target.value })}
                        placeholder={t('zalo_routes_footer_ph', 'Paste the whole contact block here.')}
                        className={textareaCls}
                      />
                    </div>
                    <div className="flex flex-col gap-[5px]">
                      <FieldLabel
                        hint={t('zalo_routes_guide_hint', 'AI follows these INSTRUCTIONS to adapt each post (tone, addressing, campaign, lead magnet) — not copied verbatim.')}
                      >
                        {t('zalo_routes_guide', 'Writing guide for this Page (optional)')}
                        {(r.writeGuide || '').length ? ` · ${(r.writeGuide || '').length} ${t('zalo_routes_chars', 'chars')}` : ''}
                      </FieldLabel>
                      <textarea
                        rows={6}
                        value={r.writeGuide || ''}
                        onChange={(e) => patch(i, { writeGuide: e.target.value })}
                        placeholder={t(
                          'zalo_routes_guide_ph',
                          "Write DIRECTIONS for the AI, e.g.:\n- Style: warm, emotional.\n- Addressing: call readers 'ba mẹ', sign as 'nhà trường'.\n- Running campaign: July tuition offer.\n- Lead magnet: invite to leave a phone number for a tour.\nLeave empty = default style."
                        )}
                        className={textareaCls}
                      />
                    </div>
                    <label className="flex items-center gap-[8px] text-[13px] font-[600] cursor-pointer w-fit">
                      <Toggle small on={r.autoHashtags !== false} onChange={() => patch(i, { autoHashtags: !(r.autoHashtags !== false) })} />
                      {t('zalo_routes_hashtags', 'AI adds 5 hashtags at the end (below the footer)')}
                    </label>
                  </div>
                )}

                <div className="border-t border-newTableBorder pt-[10px]">
                  <DangerLink onClick={() => remove(i)}>
                    🗑 {t('zalo_routes_delete', 'Delete route')}
                  </DangerLink>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-[10px] flex-wrap">
        <PrimaryButton disabled={saving || !dirty} onClick={save}>
          {saving ? t('zalo_routes_saving', 'Saving…') : t('zalo_routes_save', 'Save configuration')}
        </PrimaryButton>
        <SimpleButton
          onClick={() => {
            setFile((cur) => (cur ? { ...cur, routes: [...cur.routes, newRoute()] } : cur));
            setOpen((cur) => new Set([...cur, routes.length]));
            setDirty(true);
          }}
        >
          + {t('zalo_routes_add', 'Add group')}
        </SimpleButton>
        {dirty && (
          <span className="text-[12.5px] text-amber-400 font-[600]">
            {t('zalo_routes_unsaved', 'Unsaved changes')}
          </span>
        )}
        {groups === null && zaloLogged && (
          <span className="text-[12px] text-textItemBlur">
            {t('zalo_routes_groups_loading', 'Loading group list… (first time can take 10–30s)')}
          </span>
        )}
      </div>
    </div>
  );
};
