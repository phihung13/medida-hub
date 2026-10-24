'use client';

import { FC, Fragment, useState } from 'react';
import {
  Board,
  MediaCard,
  SIDX,
  STATUSES,
  codeSort,
  editRange,
  fmt,
  safeUrl,
  sevOf,
} from '@gitroom/frontend/components/media-board/logic';
import { ExtLink, Pill, btnCls } from '@gitroom/frontend/components/media-board/ui';

const LIST_COLS: [string, string][] = [
  ['episode', 'Mã tập'],
  ['title', 'Tiêu đề'],
  ['subseries', 'Chuyên mục'],
  ['format', 'Dạng'],
  ['assignee', 'Phụ trách'],
  ['publishDate', 'Phát'],
  ['shootDate', 'Quay'],
  ['editEnd', 'Dựng (bắt đầu → xong)'],
  ['status', 'Trạng thái'],
  ['links', 'Link'],
];

const StatusPill: FC<{ c: MediaCard; board: Board }> = ({ c, board }) => {
  const sv = sevOf(board.alertsFor(c));
  const s = STATUSES[SIDX[c.status] ?? 0];
  return <Pill sev={sv || (c.status === 'da-phat' ? 'green' : '')}>{s.name}</Pill>;
};

const cell = 'px-[9px] py-[7px] border-b border-newBgLineColor text-start align-top text-[12.5px]';
const mono = 'font-mono text-[11.5px] whitespace-nowrap tabular-nums';

export const ListView: FC<{
  board: Board;
  list: MediaCard[];
  loaded: boolean;
  onOpen: (id: string) => void;
  onCsv: () => void;
}> = ({ board, list, loaded, onOpen, onCsv }) => {
  const [showArch, setShowArch] = useState(false);
  const [sortKey, setSortKey] = useState('episode');
  const [sortDir, setSortDir] = useState(1);

  const rows = list.filter((c) => showArch || c.status !== 'da-phat');
  const val = (c: MediaCard, k: string) => (k === 'status' ? SIDX[c.status] : c[k] || '');
  rows.sort((a, b) =>
    sortKey === 'episode'
      ? codeSort(a, b) * sortDir
      : String(val(a, sortKey)).localeCompare(String(val(b, sortKey)), 'vi', { numeric: true }) * sortDir || codeSort(a, b)
  );
  const groups = new Map<string, MediaCard[]>();
  rows.forEach((c) => {
    const k = c.stream || 'Chưa gắn luồng';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  });
  const order = [...board.config.streams.map((s) => s.name), ...[...groups.keys()].filter((k) => !board.streamOf(k))];
  const link = (u: string | undefined, l: string) => (safeUrl(u) ? <ExtLink href={safeUrl(u)}>{l}</ExtLink> : null);
  const sortBy = (k: string) => {
    if (sortKey === k) setSortDir((d) => d * -1);
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-[8px] items-center py-[8px]">
        <label className="text-[12px] text-textItemBlur flex items-center gap-[6px]">
          <input type="checkbox" checked={showArch} onChange={(e) => setShowArch(e.target.checked)} /> Hiện cả video đã phát hành
        </label>
        <span className="flex-1" />
        <button type="button" className={btnCls()} onClick={onCsv}>
          Tải CSV
        </button>
      </div>
      <div className="overflow-x-auto pt-[4px] pb-[32px]">
        {!rows.length ? (
          <div className="text-[12px] text-textItemBlur py-[12px] text-center">
            {loaded ? 'Không có tập nào khớp bộ lọc.' : 'Đang tải…'}
          </div>
        ) : (
          <table className="border-collapse w-full min-w-[980px] bg-newBgColorInner border border-newBgLineColor">
            <thead>
              <tr>
                {LIST_COLS.map(([k, l]) => (
                  <th
                    key={k}
                    onClick={k !== 'links' ? () => sortBy(k) : undefined}
                    className="px-[9px] py-[7px] border-b border-newBgLineColor text-start bg-newBgColor text-[11.5px] uppercase tracking-[.04em] cursor-pointer whitespace-nowrap select-none"
                  >
                    {l}
                    {sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((g) => {
                const items = groups.get(g);
                if (!items) return null;
                const st = board.streamOf(g);
                return (
                  <Fragment key={g}>
                    <tr>
                      <td colSpan={LIST_COLS.length} className={`${cell} bg-btnPrimary/10 font-[700] text-[13px]`}>
                        {g}
                        {st?.code ? ` · ${st.code}` : ''} — {items.length} tập
                      </td>
                    </tr>
                    {items.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer hover:bg-newBgColor"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('a')) return;
                          onOpen(c.id);
                        }}
                      >
                        <td className={`${cell} ${mono}`}>{c.episode || '—'}</td>
                        <td className={cell}>{c.title}</td>
                        <td className={cell}>{c.subseries || ''}</td>
                        <td className={cell}>
                          {c.format === 'dai' ? 'Dài' : 'Ngắn'}
                          {c.duration ? ' ' + c.duration + '′' : ''}
                        </td>
                        <td className={cell}>{c.assignee || '—'}</td>
                        <td className={`${cell} ${mono}`}>{fmt(c.publishDate)}</td>
                        <td className={`${cell} ${mono}`}>
                          {fmt(c.shootDate)}
                          {c.shootTime ? ' ' + c.shootTime : ''}
                        </td>
                        <td className={`${cell} ${mono}`}>{editRange(c)}</td>
                        <td className={cell}>
                          <StatusPill c={c} board={board} />
                        </td>
                        <td className={cell}>
                          <span className="flex flex-wrap gap-x-[10px] gap-y-[4px] text-[12px]">
                            {link(c.scriptUrl, 'KB')}
                            {link(c.editedUrl, 'Edited')}
                            {link(c.publishUrl, 'Bài')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};
