'use client';

import { FC, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';

// ============================================================================
//  GĐ4 — Tổng quan mọi kênh (kiểu Meta Business Suite): mỗi kênh 1 card với
//  các chỉ số kỳ này + % thay đổi + sparkline; bấm card nhảy sang chi tiết.
// ============================================================================

interface OverviewMetric {
  label: string;
  total: number;
  percentageChange: number;
  series: { date: string; value: number }[];
}

interface OverviewChannel {
  id: string;
  name: string;
  picture: string | null;
  identifier: string;
  metrics: OverviewMetric[];
  error?: boolean;
}

const useOverview = (date: number) => {
  const fetch = useFetch();
  return useSWR(
    `/analytics/overview?date=${date}`,
    async (u: string) => (await fetch(u)).json(),
    { revalidateOnFocus: false }
  );
};

const nice = (n: number) =>
  n >= 1000000
    ? (n / 1000000).toFixed(1).replace('.0', '') + 'M'
    : n >= 1000
    ? (n / 1000).toFixed(1).replace('.0', '') + 'K'
    : String(Math.round(n));

// Sparkline SVG thuần — không thêm thư viện chart.
const Sparkline: FC<{ series: { value: number }[] }> = ({ series }) => {
  const points = useMemo(() => {
    const vals = series.map((s) => s.value);
    if (vals.length < 2) return '';
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const range = max - min || 1;
    const W = 120;
    const H = 32;
    return vals
      .map(
        (v, i) =>
          `${((i / (vals.length - 1)) * W).toFixed(1)},${(
            H -
            ((v - min) / range) * (H - 4) -
            2
          ).toFixed(1)}`
      )
      .join(' ');
  }, [series]);
  if (!points) return null;
  return (
    <svg width="120" height="32" viewBox="0 0 120 32" className="opacity-80">
      <polyline
        points={points}
        fill="none"
        stroke="#1e6fd9"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const OverviewAnalytics: FC<{
  onOpenChannel?: (id: string) => void;
}> = ({ onOpenChannel }) => {
  const t = useT();
  const [date, setDate] = useState(7);
  const { data, isLoading } = useOverview(date);
  const channels: OverviewChannel[] = data?.channels || [];

  return (
    <div className="flex flex-col gap-[16px] flex-1">
      <div className="flex items-center gap-[10px]">
        <div className="text-[18px] font-[650]">
          📊 {t('overview_title', 'Tổng quan mọi kênh')}
        </div>
        <div className="ms-auto flex gap-[4px]">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDate(d)}
              className={clsx(
                'px-[12px] py-[6px] mobile:px-[14px] mobile:py-[10px] rounded-[8px] text-[12.5px] font-[600] border transition-all tap-shrink',
                date === d
                  ? 'border-[#1e6fd9] bg-[#1e6fd9]/15 text-newTableText'
                  : 'border-newTableBorder text-newTableText/60 hover:text-newTableText'
              )}
            >
              {d} {t('days', 'ngày')}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-[13px] text-newTableText/60 p-[16px]">
          {t('overview_loading', 'Đang gom số liệu các kênh…')}
        </div>
      ) : !channels.length ? (
        <div className="text-[13px] text-newTableText/60 bg-newTableHeader border border-newTableBorder rounded-[10px] p-[16px]">
          {t(
            'overview_empty',
            'Chưa có kênh nào trả số liệu — kết nối kênh hoặc chờ nền tảng cập nhật.'
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-[14px]">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="bg-newTableHeader border border-newTableBorder rounded-[14px] p-[16px] mobile:p-[12px] flex flex-col gap-[12px]"
            >
              <div
                className={clsx(
                  'flex items-center gap-[10px]',
                  onOpenChannel && 'cursor-pointer hover:opacity-80'
                )}
                onClick={() => onOpenChannel?.(ch.id)}
                title={t('overview_open_detail', 'Mở phân tích chi tiết kênh')}
              >
                <ImageWithFallback
                  fallbackSrc={`/icons/platforms/${ch.identifier}.png`}
                  src={ch.picture || `/icons/platforms/${ch.identifier}.png`}
                  className="rounded-[8px]"
                  alt={ch.identifier}
                  width={34}
                  height={34}
                />
                <div className="flex flex-col">
                  <div className="text-[14.5px] font-[650]">{ch.name}</div>
                  <div className="text-[11px] text-newTableText/50 capitalize">
                    {ch.identifier}
                  </div>
                </div>
                {onOpenChannel && (
                  <span className="ms-auto text-[12px] text-[#1e6fd9]">
                    {t('overview_detail', 'Chi tiết')} →
                  </span>
                )}
              </div>

              {ch.error ? (
                <div className="text-[12px] text-[#f97066]">
                  {t(
                    'overview_channel_error',
                    'Không đọc được số liệu — thử Refresh Channel ở Calendar.'
                  )}
                </div>
              ) : (
                // Mobile: ép 2 cột chip gọn (sm:640px vẫn nằm trong dải mobile ≤1025px)
                <div className="grid grid-cols-2 sm:grid-cols-3 mobile:grid-cols-2 gap-[10px] mobile:gap-[8px]">
                  {ch.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="bg-newBgColorInner/50 border border-newTableBorder/60 rounded-[10px] p-[10px] mobile:p-[9px] flex flex-col gap-[4px]"
                    >
                      <div
                        className="text-[10.5px] uppercase tracking-[0.06em] text-newTableText/55 truncate"
                        title={m.label}
                      >
                        {m.label}
                      </div>
                      <div className="flex items-baseline gap-[8px]">
                        <div className="text-[20px] font-[750] tabular-nums">
                          {nice(m.total)}
                        </div>
                        {!!m.percentageChange && (
                          <div
                            className={clsx(
                              'text-[11px] font-[700] tabular-nums',
                              m.percentageChange > 0
                                ? 'text-[#32d583]'
                                : 'text-[#f97066]'
                            )}
                          >
                            {m.percentageChange > 0 ? '▲' : '▼'}{' '}
                            {Math.abs(Math.round(m.percentageChange))}%
                          </div>
                        )}
                      </div>
                      <Sparkline series={m.series} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
