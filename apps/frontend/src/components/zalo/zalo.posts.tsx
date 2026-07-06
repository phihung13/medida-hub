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
//  Tab "Bài viết" — thay thế hoàn toàn màn Bài viết của dashboard bot :8088.
//  Thẻ duyệt: ảnh/video, caption (sửa + AI viết lại + tải lại chân bài),
//  chú thích từng ảnh, sắp xếp/thêm/bỏ ảnh, hẹn giờ, duyệt Facebook (công
//  khai/nháp), duyệt Google Business, bỏ từng kênh, từ chối, duyệt hàng loạt.
//  Bài đã xong: đăng công khai bản nháp, xoá FB, đăng nháp lại, xoá khỏi
//  danh sách, sửa caption bài đã đăng.
// ============================================================================

type EditImage = {
  key: string;
  origIndex?: number;
  newImage?: string; // dataURL ảnh mới thêm
  url: string; // để hiển thị
  caption: string;
};

type RouteInfo = { threadId: string; folder?: string; label?: string };

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
  const [capsOpen, setCapsOpen] = useState<Set<string>>(new Set());

  // Khu sửa bài (1 bài một lúc — giống dashboard cũ mở khối Sửa dưới thẻ)
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
      await act(
        d.id,
        `/api/pending/${d.id}/schedule`,
        { at, published: mode === 'public' },
        mode === 'public'
          ? t('zalo_posts_scheduled_public', 'Scheduled to PUBLISH PUBLICLY')
          : t('zalo_posts_scheduled_draft', 'Scheduled to SAVE AS DRAFT')
      );
    },
    [act, t]
  );

  // ---- Render 1 thẻ -----------------------------------------------------------
  const renderCard = (d: BotPost) => {
    const approvals = d.approvals || {};
    const fb = approvals.facebook || {};
    const fbStatus = fb.status || 'pending';
    const pub = d.published !== undefined ? !!d.published : fb.published !== false;
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
      String(d.caption || '').length > 260 || String(d.caption || '').split('\n').length > 5;
    const hasImgCaps =
      (d.imageCaptions || []).some((c) => c) || (d.videoCaptions || []).some((c) => c);
    const editing = editId === d.id;
    const thisBusy = busy === d.id;
    const needsPublic = fbStatus === 'posted' && fb.published === false;

    return (
      <div
        key={d.id}
        className="border border-newTableBorder rounded-[12px] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start gap-[10px] p-[14px] pb-[8px] flex-wrap">
          <div className="w-[36px] h-[36px] rounded-[8px] bg-btnSimple flex items-center justify-center text-[15px] font-[700] shrink-0">
            {(String(d.routeLabel || 'Z').trim()[0] || 'Z').toUpperCase()}
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="text-[14px] font-[600] truncate">{d.routeLabel || d.id}</div>
            <div className="text-[11.5px] text-textItemBlur">
              {fmtFull(d.postedAt || d.createdAt || 0)} · {imgs.length}{' '}
              {t('zalo_images_unit', 'images')}
              {vids.length ? ` + ${vids.length} video` : ''}
              {d.droppedCount
                ? ` · ${t('zalo_posts_dropped', 'filtered out')} ${d.droppedCount}`
                : ''}
            </div>
            <div className="flex items-center gap-[6px] mt-[4px] flex-wrap">
              <StatusChip tone={isActive ? 'warn' : 'ok'}>
                {isActive ? t('zalo_posts_needs_action', 'Needs action') : t('zalo_posts_done_chip', 'Done')}
              </StatusChip>
              {fbStatus === 'pending' ? (
                <StatusChip tone="wait">{t('zalo_posts_fb_waiting', 'Facebook waiting')}</StatusChip>
              ) : fbStatus === 'posted' ? (
                <StatusChip tone={fb.published === false ? 'warn' : 'ok'}>
                  {fb.published === false
                    ? t('zalo_posts_fb_draft', 'Facebook draft')
                    : t('zalo_posts_fb_public', 'Facebook published')}
                </StatusChip>
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
              {d.pushedToHub && (
                <StatusChip tone="ok">{t('zalo_posts_in_hub', 'In Media Hub')}</StatusChip>
              )}
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
              className="w-[18px] h-[18px] mt-[4px] cursor-pointer accent-btnPrimary"
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

        {/* Caption */}
        <div
          className={clsx(
            'px-[14px] text-[13px] leading-[1.6] whitespace-pre-wrap',
            longCaption && !isOpen && 'line-clamp-5'
          )}
        >
          {d.caption || (
            <span className="text-textItemBlur">{t('zalo_no_caption_yet', '(no caption yet — click to write)')}</span>
          )}
        </div>
        {longCaption && (
          <span
            onClick={() =>
              setExpanded((cur) => {
                const next = new Set(cur);
                if (next.has(d.id)) next.delete(d.id);
                else next.add(d.id);
                return next;
              })
            }
            className="px-[14px] text-[12.5px] font-[600] text-btnPrimary cursor-pointer"
          >
            {isOpen ? t('zalo_posts_collapse', 'collapse') : t('zalo_posts_see_more', 'see more')}
          </span>
        )}

        {/* Media */}
        {(!!imgs.length || !!vids.length) && (
          <div className="flex gap-[8px] overflow-x-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner p-[14px] pb-[6px]">
            {imgs.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`${botUrl}${u}`}
                alt={d.imageCaptions?.[i] || `Ảnh ${i + 1}`}
                title={d.imageCaptions?.[i] || ''}
                className="h-[110px] w-[110px] object-cover rounded-[8px] border border-newTableBorder shrink-0"
                loading="lazy"
              />
            ))}
            {vids.map((u, i) => (
              <video
                key={`v${i}`}
                src={`${botUrl}${u}`}
                controls
                className="h-[110px] rounded-[8px] border border-newTableBorder shrink-0"
              />
            ))}
          </div>
        )}

        {/* Chú thích từng ảnh */}
        {hasImgCaps && (
          <div className="px-[14px] pt-[6px]">
            <span
              onClick={() =>
                setCapsOpen((cur) => {
                  const next = new Set(cur);
                  if (next.has(d.id)) next.delete(d.id);
                  else next.add(d.id);
                  return next;
                })
              }
              className="text-[12.5px] font-[600] text-btnPrimary cursor-pointer"
            >
              {capsOpen.has(d.id)
                ? `▾ ${t('zalo_posts_img_caps', 'Per-image captions (AI)')}`
                : `▸ ${t('zalo_posts_img_caps', 'Per-image captions (AI)')}`}
            </span>
            {capsOpen.has(d.id) && (
              <div className="flex flex-col gap-[6px] mt-[6px]">
                {imgs.map((u, i) => (
                  <div key={i} className="flex gap-[10px] items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${botUrl}${u}`}
                      alt=""
                      className="w-[38px] h-[38px] object-cover rounded-[6px] border border-newTableBorder shrink-0"
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

        {/* Bình luận đầu tự động */}
        {!!(d.comment || '').trim() && (
          <div className="mx-[14px] mt-[8px] text-[12.5px] bg-btnSimple rounded-[8px] px-[10px] py-[7px]">
            <b>{t('zalo_posts_first_comment', 'First comment:')}</b> {d.comment}
          </div>
        )}

        {/* Link đã đăng */}
        {(!!fbLinks.length || !!gbpLinks.length) && (
          <div className="flex gap-[8px] flex-wrap px-[14px] pt-[10px]">
            {fbLinks.map((l) => (
              <a
                key={l}
                href={l}
                target="_blank"
                rel="noreferrer"
                className="text-[12.5px] font-[600] text-btnPrimary border border-newTableBorder rounded-[6px] px-[10px] h-[28px] inline-flex items-center hover:bg-boxHover"
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
                className="text-[12.5px] font-[600] text-btnPrimary border border-newTableBorder rounded-[6px] px-[10px] h-[28px] inline-flex items-center hover:bg-boxHover"
              >
                Google ↗
              </a>
            ))}
          </div>
        )}

        {/* Kênh: Facebook + Google Business */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px] p-[14px]">
          <div className="border border-newTableBorder rounded-[10px] p-[12px] flex flex-col gap-[8px]">
            <div className="flex items-center justify-between">
              <b className="text-[13px]">Facebook</b>
              {fbStatus === 'pending' ? (
                <StatusChip tone="wait">{t('zalo_posts_waiting', 'Waiting')}</StatusChip>
              ) : needsPublic ? (
                <StatusChip tone="warn">{t('zalo_posts_fb_draft', 'Facebook draft')}</StatusChip>
              ) : fbStatus === 'posted' ? (
                <StatusChip tone="ok">{t('zalo_posts_posted', 'Posted')}</StatusChip>
              ) : (
                <StatusChip tone="off">{t('zalo_posts_skipped', 'Skipped')}</StatusChip>
              )}
            </div>
            {inPending && fbStatus === 'pending' && (
              <div className="flex gap-[8px] flex-wrap items-center">
                <PrimaryButton
                  className="!h-[32px] text-[12.5px]"
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
                  className="!h-[32px] text-[12.5px]"
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
                <DangerLink
                  onClick={() =>
                    act(
                      d.id,
                      `/api/pending/${d.id}/reject/facebook`,
                      {},
                      t('zalo_posts_fb_removed', 'Facebook removed from this post')
                    )
                  }
                >
                  {t('zalo_posts_skip_fb', 'Skip Facebook')}
                </DangerLink>
              </div>
            )}
            {needsPublic && (
              <div className="flex gap-[8px] flex-wrap items-center">
                <PrimaryButton
                  className="!h-[32px] text-[12.5px]"
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
                <DangerLink
                  onClick={() =>
                    act(
                      d.id,
                      `/api/posted/${d.id}/delete/facebook`,
                      {},
                      t('zalo_posts_fb_deleted', 'Facebook draft deleted'),
                      t('zalo_posts_fb_delete_confirm', 'Delete this post from Facebook?')
                    )
                  }
                >
                  {t('zalo_posts_delete_fb_draft', 'Delete FB draft')}
                </DangerLink>
              </div>
            )}
            {fbStatus === 'posted' && !needsPublic && (
              <div className="flex gap-[10px] flex-wrap items-center">
                <SimpleButton className="!h-[32px] text-[12.5px]" onClick={() => editPosted(d)}>
                  ✏️ {t('zalo_posts_edit_posted', 'Edit published post')}
                </SimpleButton>
                <DangerLink
                  onClick={() =>
                    act(
                      d.id,
                      `/api/posted/${d.id}/delete/facebook`,
                      {},
                      t('zalo_posts_fb_deleted_pub', 'Deleted from Facebook'),
                      t('zalo_posts_fb_delete_pub_confirm', 'Delete this PUBLISHED post from Facebook? This cannot be undone.')
                    )
                  }
                >
                  {t('zalo_posts_delete_fb', 'Delete from Facebook')}
                </DangerLink>
              </div>
            )}
            {fbStatus === 'rejected' && (
              <div className="text-[12.5px] text-textItemBlur">
                {t('zalo_posts_fb_was_skipped', 'Facebook was skipped for this post.')}
              </div>
            )}
          </div>

          {hasGbp && (
            <div className="border border-newTableBorder rounded-[10px] p-[12px] flex flex-col gap-[8px]">
              <div className="flex items-center justify-between">
                <b className="text-[13px]">Google Business</b>
                {gbpStatus === 'pending' ? (
                  <StatusChip tone="wait">{t('zalo_posts_waiting', 'Waiting')}</StatusChip>
                ) : gbpStatus === 'posted' ? (
                  <StatusChip tone="ok">{t('zalo_posts_posted', 'Posted')}</StatusChip>
                ) : (
                  <StatusChip tone="off">{t('zalo_posts_skipped', 'Skipped')}</StatusChip>
                )}
              </div>
              {!!d.gbpLocationId && (
                <div className="text-[11.5px] text-textItemBlur">ID: {d.gbpLocationId}</div>
              )}
              {inPending && gbpStatus === 'pending' && (
                <div className="flex gap-[8px] flex-wrap items-center">
                  <PrimaryButton
                    className="!h-[32px] text-[12.5px]"
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
                  </PrimaryButton>
                  <DangerLink
                    onClick={() =>
                      act(
                        d.id,
                        `/api/pending/${d.id}/reject/gbp`,
                        {},
                        t('zalo_posts_gbp_removed', 'Google Business removed from this post')
                      )
                    }
                  >
                    {t('zalo_posts_skip_gbp', 'Skip Google')}
                  </DangerLink>
                </div>
              )}
              {gbpStatus === 'posted' && (
                <DangerLink
                  onClick={() =>
                    act(
                      d.id,
                      `/api/posted/${d.id}/remove/gbp`,
                      {},
                      t('zalo_posts_gbp_removed_list', 'Google Business removed from the list')
                    )
                  }
                >
                  {t('zalo_posts_gbp_remove_list', 'Remove Google from list')}
                </DangerLink>
              )}
              {gbpStatus === 'rejected' && (
                <div className="text-[12.5px] text-textItemBlur">
                  {t('zalo_posts_gbp_was_skipped', 'Google Business was skipped.')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hẹn giờ (chỉ bài chờ, FB còn pending) */}
        {inPending && fbStatus === 'pending' && (
          <div className="mx-[14px] mb-[10px] border border-dashed border-newTableBorder rounded-[10px] p-[10px]">
            {d.scheduledAt ? (
              <div className="flex items-center gap-[10px] flex-wrap text-[12.5px]">
                <span>
                  ⏰{' '}
                  {t('zalo_posts_will_auto', 'Will automatically {{mode}} at {{time}}')
                    .replace(
                      '{{mode}}',
                      d.scheduledPublished !== false
                        ? t('zalo_posts_sched_public_chip', 'publish')
                        : t('zalo_posts_sched_draft_chip', 'draft')
                    )
                    .replace('{{time}}', fmtFull(d.scheduledAt))}
                </span>
                <DangerLink
                  onClick={() =>
                    act(d.id, `/api/pending/${d.id}/unschedule`, {}, t('zalo_posts_unscheduled', 'Schedule cancelled'))
                  }
                >
                  {t('zalo_posts_cancel_schedule', 'Cancel schedule')}
                </DangerLink>
              </div>
            ) : (
              <ScheduleRow
                onSchedule={(at, mode) => schedule(d, at, mode)}
                busy={thisBusy}
              />
            )}
          </div>
        )}

        {/* Hàng tiện ích */}
        <div className="flex items-center gap-[14px] flex-wrap px-[14px] pb-[14px] text-[12.5px]">
          {inPending ? (
            <>
              <span
                onClick={() => (editing ? setEditId(null) : openEdit(d))}
                className="cursor-pointer font-[600] text-btnPrimary"
              >
                ✏️ {editing ? t('zalo_close', 'Close') : t('zalo_posts_edit', 'Edit')}
              </span>
              <span
                onClick={() => !rewriting && aiRewrite(d)}
                className={clsx('cursor-pointer font-[600] text-btnPrimary', rewriting && 'opacity-50')}
              >
                ✨ {rewriting && editing ? t('zalo_posts_rewriting', 'Rewriting…') : t('zalo_ai_rewrite', 'AI rewrite')}
              </span>
              <span
                onClick={() =>
                  act(d.id, `/api/pending/${d.id}/reload-footer`, {}, t('zalo_posts_footer_reloaded', 'Latest footer applied'))
                }
                className="cursor-pointer font-[600] text-btnPrimary"
                title={t('zalo_posts_footer_title', 'Apply the latest footer/contact block from Groups → Pages')}
              >
                ↻ {t('zalo_posts_reload_footer', 'Reload footer')}
              </span>
              {!d.pushedToHub && (
                <span
                  onClick={() =>
                    act(
                      d.id,
                      `/api/postiz/pending/${d.id}/push-hub`,
                      {},
                      t('zalo_pushed_to_hub', 'Pushed to Media Hub — open Calendar to review & schedule')
                    )
                  }
                  className="cursor-pointer font-[600] text-btnPrimary"
                >
                  📥 {t('zalo_push_to_hub', 'Push to Media Hub')}
                </span>
              )}
              <div className="flex-1" />
              <DangerLink
                onClick={() =>
                  act(
                    d.id,
                    `/api/pending/${d.id}/reject`,
                    {},
                    t('zalo_removed_from_queue', 'Removed the post from the queue'),
                    t('zalo_reject_confirm', 'Discard this post? Its images will be deleted from the bot.')
                  )
                }
              >
                🗑 {t('zalo_reject', 'Reject')}
              </DangerLink>
            </>
          ) : (
            <>
              <span
                onClick={() =>
                  act(d.id, `/api/posted/${d.id}/reload-footer`, {}, t('zalo_posts_footer_reloaded_saved', 'Footer updated (saved copy only)'))
                }
                className="cursor-pointer font-[600] text-btnPrimary"
                title={t('zalo_posts_footer_posted_title', 'Updates the saved copy only — the Facebook post is not modified')}
              >
                ↻ {t('zalo_posts_reload_footer', 'Reload footer')}
              </span>
              <span
                onClick={() =>
                  act(
                    d.id,
                    `/api/posted/${d.id}/redraft`,
                    {},
                    t('zalo_posts_redrafted', 'New draft created — check "Needs action" to approve'),
                    t('zalo_posts_redraft_confirm', 'Create a NEW draft from this post (with the latest footer) to approve & publish again?')
                  )
                }
                className="cursor-pointer font-[600] text-btnPrimary"
              >
                🔁 {t('zalo_posts_redraft', 'Repost as draft')}
              </span>
              <div className="flex-1" />
              <DangerLink
                onClick={() =>
                  act(
                    d.id,
                    `/api/posted/${d.id}/remove`,
                    {},
                    t('zalo_posts_removed_list', 'Removed from the processed list'),
                    t('zalo_posts_remove_confirm', 'Remove this post from the list? Posts on Facebook/Google are NOT affected.')
                  )
                }
              >
                🗑 {t('zalo_posts_remove_from_list', 'Remove from list')}
              </DangerLink>
            </>
          )}
        </div>

        {/* Khu sửa bài */}
        {editing && (
          <div className="border-t border-newTableBorder p-[14px] flex flex-col gap-[10px] bg-boxHover/30">
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
                        className="w-[52px] h-[52px] object-cover rounded-[8px] border border-newTableBorder shrink-0"
                      />
                      <input
                        value={it.caption}
                        onChange={(e) =>
                          setEditImages((cur) =>
                            cur.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x))
                          )
                        }
                        placeholder={t('zalo_posts_img_cap_placeholder', 'Caption for this image (optional)')}
                        className={clsx(inputCls, 'flex-1 !h-[34px]')}
                      />
                      <SimpleButton className="!h-[34px] !px-[10px]" onClick={() => moveImage(i, -1)}>
                        ↑
                      </SimpleButton>
                      <SimpleButton className="!h-[34px] !px-[10px]" onClick={() => moveImage(i, 1)}>
                        ↓
                      </SimpleButton>
                      <DangerLink
                        onClick={() => setEditImages((cur) => cur.filter((_, j) => j !== i))}
                      >
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
              <SimpleButton
                className="!h-[34px] text-[13px]"
                disabled={rewriting}
                onClick={() => aiRewrite(d)}
              >
                ✨ {t('zalo_ai_rewrite', 'AI rewrite')}
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
                'h-[34px] px-[14px] text-[12.5px] font-[600] cursor-pointer',
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

      <div className="flex flex-col gap-[14px]">{shown.map(renderCard)}</div>
    </div>
  );
};

// Hàng hẹn giờ — tách component để giữ state datetime cục bộ cho từng thẻ.
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
