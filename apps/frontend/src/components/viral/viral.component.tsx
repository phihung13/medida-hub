'use client';

import { FC, Fragment, useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ── Lò Bài Thắng: tường bài viral giáo dục → mổ công thức → nhân bản ───────
// Thước đo chính: LƯỢT SHARE.

const PLATFORMS = [
  { key: 'all', label: 'All', dot: '' },
  { key: 'facebook', label: 'Facebook', dot: '#5EA2FF' },
  { key: 'instagram', label: 'Instagram', dot: '#E85C90' },
  { key: 'tiktok', label: 'TikTok', dot: '#4DE6DE' },
  { key: 'youtube', label: 'YouTube', dot: '#FF5A52' },
  { key: 'news', label: 'Blog · News', dot: '#A8AEBB' },
];
const LEVELS = [
  { key: 'all', label: 'All' },
  { key: 'mn', label: 'Preschool' },
  { key: 'th', label: 'Primary' },
  { key: 'cs', label: 'Middle School' },
  { key: 'pt', label: 'High School' },
];
const LEVEL_STYLE: Record<string, string> = {
  mn: 'bg-[#57D9A3]/15 text-[#57D9A3]',
  th: 'bg-[#5CBEFF]/15 text-[#5CBEFF]',
  cs: 'bg-[#B08CFF]/15 text-[#B08CFF]',
  pt: 'bg-[#FFA057]/15 text-[#FFA057]',
  all: 'bg-newColColor text-textItemBlur',
};
const platMeta = (k: string) => PLATFORMS.find((x) => x.key === k);
const levelLabel = (k: string) => LEVELS.find((l) => l.key === k)?.label || 'General';
const nice = (n?: number | null) => {
  if (n == null) return null;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

// Màu huy hiệu điểm AI: >=90 xanh (tự duyệt), 70-89 vàng, 50-69 xanh dương, <50 đỏ
const scoreStyle = (s?: number | null) =>
  s == null
    ? 'bg-black/60 text-white/60'
    : s >= 90
    ? 'bg-[#57D9A3]/20 text-[#57D9A3] border border-[#57D9A3]/40'
    : s >= 70
    ? 'bg-[#FFC53D]/20 text-[#FFC53D] border border-[#FFC53D]/40'
    : s >= 50
    ? 'bg-[#5CBEFF]/20 text-[#5CBEFF] border border-[#5CBEFF]/40'
    : 'bg-[#FF5A52]/20 text-[#FF5A52] border border-[#FF5A52]/40';

const useViral = (platform: string, level: string, sort: string, status: string) => {
  const fetch = useFetch();
  return useSWR(
    `/viral?platform=${platform}&level=${level}&sort=${sort}&status=${status}`,
    async (u: string) => (await fetch(u)).json()
  );
};

const Field: FC<{ label: string; children: any }> = ({ label, children }) => (
  <label className="flex flex-col gap-[5px]">
    <span className="text-[11.5px] text-textItemBlur">{label}</span>
    {children}
  </label>
);
const inputCls =
  'bg-input border border-fifth rounded-[8px] px-[12px] h-[42px] text-[13px] text-inputText outline-none w-full';

// ── Thêm bài viral ────────────────────────────────────────────────────────
const CaptureModal: FC<{ onDone: () => void }> = ({ onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const [tab, setTab] = useState<'link' | 'text' | 'image'>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [images, setImages] = useState<{ base64: string; mediaType: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).slice(0, 4).forEach((f) => {
      const r = new FileReader();
      r.onload = () => {
        const m = String(r.result || '').match(/^data:([^;]+);base64,(.*)$/);
        if (m) setImages((p) => [...p, { mediaType: m[1], base64: m[2] }]);
      };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  }, []);

  const save = useCallback(async () => {
    const body: any = {};
    if (tab === 'link' && url.trim()) body.url = url.trim();
    if (tab === 'text' && text.trim()) body.text = text.trim();
    if (tab === 'image' && images.length) body.images = images;
    if (!body.url && !body.text && !body.images) {
      toast.show(t('viral_capture_need_input', 'Enter a link, text, or pick an image first.'), 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/viral', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.show(t('viral_capture_success', 'Post captured — AI has classified it.'), 'success');
      onDone();
      modal.closeCurrent();
    } catch {
      toast.show(t('viral_capture_failed', 'Could not capture the post, try again.'), 'warning');
    } finally {
      setBusy(false);
    }
  }, [tab, url, text, images, onDone]);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="text-[12.5px] text-textItemBlur">
        {t(
          'viral_capture_hint',
          'AI reads the content, fills in the metrics and classifies the school level. Screenshots that already show share counts are read automatically.'
        )}
      </div>
      <div className="flex gap-[6px]">
        {(
          [
            ['link', t('viral_tab_link', 'Link')],
            ['text', t('viral_tab_text', 'Text')],
            ['image', t('viral_tab_image', 'Screenshot')],
          ] as [typeof tab, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              'px-[14px] py-[7px] rounded-[8px] text-[12.5px] font-[600] border',
              tab === k
                ? 'bg-btnPrimary/15 border-btnPrimary/50 text-btnPrimary'
                : 'border-newBgLineColor text-textItemBlur'
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'link' && (
        <div className="flex flex-col gap-[6px]">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('viral_link_placeholder', 'Paste post link (Facebook, TikTok, YouTube, news…)')}
            className={inputCls}
          />
          {/(facebook\.com|fb\.watch|instagram\.com|tiktok\.com)/.test(url) && (
            <div className="text-[11.5px] text-[#FFC53D]/90 leading-[1.5]">
              ⚠{' '}
              {t(
                'viral_social_link_warning',
                'FB/IG/TikTok often block bots — the result may miss the image or numbers. Most reliable: use the Screenshot tab (AI reads likes/shares straight from the image).'
              )}
            </div>
          )}
        </div>
      )}
      {tab === 'text' && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('viral_text_placeholder', 'Paste the post content (include share/like counts if available)')}
          className="bg-input border border-fifth rounded-[8px] p-[12px] min-h-[150px] text-[13px] text-inputText outline-none"
        />
      )}
      {tab === 'image' && (
        <div className="flex flex-col gap-[8px]">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
          <button
            onClick={() => fileRef.current?.click()}
            className="border-[1.5px] border-dashed border-newBgLineColor rounded-[10px] p-[26px] text-center text-[12.5px] text-textItemBlur hover:text-textColor"
          >
            <b className="text-textColor">{t('viral_pick_images', 'Choose screenshots of the viral post')}</b> {t('viral_pick_images_max', '— up to 4 images')}
          </button>
          {!!images.length && (
            <div className="flex gap-[6px] flex-wrap">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:${img.mediaType};base64,${img.base64}`} className="h-[62px] rounded-[6px] object-cover" alt="" />
                  <button
                    onClick={() => setImages(images.filter((_, x) => x !== i))}
                    className="absolute -top-[6px] -right-[6px] w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Button onClick={save} loading={busy}>
        {busy ? t('viral_reading', 'AI is reading…') : t('viral_capture_this', 'Capture this post')}
      </Button>
    </div>
  );
};

// ── Xem chi tiết + mổ công thức + nhân bản (một chỗ) ──────────────────────
const DetailModal: FC<{ post: any; onDone: () => void }> = ({ post, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const [cloning, setCloning] = useState(false);
  const [open, setOpen] = useState(false);

  const loadFormula = useCallback(async () => {
    const res = await fetch(`/viral/${post.id}/formula`, { method: 'POST' });
    if (!res.ok) throw new Error();
    return res.json();
  }, [post.id]);
  const { data, isLoading } = useSWR(open ? `vf-${post.id}` : null, loadFormula, {
    revalidateOnFocus: false,
  });
  const f = data?.formula;

  // Clone → "Bài của mình": AI viết lại tốt hơn + chấm lại (chạy nền).
  const cloneToMine = useCallback(async () => {
    setCloning(true);
    try {
      const res = await fetch('/viral/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [post.id], action: 'clone' }),
      });
      if (!res.ok) throw new Error();
      toast.show(t('viral_clone_to_mine_success', 'Creating your post — check the "My posts" tab in a few minutes.'), 'success');
      onDone();
      modal.closeCurrent();
    } catch {
      toast.show(t('viral_clone_failed', 'Could not generate the post, try again.'), 'warning');
    } finally {
      setCloning(false);
    }
  }, [post.id, onDone]);

  const stat = (icon: string, v: any, gold = false) =>
    v == null ? null : (
      <span className={clsx('flex items-center gap-[4px]', gold && 'text-[#FFC53D] font-[700]')}>
        {icon} <b className={gold ? 'text-[#FFC53D]' : 'text-textColor'}>{nice(v)}</b>
      </span>
    );

  const FIELDS: [string, string][] = [
    ['hook', t('viral_field_hook', 'Opening hook')],
    ['structure', t('viral_field_structure', 'Structure')],
    ['emotion', t('viral_field_emotion', 'Emotional trigger')],
    ['format', t('viral_field_format', 'Format')],
    ['whyShared', t('viral_field_why_shared', 'Why it got shared')],
  ];

  // điểm AI + phán quyết (đã chấm lúc cào/bắt bài)
  const detail = (() => {
    try {
      return post.scoreDetail ? JSON.parse(post.scoreDetail) : null;
    } catch {
      return null;
    }
  })();
  const setStatus = (status: string) => async () => {
    await fetch(`/viral/${post.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    toast.show(
      status === 'approved'
        ? t('viral_approved_toast', 'Approved')
        : status === 'skipped'
        ? t('viral_skipped_toast', 'Skipped')
        : t('viral_pending_toast', 'Moved back to review'),
      'success'
    );
    onDone();
    modal.closeCurrent();
  };
  const SUB_LABELS: Record<string, string> = {
    hook: 'Hook',
    clarity: 'Clarity',
    brand_voice: 'Brand',
    value: 'Value',
    cta: 'CTA',
    seo: 'SEO',
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {post.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.thumbnail} alt="" className="w-full max-h-[220px] object-cover rounded-[10px]" />
      )}
      <div className="flex items-center gap-[8px] text-[12px] text-textItemBlur flex-wrap">
        <span className="flex items-center gap-[5px]">
          <i className="w-[8px] h-[8px] rounded-full inline-block" style={{ background: platMeta(post.platform)?.dot || '#888' }} />
          {platMeta(post.platform)?.label || post.platform}
        </span>
        <span className={clsx('text-[10px] font-[700] px-[8px] py-[2px] rounded-full', LEVEL_STYLE[post.level] || LEVEL_STYLE.all)}>
          {levelLabel(post.level)}
        </span>
        {post.sourceName && <span>· {post.sourceName}</span>}
      </div>
      <div className="text-[15px] font-[600] leading-[1.45]">{post.title}</div>
      {post.content && (
        <div className="text-[13px] text-textColor/80 leading-[1.6] max-h-[160px] overflow-auto whitespace-pre-line bg-newColColor rounded-[8px] p-[12px]">
          {post.content}
        </div>
      )}
      <div className="flex gap-[16px] text-[13px] text-textItemBlur tabular-nums flex-wrap">
        {stat('▶', post.views)}
        {stat('👍', post.likes)}
        {stat('💬', post.comments)}
        {stat('↗', post.shares, true)}
      </div>

      {/* AI chấm điểm theo chân dung + bản viết lại */}
      {post.score != null && (
        <div className="bg-newColColor border border-newBgLineColor rounded-[10px] p-[12px] flex flex-col gap-[8px]">
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className={clsx('text-[13px] font-[800] px-[10px] py-[3px] rounded-[7px]', scoreStyle(post.score))}>
              ⭐ {post.score}/100
            </span>
            {detail?.verdict && <span className="text-[12px] text-textItemBlur">{detail.verdict}</span>}
            {post.persona && (
              <span className="ms-auto text-[11px] font-[700] px-[8px] py-[3px] rounded-full bg-btnPrimary/15 text-btnPrimary">
                {post.persona}
              </span>
            )}
          </div>
          {detail?.scores && (
            <div className="flex gap-[10px] flex-wrap text-[11.5px] text-textItemBlur tabular-nums">
              {Object.entries(SUB_LABELS).map(([k, l]) =>
                detail.scores[k] != null ? (
                  <span key={k}>
                    {l} <b className="text-textColor">{detail.scores[k]}</b>
                  </span>
                ) : null
              )}
            </div>
          )}
          {post.aiContent && (
            <div>
              <div className="text-[10.5px] font-[800] tracking-[0.08em] uppercase text-btnPrimary mb-[4px]">
                {t('viral_ai_rewrite', 'AI rewrite for this persona')}
              </div>
              <div className="text-[12.5px] leading-[1.6] whitespace-pre-line max-h-[150px] overflow-auto">{post.aiContent}</div>
            </div>
          )}
          {(() => {
            // biến thể cho các nhóm khác cùng cấp học (multi-variant)
            try {
              const vs = JSON.parse(post.aiVariants || '[]');
              if (!Array.isArray(vs) || !vs.length) return null;
              return vs.map((v: any, i: number) => (
                <div key={i}>
                  <div className="text-[10.5px] font-[800] tracking-[0.08em] uppercase text-textItemBlur mb-[4px]">
                    ↳ {t('viral_ai_variant', 'Variant')} · {v.persona}
                  </div>
                  <div className="text-[12.5px] leading-[1.6] whitespace-pre-line max-h-[120px] overflow-auto text-textColor/85">{v.text}</div>
                </div>
              ));
            } catch {
              return null;
            }
          })()}
          {detail?.reason && <div className="text-[11.5px] text-textItemBlur">🎯 {detail.reason}</div>}
          {detail?.content_type && (
            <div className="text-[11.5px] text-textItemBlur">
              🏭 {t('viral_produce_suggest', 'AI production suggestion')}:{' '}
              <b className="text-textColor">
                {detail.content_type === 'infographic' ? '🖼 Infographic' : detail.content_type === 'video' ? '🎬 Video' : '📝 Blog'}
              </b>
              {(detail.podcast_score ?? 0) >= 75 && <b className="text-textColor"> + 🎧 Podcast ({detail.podcast_score})</b>}
            </div>
          )}
          <div className="flex gap-[8px] mt-[2px]">
            {post.status !== 'approved' && (
              <button onClick={setStatus('approved')} className="flex-1 py-[8px] rounded-[8px] text-[12.5px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] border border-[#57D9A3]/35 hover:bg-[#57D9A3]/25">
                ✓ {t('viral_approve', 'Approve')}
              </button>
            )}
            {post.status !== 'skipped' && (
              <button onClick={setStatus('skipped')} className="flex-1 py-[8px] rounded-[8px] text-[12.5px] font-[700] text-[#FF5A52] border border-[#FF5A52]/35 hover:bg-[#FF5A52]/10">
                ✕ {t('viral_skip', 'Skip')}
              </button>
            )}
            {post.status !== 'pending' && (
              <button onClick={setStatus('pending')} className="flex-1 py-[8px] rounded-[8px] text-[12.5px] font-[700] text-textItemBlur border border-newBgLineColor hover:text-textColor">
                ↩ {t('viral_back_to_review', 'Back to review')}
              </button>
            )}
          </div>
        </div>
      )}

      {!open ? (
        <div className="flex gap-[8px]">
          {post.url && (
            <a href={post.url} target="_blank" rel="noreferrer" className="flex-1 text-center py-[10px] rounded-[9px] text-[13px] font-[600] border border-newBgLineColor text-textItemBlur hover:text-textColor">
              {t('viral_view_original', 'View original post')}
            </a>
          )}
          <Button onClick={() => setOpen(true)} className="flex-[1.4]">
            {t('viral_dissect_and_clone', 'Dissect the formula & clone')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px] border-t border-newBgLineColor pt-[14px]">
          {isLoading && <div className="text-[13px] text-textItemBlur text-center py-[12px]">{t('viral_dissecting', 'AI is dissecting the formula…')}</div>}
          {!!f &&
            FIELDS.map(([k, label]) => (
              <div key={k} className="bg-newColColor border border-newBgLineColor rounded-[10px] p-[12px]">
                <div className="text-[10.5px] font-[800] tracking-[0.08em] uppercase text-btnPrimary mb-[4px]">{label}</div>
                <p className="text-[12.5px] leading-[1.55]">{f[k]}</p>
              </div>
            ))}
          {!!f && (
            <div className="flex flex-col gap-[8px] mt-[2px]">
              <Button onClick={cloneToMine} loading={cloning}>
                {cloning ? t('viral_claude_writing', 'Claude is writing…') : t('viral_make_mine', 'Rewrite into my post →')}
              </Button>
              <div className="text-[11px] text-textItemBlur text-center">
                {t('viral_make_mine_note', 'AI rewrites this into a better, higher-scoring post that lands in the "My posts" tab — post it to the Calendar from there.')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Thêm nguồn theo dõi ───────────────────────────────────────────────────
const SourceModal: FC<{ onDone: () => void }> = ({ onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('news');
  const [url, setUrl] = useState('');
  const [auto, setAuto] = useState(true);

  const help =
    platform === 'news'
      ? t('viral_help_news', 'URL = RSS feed link of the news site/blog (e.g. .../rss). Crawling is FREE, no key needed.')
      : platform === 'youtube'
      ? t('viral_help_youtube', 'Name = search keyword. Requires a YouTube key (free) in Settings.')
      : platform === 'gnews'
      ? t('viral_help_gnews', 'Keyword = topic (e.g. "nuôi dạy con"). AI expands it into 6-7 related queries, then crawls Google News (last 7 days) — FREE, no key needed.')
      : t('viral_help_apify', 'URL = page/channel link. Requires an Apify token (paid) in Settings to crawl.');
  const isKeyword = platform === 'youtube' || platform === 'gnews';

  const save = useCallback(async () => {
    if (!name.trim()) return;
    await fetch('/viral/sources', { method: 'POST', body: JSON.stringify({ name, platform, url, auto }) });
    onDone();
    modal.closeCurrent();
  }, [name, platform, url, auto, onDone]);

  return (
    <div className="flex flex-col gap-[12px]">
      <Field label={t('viral_platform', 'Platform')}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls}>
          <option value="news">{t('viral_source_news', 'Blog / News (RSS — free)')}</option>
          <option value="gnews">{t('viral_source_gnews', 'Google News (keyword + AI expand — free)')}</option>
          <option value="youtube">{t('viral_source_youtube', 'YouTube (keyword — free)')}</option>
          <option value="facebook">{t('viral_source_facebook', 'Facebook (Apify)')}</option>
          <option value="instagram">{t('viral_source_instagram', 'Instagram (Apify)')}</option>
          <option value="tiktok">{t('viral_source_tiktok', 'TikTok (Apify)')}</option>
        </select>
      </Field>
      <Field label={isKeyword ? t('viral_search_keyword', 'Search keyword') : t('viral_source_name', 'Source name')}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isKeyword ? t('viral_keyword_example', 'e.g. raising a teenager') : t('viral_source_example', 'e.g. VnExpress Education')} className={inputCls} />
      </Field>
      {!isKeyword && (
        <Field label={t('viral_url_label', 'URL')}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={platform === 'news' ? 'https://vnexpress.net/rss/giao-duc.rss' : 'https://facebook.com/tenTrang'} className={inputCls} />
        </Field>
      )}
      <label className="flex items-center gap-[8px] text-[13px] cursor-pointer">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        {t('viral_auto_crawl_schedule', 'Auto-crawl on a schedule')}
      </label>
      <div className="text-[11.5px] text-textItemBlur">{help}</div>
      <Button onClick={save} disabled={!name.trim()}>
        {t('viral_add_source', 'Add source')}
      </Button>
    </div>
  );
};

// ── Cấu hình (token) ──────────────────────────────────────────────────────
const ConfigModal: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const { data, mutate: mutateCfg } = useSWR('viral-config', async () => (await fetch('/viral/config')).json());
  const [apify, setApify] = useState('');
  const [yt, setYt] = useState('');
  const [mmKey, setMmKey] = useState('');
  const [mmGroup, setMmGroup] = useState('');
  const [hours, setHours] = useState<number>(data?.crawlEveryHours ?? 12);

  const save = useCallback(async () => {
    const body: any = { crawlEveryHours: Number(hours) };
    if (apify.trim()) body.apifyToken = apify.trim();
    if (yt.trim()) body.youtubeKey = yt.trim();
    if (mmKey.trim()) body.minimaxKey = mmKey.trim();
    if (mmGroup.trim()) body.minimaxGroupId = mmGroup.trim();
    const res = await fetch('/viral/config', { method: 'POST', body: JSON.stringify(body) });
    if (res.status >= 400) {
      toast.show(t('viral_need_admin', 'System administrator permission required.'), 'warning');
      return;
    }
    toast.show(t('viral_config_saved', 'Configuration saved.'), 'success');
    modal.closeCurrent();
  }, [apify, yt, mmKey, mmGroup, hours]);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="text-[12.5px] text-textItemBlur">
        {t(
          'viral_config_hint',
          'Auto-crawling sources: RSS news/blogs and looking up share counts via Facebook is FREE. YouTube needs a Google key (free). Crawling shares on FB/IG/TikTok needs an Apify token (paid, free tier $5/month).'
        )}
      </div>
      <Field label={`${t('viral_apify_label', 'Apify token — paid, optional')} ${data?.hasApify ? `(${t('viral_saved', 'saved')} ${data.apifyMasked})` : ''}`}>
        <input type="password" value={apify} onChange={(e) => setApify(e.target.value)} placeholder="apify_api_..." className={inputCls} />
      </Field>
      <Field label={`${t('viral_youtube_label', 'YouTube Data key — free')} ${data?.hasYoutube ? `(${t('viral_saved', 'saved')} ${data.youtubeMasked})` : ''}`}>
        <input type="password" value={yt} onChange={(e) => setYt(e.target.value)} placeholder="AIza..." className={inputCls} />
      </Field>
      <Field label={`${t('viral_minimax_label', 'MiniMax TTS key — for podcast production')} ${data?.hasMinimax ? `(${t('viral_saved', 'saved')} ${data.minimaxMasked})` : ''}`}>
        <input type="password" value={mmKey} onChange={(e) => setMmKey(e.target.value)} placeholder="eyJhbGci..." className={inputCls} />
      </Field>
      <Field label={t('viral_minimax_group', 'MiniMax GroupId')}>
        <input value={mmGroup} onChange={(e) => setMmGroup(e.target.value)} placeholder={data?.minimaxGroupId || '19xxxxxxxxxxxxxxxxx'} className={inputCls} />
      </Field>
      <Field label={`${t('viral_bgm_label', 'Podcast background music (mp3)')} ${data?.hasBgm ? `— ✓ ${t('viral_bgm_saved', 'uploaded')}` : ''}`}>
        <div className="flex gap-[8px] items-center">
          <input
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const b64 = await new Promise<string>((res) => {
                const r = new FileReader();
                r.onload = () => res(String(r.result).split(',')[1] || '');
                r.readAsDataURL(f);
              });
              const resp = await fetch('/viral/config/bgm', { method: 'POST', body: JSON.stringify({ base64: b64 }) });
              toast.show(resp.ok ? t('viral_bgm_ok', 'Background music uploaded.') : t('viral_bgm_fail', 'Upload failed (admin only, mp3 ≤30MB).'), resp.ok ? 'success' : 'warning');
              mutateCfg();
            }}
            className="text-[12px] text-textItemBlur file:mr-[8px] file:py-[6px] file:px-[10px] file:rounded-[7px] file:border-0 file:bg-btnPrimary/15 file:text-btnPrimary"
          />
          {data?.hasBgm && (
            <button
              onClick={async () => {
                await fetch('/viral/config/bgm', { method: 'DELETE' });
                mutateCfg();
              }}
              className="text-[12px] text-[#FF5A52] hover:underline"
            >
              ✕ {t('viral_bgm_remove', 'Remove')}
            </button>
          )}
        </div>
      </Field>
      <Field label={t('viral_crawl_cycle', 'Auto-crawl cycle')}>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={inputCls}>
          <option value={0}>{t('viral_crawl_off', 'Off (manual crawl only)')}</option>
          <option value={6}>{t('viral_crawl_6h', 'Every 6 hours')}</option>
          <option value={12}>{t('viral_crawl_12h', 'Every 12 hours')}</option>
          <option value={24}>{t('viral_crawl_daily', 'Every day')}</option>
          <option value={72}>{t('viral_crawl_3d', 'Every 3 days')}</option>
        </select>
      </Field>
      <Button onClick={save}>{t('viral_save_config', 'Save configuration')}</Button>
    </div>
  );
};

// ── Bài của mình (clone) ──────────────────────────────────────────────────
const useMine = () => {
  const fetch = useFetch();
  return useSWR('/viral/mine', async (u: string) => (await fetch(u)).json());
};

// Modal chọn kênh để đăng "Bài của mình" → bản nháp trên Lịch.
const PostMineModal: FC<{ clone: any; onDone: () => void }> = ({ clone, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const { data: integrations } = useIntegrationList();
  const [integrationId, setIntegrationId] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = useCallback(async () => {
    if (!integrationId) {
      toast.show(t('viral_pick_channel_first', 'Pick a target channel first.'), 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/viral/mine/${clone.id}/post`, { method: 'POST', body: JSON.stringify({ integrationId }) });
      if (!res.ok) throw new Error();
      toast.show(t('viral_posted_toast', 'Added as a draft on the Calendar — review & schedule there.'), 'success');
      onDone();
      modal.closeCurrent();
    } catch {
      toast.show(t('viral_post_failed', 'Could not post, try again.'), 'warning');
    } finally {
      setBusy(false);
    }
  }, [integrationId, clone.id]);
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[12.5px] text-textItemBlur">
        {t('viral_post_mine_hint', 'Pick a channel — the content becomes a draft on the Calendar for review, not published right away.')}
      </div>
      <div className="text-[13px] leading-[1.6] whitespace-pre-line max-h-[200px] overflow-auto bg-newColColor rounded-[8px] p-[12px]">{clone.content}</div>
      <select value={integrationId} onChange={(e) => setIntegrationId(e.target.value)} className={inputCls}>
        <option value="">{t('viral_write_for_channel', 'Write for channel…')}</option>
        {(integrations || []).map((i: any) => (
          <option key={i.id} value={i.id}>{i.name} ({i.identifier})</option>
        ))}
      </select>
      <Button onClick={submit} loading={busy}>{t('viral_post_to_calendar', 'Add to Calendar as draft')}</Button>
    </div>
  );
};

// Thẻ "Bài của mình" — bản AI viết lại + điểm mới so với bài gốc.
const MineCard: FC<{ clone: any; onDone: () => void }> = ({ clone, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const [busy, setBusy] = useState<false | 'regen' | 'del'>(false);
  const detail = (() => {
    try {
      return clone.scoreDetail ? JSON.parse(clone.scoreDetail) : null;
    } catch {
      return null;
    }
  })();
  const better = clone.score != null && clone.sourceScore != null && clone.score > clone.sourceScore;
  const openPost = () =>
    modal.openModal({ title: t('viral_post_mine', 'Post this'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[520px]' }, children: <PostMineModal clone={clone} onDone={onDone} /> });
  const openProduceMine = () =>
    modal.openModal({ title: t('viral_modal_produce', 'Produce content'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[520px]' }, children: <ProduceModal ids={[clone.id]} source="clone" onDone={onDone} /> });
  const regen = async () => {
    setBusy('regen');
    try {
      const res = await fetch(`/viral/mine/${clone.id}/regenerate`, { method: 'POST' });
      toast.show(res.ok ? t('viral_regenerated', 'Regenerated — a fresher, higher-scoring version.') : t('viral_regen_failed', 'Could not regenerate.'), res.ok ? 'success' : 'warning');
      onDone();
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!(await deleteDialog(t('viral_delete_mine_confirm', 'Delete this post of yours?'), t('viral_delete', 'Delete')))) return;
    setBusy('del');
    try {
      await fetch(`/viral/mine/${clone.id}`, { method: 'DELETE' });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bg-newColColor border border-newBgLineColor rounded-[13px] p-[14px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[8px] flex-wrap">
        <span className={clsx('text-[12px] font-[800] px-[9px] py-[3px] rounded-[7px] tabular-nums', scoreStyle(clone.score))}>⭐ {clone.score ?? '—'}</span>
        {clone.sourceScore != null && (
          <span className={clsx('text-[11px]', better ? 'text-[#57D9A3]' : 'text-textItemBlur')}>
            {better ? '▲ ' : ''}{t('viral_vs_original', 'vs original')} {clone.sourceScore}
          </span>
        )}
        {clone.persona && <span className="ms-auto text-[10.5px] font-[700] px-[8px] py-[2px] rounded-full bg-btnPrimary/15 text-btnPrimary">{clone.persona}</span>}
      </div>
      {clone.status === 'posted' && (
        <span className="text-[11px] font-[700] text-[#57D9A3]">✓ {t('viral_added_to_calendar', 'Added to Calendar')}</span>
      )}
      <div className="text-[13px] leading-[1.6] whitespace-pre-line max-h-[220px] overflow-auto">{clone.content}</div>
      {detail?.reason && <div className="text-[11.5px] text-textItemBlur">🎯 {detail.reason}</div>}
      <div className="flex gap-[6px] mt-auto pt-[8px] border-t border-newBgLineColor/60">
        <button onClick={openPost} className="flex-1 py-[7px] rounded-[8px] text-[12px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25">
          📤 {t('viral_post_mine', 'Post')}
        </button>
        <button onClick={openProduceMine} className="px-[11px] py-[7px] rounded-[8px] text-[12px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25" title={t('viral_produce_bulk', 'Produce')}>
          🏭
        </button>
        <button onClick={regen} disabled={!!busy} className="px-[11px] py-[7px] rounded-[8px] text-[12px] text-textItemBlur border border-newBgLineColor hover:text-textColor disabled:opacity-50" title={t('viral_regenerate', 'Regenerate a better version')}>
          {busy === 'regen' ? '…' : '↻'}
        </button>
        <button onClick={del} disabled={!!busy} className="px-[11px] py-[7px] rounded-[8px] text-[12px] text-[#FF5A52] hover:bg-[#FF5A52]/10 disabled:opacity-50">✕</button>
      </div>
    </div>
  );
};

// ── SẢN XUẤT (blog / infographic / podcast) ─────────────────────────────────
const useProducts = (active: boolean) => {
  const fetch = useFetch();
  return useSWR(
    active ? '/viral/products' : null,
    async (u: string) => (await fetch(u)).json(),
    // đang có job chạy → tự làm mới mỗi 5s cho tới khi xong
    { refreshInterval: (d) => ((d?.items || []).some((p: any) => p.status === 'processing') ? 5000 : 0) }
  );
};

const FORMAT_META: Record<string, { icon: string; label: string }> = {
  blog: { icon: '📝', label: 'Blog' },
  infographic: { icon: '🖼', label: 'Infographic' },
  podcast: { icon: '🎧', label: 'Podcast' },
};

// Modal chọn định dạng sản xuất cho các bài đã chọn.
// defaults: gợi ý AI (content_type + podcast_score từ lúc chấm) — tick sẵn.
const ProduceModal: FC<{ ids: string[]; source: 'post' | 'clone'; onDone: () => void; defaults?: string[] }> = ({ ids, source, onDone, defaults }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const [formats, setFormats] = useState<Set<string>>(new Set(defaults?.length ? defaults : ['blog']));
  const [busy, setBusy] = useState(false);
  const [bgm, setBgm] = useState(true); // trộn nhạc nền podcast (nếu đã upload nhạc)
  const { data: cfg } = useSWR('viral-config', async () => (await fetch('/viral/config')).json());
  const toggle = (f: string) =>
    setFormats((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
  const submit = useCallback(async () => {
    if (!formats.size) return;
    setBusy(true);
    try {
      const res = await fetch('/viral/produce', {
        method: 'POST',
        body: JSON.stringify({ ids, source, formats: [...formats], bgm: bgm && !!cfg?.hasBgm }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || '');
      toast.show(
        `${t('viral_produce_queued', 'Started producing')} ${d?.queued ?? ''} ${t('viral_produce_queued_suffix', 'items — see the "Products" tab, results appear in a few minutes.')}`,
        'success'
      );
      onDone();
      modal.closeCurrent();
    } catch (e: any) {
      toast.show(e?.message || t('viral_produce_failed', 'Could not start production.'), 'warning');
    } finally {
      setBusy(false);
    }
  }, [ids, source, formats, onDone]);
  const OPTIONS = [
    { key: 'blog', desc: t('viral_produce_blog_desc', 'SEO article for the website (EEAT structure) — download as .docx') },
    { key: 'infographic', desc: t('viral_produce_info_desc', 'AI-designed image (Gemini) — saved to Media library') },
    { key: 'podcast', desc: t('viral_produce_pod_desc', 'Script + Vietnamese TTS voice (MiniMax) — mp3 audio') },
  ];
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[12.5px] text-textItemBlur">
        {t('viral_produce_hint', 'Pick output formats —')} {ids.length} {t('viral_produce_hint_suffix', 'post(s) will be produced in the background, one product per format.')}
      </div>
      {OPTIONS.map((o) => (
        <label key={o.key} className={clsx('flex items-start gap-[10px] p-[12px] rounded-[10px] border cursor-pointer', formats.has(o.key) ? 'border-btnPrimary/60 bg-btnPrimary/10' : 'border-newBgLineColor hover:border-newTableBorder')}>
          <input type="checkbox" checked={formats.has(o.key)} onChange={() => toggle(o.key)} className="mt-[2px]" />
          <span className="flex flex-col gap-[2px]">
            <b className="text-[13px]">{FORMAT_META[o.key].icon} {FORMAT_META[o.key].label}</b>
            <span className="text-[11.5px] text-textItemBlur">{o.desc}</span>
            {o.key === 'podcast' && cfg && !cfg.hasMinimax && (
              <span className="text-[11px] text-[#FFC53D]">⚠ {t('viral_minimax_missing', 'MiniMax key not set — add it in Settings or this format will fail.')}</span>
            )}
            {o.key === 'podcast' && formats.has('podcast') && cfg?.hasBgm && (
              <label className="flex items-center gap-[6px] text-[11.5px] text-textItemBlur cursor-pointer mt-[4px]" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={bgm} onChange={(e) => setBgm(e.target.checked)} />
                🎵 {t('viral_bgm_mix', 'Mix background music (intro 6s · outro 8s · auto-duck under voice)')}
              </label>
            )}
          </span>
        </label>
      ))}
      <Button onClick={submit} loading={busy} disabled={!formats.size}>
        🏭 {t('viral_produce_start', 'Start production')}
      </Button>
    </div>
  );
};

// Xem chi tiết sản phẩm: blog đọc được, podcast nghe + kịch bản.
const ProductDetailModal: FC<{ product: any }> = ({ product }) => {
  const t = useT();
  const meta = (() => {
    try {
      return product.meta ? JSON.parse(product.meta) : {};
    } catch {
      return {};
    }
  })();
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[15px] font-[700] leading-[1.4]">{product.title || product.topic}</div>
      {meta.meta_description && <div className="text-[12px] italic text-textItemBlur">{meta.meta_description}</div>}
      {product.format === 'infographic' && product.mediaPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.mediaPath} alt={product.title || ''} className="w-full rounded-[10px]" />
      )}
      {product.format === 'podcast' && product.mediaPath && (
        <audio controls src={product.mediaPath} className="w-full" />
      )}
      {product.format === 'blog' && product.textContent && (
        <div
          className="text-[13px] leading-[1.7] max-h-[400px] overflow-auto bg-newColColor rounded-[10px] p-[14px] [&_h2]:text-[15px] [&_h2]:font-[700] [&_h2]:mt-[12px] [&_h3]:text-[13.5px] [&_h3]:font-[700] [&_h3]:mt-[8px] [&_p]:mt-[6px] [&_li]:ml-[16px] [&_li]:list-disc [&_table]:w-full [&_td]:border [&_td]:border-newBgLineColor [&_td]:p-[6px] [&_th]:border [&_th]:border-newBgLineColor [&_th]:p-[6px]"
          dangerouslySetInnerHTML={{ __html: product.textContent }}
        />
      )}
      {product.format === 'podcast' && product.textContent && (
        <div className="text-[12.5px] leading-[1.7] max-h-[220px] overflow-auto whitespace-pre-line bg-newColColor rounded-[10px] p-[12px]">
          {product.textContent}
        </div>
      )}
      {Array.isArray(meta.tags) && meta.tags.length > 0 && (
        <div className="text-[11.5px] text-textItemBlur">🏷 {meta.tags.join(', ')}</div>
      )}
    </div>
  );
};

// Thẻ sản phẩm trong tab "Sản phẩm".
const ProductCard: FC<{ product: any; onDone: () => void }> = ({ product, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const [busy, setBusy] = useState(false);
  const fm = FORMAT_META[product.format] || { icon: '📦', label: product.format };
  const openDetail = () =>
    modal.openModal({ title: `${fm.icon} ${fm.label}`, withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[680px]' }, children: <ProductDetailModal product={product} /> });
  const downloadDocx = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch(`/viral/products/${product.id}/docx`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      const bin = atob(d.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = d.fileName || 'blog.docx';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.show(t('viral_docx_failed', 'Could not download .docx.'), 'warning');
    } finally {
      setBusy(false);
    }
  };
  const retry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await fetch(`/viral/products/${product.id}/retry`, { method: 'POST' });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  const del = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await deleteDialog(t('viral_delete_product_confirm', 'Delete this product?'), t('viral_delete', 'Delete')))) return;
    await fetch(`/viral/products/${product.id}`, { method: 'DELETE' });
    onDone();
  };
  return (
    <div onClick={product.status === 'done' ? openDetail : undefined} className={clsx('bg-newColColor border border-newBgLineColor rounded-[13px] overflow-hidden flex flex-col', product.status === 'done' && 'cursor-pointer hover:border-newTableBorder')}>
      {product.format === 'infographic' && product.mediaPath && product.status === 'done' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.mediaPath} alt="" className="w-full max-h-[240px] object-cover" />
      )}
      <div className="p-[13px] flex flex-col gap-[9px] flex-1">
        <div className="flex items-center gap-[7px] flex-wrap">
          <span className="text-[11px] font-[800] px-[9px] py-[3px] rounded-full bg-btnPrimary/15 text-btnPrimary">{fm.icon} {fm.label}</span>
          {product.status === 'processing' && (
            <span className="text-[11px] font-[700] px-[9px] py-[3px] rounded-full bg-[#FFC53D]/15 text-[#FFC53D] animate-pulse">⏳ {t('viral_producing', 'Producing…')}</span>
          )}
          {product.status === 'error' && (
            <span className="text-[11px] font-[700] px-[9px] py-[3px] rounded-full bg-[#FF5A52]/15 text-[#FF5A52]">✕ {t('viral_produce_error', 'Failed')}</span>
          )}
          {product.status === 'done' && (
            <span className="text-[11px] font-[700] px-[9px] py-[3px] rounded-full bg-[#57D9A3]/15 text-[#57D9A3]">✓ {t('viral_produce_done', 'Done')}</span>
          )}
        </div>
        <div className="text-[13.5px] font-[600] leading-[1.4] line-clamp-2">{product.title || product.topic || '—'}</div>
        {product.status === 'error' && product.error && (
          <div className="text-[11.5px] text-[#FF5A52]/90 leading-[1.5] line-clamp-3">{product.error}</div>
        )}
        {product.format === 'podcast' && product.mediaPath && product.status === 'done' && (
          <audio controls src={product.mediaPath} className="w-full h-[36px]" onClick={(e) => e.stopPropagation()} />
        )}
        <div className="flex gap-[6px] mt-auto pt-[8px] border-t border-newBgLineColor/60">
          {product.status === 'done' && product.format === 'blog' && (
            <button onClick={downloadDocx} disabled={busy} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25 disabled:opacity-50">
              ⬇ {t('viral_download_docx', 'Download .docx')}
            </button>
          )}
          {product.status === 'done' && product.format !== 'blog' && product.mediaPath && (
            <a href={product.mediaPath} download onClick={(e) => e.stopPropagation()} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-center bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25">
              ⬇ {t('viral_download', 'Download')}
            </a>
          )}
          {product.status === 'error' && (
            <button onClick={retry} disabled={busy} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-[#FFC53D] border border-[#FFC53D]/40 hover:bg-[#FFC53D]/10 disabled:opacity-50">
              ↻ {t('viral_retry', 'Retry')}
            </button>
          )}
          <button onClick={del} className="px-[10px] py-[6px] rounded-[7px] text-[11.5px] text-[#FF5A52] hover:bg-[#FF5A52]/10">✕</button>
        </div>
      </div>
    </div>
  );
};

// ── Trang chính ───────────────────────────────────────────────────────────
export const ViralComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const toast = useToaster();
  const [platform, setPlatform] = useState('all');
  const [level, setLevel] = useState('all');
  const [sort, setSort] = useState('shares');
  const [tab, setTab] = useState('pending');
  const [crawling, setCrawling] = useState(false);
  const isMine = tab === 'mine';
  const isArchive = tab === 'archive';
  const isProducts = tab === 'products';
  const { data, isLoading, mutate } = useViral(platform, level, sort, tab);
  const { data: mineData, mutate: mutateMine } = useMine();
  const { data: productsData, mutate: mutateProducts } = useProducts(isProducts);
  const refreshAll = useCallback(() => {
    mutate();
    mutateMine();
    mutateProducts();
  }, [mutate, mutateMine, mutateProducts]);

  // Thumbnail hỏng (URL CDN hết hạn → 403): ẩn ảnh, rơi về placeholder nhãn nền tảng.
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  const markThumbBroken = useCallback((id: string) => {
    setBrokenThumbs((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // ── Chọn nhiều thẻ: tick từng cái + kéo-quét (lasso) ─────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const [dragBox, setDragBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);

  // đổi tab → bỏ chọn hết
  useEffect(() => {
    setSelected(new Set());
  }, [tab, platform, level]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const onGridMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, a, select, textarea')) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const s = dragStart.current;
      if (!didDrag.current && Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) < 6) return;
      didDrag.current = true;
      const l = Math.min(e.clientX, s.x);
      const tp = Math.min(e.clientY, s.y);
      const r = Math.max(e.clientX, s.x);
      const b = Math.max(e.clientY, s.y);
      setDragBox({ l, t: tp, w: r - l, h: b - tp });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id in cardRefs.current) {
          const el = cardRefs.current[id];
          if (!el) continue;
          const rc = el.getBoundingClientRect();
          if (rc.left < r && rc.right > l && rc.top < b && rc.bottom > tp) next.add(id);
        }
        return next;
      });
    };
    const up = () => {
      dragStart.current = null;
      setDragBox(null);
      // giữ cờ để click ngay sau khi kéo không mở chi tiết
      setTimeout(() => {
        didDrag.current = false;
      }, 30);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const bulkAction = useCallback(
    async (action: string) => {
      const ids = [...selected];
      if (!ids.length) return;
      if (action === 'hard-delete') {
        if (!(await deleteDialog(`${t('viral_hard_delete_confirm', 'Permanently delete from the database')} (${ids.length})?`, t('viral_delete', 'Delete')))) return;
      }
      const res = await (await fetch('/viral/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) })).json();
      if (action === 'clone') {
        toast.show(`${t('viral_cloning_n', 'Creating')} ${res?.queued ?? ids.length} ${t('viral_cloning_n_suffix', 'posts of yours — check the "My posts" tab in a few minutes.')}`, 'success');
      }
      setSelected(new Set());
      refreshAll();
    },
    [selected, refreshAll, t]
  );

  const selectAllOnPage = useCallback(() => {
    const items = data?.items || [];
    setSelected((prev) => (prev.size >= items.length && items.length > 0 ? new Set() : new Set(items.map((p: any) => p.id))));
  }, [data]);

  const purgeArchive = useCallback(async () => {
    if (!(await deleteDialog(t('viral_purge_all_confirm', 'Permanently delete the ENTIRE archive from the database?'), t('viral_delete_all', 'Delete all')))) return;
    await fetch('/viral/archive/purge', { method: 'POST' });
    setSelected(new Set());
    mutate();
  }, [mutate, t]);

  const openCapture = () =>
    modal.openModal({ title: t('viral_modal_add_post', 'Add viral post'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[540px]' }, children: <CaptureModal onDone={refreshAll} /> });
  const openDetail = (post: any) => () =>
    modal.openModal({ title: t('viral_modal_post', 'Viral post'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[600px]' }, children: <DetailModal post={post} onDone={refreshAll} /> });
  const openSource = () =>
    modal.openModal({ title: t('viral_modal_add_source', 'Add tracked source'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[500px]' }, children: <SourceModal onDone={mutate} /> });
  const openConfig = () =>
    modal.openModal({ title: t('viral_modal_config', 'Auto-crawl configuration'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[520px]' }, children: <ConfigModal /> });
  // Sản xuất: từ các thẻ đã chọn → chọn định dạng → job chạy nền → tab Sản phẩm.
  // Tick sẵn theo gợi ý AI: content_type đa số + podcast nếu có bài podcast_score>=75.
  const openProduce = useCallback(() => {
    const ids = [...selected];
    if (!ids.length) return;
    const chosen = (data?.items || []).filter((p: any) => selected.has(p.id));
    const count: Record<string, number> = {};
    let podcast = false;
    for (const p of chosen) {
      try {
        const d = JSON.parse(p.scoreDetail || '{}');
        if (d.content_type === 'blog' || d.content_type === 'infographic') count[d.content_type] = (count[d.content_type] || 0) + 1;
        if ((d.podcast_score ?? 0) >= 75) podcast = true;
      } catch {
        /* thẻ chưa chấm — bỏ qua gợi ý */
      }
    }
    const top = (count.infographic || 0) > (count.blog || 0) ? 'infographic' : 'blog';
    const defaults = podcast ? [top, 'podcast'] : [top];
    modal.openModal({
      title: t('viral_modal_produce', 'Produce content'),
      withCloseButton: true,
      classNames: { modal: 'w-[100%] max-w-[520px]' },
      children: (
        <ProduceModal
          ids={ids}
          source="post"
          defaults={defaults}
          onDone={() => {
            setSelected(new Set());
            setTab('products');
            refreshAll();
          }}
        />
      ),
    });
  }, [selected, data, refreshAll, t]);

  const crawlNow = useCallback(async () => {
    setCrawling(true);
    try {
      const res = await (await fetch('/viral/crawl', { method: 'POST' })).json();
      if (res?.added) {
        toast.show(
          `${t('viral_crawled_prefix', 'Crawled')} ${res.added} ${t('viral_crawled_suffix', 'new posts.')} ${t('viral_scoring_bg', 'AI is scoring them in the background — scores appear in a few minutes.')}`,
          'success'
        );
      } else if (res?.scanned) {
        toast.show(
          `${t('viral_scanned_no_new', 'Scanned')} ${res.scanned} ${t('viral_scanned_no_new_suffix', 'sources — no new posts (all already captured).')}`,
          'warning'
        );
      } else {
        toast.show(t('viral_no_sources', 'No sources yet — add a source below first.'), 'warning');
      }
      mutate();
    } finally {
      setCrawling(false);
    }
  }, [mutate]);

  const quickStatus = (id: string, status: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/viral/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    mutate();
  };
  const toggleSourceAuto = (s: any) => async () => {
    await fetch(`/viral/sources/${s.id}/auto`, { method: 'POST', body: JSON.stringify({ auto: !s.auto }) });
    mutate();
  };

  const removePost = (id: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await deleteDialog(t('viral_delete_post_confirm', 'Remove this post from the forge?'), t('viral_delete', 'Delete')))) return;
    await fetch(`/viral/${id}`, { method: 'DELETE' });
    mutate();
  };
  // Nhập bộ nguồn n8n (KOL/đối thủ/group + keyword Google News) — trùng thì bỏ qua.
  const importDefaultSources = useCallback(async () => {
    const res = await (await fetch('/viral/sources/import-defaults', { method: 'POST' })).json();
    toast.show(
      res?.added
        ? `${t('viral_imported_sources', 'Imported')} ${res.added} ${t('viral_imported_sources_suffix', 'sources. FB/TikTok stay OFF until you add an Apify token; Google News keywords are AUTO right away.')}`
        : t('viral_imported_none', 'All pack sources already exist.'),
      res?.added ? 'success' : 'warning'
    );
    mutate();
  }, [mutate, t]);

  const removeSource = (id: string) => async () => {
    if (!(await deleteDialog(t('viral_unfollow_source_confirm', 'Stop tracking this source?'), t('viral_unfollow', 'Remove')))) return;
    await fetch(`/viral/sources/${id}`, { method: 'DELETE' });
    mutate();
  };
  // Lưu trữ: khôi phục 1 thẻ về Chờ duyệt / xóa cứng 1 thẻ (qua endpoint bulk).
  const restoreOne = (id: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch('/viral/bulk', { method: 'POST', body: JSON.stringify({ ids: [id], action: 'pending' }) });
    mutate();
  };
  const hardDeleteOne = (id: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await deleteDialog(t('viral_hard_delete_one_confirm', 'Permanently delete this post from the database?'), t('viral_delete', 'Delete')))) return;
    await fetch('/viral/bulk', { method: 'POST', body: JSON.stringify({ ids: [id], action: 'hard-delete' }) });
    mutate();
  };

  const stats = data?.stats;
  const items = data?.items || [];
  const sources = data?.sources || [];

  const QUICK = [
    { label: 'TikTok Trending', href: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en' },
    { label: 'FB Ad Library', href: 'https://www.facebook.com/ads/library/' },
    { label: 'Google Trends', href: 'https://trends.google.com/trends/?geo=VN' },
    { label: 'YouTube Trending', href: 'https://www.youtube.com/feed/trending' },
  ];

  return (
    <div className="flex-1 bg-newBgColorInner p-[24px] mobile:p-[14px] overflow-auto flex flex-col gap-[16px]">
      {/* header: stats bên trái + nút bên phải, MỘT hàng cho gọn diện tích */}
      <div className="flex items-center gap-[10px] flex-wrap">
        <div className="flex gap-[22px] px-[16px] py-[8px] bg-newColColor border border-newBgLineColor rounded-[10px] flex-wrap items-center">
          {[
            [stats?.total ?? '—', t('viral_stat_captured', 'posts captured'), false],
            [nice(stats?.totalShares) ?? '—', t('viral_stat_total_shares', 'total shares'), true],
            [stats?.cloned ?? '—', t('viral_stat_cloned', 'cloned'), false],
            [stats?.sources ?? '—', t('viral_stat_sources', 'tracked sources'), false],
          ].map(([v, k, gold], i) => (
            <div key={i} className="flex items-baseline gap-[6px]">
              <span className={clsx('text-[16px] font-[700] tabular-nums', gold && 'text-[#FFC53D]')}>{v as any}</span>
              <span className="text-[11px] text-textItemBlur">{k as any}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={openConfig} title={t('viral_modal_config', 'Auto-crawl configuration')} className="h-[40px] px-[12px] rounded-[9px] border border-newBgLineColor text-textItemBlur hover:text-textColor text-[13px]">
          {t('viral_config_button', 'Settings')}
        </button>
        <button onClick={crawlNow} disabled={crawling} className="h-[40px] px-[14px] rounded-[9px] border border-newBgLineColor bg-newColColor text-[13px] font-[600] disabled:opacity-50">
          {crawling ? t('viral_crawling', 'Crawling…') : t('viral_crawl_now', 'Crawl now')}
        </button>
        <Button onClick={openCapture}>{t('viral_add_post_button', 'Add viral post')}</Button>
      </div>

      {/* LUỒNG 4 BƯỚC: ①Chờ duyệt → ②Đã duyệt → ③Bài của mình → ④Sản phẩm.
          Lưu trữ nằm NGOÀI luồng (bên phải). Dưới tabs có dòng hướng dẫn bước. */}
      <div className="flex items-center gap-[6px] flex-wrap">
        {[
          ['pending', t('viral_status_pending', 'To review'), data?.statusCounts?.pending],
          ['approved', t('viral_status_approved', 'Approved'), data?.statusCounts?.approved],
          ['mine', t('viral_tab_mine', 'My posts'), data?.statusCounts?.mine],
          ['products', t('viral_tab_products', 'Products'), data?.statusCounts?.products],
        ].map(([k, l, count], i) => (
          <Fragment key={k as string}>
            {i > 0 && <span className="text-textItemBlur/50 text-[14px] font-[700] select-none px-[1px]">→</span>}
            <button
              onClick={() => setTab(k as string)}
              className={clsx(
                'flex items-center gap-[7px] px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-[700] border',
                tab === k
                  ? 'bg-btnPrimary/15 border-btnPrimary/50 text-btnPrimary'
                  : 'border-newBgLineColor text-textItemBlur hover:text-textColor'
              )}
            >
              <span
                className={clsx(
                  'w-[18px] h-[18px] rounded-full grid place-items-center text-[10.5px] font-[800] shrink-0',
                  tab === k ? 'bg-btnPrimary text-white' : 'bg-newColColor border border-newBgLineColor'
                )}
              >
                {i + 1}
              </span>
              {l as string}
              {count != null && <span className="tabular-nums opacity-80">{count as number}</span>}
            </button>
          </Fragment>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setTab('archive')}
          className={clsx(
            'px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-[700] border',
            tab === 'archive'
              ? 'bg-newColColor border-newTableBorder text-textColor'
              : 'border-newBgLineColor text-textItemBlur hover:text-textColor'
          )}
        >
          🗄 {t('viral_tab_archive', 'Archive')}
          {data?.statusCounts?.archive != null && (
            <span className="ms-[6px] tabular-nums opacity-80">{data.statusCounts.archive}</span>
          )}
        </button>
      </div>

      {/* hướng dẫn bước hiện tại — ai mới vào nhìn là biết làm gì tiếp */}
      <div className="flex items-start gap-[8px] text-[12px] leading-[1.55] text-textItemBlur bg-newColColor border border-newBgLineColor rounded-[9px] px-[13px] py-[8px]">
        <span className="shrink-0">💡</span>
        <span>
          {tab === 'pending' && t('viral_flow_pending', 'Step 1 · AI crawled & scored these posts. ✓ Approve → moves to "Approved" · ✕ Skip → goes to Archive (auto-deleted after 7 days). Posts scoring ≥90 are auto-approved.')}
          {tab === 'approved' && t('viral_flow_approved', 'Step 2 · Posts you approved. Select cards → "⧉ Clone" lets AI rewrite them as your own posts (step 3), or "🏭 Produce" turns them straight into blog/infographic/podcast (step 4).')}
          {tab === 'mine' && t('viral_flow_mine', 'Step 3 · AI-rewritten posts for Việt Anh (scored higher than the original). 📤 Post to Calendar as a draft, ↻ regenerate a better version, or 🏭 Produce final products.')}
          {tab === 'products' && t('viral_flow_products', 'Step 4 · Final products: read the blog & download .docx, view/download the infographic, listen/download the podcast mp3 — ready to publish on the website, YouTube or fanpage.')}
          {tab === 'archive' && t('viral_flow_archive', 'Outside the flow · Skipped + deleted posts rest here. Everything is permanently deleted after 7 days. You can still ↩ Restore a post back to "To review".')}
        </span>
      </div>

      {/* thanh thao tác hàng loạt + điều khiển Lưu trữ */}
      {(selected.size > 0 || isArchive) && (
        <div className="flex items-center gap-[8px] flex-wrap bg-newColColor border border-newBgLineColor rounded-[10px] px-[14px] py-[9px]">
          {selected.size > 0 ? (
            <>
              <span className="text-[12.5px] font-[700] text-textColor">{selected.size} {t('viral_selected', 'selected')}</span>
              <button onClick={selectAllOnPage} className="text-[12px] text-btnPrimary hover:underline">{t('viral_select_all', 'Select all')}</button>
              <button onClick={() => setSelected(new Set())} className="text-[12px] text-textItemBlur hover:text-textColor">{t('viral_clear_selection', 'Clear')}</button>
              <div className="w-[1px] h-[18px] bg-newBgLineColor mx-[2px]" />
              {!isArchive ? (
                <>
                  <button onClick={() => bulkAction('approve')} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25">✓ {t('viral_approve', 'Approve')}</button>
                  <button onClick={() => bulkAction('skip')} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] text-[#FF5A52] border border-[#FF5A52]/30 hover:bg-[#FF5A52]/10">✕ {t('viral_skip', 'Skip')}</button>
                  <button onClick={() => bulkAction('clone')} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25">⧉ {t('viral_clone_bulk', 'Clone → My posts')}</button>
                  <button onClick={openProduce} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25">🏭 {t('viral_produce_bulk', 'Produce')}</button>
                  <button onClick={() => bulkAction('delete')} className="h-[32px] px-[12px] rounded-[8px] text-[12px] text-textItemBlur border border-newBgLineColor hover:text-textColor">🗑 {t('viral_move_archive', 'Archive')}</button>
                </>
              ) : (
                <>
                  <button onClick={() => bulkAction('pending')} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] text-btnPrimary border border-btnPrimary/40 hover:bg-btnPrimary/10">↩ {t('viral_restore', 'Restore')}</button>
                  <button onClick={() => bulkAction('hard-delete')} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] text-[#FF5A52] border border-[#FF5A52]/40 hover:bg-[#FF5A52]/10">✕ {t('viral_delete_forever', 'Delete forever')}</button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="text-[12px] text-textItemBlur">🗄 {t('viral_archive_note', 'Skipped + deleted posts. Everything here is auto-deleted after 7 days.')}</span>
              <button onClick={purgeArchive} className="ms-auto h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] text-[#FF5A52] border border-[#FF5A52]/40 hover:bg-[#FF5A52]/10">🗑 {t('viral_delete_all', 'Delete all from database')}</button>
            </>
          )}
        </div>
      )}

      {/* filters (không áp dụng cho tab Bài của mình / Sản phẩm) */}
      {!isMine && !isProducts && (
      <div className="flex flex-col gap-[8px]">
        <div className="flex gap-[6px] flex-wrap">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPlatform(p.key)}
              className={clsx(
                'px-[13px] py-[7px] rounded-[8px] text-[12.5px] font-[600] border',
                platform === p.key ? 'bg-newColColor border-newBgLineColor text-textColor' : 'border-transparent text-textItemBlur hover:text-textColor'
              )}
            >
              {p.dot && <i className="inline-block w-[7px] h-[7px] rounded-full mr-[6px] align-[1px]" style={{ background: p.dot }} />}
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-[6px] items-center flex-wrap">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-textItemBlur mr-[2px]">{t('viral_school_level', 'School level')}</span>
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={clsx('px-[11px] py-[5px] rounded-full text-[11.5px] font-[600] border', level === l.key ? 'bg-btnPrimary/15 border-btnPrimary/50 text-btnPrimary' : 'border-newBgLineColor text-textItemBlur')}
            >
              {l.label}
            </button>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="ms-auto bg-newColColor border border-newBgLineColor rounded-[8px] px-[10px] py-[7px] text-[12.5px] outline-none">
            <option value="shares">{t('viral_sort_top_shares', 'Most shares')}</option>
            <option value="score">{t('viral_sort_score', 'Highest AI score')}</option>
            <option value="new">{t('viral_sort_recent', 'Recently captured')}</option>
          </select>
        </div>
      </div>
      )}

      {/* Sản phẩm sản xuất */}
      {isProducts ? (
        !(productsData?.items || []).length ? (
          <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[36px] text-center">
            <div className="text-[15px] font-[600] mb-[6px]">{t('viral_products_empty_title', 'No products yet')}</div>
            <div className="text-[12.5px] text-textItemBlur max-w-[480px] mx-auto">
              {t('viral_products_empty_desc', 'Select approved posts (or use "My posts") and press "🏭 Produce" — AI turns each into a blog, infographic, or podcast that lands here.')}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px]">
            {(productsData.items || []).map((p: any) => (
              <ProductCard key={p.id} product={p} onDone={refreshAll} />
            ))}
          </div>
        )
      ) : /* Bài của mình */
      isMine ? (
        !(mineData?.items || []).length ? (
          <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[36px] text-center">
            <div className="text-[15px] font-[600] mb-[6px]">{t('viral_mine_empty_title', 'No posts of yours yet')}</div>
            <div className="text-[12.5px] text-textItemBlur max-w-[460px] mx-auto">
              {t('viral_mine_empty_desc', 'In "To review" or "Approved", select posts and press "Clone → My posts". AI rewrites each into a better, higher-scoring post that lands here — ready to post.')}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[14px]">
            {(mineData.items || []).map((c: any) => (
              <MineCard key={c.id} clone={c} onDone={refreshAll} />
            ))}
          </div>
        )
      ) : /* các tab bài viral: chờ duyệt / đã duyệt / lưu trữ */
      isLoading ? (
        <div className="text-[13px] text-textItemBlur p-[30px] text-center">{t('viral_loading', 'Loading…')}</div>
      ) : !items.length ? (
        // Lọc/tab đang lọc ra rỗng nhưng tài khoản CÓ dữ liệu → báo "không khớp bộ lọc" + nút xóa lọc,
        // thay vì màn hình onboarding lần đầu.
        (platform !== 'all' || level !== 'all') && (stats?.total ?? 0) > 0 ? (
          <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[36px] text-center">
            <div className="text-[15px] font-[600] mb-[6px]">{t('viral_no_match_title', 'No posts match these filters')}</div>
            <div className="text-[12.5px] text-textItemBlur mb-[14px] max-w-[440px] mx-auto">
              {t('viral_no_match_desc', 'Nothing in this tab matches the current platform / school-level filters. Clear the filters to see everything again.')}
            </div>
            <Button
              onClick={() => {
                setPlatform('all');
                setLevel('all');
              }}
            >
              {t('viral_clear_filters', 'Clear filters')}
            </Button>
          </div>
        ) : (
        <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[36px] text-center">
          <div className="text-[15px] font-[600] mb-[6px]">
            {isArchive ? t('viral_archive_empty', 'Archive is empty') : t('viral_empty_title', 'No data yet')}
          </div>
          <div className="text-[12.5px] text-textItemBlur mb-[14px] max-w-[440px] mx-auto">
            {t('viral_empty_desc', 'Paste a link/image/text of a post being heavily shared, or add an RSS source and click "Crawl now". AI will classify it and dissect the formula.')}
          </div>
          {!isArchive && <Button onClick={openCapture}>{t('viral_add_first_post', 'Add the first post')}</Button>}
        </div>
        )
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-[14px] select-none"
          onMouseDown={onGridMouseDown}
        >
          {items.map((p: any) => {
            const sel = selected.has(p.id);
            return (
            <div
              key={p.id}
              ref={(el) => {
                cardRefs.current[p.id] = el;
              }}
              onClick={() => {
                if (didDrag.current) return;
                openDetail(p)();
              }}
              className={clsx(
                'group/card relative cursor-pointer bg-newColColor border rounded-[13px] overflow-hidden flex flex-col transition-colors',
                sel ? 'border-btnPrimary ring-2 ring-btnPrimary/40' : 'border-newBgLineColor hover:border-newTableBorder'
              )}
            >
              {/* ô tích chọn */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelect(p.id);
                }}
                className={clsx(
                  'absolute z-[10] top-[8px] left-[8px] w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center text-[13px] font-[900] transition-all',
                  sel ? 'bg-btnPrimary border-btnPrimary text-white' : 'bg-black/50 border-white/60 text-transparent opacity-0 group-hover/card:opacity-100'
                )}
                title={t('viral_select', 'Select')}
                aria-label={t('viral_select', 'Select')}
              >
                ✓
              </button>
              <div className="relative aspect-video bg-newBgColor grid place-items-center">
                {p.thumbnail && !brokenThumbs.has(p.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => markThumbBroken(p.id)}
                  />
                ) : (
                  <span className="text-[13px] text-textItemBlur">{platMeta(p.platform)?.label}</span>
                )}
                <span className="absolute bottom-[8px] left-[8px] text-[10.5px] font-[700] px-[9px] py-[3px] rounded-full bg-black/70 text-white flex items-center gap-[5px]">
                  <i className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: platMeta(p.platform)?.dot || '#888' }} />
                  {platMeta(p.platform)?.label || p.platform}
                </span>
                {p.score != null && (
                  <span className={clsx('absolute top-[8px] right-[8px] text-[11px] font-[800] px-[8px] py-[3px] rounded-[7px] tabular-nums', scoreStyle(p.score))}>
                    ⭐ {p.score}
                  </span>
                )}
                {p.origin === 'auto' && (
                  <span className={clsx('absolute right-[8px] text-[9px] font-[700] tracking-[0.05em] px-[7px] py-[3px] rounded-[6px] bg-black/60 text-[#57D9A3]', p.score != null ? 'top-[34px]' : 'top-[8px]')}>
                    AUTO
                  </span>
                )}
                {!isArchive && (
                  <button
                    onClick={removePost(p.id)}
                    title={t('viral_delete', 'Delete')}
                    aria-label={t('viral_delete', 'Delete')}
                    className="absolute bottom-[8px] right-[8px] w-[22px] h-[22px] rounded-[6px] bg-black/60 text-white/70 text-[11px] opacity-0 group-hover/card:opacity-100 transition-opacity hover:text-red-400"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="p-[12px] flex flex-col gap-[8px] flex-1">
                <div className="flex items-center gap-[6px] text-[11px] text-textItemBlur">
                  <span className={clsx('text-[10px] font-[700] px-[8px] py-[2px] rounded-full', LEVEL_STYLE[p.level] || LEVEL_STYLE.all)}>{levelLabel(p.level)}</span>
                  <span className="truncate">{p.sourceName || '—'}</span>
                </div>
                <div className="text-[13.5px] font-[600] leading-[1.4] line-clamp-2 min-h-[38px]">{p.title}</div>
                <div className="flex gap-[11px] text-[12px] text-textItemBlur tabular-nums flex-wrap mt-auto">
                  {p.views != null && <span>▶ <b className="text-textColor">{nice(p.views)}</b></span>}
                  {p.likes != null && <span>👍 <b className="text-textColor">{nice(p.likes)}</b></span>}
                  {p.comments != null && <span>💬 <b className="text-textColor">{nice(p.comments)}</b></span>}
                  {p.shares ? (
                    <span className="text-[#FFC53D]">↗ <b className="text-[#FFC53D] text-[13px] font-[800]">{nice(p.shares)}</b></span>
                  ) : (
                    <span className="italic opacity-70" title={t('viral_no_share_data_hint', 'Share count not available yet')}>{t('viral_no_share_data', 'no share data')}</span>
                  )}
                  {p.clonedCount > 0 && <span title={t('viral_stat_cloned', 'cloned')}>↺ {p.clonedCount}</span>}
                  {(() => {
                    // gợi ý sản xuất AI (content_type + podcast) — gán lúc chấm điểm
                    try {
                      const d = JSON.parse(p.scoreDetail || '{}');
                      if (!d.content_type) return null;
                      const ic = d.content_type === 'infographic' ? '🖼' : d.content_type === 'video' ? '🎬' : '📝';
                      return (
                        <span className="ms-auto" title={t('viral_produce_suggest', 'AI production suggestion')}>
                          {ic}{(d.podcast_score ?? 0) >= 75 ? ' 🎧' : ''}
                        </span>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                </div>
                {/* hành động nhanh theo tab */}
                <div className="flex gap-[6px] pt-[8px] border-t border-newBgLineColor/60">
                  {isArchive ? (
                    <>
                      <button onClick={restoreOne(p.id)} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-btnPrimary hover:bg-btnPrimary/10">
                        ↩ {t('viral_restore', 'Restore')}
                      </button>
                      <button onClick={hardDeleteOne(p.id)} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-[#FF5A52] hover:bg-[#FF5A52]/10">
                        ✕ {t('viral_delete_forever', 'Delete forever')}
                      </button>
                    </>
                  ) : p.status === 'pending' ? (
                    <>
                      <button onClick={quickStatus(p.id, 'approved')} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] bg-[#57D9A3]/12 text-[#57D9A3] hover:bg-[#57D9A3]/25">
                        ✓ {t('viral_approve', 'Approve')}
                      </button>
                      <button onClick={quickStatus(p.id, 'skipped')} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-[#FF5A52] hover:bg-[#FF5A52]/10">
                        ✕ {t('viral_skip', 'Skip')}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={clsx('flex-1 py-[6px] text-center rounded-[7px] text-[11px] font-[700]', p.status === 'approved' ? 'text-[#57D9A3]' : 'text-textItemBlur')}>
                        {p.status === 'approved' ? `✓ ${t('viral_status_approved', 'Approved')}` : `✕ ${t('viral_status_skipped', 'Skipped')}`}
                      </span>
                      <button onClick={quickStatus(p.id, 'pending')} title={t('viral_back_to_review', 'Back to review')} aria-label={t('viral_back_to_review', 'Back to review')} className="px-[10px] py-[6px] rounded-[7px] text-[11.5px] text-textItemBlur hover:text-textColor">
                        ↩
                      </button>
                    </>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail(p)();
                    }}
                    className="px-[10px] py-[6px] rounded-[7px] text-[11.5px] font-[700] text-btnPrimary hover:bg-btnPrimary/10"
                    title={t('viral_dissect_and_clone', 'Dissect the formula & clone')}
                    aria-label={t('viral_dissect_and_clone', 'Dissect the formula & clone')}
                  >
                    ⧉
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* khung kéo-quét chọn (lasso) */}
      {dragBox && (
        <div
          className="fixed z-[400] border-2 border-btnPrimary bg-btnPrimary/10 rounded-[4px] pointer-events-none"
          style={{ left: dragBox.l, top: dragBox.t, width: dragBox.w, height: dragBox.h }}
        />
      )}

      {/* nguồn nhanh (free chính chủ) */}
      <div className="flex gap-[8px] flex-wrap items-center">
        <span className="text-[11px] uppercase tracking-[0.06em] text-textItemBlur">{t('viral_free_trending_sources', 'Free trending sources')}</span>
        {QUICK.map((q) => (
          <a key={q.label} href={q.href} target="_blank" rel="noreferrer" className="text-[12px] px-[11px] py-[6px] rounded-full border border-newBgLineColor text-textItemBlur hover:text-textColor">
            {q.label} ↗
          </a>
        ))}
      </div>

      {/* nguồn theo dõi */}
      <div className="border-t border-newBgLineColor pt-[14px] flex flex-col gap-[10px]">
        <div className="text-[14px] font-[650]">
          {t('viral_tracked_sources', 'Tracked sources')} <span className="text-[11.5px] text-textItemBlur font-[400]">{t('viral_tracked_sources_note', '— the system auto-crawls new posts on a schedule')}</span>
        </div>
        <div className="flex gap-[8px] flex-wrap">
          {sources.map((s: any) => (
            <div key={s.id} className="flex items-center gap-[7px] bg-newColColor border border-newBgLineColor rounded-full px-[13px] py-[6px] text-[12px]">
              <i className="w-[8px] h-[8px] rounded-full inline-block" style={{ background: platMeta(s.platform)?.dot || '#888' }} />
              <span className="font-[600]">{s.name}</span>
              <button
                onClick={toggleSourceAuto(s)}
                title={t('viral_toggle_auto', 'Toggle scheduled auto-crawl for this source')}
                className={clsx(
                  'text-[9.5px] font-[700] px-[6px] py-[1px] rounded-[5px] border',
                  s.auto
                    ? 'text-[#57D9A3] border-[#57D9A3]/40 bg-[#57D9A3]/10'
                    : 'text-textItemBlur border-newBgLineColor hover:text-textColor'
                )}
              >
                {s.auto ? 'AUTO' : 'OFF'}
              </button>
              <button onClick={removeSource(s.id)} className="text-textItemBlur hover:text-red-400 text-[11px] ms-[2px]">✕</button>
            </div>
          ))}
          <button onClick={openSource} className="border border-dashed border-newBgLineColor rounded-full px-[14px] py-[6px] text-[12px] text-textItemBlur hover:text-textColor">
            ＋ {t('viral_add_source', 'Add source')}
          </button>
          <button
            onClick={importDefaultSources}
            title={t('viral_import_sources_hint', 'KOLs, competitor schools, parent groups (needs Apify) + 10 Google News keywords (free)')}
            className="border border-dashed border-btnPrimary/40 text-btnPrimary rounded-full px-[14px] py-[6px] text-[12px] hover:bg-btnPrimary/10"
          >
            📥 {t('viral_import_sources', 'Import n8n source pack')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViralComponent;
