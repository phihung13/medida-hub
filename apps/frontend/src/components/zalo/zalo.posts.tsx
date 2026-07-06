'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  bot,
  BotPost,
  Card,
  DangerLink,
  fmtFull,
  getBotUrl,
  inputCls,
  PrimaryButton,
  selectCls,
  SimpleButton,
  StatusChip,
  textareaCls,
} from './zalo.shared';

// ============================================================================
//  Tab "Bài viết" — thẻ duyệt COMPACT thay màn Bài viết của dashboard bot:
//  1 thẻ = header (tên nhóm + chip trạng thái) → caption → dải media →
//  "Chi tiết" (chú thích ảnh/bình luận/GBP) → MỘT hàng hành động (nút chính
//  theo ngữ cảnh + menu ⋯ cho hành động phụ). Sửa bài mở khối dưới thẻ.
// ============================================================================

type EditImage = {
  key: string;
  origIndex?: number;
  newImage?: string; // dataURL ảnh mới thêm
  url: string; // để hiển thị
  caption: string;
};

type RouteInfo = { threadId: string; folder?: string; label?: string };

type MenuItem = { label: string; danger?: boolean; onClick: () => void };

// Menu ⋯ — hành động phụ của thẻ, đóng khi bấm ra ngoài.
const MoreMenu: FC<{ items: MenuItem[]; label: string }> = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className={clsx(
          'w-[32px] h-[32px] rounded-[8px] text-[16px] leading-none font-[700] cursor-pointer transition-colors duration-150',
          open ? 'bg-boxHover text-newTextColor' : 'bg-btnSimple text-btnText hover:bg-boxHover'
        )}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-[38px] end-0 min-w-[230px] bg-newBgColorInner border border-newTableBorder rounded-[10px] shadow-xl py-[4px] flex flex-col">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={clsx(
                  'text-start px-[12px] h-[34px] text-[13px] whitespace-nowrap cursor-pointer transition-colors duration-150 hover:bg-boxHover',
                  it.danger && 'text-red-500'
                )}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const ZaloPostsTab: FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const t = useT();
  const toast = useToaster();

  const [botUrl, setBotUrl] = useState('/botapi');
  useEffect(() => setBotUrl(getBotUrl()), []);

  const [posts, setPosts] = useState<BotPost[] | null>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [filter, setFilter] = useState<'needs' | 'all' | 'done'>('needs');
  const [folder, setFolder] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Set<string>>(new Set());
  const [schedId, setSchedId] = useState<string | null>(null);

  // Khu sửa bài (1 bài một lúc)
  const [editId, setEditId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editImages, setEditImages] = useState<EditImage[]>([]);
  const [rewriting, setRewriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ps, st] = await Promise.all([
        bot('/api/posts', undefined, 20000),
        bot('/api/status').catch(() => null),
      ]);
      if (Array.isArray(ps)) setPosts(ps);
      if (st && Array.isArray(st.routes)) setRoutes(st.routes);
    } catch {
      /* giữ dữ liệu cũ khi bot chưa phản hồi */
    }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [load]);

  const refresh = useCallback(() => {
    load();
    onChanged?.();
  }, [load, onChanged]);

  // ---- Mục phụ trách (folder) ----------------------------------------------
  const folderByThread = useMemo(() => {
    const m: Record<string, string> = {};
    routes.forEach((r) => {
      if (r.threadId) m[String(r.threadId)] = (r.folder || '').trim();
    });
    return m;
  }, [routes]);

  const folderOf = useCallback(
    (d: BotPost) =>
      folderByThread[String(d.threadId)] || d.routeLabel || t('zalo_posts_other', 'Other'),
    [folderByThread, t]
  );

  const folders = useMemo(() => {
    const s = new Set<string>();
    (posts || []).forEach((d) => s.add(folderOf(d)));
    routes.forEach((r) => {
      if ((r.folder || '').trim()) s.add((r.folder || '').trim());
    });
    return [...s].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [posts, routes, folderOf]);

  // ---- Lọc ------------------------------------------------------------------
  const inScope = useMemo(
    () => (posts || []).filter((d) => !folder || folderOf(d) === folder),
    [posts, folder, folderOf]
  );
  const needs = useMemo(() => inScope.filter((d) => d.queueStatus === 'pending'), [inScope]);
  const done = useMemo(() => inScope.filter((d) => d.queueStatus !== 'pending'), [inScope]);
  const shown = filter === 'needs' ? needs : filter === 'done' ? done : inScope;

  // Bài chọn được cho duyệt hàng loạt: đang chờ và Facebook còn pending.
  const selectable = useMemo(
    () =>
      new Set(
        needs
          .filter((d) => (d.approvals?.facebook?.status || 'pending') === 'pending' && d.inPending !== false)
          .map((d) => d.id)
      ),
    [needs]
  );
  useEffect(() => {
    setSel((cur) => new Set([...cur].filter((id) => selectable.has(id))));
  }, [selectable]);

  // ---- Hành động --------------------------------------------------------------
  const act = useCallback(
    async (
      id: string,
      path: string,
      body: any,
      okMsg: string,
      confirmMsg?: string
    ): Promise<boolean> => {
      if (confirmMsg && !(await deleteDialog(confirmMsg, t('zalo_agree', 'Confirm'))))
        return false;
      setBusy(id);
      try {
        const r = await bot(path, { method: 'POST', body: JSON.stringify(body || {}) }, 180000);
        if (r?.error) {
          toast.show(r.error, 'warning');
          return false;
        }
        toast.show(okMsg, 'success');
        refresh();
        return true;
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refresh, t]
  );

  const bulk = useCallback(
    async (mode: 'public' | 'draft' | 'reject') => {
      const ids = [...sel];
      if (!ids.length) return;
      const confirmMsg =
        mode === 'reject'
          ? t('zalo_posts_bulk_reject_confirm', 'Discard {{n}} selected posts? Their images will be deleted from the bot.').replace('{{n}}', String(ids.length))
          : mode === 'public'
          ? t('zalo_posts_bulk_public_confirm', 'Publish {{n}} selected posts PUBLICLY to Facebook?').replace('{{n}}', String(ids.length))
          : t('zalo_posts_bulk_draft_confirm', 'Save {{n}} selected posts as Facebook drafts?').replace('{{n}}', String(ids.length));
      if (!(await deleteDialog(confirmMsg, t('zalo_agree', 'Confirm')))) return;
      setBusy('__bulk__');
      let ok = 0;
      for (const id of ids) {
        try {
          const r =
            mode === 'reject'
              ? await bot(`/api/pending/${id}/reject`, { method: 'POST', body: '{}' }, 60000)
              : await bot(
                  `/api/pending/${id}/approve`,
                  { method: 'POST', body: JSON.stringify({ published: mode === 'public' }) },
                  180000
                );
          if (!r?.error) ok++;
          else toast.show(r.error, 'warning');
        } catch {
          toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
        }
      }
      toast.show(
        t('zalo_posts_bulk_done', 'Done {{ok}}/{{total}} posts').replace('{{ok}}', String(ok)).replace('{{total}}', String(ids.length)),
        'success'
      );
      setSel(new Set());
      setBusy(null);
      refresh();
    },
    [sel, refresh, t]
  );

  // ---- Sửa bài ---------------------------------------------------------------
  const openEdit = useCallback((d: BotPost) => {
    setEditId(d.id);
    setEditCaption(d.caption || '');
    setEditImages(
      (d.imageUrls || []).map((u, i) => ({
        key: `orig_${i}`,
        origIndex: i,
        url: u,
        caption: (d.imageCaptions && d.imageCaptions[i]) || '',
      }))
    );
  }, []);

  const addImages = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () =>
        setEditImages((cur) => [
          ...cur,
          { key: `new_${Date.now()}_${Math.random()}`, newImage: String(reader.result), url: String(reader.result), caption: '' },
        ]);
      reader.readAsDataURL(f);
    });
  }, []);

  const moveImage = useCallback((idx: number, dir: -1 | 1) => {
    setEditImages((cur) => {
      const next = [...cur];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editId) return;
    const items = editImages.map((it) =>
      it.origIndex != null
        ? { origIndex: it.origIndex, caption: it.caption }
        : { newImage: it.newImage, caption: it.caption }
    );
    const ok = await act(
      editId,
      `/api/pending/${editId}/save`,
      { caption: editCaption, items },
      t('zalo_posts_saved', 'Post updated')
    );
    if (ok) setEditId(null);
  }, [editId, editCaption, editImages, act, t]);

  const aiRewrite = useCallback(async (d: BotPost) => {
    if (editId !== d.id) openEdit(d);
    setRewriting(true);
    try {
      const r = await bot(
        `/api/pending/${d.id}/rewrite`,
        { method: 'POST', body: JSON.stringify({ caption: editId === d.id ? editCaption : d.caption }) },
        180000
      );
      if (r?.caption) {
        setEditCaption(r.caption);
        toast.show(
          t('zalo_ai_rewrote', 'AI rewrote it — review and click "Save caption" if you like it'),
          'success'
        );
      } else toast.show(r?.error || t('zalo_ai_rewrite_failed', 'AI could not rewrite it'), 'warning');
    } catch {
      toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
    } finally {
      setRewriting(false);
    }
  }, [editId, editCaption, openEdit, t]);

  // Sửa caption bài ĐÃ ĐĂNG (cập nhật thẳng lên Facebook)
  const editPosted = useCallback(
    async (d: BotPost) => {
      const next = window.prompt(
        t('zalo_posts_edit_posted_prompt', 'Edit the caption of the published Facebook post:'),
        d.caption || ''
      );
      if (next == null || next === d.caption) return;
      await act(
        d.id,
        `/api/posted/${d.id}/edit`,
        { caption: next },
        t('zalo_posts_edit_posted_ok', 'Facebook post updated')
      );
    },
    [act, t]
  );

  const schedule = useCallback(
    async (d: BotPost, atValue: string, mode: string) => {
      if (!atValue) {
        toast.show(t('zalo_posts_pick_time', 'Pick a date & time first'), 'warning');
        return;
      }
      const at = new Date(atValue).getTime();
      if (!at || at < Date.now()) {
        toast.show(t('zalo_posts_time_future', 'The scheduled time must be in the future'), 'warning');
        return;
      }
      const ok = await act(
        d.id,
        `/api/pending/${d.id}/schedule`,
        { at, published: mode === 'public' },
        mode === 'public'
          ? t('zalo_posts_scheduled_public', 'Scheduled to PUBLISH PUBLICLY')
          : t('zalo_posts_scheduled_draft', 'Scheduled to SAVE AS DRAFT')
      );
      if (ok) setSchedId(null);
    },
    [act, t]
  );

  const toggleIn = (setter: typeof setDetail) => (id: string) =>
    setter((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleDetail = toggleIn(setDetail);
  const toggleExpanded = toggleIn(setExpanded);

  // ---- Render 1 thẻ (compact) ---------------------------------------------------
  const renderCard = (d: BotPost) => {
    const approvals = d.approvals || {};
    const fb = approvals.facebook || {};
    const fbStatus = fb.status || 'pending';
    const gbp = approvals.gbp;
    const hasGbp = !!gbp || !!d.gbpLocationId;
    const gbpStatus = (gbp && gbp.status) || (hasGbp ? 'pending' : 'none');
    const isActive = d.queueStatus === 'pending';
    const inPending = d.inPending !== false && isActive;
    const fbLinks = [...new Set([...(fb.links || []), ...(d.links || [])])].filter(Boolean);
    const gbpLinks = (gbp?.links || []).filter(Boolean);
    const imgs = d.imageUrls || [];
    const vids = d.videoUrls || [];
    const isOpen = expanded.has(d.id);
    const longCaption =
      String(d.caption || '').length > 220 || String(d.caption || '').split('\n').length > 4;
    const hasImgCaps =
      (d.imageCaptions || []).some((c) => c) || (d.videoCaptions || []).some((c) => c);
    const hasDetail = hasImgCaps || !!(d.comment || '').trim() || !!d.gbpLocationId || !!d.droppedCount;
    const editing = editId === d.id;
    const thisBusy = busy === d.id;
    const needsPublic = fbStatus === 'posted' && fb.published === false;
    const fbPendingHere = inPending && fbStatus === 'pending';
    const gbpPendingHere = inPending && hasGbp && gbpStatus === 'pending';
    const MAX_TILES = 6;
    const tiles = imgs.slice(0, MAX_TILES);
    const moreTiles = imgs.length - tiles.length;

    // ----- hành động phụ (menu ⋯) theo ngữ cảnh --------------------------------
    const menu: MenuItem[] = [];
    if (fbPendingHere) {
      menu.push({
        label: `✨ ${t('zalo_ai_rewrite', 'AI rewrite')}`,
        onClick: () => aiRewrite(d),
      });
      menu.push({
        label: `↻ ${t('zalo_posts_reload_footer', 'Reload footer')}`,
        onClick: () =>
          act(d.id, `/api/pending/${d.id}/reload-footer`, {}, t('zalo_posts_footer_reloaded', 'Latest footer applied')),
      });
      if (!d.pushedToHub) {
        menu.push({
          label: `📥 ${t('zalo_push_to_hub', 'Push to Media Hub')}`,
          onClick: () =>
            act(d.id, `/api/postiz/pending/${d.id}/push-hub`, {}, t('zalo_pushed_to_hub', 'Pushed to Media Hub — open Calendar to review & schedule')),
        });
      }
      if (d.scheduledAt) {
        menu.push({
          label: `⏰ ${t('zalo_posts_cancel_schedule', 'Cancel schedule')}`,
          onClick: () => act(d.id, `/api/pending/${d.id}/unschedule`, {}, t('zalo_posts_unscheduled', 'Schedule cancelled')),
        });
      }
      menu.push({
        label: t('zalo_posts_skip_fb', 'Skip Facebook'),
        danger: true,
        onClick: () =>
          act(d.id, `/api/pending/${d.id}/reject/facebook`, {}, t('zalo_posts_fb_removed', 'Facebook removed from this post')),
      });
    }
    if (gbpPendingHere) {
      menu.push({
        label: t('zalo_posts_skip_gbp', 'Skip Google'),
        danger: true,
        onClick: () =>
          act(d.id, `/api/pending/${d.id}/reject/gbp`, {}, t('zalo_posts_gbp_removed', 'Google Business removed from this post')),
      });
    }
    if (inPending) {
      menu.push({
        label: `🗑 ${t('zalo_reject', 'Reject')}`,
        danger: true,
        onClick: () =>
          act(
            d.id,
            `/api/pending/${d.id}/reject`,
            {},
            t('zalo_removed_from_queue', 'Removed the post from the queue'),
            t('zalo_reject_confirm', 'Discard this post? Its images will be deleted from the bot.')
          ),
      });
    }
    if (needsPublic) {
      menu.push({
        label: t('zalo_posts_delete_fb_draft', 'Delete FB draft'),
        danger: true,
        onClick: () =>
          act(
            d.id,
            `/api/posted/${d.id}/delete/facebook`,
            {},
            t('zalo_posts_fb_deleted', 'Facebook draft deleted'),
            t('zalo_posts_fb_delete_confirm', 'Delete this post from Facebook?')
          ),
      });
    }
    if (!inPending && !isActive) {
      if (fbStatus === 'posted' && !needsPublic) {
        menu.push({
          label: `✏️ ${t('zalo_posts_edit_posted', 'Edit published post')}`,
          onClick: () => editPosted(d),
        });
      }
      menu.push({
        label: `↻ ${t('zalo_posts_reload_footer', 'Reload footer')}`,
        onClick: () =>
          act(d.id, `/api/posted/${d.id}/reload-footer`, {}, t('zalo_posts_footer_reloaded_saved', 'Footer updated (saved copy only)')),
      });
      menu.push({
        label: `🔁 ${t('zalo_posts_redraft', 'Repost as draft')}`,
        onClick: () =>
          act(
            d.id,
            `/api/posted/${d.id}/redraft`,
            {},
            t('zalo_posts_redrafted', 'New draft created — check "Needs action" to approve'),
            t('zalo_posts_redraft_confirm', 'Create a NEW draft from this post (with the latest footer) to approve & publish again?')
          ),
      });
      if (gbpStatus === 'posted') {
        menu.push({
          label: t('zalo_posts_gbp_remove_list', 'Remove Google from list'),
          danger: true,
          onClick: () =>
            act(d.id, `/api/posted/${d.id}/remove/gbp`, {}, t('zalo_posts_gbp_removed_list', 'Google Business removed from the list')),
        });
      }
      if (fbStatus === 'posted' && !needsPublic) {
        menu.push({
          label: `🗑 ${t('zalo_posts_delete_fb', 'Delete from Facebook')}`,
          danger: true,
          onClick: () =>
            act(
              d.id,
              `/api/posted/${d.id}/delete/facebook`,
              {},
              t('zalo_posts_fb_deleted_pub', 'Deleted from Facebook'),
              t('zalo_posts_fb_delete_pub_confirm', 'Delete this PUBLISHED post from Facebook? This cannot be undone.')
            ),
        });
      }
      menu.push({
        label: `🗑 ${t('zalo_posts_remove_from_list', 'Remove from list')}`,
        danger: true,
        onClick: () =>
          act(
            d.id,
            `/api/posted/${d.id}/remove`,
            {},
            t('zalo_posts_removed_list', 'Removed from the processed list'),
            t('zalo_posts_remove_confirm', 'Remove this post from the list? Posts on Facebook/Google are NOT affected.')
          ),
      });
    }

    return (
      <div key={d.id} className="border border-newTableBorder rounded-[12px]">
        {/* ---- Header: avatar + tên + meta + chip -------------------------- */}
        <div className="flex items-start gap-[10px] p-[14px] pb-[10px]">
          <div className="w-[30px] h-[30px] rounded-[8px] bg-btnSimple flex items-center justify-center text-[13px] font-[700] shrink-0">
            {(String(d.routeLabel || 'Z').trim()[0] || 'Z').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-[8px] flex-wrap">
              <span className="text-[13.5px] font-[600] truncate max-w-full">
                {d.routeLabel || d.id}
              </span>
              <span className="text-[11.5px] text-textItemBlur whitespace-nowrap">
                {fmtFull(d.postedAt || d.createdAt || 0)}
                {imgs.length ? ` · ${imgs.length} ${t('zalo_images_unit', 'images')}` : ''}
                {vids.length ? ` · ${vids.length} video` : ''}
              </span>
            </div>
            <div className="flex items-center gap-[6px] mt-[4px] flex-wrap">
              <StatusChip tone={isActive ? 'warn' : 'ok'}>
                {isActive ? t('zalo_posts_needs_action', 'Needs action') : t('zalo_posts_done_chip', 'Done')}
              </StatusChip>
              {fbStatus === 'pending' ? (
                <StatusChip tone="wait">{t('zalo_posts_fb_waiting', 'Facebook waiting')}</StatusChip>
              ) : needsPublic ? (
                <StatusChip tone="warn">{t('zalo_posts_fb_draft', 'Facebook draft')}</StatusChip>
              ) : fbStatus === 'posted' ? (
                <StatusChip tone="ok">{t('zalo_posts_fb_public', 'Facebook published')}</StatusChip>
              ) : (
                <StatusChip tone="off">{t('zalo_posts_fb_skipped', 'Facebook skipped')}</StatusChip>
              )}
              {hasGbp &&
                (gbpStatus === 'pending' ? (
                  <StatusChip tone="wait">{t('zalo_posts_gbp_waiting', 'Google waiting')}</StatusChip>
                ) : gbpStatus === 'posted' ? (
                  <StatusChip tone="ok">{t('zalo_posts_gbp_posted', 'Google posted')}</StatusChip>
                ) : (
                  <StatusChip tone="off">{t('zalo_posts_gbp_skipped', 'Google skipped')}</StatusChip>
                ))}
              {d.pushedToHub && <StatusChip tone="ok">{t('zalo_posts_in_hub', 'In Media Hub')}</StatusChip>}
              {!!d.scheduledAt && (
                <StatusChip tone="warn">
                  ⏰ {fmtFull(d.scheduledAt)} ·{' '}
                  {d.scheduledPublished !== false
                    ? t('zalo_posts_sched_public_chip', 'publish')
                    : t('zalo_posts_sched_draft_chip', 'draft')}
                </StatusChip>
              )}
            </div>
          </div>
          {selectable.has(d.id) && (
            <input
              type="checkbox"
              className="w-[17px] h-[17px] mt-[2px] cursor-pointer accent-btnPrimary shrink-0"
              checked={sel.has(d.id)}
              onChange={(e) =>
                setSel((cur) => {
                  const next = new Set(cur);
                  if (e.target.checked) next.add(d.id);
                  else next.delete(d.id);
                  return next;
                })
              }
              title={t('zalo_posts_select_bulk', 'Select for bulk approval')}
            />
          )}
        </div>

        {/* ---- Caption ------------------------------------------------------ */}
        {!!(d.caption || '').trim() && (
          <div className="px-[14px] pb-[4px]">
            <div
              className={clsx(
                'text-[13px] leading-[1.6] whitespace-pre-wrap',
                longCaption && !isOpen && 'line-clamp-3'
              )}
            >
              {d.caption}
            </div>
            {longCaption && (
              <span
                onClick={() => toggleExpanded(d.id)}
                className="text-[12px] font-[600] text-textItemBlur hover:text-newTextColor cursor-pointer transition-colors duration-150"
              >
                {isOpen ? t('zalo_posts_collapse', 'collapse') : `… ${t('zalo_posts_see_more', 'see more')}`}
              </span>
            )}
          </div>
        )}

        {/* ---- Media strip ---------------------------------------------------- */}
        {(!!imgs.length || !!vids.length) && (
          <div className="flex gap-[6px] overflow-x-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner px-[14px] py-[8px]">
            {tiles.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`${botUrl}${u}`}
                alt={d.imageCaptions?.[i] || `Ảnh ${i + 1}`}
                title={d.imageCaptions?.[i] || ''}
                className="h-[72px] w-[72px] object-cover rounded-[8px] border border-newTableBorder shrink-0"
                loading="lazy"
              />
            ))}
            {moreTiles > 0 && (
              <div
                onClick={() => toggleDetail(d.id)}
                className="h-[72px] w-[72px] rounded-[8px] bg-btnSimple flex items-center justify-center text-[12.5px] font-[700] shrink-0 cursor-pointer hover:bg-boxHover transition-colors duration-150"
                title={t('zalo_posts_detail', 'Details')}
              >
                +{moreTiles}
              </div>
            )}
            {vids.map((u, i) => (
              <video
                key={`v${i}`}
                src={`${botUrl}${u}`}
                controls
                preload="metadata"
                className="h-[72px] rounded-[8px] border border-newTableBorder shrink-0"
              />
            ))}
          </div>
        )}

        {/* ---- Chi tiết (chú thích ảnh · bình luận · GBP) --------------------- */}
        {hasDetail && (
          <div className="px-[14px] pb-[6px]">
            <span
              onClick={() => toggleDetail(d.id)}
              className="text-[12px] font-[600] text-textItemBlur hover:text-newTextColor cursor-pointer transition-colors duration-150"
            >
              {detail.has(d.id) ? '▾' : '▸'} {t('zalo_posts_detail', 'Details')}
            </span>
            {detail.has(d.id) && (
              <div className="flex flex-col gap-[8px] mt-[8px]">
                {!!(d.comment || '').trim() && (
                  <div className="text-[12.5px] bg-btnSimple rounded-[8px] px-[10px] py-[7px]">
                    <b>{t('zalo_posts_first_comment', 'First comment:')}</b> {d.comment}
                  </div>
                )}
                {!!d.gbpLocationId && (
                  <div className="text-[12px] text-textItemBlur">Google Business ID: {d.gbpLocationId}</div>
                )}
                {!!d.droppedCount && (
                  <div className="text-[12px] text-textItemBlur">
                    {t('zalo_posts_dropped', 'filtered out')}: {d.droppedCount}
                  </div>
                )}
                {hasImgCaps &&
                  [...imgs.entries()].map(([i, u]) => (
                    <div key={i} className="flex gap-[10px] items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${botUrl}${u}`}
                        alt=""
                        className="w-[36px] h-[36px] object-cover rounded-[6px] border border-newTableBorder shrink-0"
                        loading="lazy"
                      />
                      <div className="text-[12.5px] text-textItemBlur leading-[1.5]">
                        <b className="text-newTextColor">
                          {t('zalo_posts_image_n', 'Image {{n}}').replace('{{n}}', String(i + 1))}
                        </b>{' '}
                        {(d.imageCaptions && d.imageCaptions[i]) || t('zalo_posts_no_cap', '(none)')}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Link đã đăng ---------------------------------------------------- */}
        {(!!fbLinks.length || !!gbpLinks.length) && (
          <div className="flex gap-[8px] flex-wrap px-[14px] pb-[8px]">
            {fbLinks.map((l) => (
              <a
                key={l}
                href={l}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-[600] text-btnPrimary border border-newTableBorder rounded-full px-[10px] h-[26px] inline-flex items-center hover:bg-boxHover transition-colors duration-150"
              >
                Facebook ↗
              </a>
            ))}
            {gbpLinks.map((l) => (
              <a
                key={l}
                href={l}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-[600] text-btnPrimary border border-newTableBorder rounded-full px-[10px] h-[26px] inline-flex items-center hover:bg-boxHover transition-colors duration-150"
              >
                Google ↗
              </a>
            ))}
          </div>
        )}

        {/* ---- Hẹn giờ (mở từ nút ⏰) ------------------------------------------ */}
        {fbPendingHere && schedId === d.id && !d.scheduledAt && (
          <div className="mx-[14px] mb-[10px] border border-dashed border-newTableBorder rounded-[10px] p-[10px]">
            <ScheduleRow onSchedule={(at, mode) => schedule(d, at, mode)} busy={thisBusy} />
          </div>
        )}

        {/* ---- MỘT hàng hành động ---------------------------------------------- */}
        <div className="flex items-center gap-[8px] px-[14px] py-[10px] border-t border-newTableBorder flex-wrap">
          {fbPendingHere && (
            <>
              <PrimaryButton
                className="!h-[32px] !px-[14px] text-[12.5px]"
                disabled={thisBusy}
                onClick={() =>
                  act(
                    d.id,
                    `/api/pending/${d.id}/approve`,
                    { published: true },
                    t('zalo_fb_published', 'Published publicly to Facebook'),
                    t('zalo_fb_publish_confirm', 'Publish this post PUBLICLY to Facebook now?')
                  )
                }
              >
                {t('zalo_posts_fb_go_public', 'Publish publicly')}
              </PrimaryButton>
              <SimpleButton
                className="!h-[32px] !px-[14px] text-[12.5px]"
                disabled={thisBusy}
                onClick={() =>
                  act(
                    d.id,
                    `/api/pending/${d.id}/approve`,
                    { published: false },
                    t('zalo_posts_fb_saved_draft', 'Saved as a Facebook draft')
                  )
                }
              >
                {t('zalo_posts_fb_save_draft', 'Save draft')}
              </SimpleButton>
            </>
          )}
          {needsPublic && (
            <PrimaryButton
              className="!h-[32px] !px-[14px] text-[12.5px]"
              disabled={thisBusy}
              onClick={() =>
                act(
                  d.id,
                  `/api/posted/${d.id}/publish`,
                  {},
                  t('zalo_posts_now_public', 'The draft is now PUBLIC on Facebook'),
                  t('zalo_posts_publish_confirm', 'Publish this Facebook draft publicly?')
                )
              }
            >
              {t('zalo_posts_fb_go_public', 'Publish publicly')}
            </PrimaryButton>
          )}
          {gbpPendingHere && (
            <SimpleButton
              className="!h-[32px] !px-[14px] text-[12.5px]"
              disabled={thisBusy}
              onClick={() =>
                act(
                  d.id,
                  `/api/pending/${d.id}/approve/gbp`,
                  {},
                  t('zalo_posts_gbp_published', 'Posted to Google Business'),
                  t('zalo_posts_gbp_confirm', 'Post to Google Business now?')
                )
              }
            >
              {t('zalo_posts_gbp_publish', 'Post to Google Business')}
            </SimpleButton>
          )}
          <div className="flex-1" />
          {fbPendingHere && !d.scheduledAt && (
            <button
              onClick={() => setSchedId((cur) => (cur === d.id ? null : d.id))}
              title={t('zalo_posts_schedule_label', 'Schedule (instead of posting now)')}
              className={clsx(
                'h-[32px] px-[10px] rounded-[8px] text-[12.5px] font-[600] cursor-pointer transition-colors duration-150',
                schedId === d.id ? 'bg-boxHover text-newTextColor' : 'bg-btnSimple text-btnText hover:bg-boxHover'
              )}
            >
              ⏰ {t('zalo_posts_schedule_btn', 'Schedule')}
            </button>
          )}
          {inPending && (
            <button
              onClick={() => (editing ? setEditId(null) : openEdit(d))}
              className={clsx(
                'h-[32px] px-[10px] rounded-[8px] text-[12.5px] font-[600] cursor-pointer transition-colors duration-150',
                editing ? 'bg-boxHover text-newTextColor' : 'bg-btnSimple text-btnText hover:bg-boxHover'
              )}
            >
              ✏️ {editing ? t('zalo_close', 'Close') : t('zalo_posts_edit', 'Edit')}
            </button>
          )}
          <MoreMenu items={menu} label={t('zalo_posts_more_actions', 'More actions')} />
        </div>

        {/* ---- Khu sửa bài ------------------------------------------------------ */}
        {editing && (
          <div className="border-t border-newTableBorder p-[14px] flex flex-col gap-[10px]">
            <div className="text-[13px] font-[700]">{t('zalo_posts_edit_area', 'Edit post')}</div>
            <textarea
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              rows={8}
              className={textareaCls}
            />
            {!!editImages.length && (
              <>
                <div className="text-[12.5px] text-textItemBlur">
                  {t('zalo_posts_edit_imgs_hint', 'Images — use ↑↓ to reorder (top-down = posting order), ✕ to remove, or add new images.')}
                </div>
                <div className="flex flex-col gap-[8px]">
                  {editImages.map((it, i) => (
                    <div key={it.key} className="flex items-center gap-[8px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.origIndex != null ? `${botUrl}${it.url}` : it.url}
                        alt=""
                        className="w-[48px] h-[48px] object-cover rounded-[8px] border border-newTableBorder shrink-0"
                      />
                      <input
                        value={it.caption}
                        onChange={(e) =>
                          setEditImages((cur) =>
                            cur.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x))
                          )
                        }
                        placeholder={t('zalo_posts_img_cap_placeholder', 'Caption for this image (optional)')}
                        className={clsx(inputCls, 'flex-1 !h-[32px]')}
                      />
                      <SimpleButton className="!h-[32px] !px-[10px]" onClick={() => moveImage(i, -1)}>
                        ↑
                      </SimpleButton>
                      <SimpleButton className="!h-[32px] !px-[10px]" onClick={() => moveImage(i, 1)}>
                        ↓
                      </SimpleButton>
                      <DangerLink onClick={() => setEditImages((cur) => cur.filter((_, j) => j !== i))}>
                        ✕
                      </DangerLink>
                    </div>
                  ))}
                </div>
              </>
            )}
            <label className="inline-flex items-center gap-[6px] cursor-pointer text-[12.5px] font-[600] text-btnPrimary w-fit">
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addImages(e.target.files);
                  e.target.value = '';
                }}
              />
              🖼 {t('zalo_posts_add_images', 'Add images')}
            </label>
            <div className="flex gap-[8px] flex-wrap">
              <PrimaryButton className="!h-[34px] text-[13px]" disabled={thisBusy} onClick={saveEdit}>
                {t('zalo_posts_save_edit', 'Save changes')}
              </PrimaryButton>
              <SimpleButton className="!h-[34px] text-[13px]" disabled={rewriting} onClick={() => aiRewrite(d)}>
                ✨ {rewriting ? t('zalo_posts_rewriting', 'Rewriting…') : t('zalo_ai_rewrite', 'AI rewrite')}
              </SimpleButton>
              <SimpleButton className="!h-[34px] text-[13px]" onClick={() => setEditId(null)}>
                {t('zalo_close', 'Close')}
              </SimpleButton>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ---- Render tab ---------------------------------------------------------------
  if (posts === null) {
    return (
      <div className="text-[13px] text-textItemBlur py-[30px] text-center">
        {t('zalo_posts_loading', 'Loading posts from the bot…')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Toolbar lọc */}
      <div className="flex items-center gap-[10px] flex-wrap">
        <div className="flex border border-newTableBorder rounded-[8px] overflow-hidden">
          {(
            [
              ['needs', `${t('zalo_posts_filter_needs', 'Needs action')}${needs.length ? ` (${needs.length})` : ''}`],
              ['all', `${t('zalo_posts_filter_all', 'All')}${inScope.length ? ` (${inScope.length})` : ''}`],
              ['done', `${t('zalo_posts_filter_done', 'Done')}${done.length ? ` (${done.length})` : ''}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={clsx(
                'h-[34px] px-[14px] text-[12.5px] font-[600] cursor-pointer transition-colors duration-150',
                filter === k ? 'bg-btnPrimary text-white' : 'bg-newBgColorInner text-textItemBlur hover:bg-boxHover'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {folders.length > 1 && (
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className={clsx(selectCls, '!w-auto min-w-[170px] !h-[34px]')}
            title={t('zalo_posts_folder_title', 'Filter posts by the person/section in charge')}
          >
            <option value="">{t('zalo_posts_all_folders', '— All sections —')}</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <span onClick={refresh} className="cursor-pointer text-[12.5px] font-[600] text-btnPrimary">
          ↻ {t('zalo_refresh', 'Refresh')}
        </span>
      </div>

      {/* Thanh duyệt hàng loạt */}
      {!!selectable.size && (
        <div className="flex items-center gap-[10px] flex-wrap border border-newTableBorder rounded-[10px] px-[12px] py-[8px]">
          <label className="flex items-center gap-[6px] text-[12.5px] font-[600] cursor-pointer">
            <input
              type="checkbox"
              className="w-[16px] h-[16px] accent-btnPrimary"
              checked={sel.size === selectable.size && !!selectable.size}
              onChange={(e) => setSel(e.target.checked ? new Set(selectable) : new Set())}
            />
            {t('zalo_posts_select_all', 'Select all')}
          </label>
          <span className="text-[12.5px] text-textItemBlur">
            {t('zalo_posts_selected_n', '{{n}} selected').replace('{{n}}', String(sel.size))}
          </span>
          <div className="flex-1" />
          <PrimaryButton
            className="!h-[32px] text-[12.5px]"
            disabled={!sel.size || busy === '__bulk__'}
            onClick={() => bulk('public')}
          >
            {t('zalo_posts_bulk_public', 'Publish publicly')}
          </PrimaryButton>
          <SimpleButton
            className="!h-[32px] text-[12.5px]"
            disabled={!sel.size || busy === '__bulk__'}
            onClick={() => bulk('draft')}
          >
            {t('zalo_posts_bulk_draft', 'Save drafts')}
          </SimpleButton>
          <DangerLink onClick={() => sel.size && busy !== '__bulk__' && bulk('reject')}>
            {t('zalo_posts_bulk_reject', 'Reject')}
          </DangerLink>
        </div>
      )}

      {!shown.length && (
        <Card>
          <div className="text-[13px] text-textItemBlur text-center py-[20px] leading-[1.6]">
            {posts.length
              ? t('zalo_posts_none_filter', 'No posts match this filter.')
              : t('zalo_posts_none', 'No posts yet. When someone sends images into a listened Zalo group, drafts will appear here.')}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-[12px]">{shown.map(renderCard)}</div>
    </div>
  );
};

// Hàng hẹn giờ — state datetime cục bộ cho từng thẻ.
const ScheduleRow: FC<{ onSchedule: (at: string, mode: string) => void; busy?: boolean }> = ({
  onSchedule,
  busy,
}) => {
  const t = useT();
  const [at, setAt] = useState('');
  const [mode, setMode] = useState('public');
  return (
    <div className="flex items-end gap-[8px] flex-wrap">
      <div className="flex flex-col gap-[4px]">
        <div className="text-[11.5px] font-[600] text-textItemBlur">
          ⏰ {t('zalo_posts_schedule_label', 'Schedule (instead of posting now)')}
        </div>
        <input
          type="datetime-local"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          className={clsx(inputCls, '!w-auto !h-[34px]')}
        />
      </div>
      <div className="flex flex-col gap-[4px]">
        <div className="text-[11.5px] font-[600] text-textItemBlur">
          {t('zalo_posts_schedule_mode', 'When the time comes')}
        </div>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className={clsx(selectCls, '!w-auto !h-[34px]')}
        >
          <option value="public">{t('zalo_posts_fb_go_public', 'Publish publicly')}</option>
          <option value="draft">{t('zalo_posts_fb_save_draft', 'Save draft')}</option>
        </select>
      </div>
      <SimpleButton className="!h-[34px] text-[12.5px]" disabled={busy} onClick={() => onSchedule(at, mode)}>
        {t('zalo_posts_schedule_btn', 'Schedule')}
      </SimpleButton>
    </div>
  );
};
