import { FC, useCallback, useMemo, useRef, useState } from 'react';
import { Integration } from '@prisma/client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Emoji cho từng loại reaction của Facebook.
const REACTION_EMOJI: Record<string, string> = {
  like: '👍', love: '❤️', haha: '😆', wow: '😮', sad: '😢',
  angry: '😡', care: '🥰', thankful: '🌸', pride: '🌈',
};
const reactionRow = (types: Record<string, number>, nice: (n: number) => string) =>
  Object.entries(types)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => (
      <span key={k}>{REACTION_EMOJI[k] || '•'} {nice(v)}</span>
    ));

// Rút gọn số: 1.2K / 3.4M.
const fmt = (n: number) =>
  n >= 1000000
    ? (n / 1000000).toFixed(1).replace('.0', '') + 'M'
    : n >= 1000
    ? (n / 1000).toFixed(1).replace('.0', '') + 'K'
    : new Intl.NumberFormat().format(Math.round(n || 0));

const REACTION_COLOR: Record<string, string> = {
  like: '#1e6fd9', love: '#f0356e', haha: '#f7b928', wow: '#f7b928',
  sad: '#8b95a5', angry: '#e0552b', care: '#f0a0c0', thankful: '#57d9a3', pride: '#b08cff',
};
const REACTION_LABEL: Record<string, string> = {
  like: 'Like', love: 'Love', haha: 'Haha', wow: 'Wow', sad: 'Sad',
  angry: 'Angry', care: 'Care', thankful: 'Thankful', pride: 'Pride',
};

// ── Donut SVG thuần (không thư viện) ───────────────────────────────────────
const Donut: FC<{
  segments: { label: string; value: number; color: string }[];
  center?: string;
}> = ({ segments, center }) => {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R, sw = 16;
  let acc = 0;
  return (
    <div className="flex items-center gap-[16px] flex-wrap">
      <svg width="132" height="132" viewBox="0 0 132 132" className="shrink-0 text-newTableText">
        <circle cx="66" cy="66" r={R} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth={sw} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * C;
          const off = -acc * C;
          acc += frac;
          return (
            <circle key={i} cx="66" cy="66" r={R} fill="none" stroke={s.color} strokeWidth={sw}
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={off}
              transform="rotate(-90 66 66)" />
          );
        })}
        <text x="66" y="62" textAnchor="middle" fill="currentColor" fontSize="21" fontWeight="700">{fmt(total)}</text>
        <text x="66" y="80" textAnchor="middle" fill="currentColor" fontSize="10" opacity="0.55">{center}</text>
      </svg>
      <div className="flex flex-col gap-[5px] text-[12px] min-w-[150px] flex-1">
        {segments.filter((s) => s.value > 0).map((s, i) => (
          <div key={i} className="flex items-center gap-[7px]">
            <span className="w-[10px] h-[10px] rounded-[3px] shrink-0" style={{ background: s.color }} />
            <span className="text-newTableText/80">{s.label}</span>
            <b className="ms-auto tabular-nums text-newTableText">{fmt(s.value)}</b>
            <span className="text-newTableText/45 tabular-nums w-[36px] text-right">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Cột dọc thuần ──────────────────────────────────────────────────────────
const VBars: FC<{ bars: { label: string; value: number }[]; color?: string }> = ({ bars, color = '#1e6fd9' }) => {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="flex items-end gap-[6px]" style={{ height: 140 }}>
      {bars.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col justify-end items-center h-full" title={`${b.label}: ${fmt(b.value)}`}>
          <div className="text-[10px] text-newTableText/55 tabular-nums mb-[3px] h-[12px]">{b.value ? fmt(b.value) : ''}</div>
          <div className="w-full rounded-t-[4px] transition-all" style={{ height: `${(b.value / max) * 100}%`, minHeight: b.value > 0 ? 4 : 0, background: color, opacity: 0.45 + 0.55 * (b.value / max) }} />
          <div className="text-[10px] text-newTableText/60 mt-[5px]">{b.label}</div>
        </div>
      ))}
    </div>
  );
};

const cardCls = 'bg-newTableHeader border border-newTableBorder rounded-[14px] p-[16px]';

// ── Dải KPI (số liệu đầu trang, lấy từ series trang FB) ─────────────────────
const KpiStrip: FC<{ series: any[]; t: (k: string, d: string) => string }> = ({ series, t }) => {
  const byKey = (k: string) => series.find((s: any) => s.key === k);
  const val = (s: any) => (s ? (s.cumulative ? s.latest : s.data.reduce((a: number, p: any) => a + (p.total || 0), 0)) : null);
  const items = [
    { key: 'page_follows', label: t('kpi_total_followers', 'Total followers'), icon: '👥' },
    { key: 'page_total_media_view_unique', label: t('kpi_reach', 'Reach'), icon: '📈' },
    { key: 'page_post_engagements', label: t('kpi_engagement', 'Engagement'), icon: '❤️' },
    { key: 'page_video_views', label: t('kpi_video_views', 'Video views'), icon: '▶️' },
    { key: 'page_views_total', label: t('kpi_profile_views', 'Profile views'), icon: '👁️' },
    { key: 'page_daily_follows', label: t('kpi_new_followers', 'New followers'), icon: '➕' },
  ];
  const cells = items.map((it) => ({ ...it, s: byKey(it.key), v: val(byKey(it.key)) })).filter((c) => c.v != null);
  if (!cells.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[12px]">
      {cells.map((c) => (
        <div key={c.key} className={cardCls}>
          <div className="text-[11px] text-newTableText/60 flex items-center gap-[5px]">{c.icon} {c.label}</div>
          <div className="text-[26px] leading-[32px] font-[700] tabular-nums mt-[6px]">{fmt(c.v as number)}</div>
          {!!c.s?.percentageChange && <TrendIndicator value={c.s.percentageChange} />}
        </div>
      ))}
    </div>
  );
};

// ── Biểu đồ suy ra từ bài đăng THẬT: cảm xúc + ngày trong tuần + giờ ────────
const PostCharts: FC<{ integrationId: string; date: number }> = ({ integrationId, date }) => {
  const t = useT();
  const { data } = useTopPosts(integrationId, date, true);
  const posts = data?.posts || [];
  if (!posts.length) return null;

  const rx: Record<string, number> = {};
  for (const p of posts) {
    if (p.reactionTypes) for (const [k, v] of Object.entries(p.reactionTypes)) rx[k] = (rx[k] || 0) + (v as number);
  }
  const reactionSegs = Object.entries(rx)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: REACTION_LABEL[k] || k, value: v, color: REACTION_COLOR[k] || '#8b95a5' }));

  const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const eng = (p: any) => (p.shares || 0) * 3 + (p.reactions || 0) + (p.comments || 0) * 2;
  const dowBars = DOW.map((label, i) => ({
    label,
    value: posts.filter((p: any) => new Date(p.createdAt).getDay() === i).reduce((a: number, p: any) => a + eng(p), 0),
  }));

  const metricBars = [
    { label: t('analytics_reactions', 'reactions'), value: posts.reduce((a: number, p: any) => a + (p.reactions || 0), 0) },
    { label: t('analytics_comments', 'comments'), value: posts.reduce((a: number, p: any) => a + (p.comments || 0), 0) },
    { label: t('analytics_shares', 'shares'), value: posts.reduce((a: number, p: any) => a + (p.shares || 0), 0) },
    { label: t('analytics_clicks', 'clicks'), value: posts.reduce((a: number, p: any) => a + (p.clicks || 0), 0) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-[16px] mt-[16px]">
      <div className={cardCls}>
        <div className="text-[13px] font-[650] mb-[12px]">😊 {t('chart_reaction_mix', 'Reaction mix')}</div>
        {reactionSegs.length ? <Donut segments={reactionSegs} center={t('analytics_reactions', 'reactions')} /> : <div className="text-[12px] text-newTableText/50">—</div>}
      </div>
      <div className={cardCls}>
        <div className="text-[13px] font-[650] mb-[12px]">📅 {t('chart_best_day', 'Engagement by weekday')}</div>
        <VBars bars={dowBars} color="#b08cff" />
      </div>
      <div className={cardCls}>
        <div className="text-[13px] font-[650] mb-[12px]">📊 {t('chart_metric_mix', 'Interaction totals')}</div>
        <VBars bars={metricBars} color="#32d583" />
      </div>
    </div>
  );
};

interface AnalyticsDataItem {
  label: string;
  data: Array<{ total: number; date: string }>;
  average?: boolean;
  percentageChange?: number;
}

const TrendIndicator: FC<{ value: number; average?: boolean }> = ({
  value,
  average,
}) => {
  if (value === 0) return null;

  const isPositive = value > 0;
  const displayValue = Math.abs(value).toFixed(1);

  return (
    <div
      className={`flex items-center gap-[4px] text-[13px] font-medium ${
        isPositive ? 'text-[#32d583]' : 'text-[#f97066]'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={isPositive ? '' : 'rotate-180'}
      >
        <path
          d="M6 2.5L10 7.5H2L6 2.5Z"
          fill="currentColor"
        />
      </svg>
      <span>
        {displayValue}
        {average ? 'pp' : '%'}
      </span>
    </div>
  );
};

const AnalyticsCard: FC<{
  item: AnalyticsDataItem;
  total: string | number;
  index: number;
}> = ({ item, total, index }) => {
  const colorVariants = ['purple', 'green', 'blue'] as const;
  const color = colorVariants[index % colorVariants.length];

  const hasDataPoints = item.data.length >= 1;

  return (
    <div className="group relative">
      <div
        className={`
          flex flex-col h-full
          bg-newTableHeader
          border border-newTableBorder
          rounded-[12px]
          overflow-hidden
          transition-all duration-200
          hover:border-[#1e6fd9]/50
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[16px] pt-[14px] pb-[8px]">
          <div className="flex items-center gap-[10px]">
            <div
              className={`
                w-[8px] h-[8px] rounded-full
                ${color === 'purple' ? 'bg-[#1e6fd9]' : ''}
                ${color === 'green' ? 'bg-[#32d583]' : ''}
                ${color === 'blue' ? 'bg-[#1d9bf0]' : ''}
              `}
            />
            <span className="text-[15px] font-medium text-newTableText">
              {item.label}
            </span>
          </div>
          {item.percentageChange !== undefined && (
            <TrendIndicator value={item.percentageChange} average={item.average} />
          )}
        </div>

        {/* Content */}
        {hasDataPoints ? (
          <>
            {/* Chart */}
            <div className="flex-1 px-[12px] py-[8px]">
              <div className="h-[120px] relative">
                <ChartSocial data={item.data} color={color} key={`chart-${index}`} />
              </div>
            </div>

            {/* Value */}
            <div className="px-[16px] pb-[14px]">
              <div className="text-[36px] leading-[42px] font-semibold tracking-tight">
                {total}
              </div>
            </div>
          </>
        ) : (
          /* Single value display */
          <div className="flex-1 flex flex-col items-center justify-center py-[32px] px-[16px]">
            <div className="text-[48px] leading-[56px] font-semibold tracking-tight">
              {total}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState: FC<{
  onRefresh: () => void;
  onRetry?: () => void;
  isFacebook?: boolean;
}> = ({ onRefresh, onRetry, isFacebook }) => {
  const t = useT();

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-[48px] px-[24px] bg-newTableHeader border border-newTableBorder rounded-[12px]">
      <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-[#1e6fd9]/10 flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-[#1e6fd9]"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M12 8v4l2 2" />
        </svg>
      </div>
      <p className="text-[15px] text-newTableText text-center mb-[8px]">
        {t('analytics_no_overview', 'No overview data to show right now')}
      </p>
      {isFacebook && (
        <p className="text-[12.5px] text-newTableText/60 text-center mb-[14px] max-w-[520px]">
          {t(
            'analytics_no_overview_hint',
            'This is usually a temporary hiccup or a cached page. Click "Try again" first. If it keeps happening, use "Refresh Channel" to reconnect.'
          )}
        </p>
      )}
      <div className="flex items-center gap-[10px] flex-wrap justify-center">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-[6px] px-[16px] py-[8px] text-[14px] font-medium text-newTableText border border-newTableBorder hover:border-[#1e6fd9] rounded-[8px] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {t('analytics_try_again', 'Try again')}
          </button>
        )}
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-[6px] px-[16px] py-[8px] text-[14px] font-medium text-white bg-[#1e6fd9] hover:bg-[#5023b8] rounded-[8px] transition-colors"
        >
          {t('refresh_channel', 'Refresh Channel')}
        </button>
      </div>
    </div>
  );
};

// Bài nổi bật của kênh FB (kể cả bài đăng ngoài Hub) — "bài chiến thắng".
const useTopPosts = (integrationId: string, date: number, enabled: boolean) => {
  const fetch = useFetch();
  return useSWR(
    enabled ? `/analytics/${integrationId}/top-posts?date=${date}` : null,
    async (u: string) => (await fetch(u)).json(),
    { revalidateOnFocus: false }
  );
};

// ── AI: Phân tích bài chiến thắng — NỘI DUNG cho popup ─────────────────────
const WinningAnalysis: FC<{ integrationId: string }> = ({ integrationId }) => {
  const t = useT();
  const fetch = useFetch();
  const { data, isLoading } = useSWR(
    `/analytics/${integrationId}/winning-analysis`,
    async (u: string) => (await fetch(u)).json(),
    { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false }
  );
  return (
    <div className="flex flex-col gap-[14px] max-h-[72vh] overflow-auto pr-[4px]">
      <div className="text-[12px] text-newTableText/60">
        {t('analytics_ai_analysis_note', '— what wins for this channel, and what to post next')}
      </div>
      {isLoading ? (
        <div className="text-[13px] text-newTableText/60">{t('analytics_ai_thinking', 'AI is reading this channel’s posts…')}</div>
      ) : !data || data.empty ? (
        <div className="text-[13px] text-newTableText/60">{t('analytics_ai_empty', 'Not enough posts yet to analyze — post a bit more, then check back.')}</div>
      ) : (
        <>
          <div className="text-[13.5px] leading-[1.6] text-newTableText/90">{data.overview}</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px]">
            <div className="flex flex-col gap-[8px]">
              <div className="text-[11px] font-[800] tracking-[0.08em] uppercase text-[#1e6fd9]">{t('analytics_patterns', 'What wins')}</div>
              {(data.patterns || []).map((p: any, i: number) => (
                <div key={i} className="bg-newBgColorInner/40 border border-newTableBorder rounded-[10px] p-[10px]">
                  <div className="text-[12.5px] font-[700]">{p.title}</div>
                  <div className="text-[11.5px] text-newTableText/70 leading-[1.5] mt-[2px]">{p.detail}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-[10px]">
              <div>
                <div className="text-[11px] font-[800] tracking-[0.08em] uppercase text-[#32d583] mb-[6px]">{t('analytics_recommendations', 'Do next')}</div>
                <ul className="flex flex-col gap-[5px] text-[12.5px] leading-[1.5] text-newTableText/85 list-disc ps-[18px]">
                  {(data.recommendations || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
              {data.bestFormat && (
                <div className="text-[12px] text-newTableText/70 bg-newBgColorInner/40 border border-newTableBorder rounded-[10px] p-[10px]">
                  <b className="text-newTableText">{t('analytics_best_format', 'Best format')}:</b> {data.bestFormat}
                </div>
              )}
            </div>
          </div>
          {!!(data.contentIdeas || []).length && (
            <div>
              <div className="text-[11px] font-[800] tracking-[0.08em] uppercase text-[#b08cff] mb-[8px]">💡 {t('analytics_content_ideas', 'Post ideas for you')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[10px]">
                {(data.contentIdeas || []).map((c: any, i: number) => (
                  <div key={i} className="bg-newBgColorInner/40 border border-newTableBorder rounded-[10px] p-[11px]">
                    <div className="text-[12.5px] font-[700] leading-[1.4]">{c.title}</div>
                    <div className="text-[11.5px] text-newTableText/70 leading-[1.5] mt-[4px] italic">{c.hook}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── AI chat: hỏi-đáp về kênh ───────────────────────────────────────────────
const ChannelChat: FC<{ integrationId: string; channelName: string }> = ({ integrationId, channelName }) => {
  const t = useT();
  const fetch = useFetch();
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const suggestions = [
    t('analytics_q1', 'Which post performed best and why?'),
    t('analytics_q2', 'Write a post like my top one'),
    t('analytics_q3', 'What should I post this week?'),
  ];
  const send = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || busy) return;
      const history = msgs;
      setMsgs((m) => [...m, { role: 'user', content: question }]);
      setInput('');
      setBusy(true);
      try {
        const res = await (
          await fetch(`/analytics/${integrationId}/ask`, {
            method: 'POST',
            body: JSON.stringify({ question, history }),
          })
        ).json();
        setMsgs((m) => [...m, { role: 'assistant', content: res?.answer || t('analytics_ai_error', 'Sorry, try again.') }]);
      } catch {
        setMsgs((m) => [...m, { role: 'assistant', content: t('analytics_ai_error', 'Sorry, try again.') }]);
      } finally {
        setBusy(false);
        setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }), 60);
      }
    },
    [msgs, busy, integrationId]
  );
  // Bong bóng chat NỔI góc dưới-phải (thay ô class dưới cùng).
  return (
    <div className="fixed bottom-[20px] right-[20px] z-[350] flex flex-col items-end gap-[12px] mobile:bottom-[76px]">
      {open && (
        <div className="w-[390px] max-w-[calc(100vw-32px)] h-[540px] max-h-[72vh] bg-newBgColorInner border border-newTableBorder rounded-[18px] shadow-[0_12px_48px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden animate-fadeIn">
          <div className="shrink-0 flex items-center gap-[10px] px-[16px] py-[12px] border-b border-newTableBorder bg-newTableHeader">
            <span className="w-[30px] h-[30px] rounded-full bg-[#1e6fd9] grid place-items-center text-white text-[15px]">🤖</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-[700] leading-[1.2]">{t('analytics_ask_ai', 'Ask AI about this channel')}</div>
              <div className="text-[11px] text-newTableText/55 truncate">{channelName}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t('close', 'Close')} className="w-[28px] h-[28px] rounded-[7px] grid place-items-center text-newTableText/60 hover:text-newTableText hover:bg-newTableBorder/40">✕</button>
          </div>
          <div ref={scroller} className="flex-1 overflow-auto flex flex-col gap-[10px] p-[14px]">
            {!msgs.length && (
              <div className="text-[12.5px] text-newTableText/70 leading-[1.6]">
                {t('analytics_chat_greeting', 'Hi! Ask me anything about this channel — I read its real numbers and posts. I can even draft a post for you.')}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'self-end max-w-[88%]' : 'self-start max-w-[94%]'}>
                <div className={m.role === 'user' ? 'bg-[#1e6fd9] text-white rounded-[12px] rounded-br-[3px] px-[12px] py-[8px] text-[13px]' : 'bg-newTableHeader border border-newTableBorder rounded-[12px] rounded-bl-[3px] px-[12px] py-[10px] text-[13px] leading-[1.6] whitespace-pre-wrap'}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <div className="self-start text-[12px] text-newTableText/60 px-[4px]">{t('analytics_ai_typing', 'AI is typing…')}</div>}
          </div>
          {!msgs.length && (
            <div className="shrink-0 flex gap-[6px] flex-wrap px-[14px] pb-[10px]">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} className="text-[11.5px] px-[10px] py-[6px] rounded-full border border-newTableBorder text-newTableText/75 hover:border-[#1e6fd9]/60 hover:text-newTableText">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="shrink-0 flex gap-[8px] p-[12px] border-t border-newTableBorder">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder={t('analytics_ask_placeholder', 'Ask anything about this channel’s performance…')}
              className="flex-1 bg-newTableHeader border border-newTableBorder rounded-[10px] px-[12px] h-[40px] text-[13px] text-newTableText outline-none"
            />
            <button onClick={() => send(input)} disabled={busy || !input.trim()} aria-label={t('analytics_send', 'Send')} className="w-[40px] h-[40px] shrink-0 rounded-[10px] bg-[#1e6fd9] text-white grid place-items-center disabled:opacity-50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('analytics_ask_ai', 'Ask AI about this channel')}
        className="w-[56px] h-[56px] rounded-full bg-[#1e6fd9] text-white shadow-[0_6px_20px_rgba(30,111,217,0.5)] grid place-items-center text-[22px] hover:scale-105 transition-transform"
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
};

const TopPostsSection: FC<{ integrationId: string; date: number }> = ({
  integrationId,
  date,
}) => {
  const t = useT();
  const { data, isLoading } = useTopPosts(integrationId, date, true);
  const posts = data?.posts || [];
  const nice = (n: number) =>
    n >= 1000000
      ? (n / 1000000).toFixed(1).replace('.0', '') + 'M'
      : n >= 1000
      ? (n / 1000).toFixed(1).replace('.0', '') + 'K'
      : String(n);

  return (
    <div className="mt-[20px] flex flex-col gap-[10px]">
      <div className="text-[15px] font-[650]">
        🏆 {t('analytics_top_posts', 'Top posts of this channel')}{' '}
        <span className="text-[11.5px] font-[400] text-newTableText/60">
          {t(
            'analytics_top_posts_note',
            '— every post on the page (including ones posted outside the Hub), ranked by engagement'
          )}
        </span>
      </div>
      {isLoading ? (
        <div className="text-[13px] text-newTableText/60 p-[16px]">
          {t('loading', 'Loading...')}
        </div>
      ) : data?.error ? (
        <div className="text-[12.5px] text-[#f97066] bg-newTableHeader border border-newTableBorder rounded-[10px] p-[14px]">
          {t('analytics_top_posts_error', 'Could not read page posts:')} {data.error}
        </div>
      ) : !posts.length ? (
        <div className="text-[13px] text-newTableText/60 bg-newTableHeader border border-newTableBorder rounded-[10px] p-[14px]">
          {t('analytics_top_posts_empty', 'No posts found in this period — try a longer date range.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[12px]">
          {posts.slice(0, 12).map((p: any, i: number) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              title={t('analytics_open_post', 'Open this post on Facebook (new tab)')}
              className="group/post relative bg-newTableHeader border border-newTableBorder rounded-[12px] overflow-hidden flex flex-col hover:border-[#1e6fd9] hover:shadow-[0_2px_12px_rgba(30,111,217,0.18)] transition-all cursor-pointer"
            >
              {/* Chỉ báo link mở tab mới */}
              <span
                aria-hidden="true"
                className="absolute top-[8px] right-[8px] z-[10] w-[24px] h-[24px] grid place-items-center rounded-[6px] bg-black/70 text-white opacity-70 group-hover/post:opacity-100 group-hover/post:bg-[#1e6fd9] transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M17 7H8M17 7v9" />
                </svg>
              </span>
              <div
                className={`relative aspect-[16/8] bg-newBgColorInner/60${
                  p.picture ? ' animate-pulse' : ''
                }`}
              >
                {p.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.picture}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                    onLoad={(e) => e.currentTarget.parentElement?.classList.remove('animate-pulse')}
                    onError={(e) => {
                      const wrap = e.currentTarget.parentElement;
                      wrap?.classList.remove('animate-pulse');
                      e.currentTarget.style.display = 'none';
                      if (wrap && !wrap.querySelector('[data-img-fallback]')) {
                        const fb = document.createElement('div');
                        fb.setAttribute('data-img-fallback', '');
                        fb.className =
                          'absolute inset-0 grid place-items-center text-[12px] text-newTableText/40';
                        fb.textContent = 'Facebook';
                        wrap.appendChild(fb);
                      }
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-[12px] text-newTableText/40">Facebook</div>
                )}
                <span className="absolute top-[8px] left-[8px] text-[11px] font-[800] px-[8px] py-[2px] rounded-[6px] bg-black/70 text-white">
                  #{i + 1}
                </span>
              </div>
              <div className="p-[12px] flex flex-col gap-[8px] flex-1">
                <div className="text-[12.5px] leading-[1.5] line-clamp-3 min-h-[54px]">
                  {p.message || '(post without text)'}
                </div>
                <div className="flex gap-[11px] text-[12px] text-newTableText/70 tabular-nums mt-auto items-center flex-wrap">
                  {p.reactions != null && <span title={t('analytics_reactions', 'reactions')}>👍 <b className="text-newTableText">{nice(p.reactions)}</b></span>}
                  {p.comments != null && <span title={t('analytics_comments', 'comments')}>💬 <b className="text-newTableText">{nice(p.comments)}</b></span>}
                  <span className="text-[#FFC53D]" title={t('analytics_shares', 'shares')}>↗ <b className="font-[800] text-[13px]">{nice(p.shares)}</b></span>
                  {p.clicks != null && <span title={t('analytics_clicks', 'link clicks')}>👆 <b className="text-newTableText">{nice(p.clicks)}</b></span>}
                  {p.views != null && <span title={t('analytics_views', 'video views')}>▶️ <b className="text-newTableText">{nice(p.views)}</b></span>}
                  <span className="ms-auto text-[11px] text-newTableText/50">{String(p.createdAt || '').slice(0, 10)}</span>
                </div>
                {p.reactionTypes && Object.keys(p.reactionTypes).length > 0 && (
                  <div className="flex gap-[8px] text-[11px] text-newTableText/60 tabular-nums pt-[2px] border-t border-newTableBorder/50">
                    {reactionRow(p.reactionTypes, nice)}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export const RenderAnalytics: FC<{
  integration: Integration;
  date: number;
}> = (props) => {
  const { integration, date } = props;
  const fetch = useFetch();

  const load = useCallback(async () => {
    try {
      return await (
        await fetch(`/analytics/${integration.id}?date=${date}`)
      ).json();
    } catch {
      return [];
    }
  }, [integration, date]);

  // Dùng isLoading của SWR thay cho state thủ công: khi remount mà đã có cache,
  // SWR không gọi lại fetcher → state thủ công kẹt `true` (spinner treo).
  const { data, isLoading, mutate } = useSWR(
    `/analytics-${integration?.id}-${date}`,
    load,
    {
      refreshInterval: 0,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshWhenOffline: false,
      revalidateOnMount: true,
    }
  );
  const loading = isLoading && !data;

  const t = useT();
  const modals = useModals();

  const openAnalysis = useCallback(() => {
    modals.openModal({
      title: (
        <span>
          🧠 {t('analytics_ai_analysis', 'AI winning-post analysis')}
        </span>
      ) as any,
      withCloseButton: true,
      classNames: { modal: 'bg-newBgColorInner text-newTextColor w-[100%] max-w-[860px]' },
      children: <WinningAnalysis integrationId={integration.id} />,
    });
  }, [modals, t, integration.id]);

  const refreshChannel = useCallback(
    (
        integrationData: Integration & {
          identifier: string;
        }
      ) =>
      async () => {
        // Cảnh báo trước khi rời trang: OAuth mở ngay trong tab hiện tại.
        const ok = window.confirm(
          t(
            'analytics_refresh_confirm',
            'Refreshing reconnects this channel. You will leave Analytics and be sent to the provider to sign in again. Continue?'
          )
        );
        if (!ok) {
          return;
        }
        const { url } = await (
          await fetch(
            `/integrations/social/${integrationData.identifier}?refresh=${integrationData.internalId}`,
            {
              method: 'GET',
            }
          )
        ).json();
        window.location.href = url;
      },
    [t]
  );

  const totals = useMemo(() => {
    return data?.map((p: any) => {
      // Metric tích luỹ (tổng người theo dõi) → lấy giá trị MỚI NHẤT, không cộng dồn.
      if (p.cumulative) {
        return new Intl.NumberFormat().format(Math.round(p.latest || 0));
      }
      const value =
        (p?.data.reduce((acc: number, curr: { total: number }) => acc + curr.total, 0) || 0) /
        (p.average ? p.data.length : 1);
      if (p.average) {
        return value.toFixed(2) + '%';
      }
      return new Intl.NumberFormat().format(Math.round(value));
    });
  }, [data]);

  const isFacebook =
    (integration as any)?.providerIdentifier === 'facebook' ||
    (integration as any)?.identifier === 'facebook';

  const hasSeries = Array.isArray(data) && data.length > 0;

  return (
    <div className="flex flex-col gap-[16px]">
      {/* 1) Dải KPI + nút mở popup AI phân tích */}
      {isFacebook && (
        <div className="flex items-center gap-[10px] flex-wrap">
          <div className="text-[15px] font-[700] flex-1">
            {(integration as any)?.name || t('analytics', 'Analytics')}
          </div>
          <button
            onClick={openAnalysis}
            className="inline-flex items-center gap-[7px] h-[38px] px-[14px] rounded-[10px] bg-[#1e6fd9]/15 border border-[#1e6fd9]/40 text-[#3b82f6] hover:bg-[#1e6fd9]/25 text-[13px] font-[650] transition-colors"
            title={t('analytics_ai_analysis', 'AI winning-post analysis')}
          >
            🧠 {t('analytics_ai_analysis_btn', 'AI analysis')}
          </button>
        </div>
      )}

      {/* 2) Dải KPI đầu trang (số liệu trang FB, thật) */}
      {hasSeries && <KpiStrip series={data} t={t} />}

      {/* 3) Biểu đồ xu hướng — mỗi metric một biểu đồ */}
      {loading ? (
        <div className="flex items-center justify-center py-[48px]">
          <LoadingComponent />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[16px]">
          {data?.length === 0 && (
            <EmptyState
              onRefresh={refreshChannel(integration as any)}
              onRetry={() => mutate()}
              isFacebook={isFacebook}
            />
          )}
          {data?.map((item: AnalyticsDataItem, index: number) => (
            <AnalyticsCard
              key={`analytics-${index}`}
              item={item}
              total={totals[index]}
              index={index}
            />
          ))}
        </div>
      )}

      {/* 4) Biểu đồ suy ra từ bài đăng thật: cảm xúc / ngày trong tuần / tổng tương tác */}
      {isFacebook && <PostCharts integrationId={integration.id} date={date} />}

      {/* 5) Bài nổi bật của kênh — đủ chỉ số */}
      {isFacebook && <TopPostsSection integrationId={integration.id} date={date} />}

      {/* 6) Chat AI nổi góc phải */}
      {isFacebook && (
        <ChannelChat
          integrationId={integration.id}
          channelName={(integration as any)?.name || ''}
        />
      )}
    </div>
  );
};
