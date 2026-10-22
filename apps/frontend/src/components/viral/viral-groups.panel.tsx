'use client';

import { FC, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ── Tab "👥 Group FB" ─────────────────────────────────────────────────────
// Claude cào các group trong danh sách bên dưới → gửi từng bài (link, group,
// chủ đề, loại) → kết kỳ kèm chủ đề hot + câu hỏi nhiều người hỏi. Tách riêng
// phễu content; muốn làm content từ 1 bài thì bấm "⚡ Làm content".

const KIND_META: Record<string, { icon: string; key: string; label: string; cls: string }> = {
  hoi: { icon: '❓', key: 'viral_gr_kind_hoi', label: 'Question', cls: 'bg-[#FFC53D]/15 text-[#FFC53D]' },
  chia_se: { icon: '💬', key: 'viral_gr_kind_chia_se', label: 'Experience', cls: 'bg-[#5CBEFF]/15 text-[#5CBEFF]' },
  review: { icon: '⭐', key: 'viral_gr_kind_review', label: 'Review', cls: 'bg-[#57D9A3]/15 text-[#57D9A3]' },
  phan_nan: { icon: '⚠️', key: 'viral_gr_kind_phan_nan', label: 'Complaint', cls: 'bg-[#FF5A52]/15 text-[#FF5A52]' },
  khac: { icon: '•', key: 'viral_gr_kind_khac', label: 'Other', cls: 'bg-newBgColor text-textItemBlur' },
};

// Bài đã "Thành content" đang ở bước nào của phễu (backend: contentStages).
const STAGE_META: Record<string, { key: string; label: string; cls: string }> = {
  'dang-tong-hop': { key: 'viral_gr_stage_synth', label: 'AI is summarising — not in any tab yet', cls: 'text-[#FFC53D]' },
  pending: { key: 'viral_gr_stage_pending', label: 'In "To review"', cls: 'text-btnPrimary' },
  approved: { key: 'viral_gr_stage_approved', label: 'Approved — producing', cls: 'text-[#57D9A3]' },
  ready: { key: 'viral_gr_stage_ready', label: 'In "Ready to post"', cls: 'text-[#57D9A3]' },
  skipped: { key: 'viral_gr_stage_skipped', label: 'Low score — moved to "Archive"', cls: 'text-[#FF5A52]' },
  deleted: { key: 'viral_gr_stage_deleted', label: 'Deleted — in "Archive"', cls: 'text-textItemBlur' },
};

const useGroupsOverview = () => {
  const fetch = useFetch();
  return useSWR('/viral-groups', async (u: string) => (await fetch(u)).json());
};

const useGroupPosts = (batch: string, group: string, kind: string, topic: string, q: string) => {
  const fetch = useFetch();
  const qs = new URLSearchParams({ batch, group, kind, topic, q }).toString();
  return useSWR(`/viral-groups/posts?${qs}`, async (u: string) => (await fetch(u)).json());
};

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(d);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const selCls =
  'h-[34px] bg-newColColor border border-newBgLineColor rounded-[8px] px-[10px] text-[12.5px] outline-none mobile:h-[44px] mobile:shrink-0 max-w-[220px]';

// Danh sách chủ đề (hot / hỏi nhiều) của 1 kỳ — bấm để lọc bài theo chủ đề.
const TopicList: FC<{
  title: string;
  items: any[];
  active: string;
  onPick: (topic: string) => void;
  empty: string;
}> = ({ title, items, active, onPick, empty }) => {
  const t = useT();
  return (
    <div className="flex-1 min-w-[260px] flex flex-col gap-[6px]">
      <div className="text-[12.5px] font-[700]">{title}</div>
      {!items.length ? (
        <div className="text-[12px] text-textItemBlur">{empty}</div>
      ) : (
        items.map((x: any, i: number) => (
          <div
            key={i}
            className={clsx(
              'rounded-[9px] border px-[10px] py-[7px] text-[12px] flex flex-col gap-[3px]',
              active && active.toLowerCase() === String(x.topic).toLowerCase()
                ? 'border-btnPrimary/60 bg-btnPrimary/10'
                : 'border-newBgLineColor bg-newColColor'
            )}
          >
            <div className="flex items-center gap-[8px]">
              <span className="text-textItemBlur tabular-nums w-[16px] shrink-0">{i + 1}</span>
              <button onClick={() => onPick(x.topic)} className="font-[650] text-start flex-1 hover:text-btnPrimary" title={t('viral_gr_filter_topic', 'Show posts on this topic')}>
                {x.topic}
              </button>
              <span className="text-textItemBlur tabular-nums shrink-0">
                📄{x.posts || 0}
                {x.comments ? ` · 💬${x.comments}` : ''}
              </span>
            </div>
            {(x.groups || []).length > 0 && (
              <div className="ps-[24px] text-[11px] text-textItemBlur truncate">👥 {(x.groups || []).join(' · ')}</div>
            )}
            {x.note && <div className="ps-[24px] text-[11.5px] text-textItemBlur">{x.note}</div>}
            {(x.urls || []).length > 0 && (
              <div className="ps-[24px] flex gap-[8px] flex-wrap">
                {(x.urls || []).map((u: string, k: number) => (
                  <a key={k} href={u} target="_blank" rel="noreferrer" className="text-[11px] text-btnPrimary hover:underline">
                    {t('viral_gr_post_n', 'Post')} {k + 1} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

const PostCard: FC<{ post: any; canModerate: boolean; onDone: () => void; onOpenTopic?: (id: string) => void }> = ({ post, canModerate, onDone, onOpenTopic }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const km = KIND_META[post.kind] || KIND_META.khac;
  const toContent = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/viral-groups/posts/${post.id}/to-content`, { method: 'POST' });
      const j = res.ok ? await res.json().catch(() => null) : null;
      toast.show(
        !res.ok
          ? t('viral_gr_to_content_fail', 'Could not create content — try again.')
          : j?.existed
          ? j?.retried
            ? t('viral_gr_resynth_ok', 'Summarised again — the content is now in its tab.')
            : t('viral_gr_resynth_fail', 'AI still could not summarise this post — try again later.')
          : t('viral_gr_to_content_ok', 'Sent to the content funnel — AI is summarising it, see "To review" in a minute.'),
        !res.ok || (j?.existed && !j?.retried) ? 'warning' : 'success'
      );
      onDone();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await deleteDialog(t('viral_gr_delete_post_confirm', 'Remove this post?'), t('viral_delete', 'Delete')))) return;
    await fetch(`/viral-groups/posts/${post.id}`, { method: 'DELETE' });
    onDone();
  };
  return (
    <div className="bg-newColColor border border-newBgLineColor rounded-[12px] p-[12px] flex flex-col gap-[7px]">
      <div className="flex items-center gap-[6px] flex-wrap text-[11px]">
        <span className={clsx('px-[7px] py-[2px] rounded-full font-[700]', km.cls)}>
          {km.icon} {t(km.key, km.label)}
        </span>
        {post.topic && <span className="px-[7px] py-[2px] rounded-full bg-btnPrimary/12 text-btnPrimary font-[700] max-w-[200px] truncate">#{post.topic}</span>}
        <span className="ms-auto text-textItemBlur tabular-nums">{fmtDate(post.postedAt || post.createdAt)}</span>
      </div>
      <div className="text-[11.5px] text-textItemBlur truncate">
        👥 <b className="text-textColor font-[650]">{post.groupName}</b>
        {post.author ? ` · ${post.author}` : ''}
      </div>
      <div className={clsx('text-[12.5px] leading-[1.55] whitespace-pre-line', !open && 'line-clamp-5')}>{post.content}</div>
      {open && (post.topComments || []).length > 0 && (
        <div className="flex flex-col gap-[4px] bg-newBgColor rounded-[8px] p-[8px] text-[12px]">
          <div className="font-[700] text-textItemBlur">💬 {t('viral_gr_top_comments', 'Notable comments')}</div>
          {(post.topComments || []).map((c: string, i: number) => (
            <div key={i}>– {c}</div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-[10px] text-[11.5px] text-textItemBlur tabular-nums mt-auto pt-[6px] border-t border-newBgLineColor/60 flex-wrap">
        {post.likes != null && <span>👍 {post.likes}</span>}
        {post.comments != null && <span>💬 {post.comments}</span>}
        {post.shares != null && <span>↗ {post.shares}</span>}
        <button onClick={() => setOpen((v) => !v)} className="text-btnPrimary hover:underline">
          {open ? t('viral_gr_less', 'Less') : t('viral_gr_more', 'More')}
        </button>
        <span className="flex-1" />
        {post.url ? (
          <a href={post.url} target="_blank" rel="noreferrer" className="font-[700] text-btnPrimary hover:underline">
            {t('viral_gr_open_post', 'Open post')} ↗
          </a>
        ) : (
          <span title={t('viral_gr_no_link_hint', 'The crawler could not get this post\'s permalink')}>{t('viral_gr_no_link', 'no link')}</span>
        )}
      </div>
      {canModerate && (
        <div className="flex gap-[6px]">
          {post.pushedTopicId ? (
            (() => {
              const sm = STAGE_META[post.contentStage || ''];
              const canOpen = !!onOpenTopic && post.pushedTopicId !== 'pushed' && post.contentStage && post.contentStage !== 'dang-tong-hop';
              return (
                <div className="flex-1 flex items-center gap-[6px] min-w-0">
                  <button
                    type="button"
                    disabled={!canOpen}
                    onClick={() => canOpen && onOpenTopic!(post.pushedTopicId)}
                    title={canOpen ? t('viral_gr_open_content', 'Open this content') : undefined}
                    className={clsx(
                      'flex-1 min-w-0 py-[6px] px-[8px] rounded-[7px] text-[11.5px] font-[700] text-start truncate',
                      sm?.cls || 'text-[#57D9A3]',
                      canOpen ? 'hover:bg-newBgColor cursor-pointer' : 'cursor-default'
                    )}
                  >
                    ✓ {t('viral_gr_in_content', 'Already in content')}
                    {sm ? ` · ${t(sm.key, sm.label)}` : ''}
                    {post.contentScore != null && post.contentStage !== 'dang-tong-hop' ? ` · ${post.contentScore}đ` : ''}
                    {canOpen ? ' ↗' : ''}
                  </button>
                  {post.contentStage === 'dang-tong-hop' && (
                    <button
                      onClick={toContent}
                      disabled={busy}
                      className="shrink-0 py-[6px] px-[10px] rounded-[7px] text-[11.5px] font-[700] bg-btnPrimary/12 text-btnPrimary hover:bg-btnPrimary/25 disabled:opacity-50"
                    >
                      {busy ? t('viral_gr_sending', 'Sending…') : `↻ ${t('viral_gr_resynth', 'Summarise again')}`}
                    </button>
                  )}
                </div>
              );
            })()
          ) : (
            <button onClick={toContent} disabled={busy} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] bg-btnPrimary/12 text-btnPrimary hover:bg-btnPrimary/25 disabled:opacity-50">
              {busy ? t('viral_gr_sending', 'Sending…') : `⚡ ${t('viral_gr_to_content', 'Make content')}`}
            </button>
          )}
          <button onClick={remove} aria-label={t('viral_delete', 'Delete')} className="px-[10px] py-[6px] rounded-[7px] text-[11.5px] text-textItemBlur hover:text-[#FF5A52]">
            🗑
          </button>
        </div>
      )}
    </div>
  );
};

// Danh sách group theo dõi — Claude đọc danh sách này mỗi kỳ để biết cào đâu.
const GroupsManager: FC<{ groups: any[]; canModerate: boolean; onDone: () => void }> = ({ groups, canModerate, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const add = async () => {
    if (!url.trim()) return;
    const res = await fetch('/viral-groups/groups', { method: 'POST', body: JSON.stringify({ url, name, area }) });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      toast.show(j?.message || t('viral_gr_add_fail', 'Invalid group link.'), 'warning');
      return;
    }
    setUrl('');
    setName('');
    setArea('');
    onDone();
  };
  const toggle = (g: any) => async () => {
    await fetch(`/viral-groups/groups/${g.id}`, { method: 'POST', body: JSON.stringify({ active: !g.active }) });
    onDone();
  };
  const remove = (g: any) => async () => {
    if (!(await deleteDialog(`${t('viral_gr_delete_group_confirm', 'Stop tracking this group?')} ${g.name}`, t('viral_unfollow', 'Remove')))) return;
    await fetch(`/viral-groups/groups/${g.id}`, { method: 'DELETE' });
    onDone();
  };
  return (
    <div className="flex flex-col gap-[10px] border-t border-newBgLineColor pt-[14px]">
      <div className="text-[14px] font-[650]">
        👥 {t('viral_gr_groups_head', 'Tracked groups')} ({groups.length}){' '}
        <span className="text-[11.5px] text-textItemBlur font-[400]">— {t('viral_gr_groups_note', 'Claude reads this list every run; groups it finds on its own are added here automatically')}</span>
      </div>
      <div className="flex flex-col gap-[6px]">
        {groups.map((g: any) => (
          <div key={g.id} className={clsx('flex items-center gap-[10px] bg-newColColor border border-newBgLineColor rounded-[10px] px-[12px] py-[8px] text-[12.5px] flex-wrap', !g.active && 'opacity-55')}>
            <a href={g.url} target="_blank" rel="noreferrer" className="font-[650] hover:text-btnPrimary truncate max-w-[340px]">
              {g.name} ↗
            </a>
            {g.area && <span className="text-[11px] px-[7px] py-[1px] rounded-full bg-newBgColor text-textItemBlur">📍 {g.area}</span>}
            <span className="ms-auto text-[11px] text-textItemBlur tabular-nums">
              {g.posts30d} {t('viral_gr_posts_30d', 'posts / 30 days')} · {g.lastCrawledAt ? `${t('viral_gr_last_crawled', 'last run')} ${fmtDate(g.lastCrawledAt)}` : t('viral_gr_never', 'not crawled yet')}
            </span>
            {canModerate && (
              <>
                <button
                  onClick={toggle(g)}
                  className={clsx(
                    'text-[10.5px] font-[700] px-[7px] py-[2px] rounded-[6px] border mobile:min-h-[36px] mobile:px-[10px]',
                    g.active ? 'text-[#57D9A3] border-[#57D9A3]/40 bg-[#57D9A3]/10' : 'text-textItemBlur border-newBgLineColor'
                  )}
                  title={t('viral_gr_toggle_hint', 'ON = Claude crawls this group each run')}
                >
                  {g.active ? 'ON' : 'OFF'}
                </button>
                <button onClick={remove(g)} aria-label={t('viral_unfollow', 'Remove')} className="text-textItemBlur hover:text-red-400 text-[12px] mobile:min-h-[36px] mobile:min-w-[36px]">
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {canModerate && (
        <div className="flex gap-[8px] flex-wrap items-center">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.facebook.com/groups/…" className="h-[36px] mobile:h-[44px] flex-1 min-w-[240px] bg-input border border-fifth rounded-[8px] px-[10px] text-[12.5px] outline-none" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('viral_gr_name_ph', 'Name (optional)')} className="h-[36px] mobile:h-[44px] w-[200px] mobile:flex-1 bg-input border border-fifth rounded-[8px] px-[10px] text-[12.5px] outline-none" />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder={t('viral_gr_area_ph', 'Area (e.g. HCMC)')} className="h-[36px] mobile:h-[44px] w-[150px] mobile:flex-1 bg-input border border-fifth rounded-[8px] px-[10px] text-[12.5px] outline-none" />
          <button onClick={add} disabled={!url.trim()} className="h-[36px] mobile:h-[44px] px-[14px] rounded-[8px] text-[12.5px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25 disabled:opacity-50">
            ＋ {t('viral_gr_add_group', 'Add group')}
          </button>
        </div>
      )}
    </div>
  );
};

export const ViralGroupsPanel: FC<{ canModerate: boolean; onOpenTopic?: (id: string) => void }> = ({ canModerate, onOpenTopic }) => {
  const t = useT();
  const { data: ov, mutate: mutateOv } = useGroupsOverview();
  const groups: any[] = ov?.groups || [];
  const batches: any[] = ov?.batches || [];
  // '' = kỳ mới nhất (nếu có); 'all' = 30 ngày; 'open' = chưa kết kỳ
  const [batchSel, setBatchSel] = useState('');
  const [group, setGroup] = useState('');
  const [kind, setKind] = useState('');
  const [topic, setTopic] = useState('');
  const [q, setQ] = useState('');
  const batch = useMemo(() => {
    if (batchSel === 'all' || batchSel === 'open') return null;
    return batches.find((b) => b.id === batchSel) || batches[0] || null;
  }, [batchSel, batches]);
  const batchParam = batchSel === 'all' ? '' : batchSel === 'open' ? 'open' : batch?.id || '';
  const { data: postsData, isLoading, mutate: mutatePosts } = useGroupPosts(batchParam, group, kind, topic, q);
  const posts: any[] = Array.isArray(postsData) ? postsData : [];
  const refresh = () => {
    mutateOv();
    mutatePosts();
  };

  if (ov && !groups.length && !batches.length) {
    return (
      <div className="flex flex-col gap-[14px]">
        <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[30px] text-center">
          <div className="text-[15px] font-[600] mb-[6px]">{t('viral_gr_empty_title', 'No Facebook groups yet')}</div>
          <div className="text-[12.5px] text-textItemBlur max-w-[520px] mx-auto">
            {t('viral_gr_empty_desc', 'Add the groups you want Claude to watch below, then run the "cào facebook viral" skill. Posts, links, hot topics and most-asked questions will show up here — separate from the content funnel.')}
          </div>
        </div>
        <GroupsManager groups={groups} canModerate={canModerate} onDone={refresh} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Kỳ cào: chọn kỳ + tóm tắt + 2 cột chủ đề hot / hỏi nhiều */}
      <div className="flex items-center gap-[8px] flex-wrap mobile:flex-nowrap mobile-hscroll">
        <select value={batchSel} onChange={(e) => { setBatchSel(e.target.value); setTopic(''); }} className={selCls}>
          {batches.length > 0 && <option value="">{t('viral_gr_latest_batch', 'Latest run')}</option>}
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {t('viral_gr_batch', 'Run')} {new Date(b.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {b.postCount}
            </option>
          ))}
          <option value="open">{t('viral_gr_open_batch', 'Not finished yet (crawling)')}</option>
          <option value="all">{t('viral_gr_all_30d', 'Everything, last 30 days')}</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={selCls}>
          <option value="">{t('viral_gr_all_groups', 'All groups')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={selCls}>
          <option value="">{t('viral_gr_all_kinds', 'All post types')}</option>
          {Object.entries(KIND_META).map(([k, m]) => (
            <option key={k} value={k}>{m.icon} {t(m.key, m.label)}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('viral_gr_search', 'Search posts…')} className={clsx(selCls, 'min-w-[160px]')} />
        {topic && (
          <button onClick={() => setTopic('')} className="h-[34px] mobile:h-[44px] px-[10px] rounded-[8px] text-[12px] font-[700] bg-btnPrimary/15 text-btnPrimary mobile:shrink-0 whitespace-nowrap">
            #{topic} ✕
          </button>
        )}
      </div>

      {batch && batchSel !== 'open' && batchSel !== 'all' && (
        <div className="bg-newBgColor rounded-[12px] p-[14px] flex flex-col gap-[12px]">
          <div className="text-[12px] text-textItemBlur">
            🗓 {new Date(batch.createdAt).toLocaleString('vi-VN')} · {batch.postCount} {t('viral_gr_posts', 'posts')} · {batch.groupCount} {t('viral_gr_groups', 'groups')}
          </div>
          {batch.summary && <div className="text-[12.5px] leading-[1.6] whitespace-pre-line">{batch.summary}</div>}
          <div className="flex gap-[14px] flex-wrap">
            <TopicList
              title={`🔥 ${t('viral_gr_hot', 'Hot topics')}`}
              items={batch.hotTopics || []}
              active={topic}
              onPick={setTopic}
              empty={t('viral_gr_no_topics', 'No topic labels in this run.')}
            />
            <TopicList
              title={`❓ ${t('viral_gr_asked', 'Most-asked topics')}`}
              items={batch.askedTopics || []}
              active={topic}
              onPick={setTopic}
              empty={t('viral_gr_no_questions', 'No questions in this run.')}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-[13px] text-textItemBlur p-[24px] text-center">{t('viral_loading', 'Loading…')}</div>
      ) : !posts.length ? (
        <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[26px] text-center text-[12.5px] text-textItemBlur">
          {t('viral_gr_no_posts', 'No posts match these filters.')}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[12px]">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} canModerate={canModerate} onDone={refresh} onOpenTopic={onOpenTopic} />
          ))}
        </div>
      )}

      <GroupsManager groups={groups} canModerate={canModerate} onDone={refresh} />
    </div>
  );
};
