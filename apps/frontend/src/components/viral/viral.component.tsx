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
import { MobileFab } from '@gitroom/frontend/components/new-layout/mobile.fab';
import { useIsMobile } from '@gitroom/frontend/components/new-layout/use.is.mobile';

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
      toast.show(t('viral_clone_to_mine_success', 'Creating your social post — check the "Ready to post" tab in a few minutes.'), 'success');
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
  // Cách gom cụm content: 'ai' (Claude gom cả mẻ cào) hoặc 'embeddings' (vector).
  const [clusterMode, setClusterMode] = useState<string>(data?.clusterMode ?? 'ai');
  useEffect(() => {
    if (data?.clusterMode) setClusterMode(data.clusterMode);
  }, [data?.clusterMode]);
  // Phễu tự động 90/70/3: ≥duyệt → tự duyệt (+tự sản xuất) · <bỏ → tự bỏ ·
  // ở giữa → AI viết lại tối đa N vòng rồi chờ người duyệt.
  const [approveMin, setApproveMin] = useState<number>(90);
  const [skipMax, setSkipMax] = useState<number>(70);
  const [maxRounds, setMaxRounds] = useState<number>(3);
  const [autoProduce, setAutoProduce] = useState<boolean>(true);
  const [paused, setPaused] = useState<boolean>(false);
  useEffect(() => {
    if (!data) return;
    if (typeof data.autoApproveMin === 'number') setApproveMin(data.autoApproveMin);
    if (typeof data.autoSkipMax === 'number') setSkipMax(data.autoSkipMax);
    if (typeof data.rewriteMaxRounds === 'number') setMaxRounds(data.rewriteMaxRounds);
    if (typeof data.autoProduce === 'boolean') setAutoProduce(data.autoProduce);
    if (typeof data.productionPaused === 'boolean') setPaused(data.productionPaused);
  }, [data]);
  // Nhóm Zalo nhận bản tin tuần — danh sách lấy từ bot qua proxy /botapi
  // (same-origin, cookie đăng nhập Hub đi kèm; KHÔNG qua useFetch backend).
  const [zaloThread, setZaloThread] = useState<string>(data?.reportZaloThreadId ?? '');
  const [zaloGroups, setZaloGroups] = useState<{ threadId: string; name?: string }[]>([]);
  const [zaloGroupsError, setZaloGroupsError] = useState(false);
  useEffect(() => {
    if (data?.reportZaloThreadId != null) setZaloThread(data.reportZaloThreadId);
  }, [data?.reportZaloThreadId]);
  useEffect(() => {
    (async () => {
      try {
        const r = await window.fetch('/botapi/api/postiz/groups', { signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw new Error();
        const j = await r.json();
        const list = (Array.isArray(j) ? j : j?.groups || [])
          .map((g: any) => ({ threadId: String(g.threadId || g.id || ''), name: g.name || g.label }))
          .filter((g: any) => g.threadId);
        setZaloGroups(list);
      } catch {
        setZaloGroupsError(true);
      }
    })();
  }, []);

  const save = useCallback(async () => {
    const body: any = {
      crawlEveryHours: Number(hours),
      reportZaloThreadId: zaloThread,
      clusterMode,
      autoApproveMin: Number(approveMin),
      autoSkipMax: Number(skipMax),
      rewriteMaxRounds: Number(maxRounds),
      autoProduce,
      productionPaused: paused,
    };
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
  }, [apify, yt, mmKey, mmGroup, hours, zaloThread, clusterMode, approveMin, skipMax, maxRounds, autoProduce, paused]);

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
          <option value={246}>{t('viral_crawl_mwf', 'Mon-Wed-Fri 7pm + weekly brief to Zalo/email')}</option>
        </select>
      </Field>
      {/* Cách gom nhiều bài cùng nội dung thành 1 "content" để duyệt */}
      <Field label={t('viral_cluster_mode', 'Grouping posts into one content')}>
        <select value={clusterMode} onChange={(e) => setClusterMode(e.target.value)} className={inputCls}>
          <option value="ai">{t('viral_cluster_ai', 'AI reads each crawl batch (accurate, per crawl)')}</option>
          <option value="embeddings">{t('viral_cluster_emb', 'Embeddings vector (cheaper, spans crawls)')}</option>
        </select>
        <span className="text-[11px] text-textItemBlur mt-[4px] block">
          {t('viral_cluster_hint', 'When ≥2 posts share the same story, the system surfaces that content (not each post) for approval — most-shared first.')}
        </span>
      </Field>
      {/* Phễu tự động: ≥ngưỡng duyệt → tự duyệt + tự sản xuất · <ngưỡng bỏ → tự bỏ ·
          ở giữa → AI viết lại tối đa N vòng rồi nằm chờ người duyệt */}
      <Field label={t('viral_funnel', 'Auto funnel (score thresholds)')}>
        <div className="flex gap-[8px]">
          <label className="flex flex-col gap-[2px] flex-1 text-[11px] text-textItemBlur">
            {t('viral_funnel_approve', 'Auto-approve ≥')}
            <input type="number" min={50} max={100} value={approveMin} onChange={(e) => setApproveMin(Number(e.target.value))} className={inputCls} />
          </label>
          <label className="flex flex-col gap-[2px] flex-1 text-[11px] text-textItemBlur">
            {t('viral_funnel_skip', 'Auto-skip <')}
            <input type="number" min={0} max={85} value={skipMax} onChange={(e) => setSkipMax(Number(e.target.value))} className={inputCls} />
          </label>
          <label className="flex flex-col gap-[2px] flex-1 text-[11px] text-textItemBlur">
            {t('viral_funnel_rounds', 'Rewrite rounds')}
            <input type="number" min={0} max={5} value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} className={inputCls} />
          </label>
        </div>
        <label className="flex items-center gap-[6px] text-[11.5px] text-textItemBlur cursor-pointer mt-[6px]">
          <input type="checkbox" checked={autoProduce} onChange={(e) => setAutoProduce(e.target.checked)} />
          🏭 {t('viral_funnel_autoproduce', 'Approve = auto-produce the AI-suggested format (products wait in the Products tab, nothing is scheduled automatically)')}
        </label>
        <label className={clsx('flex items-center gap-[6px] text-[11.5px] cursor-pointer mt-[6px] font-[700]', paused ? 'text-amber-400' : 'text-textItemBlur')}>
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
          ⏸ {t('viral_funnel_paused', 'DỪNG SẢN XUẤT — không tự duyệt (điểm cao đến mấy cũng đứng ở Chờ duyệt), không viết lại, duyệt tay cũng không tự sản xuất. Điểm quá thấp vẫn tự bỏ.')}
        </label>
        <span className="text-[11px] text-textItemBlur mt-[4px] block">
          {t('viral_funnel_hint', 'Between the two thresholds the AI rewrites and re-scores up to N rounds (keeping the better version); if still short, the content waits for manual review.')}
        </span>
      </Field>
      {/* Báo cáo tuần: bản tin + todo list gửi về nhóm Zalo (bot trang Zalo) + email */}
      <Field label={t('viral_report_zalo', 'Zalo group receiving weekly brief (via the Zalo bot)')}>
        <select value={zaloThread} onChange={(e) => setZaloThread(e.target.value)} className={inputCls}>
          <option value="">{t('viral_report_zalo_off', "Don't send to Zalo")}</option>
          {zaloGroups.map((g) => (
            <option key={g.threadId} value={g.threadId}>{g.name || g.threadId}</option>
          ))}
          {/* nhóm đã lưu nhưng không còn trong danh sách bot → vẫn hiện để khỏi mất */}
          {data?.reportZaloThreadId && !zaloGroups.some((g) => g.threadId === data.reportZaloThreadId) && (
            <option value={data.reportZaloThreadId}>{data.reportZaloThreadId} ({t('viral_saved', 'saved')})</option>
          )}
        </select>
        {zaloGroupsError && (
          <span className="text-[11px] text-[#FFC53D] mt-[4px] block">⚠ {t('viral_report_zalo_boterr', 'Could not load groups from the bot — check the Zalo page (bot connected?).')}</span>
        )}
      </Field>
      <div className="flex gap-[8px]">
        <Button onClick={save} className="flex-1">{t('viral_save_config', 'Save configuration')}</Button>
        <button
          onClick={async () => {
            const res = await fetch('/viral/report/test', { method: 'POST' });
            toast.show(
              res.ok
                ? t('viral_report_test_ok', 'Test brief sent — check the bell, email and Zalo group (save config first).')
                : t('viral_report_test_fail', 'Could not send test brief.'),
              res.ok ? 'success' : 'warning'
            );
          }}
          className="px-[14px] rounded-[8px] text-[12.5px] font-[700] border border-newBgLineColor text-textItemBlur hover:text-textColor"
          title={t('viral_report_test_hint', 'Send the weekly brief right now to test channels')}
        >
          📨 {t('viral_report_test', 'Send test')}
        </button>
      </div>
    </div>
  );
};

// ── Hồ sơ 8 chân dung khách hàng (persona động — AI tự làm giàu sau mỗi cào) ──
const usePersonas = (active: boolean) => {
  const fetch = useFetch();
  return useSWR(active ? '/viral/personas' : null, async (u: string) => (await fetch(u)).json());
};

const PersonasModal: FC = () => {
  const t = useT();
  const { data } = usePersonas(true);
  const items: any[] = data?.items || [];

  // Tải hồ sơ ra file .txt đọc được (chia sẻ / in cho team).
  const download = useCallback(() => {
    const lines: string[] = ['HỒ SƠ 8 CHÂN DUNG KHÁCH HÀNG — TRƯỜNG VIỆT ANH', ''];
    for (const p of items) {
      let st: any = {};
      try { st = JSON.parse(p.statics || '{}'); } catch { /* bỏ qua */ }
      lines.push(`═══ ${p.code} — ${p.label} ═══`);
      lines.push(`Cấp học / Khu vực: ${p.capHoc || '?'} · ${p.khuVuc || '?'}`);
      lines.push(`Phân khúc: ${st.phan_khuc || '?'} | Độ tuổi: ${st.do_tuoi || '?'} | Học vấn: ${st.hoc_van || '?'}`);
      lines.push(`Nghề nghiệp: ${st.nghe_nghiep || '?'} | Thu nhập: ${st.thu_nhap || '?'} | Kinh tế: ${st.kinh_te || '?'}`);
      lines.push(`Mối quan tâm: ${p.moiQuanTam || ''}`);
      lines.push(`Tâm lý: ${p.tamLy || ''}`);
      lines.push(`Hành vi: ${p.hanhVi || ''}`);
      lines.push(`Insight content: ${p.insights || ''}`);
      lines.push(`(Điểm dữ liệu: ${p.dataPoints ?? 0}${p.updatedAt ? ` · cập nhật ${String(p.updatedAt).slice(0, 10)}` : ''})`);
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ho-so-khach-hang-viet-anh.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [items]);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-start gap-[8px] text-[12px] leading-[1.55] text-textItemBlur bg-newColColor border border-newBgLineColor rounded-[9px] px-[13px] py-[8px]">
        <span className="shrink-0">🧬</span>
        <span>{t('viral_personas_hint', 'The 8 parent personas AI uses to score & rewrite posts. The dynamic parts (interests, psychology, behaviour, insights) auto-enrich after each crawl from real signals (parent groups, news, winning posts).')}</span>
      </div>
      {!items.length ? (
        <div className="text-[13px] text-textItemBlur p-[24px] text-center">{t('viral_loading', 'Loading…')}</div>
      ) : (
        <>
          <div className="flex flex-col gap-[12px] max-h-[62vh] overflow-auto pr-[4px]">
            {items.map((p) => {
              let st: any = {};
              try { st = JSON.parse(p.statics || '{}'); } catch { /* bỏ qua */ }
              return (
                <div key={p.id} className="bg-newColColor border border-newBgLineColor rounded-[11px] p-[13px] flex flex-col gap-[7px]">
                  <div className="flex items-center gap-[8px] flex-wrap">
                    <span className="text-[12px] font-[800] px-[9px] py-[3px] rounded-[7px] bg-btnPrimary/15 text-btnPrimary">{p.code}</span>
                    <span className="text-[13.5px] font-[700] leading-[1.35]">{p.label}</span>
                    <span className="ms-auto text-[10.5px] text-textItemBlur tabular-nums" title={t('viral_persona_datapoints', 'data points feeding this profile')}>📊 {p.dataPoints ?? 0}</span>
                  </div>
                  <div className="text-[11.5px] text-textItemBlur flex gap-[8px] flex-wrap">
                    <span>🎓 {p.capHoc || '?'} · {p.khuVuc || '?'}</span>
                    {st.do_tuoi && <span>· {st.do_tuoi}</span>}
                    {st.thu_nhap && <span>· 💰 {st.thu_nhap}</span>}
                  </div>
                  {[
                    ['💡', t('viral_persona_interest', 'Interests'), p.moiQuanTam],
                    ['🧠', t('viral_persona_psych', 'Psychology'), p.tamLy],
                    ['🏃', t('viral_persona_behaviour', 'Behaviour'), p.hanhVi],
                    ['🎯', t('viral_persona_insight', 'Content insight'), p.insights],
                  ].filter(([, , v]) => v).map(([ic, lbl, v]) => (
                    <div key={lbl as string} className="text-[12px] leading-[1.5]">
                      <b className="text-textColor">{ic} {lbl}:</b> <span className="text-textColor/85">{v as string}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <Button onClick={download}>⬇ {t('viral_personas_download', 'Download profiles (.txt)')}</Button>
        </>
      )}
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

// Ô tích chọn cho thẻ "Chờ đăng" (bài social + sản phẩm) — cùng kiểu thẻ content.
// show = chế độ chọn trên mobile: tick luôn hiện (touch không có hover).
const ReadyTick: FC<{ sel?: boolean; onToggle?: () => void; show?: boolean }> = ({ sel, onToggle, show }) =>
  !onToggle ? null : (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={clsx(
        'absolute z-[10] top-[10px] left-[10px] w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center text-[13px] font-[900] transition-all',
        sel
          ? 'bg-btnPrimary border-btnPrimary text-white'
          : clsx(
              'bg-newBgColor border-newBgLineColor text-transparent',
              show ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'
            )
      )}
    >
      ✓
    </button>
  );

// Thẻ "Bài của mình" — bản AI viết lại + điểm mới so với bài gốc.
const MineCard: FC<{
  clone: any;
  onDone: () => void;
  sel?: boolean;
  onToggleSel?: () => void;
  selectMode?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
}> = ({ clone, onDone, sel, onToggleSel, selectMode, cardRef }) => {
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
    <div
      ref={cardRef}
      // chế độ chọn (mobile): tap nền thẻ = tick — nút/link bên trong vẫn là của chúng
      onClick={
        selectMode
          ? (e) => {
              if ((e.target as HTMLElement).closest('button, a, select, textarea, input, audio')) return;
              onToggleSel?.();
            }
          : undefined
      }
      className={clsx(
        'group/card relative bg-newColColor border rounded-[13px] p-[14px] flex flex-col gap-[10px]',
        sel ? 'border-btnPrimary ring-2 ring-btnPrimary/40' : 'border-newBgLineColor'
      )}
    >
      <ReadyTick sel={sel} onToggle={onToggleSel} show={selectMode} />
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

// ── CONTENT (chủ đề) — đơn vị duyệt CHÍNH của trang: 1 content = nhiều bài từ
// nhiều nguồn (hoặc 1 bài). Bài lẻ chỉ còn là bằng chứng bên trong content.
const useTopics = (sort: string, status: string) => {
  const fetch = useFetch();
  return useSWR(
    `/viral/topics?sort=${sort}&status=${status}`,
    async (u: string) => (await fetch(u)).json()
  );
};

// Định dạng AI đề xuất cho 1 content (đọc từ scoreDetail đã parse sẵn).
const topicDefaults = (sd: any): string[] => {
  const primary =
    sd?.content_type === 'blog' ? 'blog' : sd?.content_type === 'video' ? 'podcast' : 'infographic';
  return (sd?.podcast_score ?? 0) >= 75 && primary !== 'podcast' ? [primary, 'podcast'] : [primary];
};

// Chi tiết 1 content: bản tổng hợp + điểm + bài nguồn (bằng chứng) + hành động.
const TopicDetailModal: FC<{ topicId: string; onDone: () => void }> = ({ topicId, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const [busy, setBusy] = useState(false);
  const { data, mutate } = useSWR(`/viral/topics/${topicId}`, async (u: string) => (await fetch(u)).json());
  const topic = data?.topic;
  const posts = data?.posts || [];
  const syn = topic?.synthesis || {};
  const sd = topic?.scoreDetail || {};
  const act = async (action: string) => {
    await fetch('/viral/topics/bulk', { method: 'POST', body: JSON.stringify({ ids: [topicId], action }) });
    mutate();
    onDone();
    if (action === 'approve') {
      toast.show(t('viral_topic_approved_toast', 'Approved — AI is producing the suggested format, see "Ready to post" in a few minutes.'), 'success');
    }
  };
  const clone = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/viral/topics/${topicId}/clone`, { method: 'POST' });
      toast.show(
        res.ok
          ? t('viral_topic_cloned', 'Rewritten as your social post — check "Ready to post".')
          : t('viral_topic_clone_fail', 'Could not rewrite — try again.'),
        res.ok ? 'success' : 'warning'
      );
      onDone();
    } finally {
      setBusy(false);
    }
  };
  const produce = () =>
    modal.openModal({
      title: t('viral_modal_produce', 'Produce content'),
      withCloseButton: true,
      classNames: { modal: 'w-[100%] max-w-[520px]' },
      children: <ProduceModal ids={[topicId]} source="topic" defaults={topicDefaults(sd)} onDone={onDone} />,
    });
  if (!topic) return <div className="text-[13px] text-textItemBlur p-[20px]">{t('viral_loading', 'Loading…')}</div>;
  return (
    <div className="flex flex-col gap-[12px]">
      {/* điểm + persona + số vòng viết lại + verdict */}
      <div className="flex items-center gap-[8px] flex-wrap text-[12px]">
        {topic.score != null && (
          <span className={clsx('text-[12px] font-[800] px-[9px] py-[3px] rounded-[7px] tabular-nums', scoreStyle(topic.score))}>⭐ {topic.score}</span>
        )}
        {topic.persona && <span className="px-[8px] py-[3px] rounded-full bg-btnPrimary/12 text-btnPrimary font-[700]">🧬 {topic.persona}</span>}
        <span className="text-textItemBlur">📄 {topic.postCount} {t('viral_topic_posts', 'post(s)')} · 📡 {topic.sourceCount} {t('viral_topic_sources', 'source(s)')}</span>
        {(sd.rounds ?? 0) > 0 && <span className="text-textItemBlur" title={t('viral_topic_rounds_hint', 'AI rewrite rounds used')}>♻ {sd.rounds} {t('viral_topic_rounds', 'rewrite(s)')}</span>}
        {sd.verdict && <span className="text-[#FFC53D]">{sd.verdict}</span>}
      </div>
      {/* bản AI viết sẵn để đăng */}
      {topic.aiContent && (
        <div className="text-[13px] leading-[1.65] whitespace-pre-line bg-newColColor border border-newBgLineColor rounded-[10px] p-[13px] max-h-[220px] overflow-auto">
          {topic.aiContent}
        </div>
      )}
      {/* tổng hợp: góc nhìn + điểm đồng thuận + số liệu + hook */}
      {(syn.angle || syn.hook || (syn.agreedFacts || []).length > 0) && (
        <div className="flex flex-col gap-[6px] text-[12.5px] leading-[1.6] bg-newBgColor rounded-[10px] p-[12px]">
          {syn.angle && <div><b>🎯 {t('viral_syn_angle', 'Angle')}:</b> {syn.angle}</div>}
          {syn.hook && <div><b>🪝 Hook:</b> {syn.hook}</div>}
          {(syn.agreedFacts || []).length > 0 && (
            <div><b>🤝 {t('viral_syn_facts', 'Agreed facts')}:</b> {(syn.agreedFacts || []).join(' · ')}</div>
          )}
          {(syn.keyNumbers || []).length > 0 && (
            <div><b>🔢 {t('viral_syn_numbers', 'Key numbers')}:</b> {(syn.keyNumbers || []).join(' · ')}</div>
          )}
          {syn.whyItMatters && <div><b>💡 {t('viral_syn_why', 'Why it matters')}:</b> {syn.whyItMatters}</div>}
          {sd.reason && <div className="text-textItemBlur">📋 {sd.reason}</div>}
        </div>
      )}
      {/* trạng thái SẢN XUẤT — lỗi thì hiện lý do + nút thử lại (thẻ content
          không bao giờ bị xóa vì SX lỗi; thường do hết hạn mức AI) */}
      {((topic.products || []).length > 0) && (
        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] font-[700] text-textItemBlur">🏭 {t('viral_topic_products', 'Production')}</div>
          {(topic.products || []).map((pr: any) => (
            <div key={pr.id} className="flex items-center gap-[8px] text-[12px] bg-newColColor border border-newBgLineColor rounded-[8px] px-[10px] py-[6px]">
              <span className="shrink-0">{FORMAT_META[pr.format]?.icon} {FORMAT_META[pr.format]?.label || pr.format}</span>
              {pr.status === 'done' && <span className="text-[#57D9A3] font-[700]">✓ {t('viral_prod_done', 'done — see "Ready to post"')}</span>}
              {pr.status === 'processing' && <span className="text-textItemBlur">⏳ {t('viral_prod_running', 'producing…')}</span>}
              {pr.status === 'error' && (
                <>
                  <span className="text-[#FF5A52] flex-1 truncate" title={pr.error || ''}>❌ {pr.error || t('viral_prod_failed', 'Production failed')}</span>
                  <button
                    onClick={async () => {
                      await fetch(`/viral/products/${pr.id}/retry`, { method: 'POST' });
                      toast.show(t('viral_prod_retrying', 'Retrying — check back in a few minutes.'), 'success');
                      mutate();
                    }}
                    className="shrink-0 text-[11.5px] font-[700] text-btnPrimary hover:underline"
                  >
                    ↻ {t('viral_prod_retry', 'Retry')}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {/* bài nguồn — bằng chứng để đối chiếu, tránh đạo nhái */}
      <div className="flex flex-col gap-[6px]">
        <div className="text-[12px] font-[700] text-textItemBlur">🧾 {t('viral_topic_evidence', 'Source posts (evidence)')}</div>
        <div className="flex flex-col gap-[4px] max-h-[180px] overflow-auto">
          {posts.map((p: any) => (
            <div key={p.id} className="flex items-center gap-[8px] text-[12px] bg-newColColor border border-newBgLineColor rounded-[8px] px-[10px] py-[6px]">
              <i className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: platMeta(p.platform)?.dot || '#888' }} />
              <span className="text-textItemBlur shrink-0 max-w-[120px] truncate">{p.sourceName || '—'}</span>
              <span className="truncate flex-1">{p.title}</span>
              {p.shares != null && <span className="text-[#FFC53D] tabular-nums shrink-0">↗ {nice(p.shares)}</span>}
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-btnPrimary shrink-0" title={t('viral_open_source', 'Open source post')}>
                  ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* hành động */}
      <div className="flex gap-[8px] flex-wrap">
        {topic.status === 'pending' ? (
          <>
            <button onClick={() => act('approve')} className="flex-1 h-[38px] rounded-[9px] text-[13px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25">✓ {t('viral_approve', 'Approve')}</button>
            <button onClick={() => act('skip')} className="h-[38px] px-[14px] rounded-[9px] text-[13px] font-[700] text-[#FF5A52] border border-[#FF5A52]/30 hover:bg-[#FF5A52]/10">✕ {t('viral_skip', 'Skip')}</button>
          </>
        ) : (
          <button onClick={() => act('pending')} className="h-[38px] px-[14px] rounded-[9px] text-[13px] font-[700] text-textItemBlur border border-newBgLineColor hover:text-textColor">↩ {t('viral_back_to_review', 'Back to review')}</button>
        )}
        <button onClick={clone} disabled={busy} className="h-[38px] px-[14px] rounded-[9px] text-[13px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25 disabled:opacity-50">
          {busy ? t('viral_cloning', 'Rewriting…') : `✍️ ${t('viral_topic_clone', 'Rewrite as my post')}`}
        </button>
        <button onClick={produce} className="h-[38px] px-[14px] rounded-[9px] text-[13px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25">🏭 {t('viral_produce_bulk', 'Produce')}</button>
      </div>
    </div>
  );
};

// Modal chọn định dạng sản xuất cho các bài đã chọn.
// defaults: gợi ý AI (content_type + podcast_score từ lúc chấm) — tick sẵn.
const ProduceModal: FC<{ ids: string[]; source: 'post' | 'clone' | 'topic'; onDone: () => void; defaults?: string[] }> = ({ ids, source, onDone, defaults }) => {
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
        // bộ carousel (meta.slides) — hiện đủ cả bộ; bản cũ 1 ảnh vẫn hiện được
        <div className="flex flex-col gap-[8px]">
          {(Array.isArray(meta.slides) && meta.slides.length > 1
            ? meta.slides.map((s: any) => (typeof s === 'string' ? s : s?.path)).filter(Boolean)
            : [product.mediaPath]
          ).map((p: string, i: number) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p} src={p} alt={`${product.title || ''} — slide ${i + 1}`} className="w-full rounded-[10px]" />
          ))}
          {Array.isArray(meta.slides) && meta.slides.length > 1 && (
            <div className="text-[11.5px] text-textItemBlur">
              🖼 {meta.slides.length} {t('viral_carousel_slides', 'slides — all saved in the Media library, post as a Facebook album')}
            </div>
          )}
        </div>
      )}
      {product.format === 'infographic' && product.textContent && (
        <div className="text-[12.5px] leading-[1.7] whitespace-pre-line bg-newColColor rounded-[10px] p-[12px]">
          <div className="text-[11px] font-[700] text-textItemBlur mb-[6px]">✍️ {t('viral_carousel_caption', 'Caption for the album post')}</div>
          {product.textContent}
        </div>
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

// Modal chọn kênh để đăng BỘ INFOGRAPHIC → bản nháp trên Lịch (cả bộ ảnh +
// caption album) — người chỉnh giờ rồi bấm đăng trên Lịch như thường.
const PostProductModal: FC<{ product: any; onDone: () => void }> = ({ product, onDone }) => {
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
      const res = await fetch(`/viral/products/${product.id}/post`, {
        method: 'POST',
        body: JSON.stringify({ integrationId }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || '');
      toast.show(
        `📤 ${t('viral_product_posted', 'Added as a draft on the Calendar with')} ${d?.images ?? ''} ${t('viral_product_posted_suffix', 'image(s) — review & schedule there.')}`,
        'success'
      );
      onDone();
      modal.closeCurrent();
    } catch (e: any) {
      toast.show(e?.message || t('viral_post_failed', 'Could not post, try again.'), 'warning');
    } finally {
      setBusy(false);
    }
  }, [integrationId, product.id]);
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[12.5px] text-textItemBlur">
        {t('viral_post_product_hint', 'Pick a channel — the WHOLE image set + album caption becomes a draft on the Calendar (not published right away).')}
      </div>
      {product.mediaPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.mediaPath} alt="" className="w-full max-h-[220px] object-cover rounded-[10px]" />
      )}
      {product.textContent && (
        <div className="text-[12.5px] leading-[1.6] whitespace-pre-line max-h-[140px] overflow-auto bg-newColColor rounded-[8px] p-[10px]">{product.textContent}</div>
      )}
      <select value={integrationId} onChange={(e) => setIntegrationId(e.target.value)} className={inputCls}>
        <option value="">{t('viral_write_for_channel', 'Write for channel…')}</option>
        {(integrations || []).map((i: any) => (
          <option key={i.id} value={i.id}>{i.name} ({i.identifier})</option>
        ))}
      </select>
      <Button onClick={submit} loading={busy}>📤 {t('viral_post_to_calendar', 'Add to Calendar as draft')}</Button>
    </div>
  );
};

// Modal ĐĂNG HÀNG LOẠT từ "Chờ đăng": chọn 1 kênh → mọi thẻ đã chọn thành bản
// nháp trên Lịch. Chỉ bài social + bộ infographic hoàn tất là đăng được;
// blog/podcast (tải về đăng web) và bài đã đăng sẽ tự bỏ qua, có báo rõ.
const BulkPostReadyModal: FC<{
  mineItems: any[];
  productItems: any[];
  onDone: () => void;
}> = ({ mineItems, productItems, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modal = useModals();
  const { data: integrations } = useIntegrationList();
  const [integrationId, setIntegrationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const eligibleMine = mineItems.filter((c) => c.status !== 'posted');
  const eligibleProducts = productItems.filter(
    (p) => p.format === 'infographic' && p.status === 'done'
  );
  const skipped =
    mineItems.length + productItems.length - eligibleMine.length - eligibleProducts.length;
  const total = eligibleMine.length + eligibleProducts.length;
  const submit = useCallback(async () => {
    if (!integrationId) {
      toast.show(t('viral_pick_channel_first', 'Pick a target channel first.'), 'warning');
      return;
    }
    setBusy(true);
    let ok = 0;
    let fail = 0;
    let done = 0;
    const step = () => setProgress(`${++done}/${total}`);
    for (const c of eligibleMine) {
      const res = await fetch(`/viral/mine/${c.id}/post`, {
        method: 'POST',
        body: JSON.stringify({ integrationId }),
      }).catch(() => null);
      res?.ok ? ok++ : fail++;
      step();
    }
    for (const p of eligibleProducts) {
      const res = await fetch(`/viral/products/${p.id}/post`, {
        method: 'POST',
        body: JSON.stringify({ integrationId }),
      }).catch(() => null);
      res?.ok ? ok++ : fail++;
      step();
    }
    setBusy(false);
    toast.show(
      `📤 ${ok} ${t('viral_bulk_posted', 'draft(s) added to the Calendar')}${fail ? ` · ${fail} ${t('viral_bulk_post_failed', 'failed')}` : ''}`,
      fail ? 'warning' : 'success'
    );
    onDone();
    modal.closeCurrent();
  }, [integrationId, eligibleMine, eligibleProducts, total]);
  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[12.5px] text-textItemBlur">
        {t('viral_bulk_post_hint', 'Pick ONE channel — every selected card becomes a draft on the Calendar (nothing publishes right away).')}
      </div>
      <div className="text-[12.5px] leading-[1.7] bg-newColColor rounded-[8px] p-[12px]">
        ✍️ {eligibleMine.length} {t('viral_bulk_social_n', 'social post(s)')} · 🖼 {eligibleProducts.length} {t('viral_bulk_info_n', 'infographic set(s)')}
        {skipped > 0 && (
          <div className="text-[11.5px] text-amber-400 mt-[4px]">
            ⚠ {skipped} {t('viral_bulk_skipped_n', 'card(s) will be skipped — blog/podcast are download-only, and already-posted or unfinished cards cannot be posted.')}
          </div>
        )}
      </div>
      <select value={integrationId} onChange={(e) => setIntegrationId(e.target.value)} className={inputCls}>
        <option value="">{t('viral_write_for_channel', 'Write for channel…')}</option>
        {(integrations || []).map((i: any) => (
          <option key={i.id} value={i.id}>{i.name} ({i.identifier})</option>
        ))}
      </select>
      <Button onClick={submit} loading={busy} disabled={!total}>
        📤 {busy && progress ? progress + ' · ' : ''}{t('viral_bulk_post_button', 'Add all to Calendar as drafts')} ({total})
      </Button>
    </div>
  );
};

// Thẻ sản phẩm trong tab "Sản phẩm".
const ProductCard: FC<{
  product: any;
  onDone: () => void;
  sel?: boolean;
  onToggleSel?: () => void;
  selectMode?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
}> = ({ product, onDone, sel, onToggleSel, selectMode, cardRef }) => {
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
    <div
      ref={cardRef}
      // chế độ chọn (mobile): tap thẻ = tick; bình thường thẻ done mở chi tiết
      onClick={
        selectMode
          ? (e) => {
              if ((e.target as HTMLElement).closest('button, a, select, textarea, input, audio')) return;
              onToggleSel?.();
            }
          : product.status === 'done'
          ? openDetail
          : undefined
      }
      className={clsx(
        'group/card relative bg-newColColor border rounded-[13px] overflow-hidden flex flex-col',
        sel ? 'border-btnPrimary ring-2 ring-btnPrimary/40' : 'border-newBgLineColor',
        product.status === 'done' && 'cursor-pointer hover:border-newTableBorder'
      )}
    >
      <ReadyTick sel={sel} onToggle={onToggleSel} show={selectMode} />
      {product.format === 'infographic' && product.mediaPath && product.status === 'done' && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.mediaPath} alt="" className="w-full max-h-[240px] object-cover" />
          {(() => {
            // bộ carousel: badge số slide trên ảnh bìa
            try {
              const m = product.meta ? JSON.parse(product.meta) : {};
              if (Array.isArray(m.slides) && m.slides.length > 1) {
                return (
                  <span className="absolute top-[8px] right-[8px] text-[11px] font-[800] px-[8px] py-[3px] rounded-[7px] bg-black/70 text-white">
                    🖼 {m.slides.length}
                  </span>
                );
              }
            } catch {
              /* meta hỏng — bỏ badge */
            }
            return null;
          })()}
        </div>
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
          {product.status === 'done' && product.format === 'infographic' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                modal.openModal({
                  title: t('viral_modal_post_product', 'Post image set to Calendar'),
                  withCloseButton: true,
                  classNames: { modal: 'w-[100%] max-w-[520px]' },
                  children: <PostProductModal product={product} onDone={onDone} />,
                });
              }}
              className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25"
            >
              📤 {t('viral_post_calendar', 'Post to Calendar')}
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

// ── KHO SKILL / CÔNG THỨC AI (tab 🧪) — mỗi skill 1 file markdown, chỉnh là
// AI ăn ngay: công thức blog/podcast/infographic, rubric chấm, chọn nhóm,
// viết lại, bản tin tuần... như harness riêng cho từng việc.
const useSkills = (active: boolean) => {
  const fetch = useFetch();
  return useSWR(active ? '/viral/skills' : null, async (u: string) => (await fetch(u)).json());
};

const SkillsPanel: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const { data, mutate } = useSkills(true);
  const items: any[] = data?.items || [];
  const [sel, setSel] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [busy, setBusy] = useState(false);
  // mobile 2 màn: 'list' = danh sách skill, 'editor' = trình sửa; desktop 2 cột
  // song song nên state này chỉ ăn qua class mobile: (đổi trên desktop vô hại).
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  const fileRef = useRef<HTMLInputElement>(null);
  const current = items.find((s) => s.key === sel) || null;

  // chọn skill → nạp nội dung vào editor
  useEffect(() => {
    if (!sel && items.length) setSel(items[0].key);
  }, [items, sel]);
  useEffect(() => {
    if (current) setDraft(current.content || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, data]);

  const groups = [...new Set(items.map((s) => s.group))];
  const dirty = current && draft !== (current.content || '');

  const save = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const res = await fetch(`/viral/skills/${current.key}`, { method: 'POST', body: JSON.stringify({ content: draft }) });
      toast.show(res.ok ? t('viral_skill_saved', 'Skill saved — AI uses it from the next run.') : t('viral_need_admin', 'System administrator permission required.'), res.ok ? 'success' : 'warning');
      mutate();
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!current) return;
    if (!(await deleteDialog(t('viral_skill_reset_confirm', 'Reset this skill to the built-in default?'), t('viral_skill_reset', 'Reset')))) return;
    setBusy(true);
    try {
      await fetch(`/viral/skills/${current.key}`, { method: 'DELETE' });
      mutate();
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (f?: File | null) => {
    if (!f) return;
    const text = await f.text();
    setDraft(text);
    toast.show(t('viral_skill_imported', 'File loaded into the editor — press Save to apply.'), 'success');
  };
  const download = () => {
    if (!current) return;
    const blob = new Blob([draft], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current.key}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex gap-[14px] mobile:flex-col">
      {/* cột trái: danh sách skill theo nhóm — mobile là MÀN 1 (full, không 68vh) */}
      <div
        className={clsx(
          'w-[290px] mobile:w-full shrink-0 flex flex-col gap-[10px] max-h-[68vh] mobile:max-h-none overflow-auto pr-[4px]',
          mobileView === 'editor' && 'mobile:hidden'
        )}
      >
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-[4px]">
            <div className="text-[10.5px] uppercase tracking-[0.07em] text-textItemBlur px-[4px]">{g}</div>
            {items.filter((s) => s.group === g).map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setSel(s.key);
                  setMobileView('editor');
                }}
                className={clsx(
                  'text-left px-[11px] py-[8px] mobile:min-h-[44px] rounded-[9px] border text-[12.5px] leading-[1.35]',
                  sel === s.key
                    ? 'bg-btnPrimary/15 border-btnPrimary/50 text-btnPrimary font-[700]'
                    : 'border-newBgLineColor text-textColor hover:border-newTableBorder'
                )}
              >
                {s.label}
                {s.isCustom && (
                  <span className="ms-[6px] text-[9.5px] font-[800] px-[6px] py-[1px] rounded-full bg-[#FFC53D]/15 text-[#FFC53D] align-[2px]">
                    {t('viral_skill_custom', 'edited')}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* cột phải: editor markdown — mobile là MÀN 2 (có nút quay lại danh sách) */}
      <div className={clsx('flex-1 flex flex-col gap-[9px] min-w-0', mobileView === 'list' && 'mobile:hidden')}>
        {current ? (
          <>
            <button
              onClick={() => setMobileView('list')}
              className="hidden mobile:flex items-center gap-[6px] min-h-[44px] self-start text-[13.5px] font-[700] text-btnPrimary tap-shrink"
            >
              ← {t('viral_skill_back_list', 'All recipes')}
            </button>
            <div className="flex items-center gap-[8px] flex-wrap">
              <div className="text-[14px] font-[700]">{current.label}</div>
              <span className={clsx('text-[10.5px] font-[700] px-[8px] py-[2px] rounded-full', current.isCustom ? 'bg-[#FFC53D]/15 text-[#FFC53D]' : 'bg-newColColor border border-newBgLineColor text-textItemBlur')}>
                {current.isCustom ? t('viral_skill_custom_full', 'Customized') : t('viral_skill_default', 'Built-in default')}
              </span>
              <span className="ms-auto text-[11px] text-textItemBlur tabular-nums">{draft.length.toLocaleString()} {t('viral_skill_chars', 'chars')}</span>
            </div>
            <div className="text-[12px] text-textItemBlur leading-[1.5]">📌 {current.description}</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="bg-input border border-fifth rounded-[10px] p-[13px] min-h-[46vh] text-[12.5px] leading-[1.6] text-inputText outline-none font-mono resize-y"
            />
            <div className="flex gap-[8px] flex-wrap">
              <Button onClick={save} loading={busy} disabled={!dirty}>
                💾 {t('viral_skill_save', 'Save skill')}
              </Button>
              <input ref={fileRef} type="file" accept=".md,.txt,text/markdown,text/plain" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} className="px-[13px] rounded-[8px] text-[12.5px] font-[700] border border-newBgLineColor text-textItemBlur hover:text-textColor">
                📥 {t('viral_skill_import', 'Import .md')}
              </button>
              <button onClick={download} className="px-[13px] rounded-[8px] text-[12.5px] font-[700] border border-newBgLineColor text-textItemBlur hover:text-textColor">
                ⬇ {t('viral_skill_export', 'Download')}
              </button>
              {current.isCustom && (
                <button onClick={reset} disabled={busy} className="ms-auto px-[13px] rounded-[8px] text-[12.5px] font-[700] text-[#FF5A52] border border-[#FF5A52]/35 hover:bg-[#FF5A52]/10">
                  ↩ {t('viral_skill_reset', 'Reset')}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-textItemBlur p-[30px] text-center">{t('viral_loading', 'Loading…')}</div>
        )}
      </div>
    </div>
  );
};

// ── TAB 📰 BẢN TIN TUẦN — đọc lại mọi bản tin đã tạo (T2-4-6 / CN / tay) ────
const useReports = (active: boolean) => {
  const fetch = useFetch();
  return useSWR(active ? '/viral/reports' : null, async (u: string) => (await fetch(u)).json());
};

// ── Panel GỬI BẢN TIN QUA ZALO: chọn người + nhóm + SĐT, giờ gửi, toggle
// auto, nút gửi ngay. Lưu xong "đóng băng" thành bản tóm tắt — bấm ✏️ Sửa để
// mở lại. Danh bạ lấy thẳng từ bot qua proxy same-origin /botapi.
const ZaloSendPanel: FC<{ latestId?: string }> = ({ latestId }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const { data: cfg, mutate: mutateCfg } = useSWR('viral-config', async () => (await fetch('/viral/config')).json());
  const [editing, setEditing] = useState(false);
  const [recipients, setRecipients] = useState<{ threadId: string; type: string; name: string }[]>([]);
  const [sendHour, setSendHour] = useState<number>(-1);
  const [friends, setFriends] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [contactsErr, setContactsErr] = useState(false);
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!cfg) return;
    setRecipients(Array.isArray(cfg.reportRecipients) ? cfg.reportRecipients : []);
    setSendHour(typeof cfg.reportSendHour === 'number' ? cfg.reportSendHour : -1);
  }, [cfg]);
  // chỉ tải danh bạ khi mở chế độ sửa (đỡ gọi bot mỗi lần xem tab)
  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const f = await (await window.fetch('/botapi/api/postiz/contacts', { signal: AbortSignal.timeout(60000) })).json();
        setFriends(Array.isArray(f?.friends) ? f.friends : []);
      } catch {
        setContactsErr(true);
      }
      try {
        const g = await (await window.fetch('/botapi/api/postiz/groups', { signal: AbortSignal.timeout(60000) })).json();
        const list = (Array.isArray(g) ? g : g?.groups || [])
          .map((x: any) => ({ threadId: String(x.threadId || x.id || ''), name: String(x.name || x.label || x.threadId) }))
          .filter((x: any) => x.threadId);
        setGroups(list);
      } catch {
        setContactsErr(true);
      }
    })();
  }, [editing]);
  const toggleR = (item: { threadId: string; name: string }, type: 'user' | 'group') =>
    setRecipients((prev) =>
      prev.some((r) => r.threadId === item.threadId)
        ? prev.filter((r) => r.threadId !== item.threadId)
        : [...prev, { threadId: item.threadId, type, name: item.name }]
    );
  const addPhone = async () => {
    const p = phone.replace(/\D/g, '');
    if (!p) return;
    try {
      const r = await (await window.fetch('/botapi/api/postiz/find-user?phone=' + p, { signal: AbortSignal.timeout(30000) })).json();
      if (!r?.threadId) throw new Error();
      setRecipients((prev) =>
        prev.some((x) => x.threadId === r.threadId) ? prev : [...prev, { threadId: r.threadId, type: 'user', name: r.name || p }]
      );
      setPhone('');
    } catch {
      toast.show(t('viral_zalo_phone_fail', 'No Zalo user found for this phone number.'), 'warning');
    }
  };
  const save = async (patch?: any) => {
    const res = await fetch('/viral/config', {
      method: 'POST',
      body: JSON.stringify({ reportRecipients: recipients, reportSendHour: sendHour, ...patch }),
    });
    if (res.status >= 400) {
      toast.show(t('viral_need_admin', 'System administrator permission required.'), 'warning');
      return false;
    }
    mutateCfg();
    return true;
  };
  const sendNow = async () => {
    if (!latestId) {
      toast.show(t('viral_zalo_no_report', 'No brief yet — create one first.'), 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/viral/reports/${latestId}/send-zalo`, { method: 'POST' });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || '');
      toast.show(
        `📨 ${t('viral_zalo_sent', 'Sent to')} ${d?.sent ?? 0} ${t('viral_zalo_sent_suffix', 'recipient(s)')}${d?.failed ? ` · ${d.failed} ${t('viral_zalo_failed', 'failed')}` : ''}`,
        d?.failed ? 'warning' : 'success'
      );
    } catch (e: any) {
      toast.show(e?.message || t('viral_zalo_send_fail', 'Could not send via Zalo.'), 'warning');
    } finally {
      setBusy(false);
    }
  };
  const auto = !!cfg?.reportAutoSend;
  const norm = (s: string) => String(s || '').toLowerCase();
  const fFriends = friends.filter((f) => !q || norm(f.name).includes(norm(q))).slice(0, 50);
  const fGroups = groups.filter((g) => !q || norm(g.name).includes(norm(q))).slice(0, 50);
  const hourLabel = sendHour < 0 ? t('viral_zalo_hour_now', 'Right when a brief is created') : `${String(sendHour).padStart(2, '0')}:00`;
  return (
    <div className="bg-newColColor border border-newBgLineColor rounded-[12px] p-[14px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[10px] flex-wrap">
        <span className="text-[13px] font-[800]">📤 {t('viral_zalo_panel', 'Send briefs via Zalo (bot)')}</span>
        <label className="flex items-center gap-[6px] text-[12px] text-textItemBlur cursor-pointer">
          <input type="checkbox" checked={auto} onChange={async (e) => { await save({ reportAutoSend: e.target.checked }); }} />
          {t('viral_zalo_auto', 'Auto-send every new brief')}
        </label>
        <div className="flex-1" />
        <button onClick={sendNow} disabled={busy} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25 disabled:opacity-50">
          {busy ? t('viral_zalo_sending', 'Sending…') : `📨 ${t('viral_zalo_send_now', 'Send latest brief now')}`}
        </button>
        {!editing && (
          <button onClick={() => setEditing(true)} className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-[700] border border-newBgLineColor text-textItemBlur hover:text-textColor">
            ✏️ {t('viral_zalo_edit', 'Edit')}
          </button>
        )}
      </div>
      {!editing ? (
        // ĐÓNG BĂNG: tóm tắt cấu hình đã lưu
        <div className="flex items-center gap-[8px] flex-wrap text-[12px] text-textItemBlur">
          {recipients.length ? (
            recipients.map((r) => (
              <span key={r.threadId} className="px-[9px] py-[3px] rounded-full bg-newBgColor border border-newBgLineColor text-textColor">
                {r.type === 'user' ? '👤' : '👥'} {r.name}
              </span>
            ))
          ) : (
            <span>⚠ {t('viral_zalo_none', 'No recipients yet — press ✏️ Edit to pick friends/groups.')}</span>
          )}
          <span className="ms-auto">🕐 {t('viral_zalo_schedule', 'Schedule:')} <b className="text-textColor">{hourLabel}</b></span>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {/* đã chọn */}
          <div className="flex items-center gap-[6px] flex-wrap min-h-[26px]">
            {recipients.map((r) => (
              <button key={r.threadId} onClick={() => setRecipients((prev) => prev.filter((x) => x.threadId !== r.threadId))} className="px-[9px] py-[3px] rounded-full bg-btnPrimary/12 text-btnPrimary text-[12px] hover:bg-[#FF5A52]/15 hover:text-[#FF5A52]" title={t('viral_zalo_remove', 'Remove')}>
                {r.type === 'user' ? '👤' : '👥'} {r.name} ✕
              </button>
            ))}
            {!recipients.length && <span className="text-[12px] text-textItemBlur">{t('viral_zalo_pick', 'Pick recipients below…')}</span>}
          </div>
          {/* tìm + SĐT */}
          <div className="flex gap-[8px] flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('viral_zalo_search', 'Search name…')} className={inputCls + ' flex-1 min-w-[160px]'} />
            <div className="flex gap-[6px]">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('viral_zalo_phone', 'Phone number…')} className={inputCls + ' w-[150px]'} />
              <button onClick={addPhone} className="px-[12px] rounded-[8px] text-[12px] font-[700] border border-newBgLineColor text-textItemBlur hover:text-textColor" title={t('viral_zalo_phone_hint', 'Look up a Zalo user by phone (careful: messaging strangers may get the bot rate-limited)')}>
                ＋SĐT
              </button>
            </div>
          </div>
          {contactsErr && (
            <div className="text-[11.5px] text-[#FFC53D]">⚠ {t('viral_zalo_bot_err', 'Could not load contacts from the bot — check the Zalo page (bot connected?).')}</div>
          )}
          {/* 2 cột: bạn bè + nhóm */}
          <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[10px]">
            {[
              { title: `👤 ${t('viral_zalo_friends', 'Friends')}`, list: fFriends, type: 'user' as const },
              { title: `👥 ${t('viral_zalo_groups', 'Groups')}`, list: fGroups, type: 'group' as const },
            ].map((col) => (
              <div key={col.type} className="border border-newBgLineColor rounded-[10px] p-[8px] max-h-[220px] overflow-auto flex flex-col gap-[4px]">
                <div className="text-[11px] font-[800] uppercase tracking-[0.05em] text-textItemBlur px-[4px]">{col.title} · {col.list.length}</div>
                {col.list.map((it: any) => {
                  const sel = recipients.some((r) => r.threadId === it.threadId);
                  return (
                    <button key={it.threadId} onClick={() => toggleR(it, col.type)} className={clsx('text-left px-[8px] py-[5px] rounded-[7px] text-[12.5px] truncate', sel ? 'bg-btnPrimary/15 text-btnPrimary font-[700]' : 'hover:bg-newBgColor')}>
                      {sel ? '✓ ' : ''}{it.name}
                    </button>
                  );
                })}
                {!col.list.length && <div className="text-[11.5px] text-textItemBlur px-[4px]">{t('viral_zalo_empty', '(empty)')}</div>}
              </div>
            ))}
          </div>
          {/* giờ gửi + lưu */}
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="text-[12px] text-textItemBlur">🕐 {t('viral_zalo_schedule', 'Schedule:')}</span>
            <select value={sendHour} onChange={(e) => setSendHour(Number(e.target.value))} className={inputCls + ' w-auto'}>
              <option value={-1}>{t('viral_zalo_hour_now', 'Right when a brief is created')}</option>
              {[6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 21].map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00 {t('viral_zalo_daily', 'daily')}</option>
              ))}
            </select>
            <div className="flex-1" />
            <button onClick={() => { setEditing(false); mutateCfg(); }} className="h-[34px] px-[14px] rounded-[8px] text-[12.5px] text-textItemBlur hover:text-textColor">
              {t('viral_zalo_cancel', 'Cancel')}
            </button>
            <Button onClick={async () => { if (await save()) { setEditing(false); toast.show(t('viral_zalo_saved', 'Recipients saved.'), 'success'); } }}>
              💾 {t('viral_zalo_save', 'Save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const ReportCard: FC<{ report: any; onDone: () => void }> = ({ report, onDone }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // Gửi bản tin NÀY qua Zalo tới danh sách người nhận đã lưu (panel phía trên)
  const sendZalo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSending(true);
    try {
      const res = await fetch(`/viral/reports/${report.id}/send-zalo`, { method: 'POST' });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || '');
      toast.show(
        `📨 ${t('viral_zalo_sent', 'Sent to')} ${d?.sent ?? 0} ${t('viral_zalo_sent_suffix', 'recipient(s)')}${d?.failed ? ` · ${d.failed} ${t('viral_zalo_failed', 'failed')}` : ''}`,
        d?.failed ? 'warning' : 'success'
      );
    } catch (err: any) {
      toast.show(err?.message || t('viral_zalo_send_fail', 'Could not send via Zalo.'), 'warning');
    } finally {
      setSending(false);
    }
  };
  const meta = (() => {
    try {
      return JSON.parse(report.meta || '{}');
    } catch {
      return {};
    }
  })();
  // tick todo lưu local theo bản tin — nhẹ nhàng, không cần backend
  const lsKey = `viral-report-todos-${report.id}`;
  const [done, setDone] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(lsKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  const toggleTodo = (i: number) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      localStorage.setItem(lsKey, JSON.stringify([...next]));
      return next;
    });
  };
  const del = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await deleteDialog(t('viral_report_delete_confirm', 'Delete this brief?'), t('viral_delete', 'Delete')))) return;
    await fetch(`/viral/reports/${report.id}`, { method: 'DELETE' });
    onDone();
  };
  const KIND: Record<string, string> = {
    crawl: t('viral_report_kind_crawl', 'After crawl'),
    sunday: t('viral_report_kind_sunday', 'Sunday recap'),
    manual: t('viral_report_kind_manual', 'Manual'),
  };
  const todos: any[] = meta.todos || [];
  return (
    <div className="bg-newColColor border border-newBgLineColor rounded-[13px] overflow-hidden">
      {/* header accordion = div role=button (button lồng button là HTML sai —
          nút 📤/✕ bên trong tự stopPropagation); Enter/Space giữ như button thật */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className="w-full text-left p-[14px] flex items-center gap-[10px] hover:bg-newBgColorInner/40"
      >
        <span className="text-[18px]">📰</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-[700] truncate">{report.title}</span>
          <span className="block text-[11.5px] text-textItemBlur">
            {String(report.createdAt).slice(0, 10)} · {KIND[report.kind] || report.kind}
            {todos.length > 0 && ` · ✅ ${done.size}/${todos.length}`}
          </span>
        </span>
        <span className="text-textItemBlur text-[12px]">{open ? '▲' : '▼'}</span>
        <button
          onClick={sendZalo}
          disabled={sending}
          title={t('viral_zalo_send_this', 'Send this brief via Zalo to the saved recipients')}
          className="px-[8px] py-[4px] mobile:min-h-[36px] mobile:min-w-[36px] rounded-[6px] text-[11.5px] text-btnPrimary hover:bg-btnPrimary/10 disabled:opacity-50"
        >
          {sending ? '…' : '📤'}
        </button>
        <button onClick={del} className="px-[8px] py-[4px] mobile:min-h-[36px] mobile:min-w-[36px] rounded-[6px] text-[11.5px] text-[#FF5A52] hover:bg-[#FF5A52]/10">✕</button>
      </div>
      {open && (
        <div className="px-[16px] pb-[16px] flex flex-col gap-[12px] border-t border-newBgLineColor/60 pt-[12px]">
          {meta.summary && <div className="text-[13px] leading-[1.6]">{meta.summary}</div>}
          {(meta.highlights || []).length > 0 && (
            <div>
              <div className="text-[11px] font-[800] uppercase tracking-[0.06em] text-[#FF7A00] mb-[6px]">🔥 {t('viral_report_hot', 'Hot this week')}</div>
              <ol className="flex flex-col gap-[5px] list-decimal ml-[18px] text-[12.5px] leading-[1.55]">
                {(meta.highlights || []).map((h: string, i: number) => <li key={i}>{h}</li>)}
              </ol>
            </div>
          )}
          {(meta.market || []).length > 0 && (
            <div>
              <div className="text-[11px] font-[800] uppercase tracking-[0.06em] text-btnPrimary mb-[6px]">📈 {t('viral_report_market', 'Market moves')}</div>
              <ul className="flex flex-col gap-[5px] list-disc ml-[18px] text-[12.5px] leading-[1.55]">
                {(meta.market || []).map((m: string, i: number) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {todos.length > 0 && (
            <div>
              <div className="text-[11px] font-[800] uppercase tracking-[0.06em] text-[#57D9A3] mb-[6px]">✅ {t('viral_report_todos', 'This week to-do')}</div>
              <div className="flex flex-col gap-[6px]">
                {todos.map((td: any, i: number) => (
                  <label key={i} className="flex items-start gap-[8px] cursor-pointer text-[12.5px] leading-[1.5]">
                    <input type="checkbox" checked={done.has(i)} onChange={() => toggleTodo(i)} className="mt-[3px]" />
                    <span className={done.has(i) ? 'line-through text-textItemBlur' : ''}>
                      <b>{td.title}</b>{td.action ? ` — ${td.action}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {meta.stats && <div className="text-[11.5px] text-textItemBlur">📊 {meta.stats}</div>}
        </div>
      )}
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
  // ── Mobile: touch không có hover/lasso chuột → chế độ "Chọn" bật tick + tap
  // thẻ = chọn; panel Nguồn theo dõi mặc định gập cho gọn trang.
  const isMobile = useIsMobile();
  const [selectMode, setSelectMode] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);
  const showTicks = isMobile && selectMode;
  // "Chờ đăng" (ready) gộp Bài của mình (caption social) + Sản phẩm (blog/ảnh/
  // podcast) — 1 bước cuối trước Lưu trữ, chia 2 khu theo cách đăng.
  const isReady = tab === 'ready';
  const isArchive = tab === 'archive';
  const isSkills = tab === 'skills';
  const isReports = tab === 'reports';
  const { data: reportsData, mutate: mutateReports } = useReports(isReports);
  const [makingReport, setMakingReport] = useState(false);
  const { data, isLoading, mutate } = useViral(platform, level, sort, tab);
  // CONTENT là đơn vị duyệt CHÍNH: tab Chờ duyệt/Đã duyệt/Lưu trữ hiển thị chủ
  // đề (1 content = nhiều bài, nhiều nguồn — hoặc 1 bài); bài lẻ chỉ còn là
  // bằng chứng bên trong từng content.
  const isTopicTab = tab === 'pending' || tab === 'approved' || isArchive;
  const topicStatus = isArchive ? 'archive' : tab === 'approved' ? 'approved' : 'pending';
  const { data: topicsData, isLoading: topicsLoading, mutate: mutateTopics } = useTopics(sort, topicStatus);
  const { data: mineData, mutate: mutateMine } = useMine();
  const { data: productsData, mutate: mutateProducts } = useProducts(isReady);
  // Trạng thái ⏸ Dừng sản xuất — hiện băng rôn + nút mở lại ngay trên trang.
  const { data: cfgData, mutate: mutateCfgMain } = useSWR(
    'viral-config',
    async () => (await fetch('/viral/config')).json()
  );
  const refreshAll = useCallback(() => {
    mutate();
    mutateTopics();
    mutateMine();
    mutateProducts();
  }, [mutate, mutateTopics, mutateMine, mutateProducts]);

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

  // đổi tab → bỏ chọn hết (kèm tắt chế độ chọn mobile)
  useEffect(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, [tab, platform, level]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // nút "Chọn/Xong" (mobile) — tắt thì bỏ luôn các thẻ đã tick
  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => {
      if (v) setSelected(new Set());
      return !v;
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
      if (isTopicTab) {
        // Tab content: hàng loạt qua /viral/topics/bulk; clone = viết lại từng
        // content thành "Bài của mình" (tuần tự — mỗi cái 1 lần gọi AI).
        if (action === 'clone') {
          for (const id of ids) {
            await fetch(`/viral/topics/${id}/clone`, { method: 'POST' }).catch(() => null);
          }
          toast.show(`${t('viral_cloning_n', 'Creating')} ${ids.length} ${t('viral_cloning_n_suffix', 'social posts — check the "Ready to post" tab in a few minutes.')}`, 'success');
          setTab('ready');
        } else {
          await fetch('/viral/topics/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) });
          if (action === 'approve') {
            toast.show(t('viral_topic_approved_toast', 'Approved — AI is producing the suggested format, see "Ready to post" in a few minutes.'), 'success');
          }
        }
      } else {
        const res = await (await fetch('/viral/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) })).json();
        if (action === 'clone') {
          toast.show(`${t('viral_cloning_n', 'Creating')} ${res?.queued ?? ids.length} ${t('viral_cloning_n_suffix', 'social posts — check the "Ready to post" tab in a few minutes.')}`, 'success');
          setTab('ready');
        }
      }
      setSelected(new Set());
      refreshAll();
    },
    [selected, refreshAll, t, isTopicTab]
  );

  const selectAllOnPage = useCallback(() => {
    if (isReady) {
      // Tab Chờ đăng: id có tiền tố phân loại — 'p:' sản phẩm, 'm:' bài social.
      const ids = [
        ...(productsData?.items || []).map((p: any) => 'p:' + p.id),
        ...(mineData?.items || []).map((c: any) => 'm:' + c.id),
      ];
      setSelected((prev) => (prev.size >= ids.length && ids.length > 0 ? new Set() : new Set(ids)));
      return;
    }
    const list = isTopicTab ? topicsData?.topics || [] : data?.items || [];
    setSelected((prev) => (prev.size >= list.length && list.length > 0 ? new Set() : new Set(list.map((p: any) => p.id))));
  }, [data, topicsData, isTopicTab, isReady, productsData, mineData]);

  // ── "Chờ đăng": xóa hàng loạt + đăng Lịch hàng loạt ───────────────────────
  const bulkReadyDelete = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!(await deleteDialog(`${t('viral_ready_delete_confirm', 'Delete the selected cards from "Ready to post"')} (${ids.length})?`, t('viral_delete', 'Delete')))) return;
    for (const id of ids) {
      const real = id.slice(2);
      await fetch(id.startsWith('p:') ? `/viral/products/${real}` : `/viral/mine/${real}`, { method: 'DELETE' }).catch(() => null);
    }
    setSelected(new Set());
    refreshAll();
  }, [selected, refreshAll, t]);

  const openBulkPostReady = useCallback(() => {
    const mineItems = (mineData?.items || []).filter((c: any) => selected.has('m:' + c.id));
    const productItems = (productsData?.items || []).filter((p: any) => selected.has('p:' + p.id));
    modal.openModal({
      title: t('viral_bulk_post_title', 'Post selected to Calendar'),
      withCloseButton: true,
      classNames: { modal: 'w-[100%] max-w-[520px]' },
      children: (
        <BulkPostReadyModal
          mineItems={mineItems}
          productItems={productItems}
          onDone={() => {
            setSelected(new Set());
            refreshAll();
          }}
        />
      ),
    });
  }, [selected, mineData, productsData, refreshAll, t]);

  const resumeProduction = useCallback(async () => {
    const res = await fetch('/viral/config', { method: 'POST', body: JSON.stringify({ productionPaused: false }) });
    if (res.status >= 400) {
      toast.show(t('viral_need_admin', 'System administrator permission required.'), 'warning');
      return;
    }
    toast.show(t('viral_production_resumed', 'Production resumed — the funnel auto-approves and produces again.'), 'success');
    mutateCfgMain();
  }, [mutateCfgMain, t]);

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
  const openTopic = (id: string) => () =>
    modal.openModal({ title: t('viral_modal_topic', 'Content'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[640px]' }, children: <TopicDetailModal topicId={id} onDone={refreshAll} /> });
  // Thao tác nhanh trên thẻ content (duyệt/bỏ/khôi phục/xóa cứng — 1 thẻ).
  const topicQuick = (id: string, action: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (action === 'hard-delete' && !(await deleteDialog(t('viral_hard_delete_one_confirm', 'Permanently delete this post from the database?'), t('viral_delete', 'Delete')))) return;
    await fetch('/viral/topics/bulk', { method: 'POST', body: JSON.stringify({ ids: [id], action }) });
    if (action === 'approve') {
      toast.show(t('viral_topic_approved_toast', 'Approved — AI is producing the suggested format, see "Ready to post" in a few minutes.'), 'success');
    }
    refreshAll();
  };
  const openSource = () =>
    modal.openModal({ title: t('viral_modal_add_source', 'Add tracked source'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[500px]' }, children: <SourceModal onDone={mutate} /> });
  const openConfig = () =>
    modal.openModal({ title: t('viral_modal_config', 'Auto-crawl configuration'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[520px]' }, children: <ConfigModal /> });
  const openPersonas = () =>
    modal.openModal({ title: t('viral_modal_personas', '8 customer personas'), withCloseButton: true, classNames: { modal: 'w-[100%] max-w-[640px]' }, children: <PersonasModal /> });
  // Sản xuất: từ các thẻ đã chọn → chọn định dạng → job chạy nền → tab Sản phẩm.
  // Tick sẵn theo gợi ý AI: content_type đa số + podcast nếu có bài podcast_score>=75.
  const openProduce = useCallback(() => {
    const ids = [...selected];
    if (!ids.length) return;
    // gợi ý AI: content trả scoreDetail đã parse sẵn; bài lẻ là chuỗi JSON
    const chosen = isTopicTab
      ? (topicsData?.topics || []).filter((p: any) => selected.has(p.id))
      : (data?.items || []).filter((p: any) => selected.has(p.id));
    const count: Record<string, number> = {};
    let podcast = false;
    for (const p of chosen) {
      let d: any = {};
      if (isTopicTab) d = p.scoreDetail || {};
      else {
        try {
          d = JSON.parse(p.scoreDetail || '{}');
        } catch {
          d = {};
        }
      }
      if (d.content_type === 'blog' || d.content_type === 'infographic') count[d.content_type] = (count[d.content_type] || 0) + 1;
      if (d.content_type === 'video' || (d.podcast_score ?? 0) >= 75) podcast = true;
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
          source={isTopicTab ? 'topic' : 'post'}
          defaults={defaults}
          onDone={() => {
            setSelected(new Set());
            setTab('ready');
            refreshAll();
          }}
        />
      ),
    });
  }, [selected, data, topicsData, isTopicTab, refreshAll, t]);

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
  // Đổi loại nguồn (đối thủ/KOL/group/tin/khác) — school+kol tính vào "động tĩnh
  // đối thủ" của bản tin tuần.
  const setSourceType = (s: any) => async (e: React.ChangeEvent<HTMLSelectElement>) => {
    await fetch(`/viral/sources/${s.id}/type`, { method: 'POST', body: JSON.stringify({ type: e.target.value }) });
    mutate();
  };

  const removePost = (id: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await deleteDialog(t('viral_delete_post_confirm', 'Remove this post from the forge?'), t('viral_delete', 'Delete')))) return;
    await fetch(`/viral/${id}`, { method: 'DELETE' });
    mutate();
  };
  // Dọn nguồn 1 nút: xoá trùng, phân loại KOL/đối thủ/group/news, AUTO cho
  // báo + keyword (hệ thống cào), OFF cho FB (đối tác cào — chỉ làm danh bạ).
  const cleanupSources = useCallback(async () => {
    const res = await (await fetch('/viral/sources/cleanup', { method: 'POST' })).json();
    toast.show(
      `🧹 ${t('viral_cleanup_done', 'Cleaned:')} ${res?.removed ?? 0} ${t('viral_cleanup_dups', 'duplicates removed')}, ${res?.retyped ?? 0} ${t('viral_cleanup_typed', 'reclassified')}, ${res?.autoOn ?? 0} AUTO ${t('viral_cleanup_on', 'on')}, ${res?.autoOff ?? 0} ${t('viral_cleanup_off', 'off')}.`,
      'success'
    );
    mutate();
  }, [mutate, t]);
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
  const topics = topicsData?.topics || [];
  const sources = data?.sources || [];

  const QUICK = [
    { label: 'TikTok Trending', href: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en' },
    { label: 'FB Ad Library', href: 'https://www.facebook.com/ads/library/' },
    { label: 'Google Trends', href: 'https://trends.google.com/trends/?geo=VN' },
    { label: 'YouTube Trending', href: 'https://www.youtube.com/feed/trending' },
  ];

  // Nút "Chọn / Xong" — mobile-only (desktop có hover-tick + lasso chuột):
  // bật thì tick hiện trên mọi thẻ và TAP thẻ = chọn thay vì mở chi tiết.
  const selectModeBtn = (
    <button
      onClick={toggleSelectMode}
      className={clsx(
        'hidden mobile:flex items-center justify-center h-[44px] px-[16px] rounded-[9px] text-[13px] font-[700] border tap-shrink shrink-0',
        selectMode
          ? 'bg-btnPrimary/15 border-btnPrimary/50 text-btnPrimary'
          : 'border-newBgLineColor text-textItemBlur'
      )}
    >
      {selectMode ? `✓ ${t('viral_select_done', 'Done')}` : `☑ ${t('viral_select_mode', 'Select')}`}
    </button>
  );

  return (
    <div
      className={clsx(
        'flex-1 bg-newBgColorInner p-[24px] mobile:p-[14px] overflow-auto flex flex-col gap-[16px]',
        // Đang chọn hàng loạt trên mobile: bulk bar ghim đáy → chừa đệm để
        // thẻ cuối lưới không bị che.
        selected.size > 0 && 'mobile:pb-[140px]'
      )}
    >
      {/* header: stats bên trái + nút bên phải, MỘT hàng cho gọn diện tích.
          Mobile: stats = dãy chip cuộn ngang, nút = hàng cuộn ngang, Add → FAB. */}
      <div className="flex items-center gap-[10px] flex-wrap">
        <div className="flex gap-[22px] px-[16px] py-[8px] bg-newColColor border border-newBgLineColor rounded-[10px] flex-wrap items-center mobile-hscroll mobile:w-full mobile:flex-nowrap mobile:gap-[8px] mobile:p-0 mobile:bg-transparent mobile:border-0 mobile:rounded-none">
          {[
            [stats?.total ?? '—', t('viral_stat_captured', 'posts captured'), false],
            [nice(stats?.totalShares) ?? '—', t('viral_stat_total_shares', 'total shares'), true],
            [stats?.cloned ?? '—', t('viral_stat_cloned', 'cloned'), false],
            [stats?.sources ?? '—', t('viral_stat_sources', 'tracked sources'), false],
          ].map(([v, k, gold], i) => (
            <div key={i} className="flex items-baseline gap-[6px] mobile:shrink-0 mobile:whitespace-nowrap mobile:bg-newColColor mobile:border mobile:border-newBgLineColor mobile:rounded-full mobile:px-[12px] mobile:py-[7px]">
              <span className={clsx('text-[16px] font-[700] tabular-nums', gold && 'text-[#FFC53D]')}>{v as any}</span>
              <span className="text-[11px] text-textItemBlur">{k as any}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 mobile:hidden" />
        {/* contents = vỏ trong suốt trên desktop (không đổi pixel); mobile thành hàng cuộn */}
        <div className="contents mobile:flex mobile:w-full mobile:items-center mobile:gap-[8px] mobile-hscroll">
          <button onClick={openPersonas} title={t('viral_modal_personas', '8 customer personas')} className="h-[40px] px-[12px] rounded-[9px] border border-newBgLineColor text-textItemBlur hover:text-textColor text-[13px] mobile:shrink-0 mobile:whitespace-nowrap tap-shrink">
            🧬 {t('viral_personas_button', 'Personas')}
          </button>
          <button onClick={openConfig} title={t('viral_modal_config', 'Auto-crawl configuration')} className="h-[40px] px-[12px] rounded-[9px] border border-newBgLineColor text-textItemBlur hover:text-textColor text-[13px] mobile:shrink-0 mobile:whitespace-nowrap tap-shrink">
            {t('viral_config_button', 'Settings')}
          </button>
          <button onClick={crawlNow} disabled={crawling} className="h-[40px] px-[14px] rounded-[9px] border border-newBgLineColor bg-newColColor text-[13px] font-[600] disabled:opacity-50 mobile:shrink-0 mobile:whitespace-nowrap tap-shrink">
            {crawling ? t('viral_crawling', 'Crawling…') : t('viral_crawl_now', 'Crawl now')}
          </button>
          <Button className="mobile:hidden" onClick={openCapture}>{t('viral_add_post_button', 'Add viral post')}</Button>
        </div>
      </div>
      {/* FAB mobile = hành động chính "Thêm bài viral"; nhường chỗ khi đang chọn
          (thanh bulk fixed đáy) và ở tab ngoài luồng content */}
      {(isTopicTab || isReady) && !showTicks && selected.size === 0 && (
        <MobileFab label={t('viral_add_post_button', 'Add viral post')} onClick={openCapture} />
      )}

      {/* LUỒNG 4 BƯỚC: ①Chờ duyệt → ②Đã duyệt → ③Bài của mình → ④Sản phẩm.
          Lưu trữ nằm NGOÀI luồng (bên phải). Dưới tabs có dòng hướng dẫn bước.
          Mobile: 1 hàng pill cuộn ngang, bỏ mũi tên. */}
      <div className="flex items-center gap-[6px] flex-wrap mobile:flex-nowrap mobile-hscroll">
        {[
          ['pending', t('viral_status_pending', 'To review'), topicsData?.counts?.pending ?? data?.statusCounts?.pending],
          ['approved', t('viral_status_approved', 'Approved'), topicsData?.counts?.approved ?? data?.statusCounts?.approved],
          ['ready', t('viral_tab_ready', 'Ready to post'), (data?.statusCounts?.mine || 0) + (data?.statusCounts?.products || 0)],
        ].map(([k, l, count], i) => (
          <Fragment key={k as string}>
            {i > 0 && <span className="text-textItemBlur/50 text-[14px] font-[700] select-none px-[1px] mobile:hidden">→</span>}
            <button
              onClick={() => setTab(k as string)}
              className={clsx(
                'flex items-center gap-[7px] px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-[700] border mobile:h-[40px] mobile:shrink-0 mobile:whitespace-nowrap tap-shrink',
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
        {/* mobile: hàng cuộn ngang nên spacer chỉ giữ khoảng ngăn nhóm tab phụ */}
        <div className="flex-1 mobile:min-w-[16px]" />
        <button
          onClick={() => setTab('reports')}
          title={t('viral_tab_reports_hint', 'Weekly briefs: hot news, market moves, to-do list — also sent to Zalo/email')}
          className={clsx(
            'px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-[700] border mobile:h-[40px] mobile:flex mobile:items-center mobile:shrink-0 mobile:whitespace-nowrap tap-shrink',
            tab === 'reports'
              ? 'bg-newColColor border-newTableBorder text-textColor'
              : 'border-newBgLineColor text-textItemBlur hover:text-textColor'
          )}
        >
          📰 {t('viral_tab_reports', 'Briefs')}
        </button>
        <button
          onClick={() => setTab('skills')}
          title={t('viral_tab_skills_hint', 'Edit the AI recipes: blog/podcast/infographic formulas, scoring rubric, rewrite rules…')}
          className={clsx(
            'px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-[700] border mobile:h-[40px] mobile:flex mobile:items-center mobile:shrink-0 mobile:whitespace-nowrap tap-shrink',
            tab === 'skills'
              ? 'bg-newColColor border-newTableBorder text-textColor'
              : 'border-newBgLineColor text-textItemBlur hover:text-textColor'
          )}
        >
          🧪 {t('viral_tab_skills', 'AI recipes')}
        </button>
        <button
          onClick={() => setTab('archive')}
          className={clsx(
            'px-[12px] py-[7px] rounded-[8px] text-[12.5px] font-[700] border mobile:h-[40px] mobile:flex mobile:items-center mobile:shrink-0 mobile:whitespace-nowrap tap-shrink',
            tab === 'archive'
              ? 'bg-newColColor border-newTableBorder text-textColor'
              : 'border-newBgLineColor text-textItemBlur hover:text-textColor'
          )}
        >
          🗄 {t('viral_tab_archive', 'Archive')}
          {(topicsData?.counts?.archive ?? data?.statusCounts?.archive) != null && (
            <span className="ms-[6px] tabular-nums opacity-80">{topicsData?.counts?.archive ?? data?.statusCounts?.archive}</span>
          )}
        </button>
      </div>

      {/* hướng dẫn bước hiện tại — ai mới vào nhìn là biết làm gì tiếp */}
      <div className="flex items-start gap-[8px] text-[12px] leading-[1.55] text-textItemBlur bg-newColColor border border-newBgLineColor rounded-[9px] px-[13px] py-[8px]">
        <span className="shrink-0">💡</span>
        <span>
          {tab === 'pending' && t('viral_flow_pending_topics', 'Step 1 · Each card is one CONTENT — many posts from many sources merged (a 1-post content is fine too). The AI already scored & rewrote it up to 3 rounds: ≥ threshold auto-approved, low ones auto-skipped, the rest wait for you here. ✓ Approve = auto-produce the suggested format.')}
          {tab === 'approved' && t('viral_flow_approved_topics2', 'Step 2 · Only content still being produced (or failed) stays here — once every product finishes, the card leaves this tab automatically (its products are in "Ready to post"). Select cards → "🏭 Produce" for more formats or "⧉ Clone" for a social post.')}
          {tab === 'ready' && t('viral_flow_ready2', 'Step 3 · Everything finished, waiting to publish. ✍️ Social posts → 📤 push to the Calendar (Facebook…). 🏭 Blog/infographic/podcast → download & publish to the website / YouTube / fanpage. Tick or drag-select multiple cards → bulk "📤 Add to Calendar" / "🗑 Delete".')}
          {tab === 'archive' && t('viral_flow_archive_topics', 'Outside the flow · Skipped + deleted content rests here. Everything is permanently deleted after 7 days. You can still ↩ Restore a content back to "To review".')}
          {tab === 'skills' && t('viral_flow_skills', 'Outside the flow · The AI recipes behind every step: writing formulas, scoring rubric, group routing, weekly brief… Edit as markdown, import a .md file, or reset to the built-in default — changes apply from the very next AI run.')}
          {tab === 'reports' && t('viral_flow_reports', 'Outside the flow · Weekly briefs the AI compiles from 7 days of crawling: hot news, market moves and a to-do list. Auto-created on the Mon-Wed-Fri schedule + Sunday recap, also sent to Zalo/email — tick off to-dos right here.')}
        </span>
      </div>

      {/* ⏸ băng rôn Dừng sản xuất — thấy ngay tại sao không có gì tự duyệt/sản xuất */}
      {cfgData?.productionPaused && (
        <div className="flex items-center gap-[10px] flex-wrap bg-amber-400/10 border border-amber-400/40 rounded-[10px] px-[14px] py-[9px]">
          <span className="text-[12.5px] font-[700] text-amber-400">
            ⏸ {t('viral_paused_banner', 'PRODUCTION PAUSED — every content stops at "To review" no matter the score; no rewriting, and approving does not auto-produce.')}
          </span>
          <button
            onClick={resumeProduction}
            className="ms-auto h-[30px] px-[12px] rounded-[8px] text-[12px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25"
          >
            ▶ {t('viral_resume_production_btn', 'Resume production')}
          </button>
        </div>
      )}

      {/* thanh thao tác hàng loạt + điều khiển Lưu trữ.
          Mobile khi CÓ chọn: ghim đáy ngay trên tab bar, 1 hàng nút 44px cuộn
          ngang (ngón cái với tới); không chọn (ghi chú Lưu trữ) thì nằm in-flow. */}
      {(selected.size > 0 || isArchive) && (
        <div
          className={clsx(
            'flex items-center gap-[8px] flex-wrap bg-newColColor border border-newBgLineColor rounded-[10px] px-[14px] py-[9px]',
            selected.size > 0 &&
              'mobile:fixed mobile:bottom-[var(--bottom-nav-h,64px)] mobile:inset-x-0 mobile:z-[160] mobile:flex-nowrap mobile-hscroll mobile:rounded-none mobile:border-x-0 mobile:border-b-0 mobile:bg-newBgColorInner mobile:px-[12px] mobile:py-[10px]'
          )}
        >
          {selected.size > 0 ? (
            <>
              <span className="text-[12.5px] font-[700] text-textColor mobile:shrink-0 mobile:whitespace-nowrap">{selected.size} {t('viral_selected', 'selected')}</span>
              <button onClick={selectAllOnPage} className="text-[12px] text-btnPrimary hover:underline mobile:min-h-[44px] mobile:px-[8px] mobile:shrink-0 mobile:whitespace-nowrap">{t('viral_select_all', 'Select all')}</button>
              <button onClick={() => setSelected(new Set())} className="text-[12px] text-textItemBlur hover:text-textColor mobile:min-h-[44px] mobile:px-[8px] mobile:shrink-0 mobile:whitespace-nowrap">{t('viral_clear_selection', 'Clear')}</button>
              <div className="w-[1px] h-[18px] bg-newBgLineColor mx-[2px] mobile:shrink-0" />
              {isReady ? (
                <>
                  <button onClick={openBulkPostReady} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25">📤 {t('viral_bulk_post_button_bar', 'Add to Calendar')}</button>
                  <button onClick={bulkReadyDelete} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] text-[#FF5A52] border border-[#FF5A52]/30 hover:bg-[#FF5A52]/10">🗑 {t('viral_delete', 'Delete')}</button>
                </>
              ) : !isArchive ? (
                <>
                  <button onClick={() => bulkAction('approve')} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25">✓ {t('viral_approve', 'Approve')}</button>
                  <button onClick={() => bulkAction('skip')} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] text-[#FF5A52] border border-[#FF5A52]/30 hover:bg-[#FF5A52]/10">✕ {t('viral_skip', 'Skip')}</button>
                  <button onClick={() => bulkAction('clone')} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] bg-btnPrimary/15 text-btnPrimary hover:bg-btnPrimary/25">⧉ {t('viral_clone_bulk', 'Clone → My posts')}</button>
                  <button onClick={openProduce} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] bg-[#57D9A3]/15 text-[#57D9A3] hover:bg-[#57D9A3]/25">🏭 {t('viral_produce_bulk', 'Produce')}</button>
                  <button onClick={() => bulkAction('delete')} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] text-textItemBlur border border-newBgLineColor hover:text-textColor">🗑 {t('viral_move_archive', 'Archive')}</button>
                </>
              ) : (
                <>
                  <button onClick={() => bulkAction('pending')} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] text-btnPrimary border border-btnPrimary/40 hover:bg-btnPrimary/10">↩ {t('viral_restore', 'Restore')}</button>
                  <button onClick={() => bulkAction('hard-delete')} className="h-[32px] mobile:h-[44px] mobile:shrink-0 mobile:whitespace-nowrap px-[12px] rounded-[8px] text-[12px] font-[700] text-[#FF5A52] border border-[#FF5A52]/40 hover:bg-[#FF5A52]/10">✕ {t('viral_delete_forever', 'Delete forever')}</button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="text-[12px] text-textItemBlur">🗄 {t('viral_archive_note', 'Skipped + deleted posts. Everything here is auto-deleted after 7 days.')}</span>
              <button onClick={purgeArchive} className="ms-auto h-[32px] mobile:h-[44px] mobile:shrink-0 px-[12px] rounded-[8px] text-[12px] font-[700] text-[#FF5A52] border border-[#FF5A52]/40 hover:bg-[#FF5A52]/10">🗑 {t('viral_delete_all', 'Delete all from database')}</button>
            </>
          )}
        </div>
      )}

      {/* điều khiển tab content: chỉ còn SẮP XẾP (1 content trộn nhiều nền tảng
          + nhiều cấp học nên bỏ 2 hàng lọc cũ của chế độ theo-bài) */}
      {isTopicTab && (
        <div className="flex gap-[6px] items-center flex-wrap">
          {selectModeBtn}
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="ms-auto bg-newColColor border border-newBgLineColor rounded-[8px] px-[10px] py-[7px] mobile:h-[44px] text-[12.5px] outline-none">
            <option value="shares">{t('viral_sort_convergence', 'Hottest (most posts & sources)')}</option>
            <option value="score">{t('viral_sort_score', 'Highest AI score')}</option>
            <option value="new">{t('viral_sort_recent', 'Recently captured')}</option>
          </select>
        </div>
      )}

      {/* tab Chờ đăng không có toolbar sắp xếp → hàng riêng cho nút Chọn (mobile) */}
      {isReady && <div className="hidden mobile:flex">{selectModeBtn}</div>}

      {/* 📰 Bản tin tuần — đọc lại + tick todo + cấu hình gửi Zalo */}
      {isReports ? (
        <div className="flex flex-col gap-[12px]">
          <ZaloSendPanel latestId={(reportsData?.items || [])[0]?.id} />
          <div className="flex">
            <button
              onClick={async () => {
                setMakingReport(true);
                try {
                  const res = await fetch('/viral/report/test', { method: 'POST' });
                  toast.show(
                    res.ok
                      ? t('viral_report_made', 'Brief created — also sent to your channels.')
                      : t('viral_report_test_fail', 'Could not send test brief.'),
                    res.ok ? 'success' : 'warning'
                  );
                  mutateReports();
                } finally {
                  setMakingReport(false);
                }
              }}
              disabled={makingReport}
              className="h-[38px] px-[16px] rounded-[9px] text-[13px] font-[700] bg-btnPrimary/15 text-btnPrimary border border-btnPrimary/40 hover:bg-btnPrimary/25 disabled:opacity-50"
            >
              {makingReport ? t('viral_report_making', 'Compiling… (about a minute)') : `⚡ ${t('viral_report_make', 'Create brief now')}`}
            </button>
          </div>
          {!(reportsData?.items || []).length ? (
            <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[36px] text-center">
              <div className="text-[15px] font-[600] mb-[6px]">{t('viral_reports_empty_title', 'No briefs yet')}</div>
              <div className="text-[12.5px] text-textItemBlur max-w-[460px] mx-auto">
                {t('viral_reports_empty_desc', 'Briefs are auto-created on the Mon-Wed-Fri crawl schedule and Sunday recap — or press "⚡ Create brief now".')}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-[10px] max-w-[860px]">
              {(reportsData.items || []).map((r: any) => (
                <ReportCard key={r.id} report={r} onDone={mutateReports} />
              ))}
            </div>
          )}
        </div>
      ) : /* 🧪 Công thức AI — kho skill chỉnh được */
      isSkills ? (
        <SkillsPanel />
      ) : /* BƯỚC 3 · "Chờ đăng" — gộp Sản phẩm (blog/ảnh/podcast, đăng web) +
          Bài của mình (caption social, đăng Lịch), chia 2 khu theo cách đăng. */
      isReady ? (
        !(productsData?.items || []).length && !(mineData?.items || []).length ? (
          <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[36px] text-center">
            <div className="text-[15px] font-[600] mb-[6px]">{t('viral_ready_empty_title', 'Nothing waiting to post yet')}</div>
            <div className="text-[12.5px] text-textItemBlur max-w-[480px] mx-auto">
              {t('viral_ready_empty_desc', 'Go to "Approved", select posts, then "🏭 Produce" (blog/infographic/podcast) or "⧉ Clone" (social post). Finished items land here, ready to publish.')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[20px]">
            {/* Khu 1 — Sản phẩm: tải về đăng website / YouTube / fanpage */}
            {(productsData?.items || []).length > 0 && (
              <div className="flex flex-col gap-[10px]">
                <div className="text-[13px] font-[700] flex items-center gap-[7px]">
                  🏭 {t('viral_ready_products_head', 'Products — download & publish to website / YouTube / fanpage')}
                  <span className="text-[11px] text-textItemBlur font-[400]">{(productsData.items || []).length}</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px] select-none" onMouseDown={onGridMouseDown}>
                  {(productsData.items || []).map((p: any) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onDone={refreshAll}
                      sel={selected.has('p:' + p.id)}
                      selectMode={showTicks}
                      onToggleSel={() => toggleSelect('p:' + p.id)}
                      cardRef={(el) => {
                        cardRefs.current['p:' + p.id] = el;
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Khu 2 — Bài social: đẩy lên Lịch (Facebook…) */}
            {(mineData?.items || []).length > 0 && (
              <div className="flex flex-col gap-[10px]">
                <div className="text-[13px] font-[700] flex items-center gap-[7px]">
                  ✍️ {t('viral_ready_social_head', 'Social posts — push to the Calendar (Facebook…)')}
                  <span className="text-[11px] text-textItemBlur font-[400]">{(mineData.items || []).length}</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[14px] select-none" onMouseDown={onGridMouseDown}>
                  {(mineData.items || []).map((c: any) => (
                    <MineCard
                      key={c.id}
                      clone={c}
                      onDone={refreshAll}
                      sel={selected.has('m:' + c.id)}
                      selectMode={showTicks}
                      onToggleSel={() => toggleSelect('m:' + c.id)}
                      cardRef={(el) => {
                        cardRefs.current['m:' + c.id] = el;
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : /* các tab CONTENT: chờ duyệt / đã duyệt / lưu trữ — 1 thẻ = 1 content
          (nhiều bài, nhiều nguồn gộp lại; content 1 bài cũng hợp lệ) */
      topicsLoading ? (
        <div className="text-[13px] text-textItemBlur p-[30px] text-center">{t('viral_loading', 'Loading…')}</div>
      ) : !topics.length ? (
        <div className="border border-dashed border-newBgLineColor rounded-[12px] p-[36px] text-center">
          <div className="text-[15px] font-[600] mb-[6px]">
            {isArchive ? t('viral_archive_empty', 'Archive is empty') : t('viral_topics_empty_title', 'No content yet')}
          </div>
          <div className="text-[12.5px] text-textItemBlur mb-[14px] max-w-[480px] mx-auto">
            {t('viral_topics_empty_desc', 'Content is distilled from every crawl batch (partner Facebook posts + RSS news merged by story). Wait for the next batch, press "Crawl now", or add a post by hand.')}
          </div>
          {!isArchive && <Button onClick={openCapture}>{t('viral_add_first_post', 'Add the first post')}</Button>}
        </div>
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px] select-none"
          onMouseDown={onGridMouseDown}
        >
          {topics.map((p: any) => {
            const sel = selected.has(p.id);
            const sd = p.scoreDetail || {};
            const syn = p.synthesis || {};
            return (
            <div
              key={p.id}
              ref={(el) => {
                cardRefs.current[p.id] = el;
              }}
              onClick={() => {
                if (didDrag.current) return;
                // chế độ chọn (mobile): tap thẻ = tick, không mở chi tiết
                if (showTicks) {
                  toggleSelect(p.id);
                  return;
                }
                openTopic(p.id)();
              }}
              className={clsx(
                'group/card relative cursor-pointer bg-newColColor border rounded-[13px] p-[13px] flex flex-col gap-[8px] transition-colors',
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
                  'absolute z-[10] top-[12px] left-[12px] w-[22px] h-[22px] rounded-[6px] border-2 flex items-center justify-center text-[13px] font-[900] transition-all',
                  sel
                    ? 'bg-btnPrimary border-btnPrimary text-white'
                    : clsx(
                        'bg-newBgColor border-newBgLineColor text-transparent',
                        // chế độ chọn mobile: tick luôn hiện (touch không có hover)
                        showTicks ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'
                      )
                )}
                title={t('viral_select', 'Select')}
                aria-label={t('viral_select', 'Select')}
              >
                ✓
              </button>
              {/* hàng đầu: điểm + persona + vòng viết lại + độ hội tụ (bài·nguồn) */}
              <div className="flex items-center gap-[6px] flex-wrap pl-[30px] min-h-[22px]">
                {p.score != null && (
                  <span className={clsx('text-[11px] font-[800] px-[8px] py-[2px] rounded-[7px] tabular-nums', scoreStyle(p.score))}>⭐ {p.score}</span>
                )}
                {p.persona && <span className="text-[10.5px] font-[700] px-[7px] py-[2px] rounded-full bg-btnPrimary/12 text-btnPrimary">{p.persona}</span>}
                {(sd.rounds ?? 0) > 0 && (
                  <span className="text-[10.5px] text-textItemBlur tabular-nums" title={t('viral_topic_rounds_hint', 'AI rewrite rounds used')}>♻{sd.rounds}</span>
                )}
                <span
                  className={clsx('ms-auto text-[11px] tabular-nums font-[700]', p.postCount > 1 ? 'text-[#FFC53D]' : 'text-textItemBlur')}
                  title={t('viral_topic_convergence_hint', 'posts · sources merged into this content')}
                >
                  📄{p.postCount} · 📡{p.sourceCount}
                </span>
              </div>
              <div className="text-[13.5px] font-[600] leading-[1.4] line-clamp-2 min-h-[38px]">{p.label}</div>
              {(syn.hook || p.aiContent) && (
                <div className="text-[12px] text-textItemBlur leading-[1.5] line-clamp-2">{syn.hook || p.aiContent}</div>
              )}
              <div className="flex gap-[10px] text-[11.5px] text-textItemBlur tabular-nums items-center mt-auto">
                {(p.platforms || []).slice(0, 4).map((pl: string) => (
                  <i key={pl} className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: platMeta(pl)?.dot || '#888' }} title={pl} />
                ))}
                {p.totalShares > 0 && (
                  <span className="text-[#FFC53D]">↗ <b className="text-[#FFC53D] font-[800]">{nice(p.totalShares)}</b></span>
                )}
                {/* trạng thái SẢN XUẤT: lỗi = badge đỏ (thẻ giữ nguyên, mở chi
                    tiết để thử lại — thường do hết hạn mức AI) */}
                {(() => {
                  const prods = p.products || [];
                  const err = prods.filter((x: any) => x.status === 'error');
                  const run = prods.filter((x: any) => x.status === 'processing').length;
                  const done = prods.filter((x: any) => x.status === 'done').length;
                  if (err.length)
                    return (
                      <span className="text-[10.5px] font-[800] px-[7px] py-[2px] rounded-[6px] bg-[#FF5A52]/15 text-[#FF5A52]" title={err[0]?.error || ''}>
                        ❌ {t('viral_prod_failed', 'Production failed')}
                      </span>
                    );
                  if (run) return <span className="text-[10.5px] font-[700]">⏳ {t('viral_prod_running', 'producing…')}</span>;
                  if (done) return <span className="text-[10.5px] font-[700] text-[#57D9A3]">🏭 {done} ✓</span>;
                  return null;
                })()}
                <span className="ms-auto" title={t('viral_produce_suggest', 'AI production suggestion')}>
                  {topicDefaults(sd).map((f) => FORMAT_META[f]?.icon).join(' ')}
                </span>
              </div>
              {/* hành động nhanh theo tab */}
              <div className="flex gap-[6px] pt-[8px] border-t border-newBgLineColor/60">
                {isArchive ? (
                  <>
                    <button onClick={topicQuick(p.id, 'pending')} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-btnPrimary hover:bg-btnPrimary/10">
                      ↩ {t('viral_restore', 'Restore')}
                    </button>
                    <button onClick={topicQuick(p.id, 'hard-delete')} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-[#FF5A52] hover:bg-[#FF5A52]/10">
                      ✕ {t('viral_delete_forever', 'Delete forever')}
                    </button>
                  </>
                ) : p.status === 'pending' ? (
                  <>
                    <button onClick={topicQuick(p.id, 'approve')} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] bg-[#57D9A3]/12 text-[#57D9A3] hover:bg-[#57D9A3]/25">
                      ✓ {t('viral_approve', 'Approve')}
                    </button>
                    <button onClick={topicQuick(p.id, 'skip')} className="flex-1 py-[6px] rounded-[7px] text-[11.5px] font-[700] text-[#FF5A52] hover:bg-[#FF5A52]/10">
                      ✕ {t('viral_skip', 'Skip')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 py-[6px] text-center rounded-[7px] text-[11px] font-[700] text-[#57D9A3]">
                      ✓ {t('viral_status_approved', 'Approved')}
                    </span>
                    <button onClick={topicQuick(p.id, 'pending')} title={t('viral_back_to_review', 'Back to review')} aria-label={t('viral_back_to_review', 'Back to review')} className="px-[10px] py-[6px] rounded-[7px] text-[11.5px] text-textItemBlur hover:text-textColor">
                      ↩
                    </button>
                  </>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openTopic(p.id)();
                  }}
                  className="px-[10px] py-[6px] rounded-[7px] text-[11.5px] font-[700] text-btnPrimary hover:bg-btnPrimary/10"
                  title={t('viral_topic_open', 'Open content detail')}
                  aria-label={t('viral_topic_open', 'Open content detail')}
                >
                  ⧉
                </button>
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

      {/* nguồn theo dõi — desktop luôn mở; mobile mặc định GẬP (panel quản trị
          phụ, không đáng chiếm màn nhỏ), bấm tiêu đề để mở/đóng */}
      <div className="border-t border-newBgLineColor pt-[14px] flex flex-col gap-[10px]">
        <div className="text-[14px] font-[650] mobile:hidden">
          {t('viral_tracked_sources', 'Tracked sources')} <span className="text-[11.5px] text-textItemBlur font-[400]">{t('viral_tracked_sources_note', '— the system auto-crawls new posts on a schedule')}</span>
        </div>
        <button
          onClick={() => setSrcOpen((v) => !v)}
          className="hidden mobile:flex items-center justify-between gap-[8px] min-h-[44px] text-[14px] font-[650] text-start tap-shrink"
        >
          <span>
            {t('viral_tracked_sources', 'Tracked sources')} ({sources.length})
          </span>
          <span className="text-textItemBlur text-[12px]">{srcOpen ? '▲' : '▼'}</span>
        </button>
        <div className={clsx('flex gap-[8px] flex-wrap', !srcOpen && 'mobile:hidden')}>
          {sources.map((s: any) => (
            <div key={s.id} className="flex items-center gap-[7px] bg-newColColor border border-newBgLineColor rounded-full px-[13px] py-[6px] text-[12px]">
              <i className="w-[8px] h-[8px] rounded-full inline-block" style={{ background: platMeta(s.platform)?.dot || '#888' }} />
              <span className="font-[600]">{s.name}</span>
              {/* Loại nguồn — đối thủ (trường) + KOL vào mục "động tĩnh đối thủ" của bản tin */}
              <select
                value={s.type || 'other'}
                onChange={setSourceType(s)}
                title={t('viral_source_type', 'Source type — schools & KOLs count as competitors in the weekly brief')}
                className="text-[10px] bg-transparent border border-newBgLineColor rounded-[5px] px-[3px] py-[1px] text-textItemBlur mobile:min-h-[36px] mobile:px-[8px] mobile:rounded-[7px]"
              >
                <option value="school">{t('viral_type_school', 'Competitor')}</option>
                <option value="kol">KOL</option>
                <option value="group">Group</option>
                <option value="news">{t('viral_type_news', 'News')}</option>
                <option value="other">{t('viral_type_other', 'Other')}</option>
              </select>
              <button
                onClick={toggleSourceAuto(s)}
                title={t('viral_toggle_auto', 'Toggle scheduled auto-crawl for this source')}
                className={clsx(
                  'text-[9.5px] font-[700] px-[6px] py-[1px] rounded-[5px] border mobile:min-h-[36px] mobile:min-w-[48px] mobile:text-[12.5px] mobile:px-[10px] mobile:rounded-[7px]',
                  s.auto
                    ? 'text-[#57D9A3] border-[#57D9A3]/40 bg-[#57D9A3]/10'
                    : 'text-textItemBlur border-newBgLineColor hover:text-textColor'
                )}
              >
                {s.auto ? 'AUTO' : 'OFF'}
              </button>
              <button onClick={removeSource(s.id)} className="text-textItemBlur hover:text-red-400 text-[11px] ms-[2px] mobile:min-h-[36px] mobile:min-w-[36px] mobile:text-[14px]">✕</button>
            </div>
          ))}
          <button onClick={openSource} className="border border-dashed border-newBgLineColor rounded-full px-[14px] py-[6px] mobile:min-h-[44px] text-[12px] text-textItemBlur hover:text-textColor">
            ＋ {t('viral_add_source', 'Add source')}
          </button>
          <button
            onClick={importDefaultSources}
            title={t('viral_import_sources_hint', 'KOLs, competitor schools, parent groups (needs Apify) + 10 Google News keywords (free)')}
            className="border border-dashed border-btnPrimary/40 text-btnPrimary rounded-full px-[14px] py-[6px] mobile:min-h-[44px] text-[12px] hover:bg-btnPrimary/10"
          >
            📥 {t('viral_import_sources', 'Import n8n source pack')}
          </button>
          <button
            onClick={cleanupSources}
            title={t('viral_cleanup_sources_hint', 'One click: DELETE all Facebook/IG/TikTok sources (the crawl partner handles those and labels each post itself), remove duplicates, turn AUTO on for news & Google News keywords')}
            className="border border-dashed border-[#57D9A3]/50 text-[#57D9A3] rounded-full px-[14px] py-[6px] mobile:min-h-[44px] text-[12px] hover:bg-[#57D9A3]/10"
          >
            🧹 {t('viral_cleanup_sources', 'Clean up sources')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViralComponent;
