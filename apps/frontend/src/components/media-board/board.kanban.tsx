'use client';

import { FC, useRef } from 'react';
import clsx from 'clsx';
import { useDrag, useDrop } from 'react-dnd';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import {
  Board,
  MediaCard,
  SIDX,
  STATUSES,
  codeSort,
  diffDays,
  editRange,
  fmt,
  safeUrl,
  sevOf,
  today,
} from '@gitroom/frontend/components/media-board/logic';
import { AlertList, ExtLink, btnCls } from '@gitroom/frontend/components/media-board/ui';

const DND_TYPE = 'media-board-card';

const LinkOr: FC<{ url?: string; label: string }> = ({ url, label }) =>
  safeUrl(url) ? <ExtLink href={safeUrl(url)}>{label}</ExtLink> : <span className="text-textItemBlur">{label}: —</span>;

const Card: FC<{
  c: MediaCard;
  board: Board;
  onOpen: (id: string) => void;
  onMove: (c: MediaCard, status: string) => void;
}> = ({ c, board, onOpen, onMove }) => {
  const ref = useRef<HTMLElement>(null);
  const [{ dragging }, drag] = useDrag(() => ({
    type: DND_TYPE,
    item: { id: c.id },
    collect: (m) => ({ dragging: m.isDragging() }),
  }), [c.id]);
  drag(ref);
  const a = board.alertsFor(c),
    sev = sevOf(a),
    dl = board.deadlines(c);
  const canAdv = SIDX[c.status] < STATUSES.length - 1 && c.status !== 'cho-duyet';
  const subs = board.subChannelsOf(c);
  return (
    <article
      ref={ref}
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        onOpen(c.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(c.id);
      }}
      className={clsx(
        'relative bg-newBgColorInner border border-newBgLineColor rounded-[8px] px-[11px] py-[10px] cursor-pointer flex flex-col gap-[6px] text-[13px] hover:border-btnPrimary focus-visible:outline focus-visible:outline-2 focus-visible:outline-btnPrimary transition-colors',
        sev === 'red' && 'border-s-[4px] border-s-[#FF5A52]',
        sev === 'amber' && 'border-s-[4px] border-s-[#E8A33D]',
        dragging && 'opacity-40'
      )}
    >
      {canAdv && (
        <button
          type="button"
          title="Chuyển sang bước tiếp theo"
          aria-label="Chuyển sang bước tiếp theo"
          onClick={(e) => {
            e.stopPropagation();
            onMove(c, STATUSES[SIDX[c.status] + 1].id);
          }}
          className="absolute end-[8px] top-[8px] bg-newBgColor text-textItemBlur hover:text-btnPrimary rounded-[5px] text-[12px] px-[7px] py-[2px]"
        >
          →
        </button>
      )}
      {c.episode && <span className="font-mono text-[11px] font-[600] text-btnPrimary tracking-[.02em]">{c.episode}</span>}
      <div className="font-[600] leading-[1.35] pe-[28px]">{c.title || '(chưa đặt tên)'}</div>
      <div className="flex flex-wrap gap-x-[10px] gap-y-[4px] text-[12px] text-textItemBlur">
        <span
          className={clsx(
            'text-[11px] font-[600] px-[7px] py-[1px] rounded-[4px]',
            c.format === 'dai' ? 'bg-newBgColor text-textColor' : 'bg-btnPrimary/15 text-btnPrimary'
          )}
        >
          {c.format === 'dai' ? 'Dài' : 'Ngắn'}
          {c.duration ? ' · ' + c.duration + '′' : ''}
        </span>
        <span>
          {c.stream || 'Chưa gắn luồng'}
          {c.subseries ? ' › ' + c.subseries : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-[10px] gap-y-[4px] text-[12px] text-textItemBlur">
        <span>Phụ trách: {c.assignee || '—'}</span>
        <span>Duyệt: {board.reviewerOf(c) || '—'}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-[8px] gap-y-[1px] text-[12px] m-0">
        <dt className="text-textItemBlur">Phát</dt>
        <dd className="m-0 font-mono text-[11.5px] tabular-nums">
          {fmt(c.publishDate)}
          {c.channel ? ' · ' + c.channel : ''}
        </dd>
        <dt className="text-textItemBlur">Quay</dt>
        <dd className="m-0 font-mono text-[11.5px] tabular-nums">
          {fmt(c.shootDate)}
          {c.shootTime ? ' ' + c.shootTime : ''}
          {SIDX[c.status] <= SIDX['cho-quay'] && dl.shootBy ? (
            <span className="text-textItemBlur"> (hạn {fmt(dl.shootBy)})</span>
          ) : null}
        </dd>
        <dt className="text-textItemBlur">Dựng</dt>
        <dd className="m-0 font-mono text-[11.5px] tabular-nums">
          {editRange(c)}
          {SIDX[c.status] <= SIDX['dang-dung'] && dl.editBy ? (
            <span className="text-textItemBlur"> (hạn {fmt(dl.editBy)})</span>
          ) : null}
        </dd>
      </dl>
      {c.goal && <div className="text-[12px] text-textItemBlur">Mục tiêu: {c.goal}</div>}
      <div className="flex flex-wrap gap-x-[10px] gap-y-[4px] text-[12px]">
        <LinkOr url={c.scriptUrl} label="Kịch bản" />
        <LinkOr url={c.editedUrl} label="File dựng" />
        <LinkOr url={c.publishUrl} label="Bài đăng" />
      </div>
      {c.parentCode && <div className="text-[12px] text-textItemBlur">Bản cắt từ {c.parentCode}</div>}
      {subs.length > 0 && (
        <div className="text-[12px] text-textItemBlur">
          Bản cắt: {subs.length - board.missingCuts(c).length}/{subs.length} kênh phụ
        </div>
      )}
      <AlertList alerts={a} />
      {c.status === 'cho-duyet' && (
        <button
          type="button"
          className={clsx(btnCls('default', true), 'self-start')}
          onClick={(e) => {
            e.stopPropagation();
            onMove(c, 'len-lich');
          }}
        >
          Duyệt ✓
        </button>
      )}
    </article>
  );
};

const Column: FC<{
  status: (typeof STATUSES)[number];
  items: MediaCard[];
  hidden: number;
  empty: string;
  board: Board;
  onOpen: (id: string) => void;
  onMove: (c: MediaCard, status: string) => void;
}> = ({ status, items, hidden, empty, board, onOpen, onMove }) => {
  const ref = useRef<HTMLElement>(null);
  const [{ over }, drop] = useDrop(() => ({
    accept: DND_TYPE,
    drop: (item: { id: string }) => {
      const c = board.cards.find((x) => x.id === item.id);
      if (c && c.status !== status.id) onMove(c, status.id);
    },
    collect: (m) => ({ over: m.isOver() }),
  }), [board, onMove, status.id]);
  drop(ref);
  return (
    <section
      ref={ref}
      aria-label={status.name}
      className={clsx(
        'bg-newBgColor rounded-[10px] flex flex-col min-h-[220px]',
        over && 'outline outline-2 outline-dashed outline-btnPrimary -outline-offset-2'
      )}
    >
      <div className="flex items-center gap-[8px] px-[12px] pt-[10px] pb-[6px]">
        <span className="w-[8px] h-[8px] rounded-full" style={{ background: status.color }} />
        <h2 className="m-0 text-[12.5px] font-[700] uppercase tracking-[.04em]">{status.name}</h2>
        <span className="font-mono text-[12px] text-textItemBlur">
          {items.length}
          {hidden ? ' (+' + hidden + ' lưu trữ)' : ''}
        </span>
      </div>
      <div className="text-[11.5px] text-textItemBlur px-[12px] pb-[8px]">{status.hint}</div>
      <div className="flex flex-col gap-[8px] px-[8px] pb-[10px] flex-1">
        {items.length ? (
          items.map((c) => <Card key={c.id} c={c} board={board} onOpen={onOpen} onMove={onMove} />)
        ) : (
          <div className="text-[12px] text-textItemBlur py-[12px] px-[6px] text-center">{empty}</div>
        )}
      </div>
    </section>
  );
};

export const KanbanView: FC<{
  board: Board;
  list: MediaCard[];
  loaded: boolean;
  onOpen: (id: string) => void;
  onMove: (c: MediaCard, status: string) => void;
}> = ({ board, list, loaded, onOpen, onMove }) => {
  const t = today();
  const sorted = [...list].sort(
    (x, y) =>
      (x.publishDate || x.editEnd || x.shootDate || '9999').localeCompare(y.publishDate || y.editEnd || y.shootDate || '9999') ||
      codeSort(x, y)
  );
  return (
    <DNDProvider>
      <div className="overflow-x-auto pt-[8px] pb-[32px]">
        <div className="grid grid-cols-[repeat(7,minmax(252px,1fr))] gap-[12px] min-w-min">
          {STATUSES.map((s) => {
            let items = sorted.filter((c) => (c.status || 'kich-ban') === s.id);
            let hidden = 0;
            if (s.id === 'da-phat') {
              const keep = items.filter((c) => !c.publishDate || diffDays(c.publishDate, t) <= 14);
              hidden = items.length - keep.length;
              items = keep.sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''));
            }
            const empty = !loaded
              ? 'Đang tải…'
              : s.id === 'kich-ban' && !board.cards.length
              ? 'Chưa có video nào. Bấm “+ Thêm video” để tạo thẻ đầu tiên.'
              : 'Trống';
            return (
              <Column
                key={s.id}
                status={s}
                items={items}
                hidden={hidden}
                empty={empty}
                board={board}
                onOpen={onOpen}
                onMove={onMove}
              />
            );
          })}
        </div>
      </div>
    </DNDProvider>
  );
};
