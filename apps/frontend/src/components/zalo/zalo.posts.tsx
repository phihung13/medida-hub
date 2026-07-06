'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  bot,
  BotPost,
  Card,
  fmtFull,
  getBotUrl,
  selectCls,
  SimpleButton,
  StatusChip,
} from './zalo.shared';

// ============================================================================
//  Tab "Bài viết" — THẺ LỊCH SỬ, CHỈ HIỂN THỊ (quyết định của user 2026-07-06):
//  cầu nối tự đẩy mọi bài gom được vào Nháp của Calendar ngay khi gom xong,
//  nên KHÔNG còn duyệt/từ chối/sửa/hẹn giờ ở đây — làm hết ở Calendar.
//  1 thẻ = header (nhóm + giờ + chip trạng thái) → caption → dải media
//  (bấm xem lớn) → Chi tiết → nút "Mở trong Calendar".
// ============================================================================

type RouteInfo = { threadId: string; folder?: string; label?: string };

// Xem lớn ảnh/video của bài — media strip 72px chỉ là thumbnail.
type LightboxMedia = { url: string; video?: boolean; caption?: string };

export const ZaloPostsTab: FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const t = useT();
  const toast = useToaster();
  const router = useRouter();

  const [botUrl, setBotUrl] = useState('/botapi');
  useEffect(() => setBotUrl(getBotUrl()), []);

  const [posts, setPosts] = useState<BotPost[] | null>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Set<string>>(new Set());

  // ---- Lightbox xem ảnh/video lớn -------------------------------------------
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const [lightboxError, setLightboxError] = useState(false);
  const openLightbox = useCallback((m: LightboxMedia) => {
    setLightboxError(false);
    setLightbox(m);
  }, []);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

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

  const shown = useMemo(
    () => (posts || []).filter((d) => !folder || folderOf(d) === folder),
    [posts, folder, folderOf]
  );

  // ---- Mở bài trong Calendar --------------------------------------------------
  // Có hubPostId → mở thẳng trình soạn bài. Đã đẩy mà thiếu id (bài cũ) → mở
  // Calendar chung. Chưa đẩy (cầu nối tắt lúc gom) → đẩy sang Hub rồi mở.
  const openInCalendar = useCallback(
    async (d: BotPost) => {
      if (d.hubPostId) {
        router.push(`/launches?openpost=${d.hubPostId}`);
        return;
      }
      if (d.pushedToHub) {
        router.push('/launches');
        return;
      }
      setBusy(d.id);
      try {
        const r = await bot(
          `/api/postiz/pending/${d.id}/push-hub`,
          { method: 'POST', body: '{}' },
          180000
        );
        if (r?.error) {
          toast.show(r.error, 'warning');
          return;
        }
        toast.show(
          t('zalo_pushed_opening', 'Pushed to Media Hub — opening the composer…'),
          'success'
        );
        refresh();
        router.push(r?.postId ? `/launches?openpost=${r.postId}` : '/launches');
      } catch {
        toast.show(t('zalo_bot_unreachable', 'Cannot reach the Zalo bot'), 'warning');
      } finally {
        setBusy(null);
      }
    },
    [router, refresh, t]
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

  // ---- Render 1 thẻ (chỉ hiển thị) ---------------------------------------------
  const renderCard = (d: BotPost) => {
    const approvals = d.approvals || {};
    const fb = approvals.facebook || {};
    const gbp = approvals.gbp;
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
    const thisBusy = busy === d.id;
    const MAX_TILES = 6;
    const tiles = imgs.slice(0, MAX_TILES);
    const moreTiles = imgs.length - tiles.length;

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
            {/* Chip = lịch sử: đã vào Hub / bot đã đăng đâu (bài cũ). Không còn
                chip "chờ duyệt" — duyệt làm ở Calendar. */}
            <div className="flex items-center gap-[6px] mt-[4px] flex-wrap">
              {d.pushedToHub && (
                <StatusChip tone="ok">{t('zalo_posts_in_hub', 'In Media Hub')}</StatusChip>
              )}
              {fb.status === 'posted' &&
                (fb.published === false ? (
                  <StatusChip tone="warn">{t('zalo_posts_fb_draft', 'Facebook draft')}</StatusChip>
                ) : (
                  <StatusChip tone="ok">{t('zalo_posts_fb_public', 'Facebook published')}</StatusChip>
                ))}
              {gbp?.status === 'posted' && (
                <StatusChip tone="ok">{t('zalo_posts_gbp_posted', 'Google posted')}</StatusChip>
              )}
              {!!d.scheduledAt && (
                <StatusChip tone="warn">⏰ {fmtFull(d.scheduledAt)}</StatusChip>
              )}
            </div>
          </div>
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

        {/* ---- Media strip (bấm xem lớn) ---------------------------------------- */}
        {(!!imgs.length || !!vids.length) && (
          <div className="flex gap-[6px] overflow-x-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner px-[14px] py-[8px]">
            {tiles.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`${botUrl}${u}`}
                alt={d.imageCaptions?.[i] || `Ảnh ${i + 1}`}
                title={d.imageCaptions?.[i] || t('zalo_posts_view_large', 'View large')}
                onClick={() =>
                  openLightbox({ url: `${botUrl}${u}`, caption: d.imageCaptions?.[i] })
                }
                className="h-[72px] w-[72px] object-cover rounded-[8px] border border-newTableBorder shrink-0 cursor-pointer hover:opacity-80 transition-opacity duration-150"
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
              // Thumbnail video (frame đầu) + nút ▶ — bấm mở lightbox player lớn.
              <div
                key={`v${i}`}
                onClick={() =>
                  openLightbox({
                    url: `${botUrl}${u}`,
                    video: true,
                    caption: d.videoCaptions?.[i],
                  })
                }
                title={d.videoCaptions?.[i] || t('zalo_posts_play_video', 'Play video')}
                className="relative h-[72px] w-[72px] rounded-[8px] border border-newTableBorder shrink-0 cursor-pointer overflow-hidden bg-black/70 hover:opacity-80 transition-opacity duration-150"
              >
                <video
                  src={`${botUrl}${u}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  className="h-full w-full object-cover pointer-events-none"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="w-[28px] h-[28px] rounded-full bg-black/60 text-white text-[12px] flex items-center justify-center ps-[2px]">
                    ▶
                  </span>
                </div>
              </div>
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

        {/* ---- Link đã đăng (bài cũ bot từng đăng) ------------------------------ */}
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

        {/* ---- MỘT nút: mở bản nháp của bài trong Calendar ------------------------ */}
        <div className="flex items-center px-[14px] py-[10px] border-t border-newTableBorder">
          <div className="flex-1" />
          <SimpleButton
            className="!h-[32px] !px-[14px] text-[12.5px]"
            disabled={thisBusy}
            title={t(
              'zalo_open_calendar_hint',
              "Open this post's draft in the Calendar composer (review, edit & publish there)"
            )}
            onClick={() => openInCalendar(d)}
          >
            📅 {t('zalo_open_calendar', 'Open in Calendar')}
          </SimpleButton>
        </div>
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
      {/* Giải thích luồng mới: thẻ chỉ là lịch sử, duyệt ở Calendar */}
      <div className="text-[12.5px] text-textItemBlur leading-[1.6]">
        {t(
          'zalo_posts_history_hint',
          'Every post collected from a Zalo group automatically becomes a draft in the Calendar — review, edit and publish there. This list is just the history.'
        )}
      </div>

      {/* Toolbar: lọc theo mục + refresh */}
      <div className="flex items-center gap-[10px] flex-wrap">
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

      {/* ---- Lightbox xem ảnh/video lớn (đóng: bấm nền / ✕ / Esc) ---------- */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-[20px]"
          onClick={() => setLightbox(null)}
        >
          <button
            aria-label={t('zalo_close', 'Close')}
            className="absolute top-[14px] end-[20px] w-[36px] h-[36px] rounded-full bg-white/10 hover:bg-white/25 text-white text-[17px] leading-none cursor-pointer transition-colors duration-150"
          >
            ✕
          </button>
          <div
            className="max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-[10px]"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxError ? (
              <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] px-[24px] py-[20px] text-[13.5px] leading-[1.6] max-w-[420px] text-center">
                ⚠️{' '}
                {t(
                  'zalo_media_missing',
                  'This file is no longer on the bot — it may have been cleaned up after posting or rejecting.'
                )}
              </div>
            ) : lightbox.video ? (
              <video
                src={lightbox.url}
                controls
                autoPlay
                playsInline
                onError={() => setLightboxError(true)}
                className="max-w-[92vw] max-h-[82vh] rounded-[10px] bg-black"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightbox.url}
                alt={lightbox.caption || ''}
                onError={() => setLightboxError(true)}
                className="max-w-[92vw] max-h-[82vh] object-contain rounded-[10px]"
              />
            )}
            {!!lightbox.caption && !lightboxError && (
              <div className="text-white/85 text-[13px] leading-[1.5] text-center max-w-[640px]">
                {lightbox.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
