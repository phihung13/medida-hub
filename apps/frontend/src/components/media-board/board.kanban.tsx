'use client';

import { FC, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
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
  prepareMove,
  safeUrl,
  sevOf,
  today,
} from '@gitroom/frontend/components/media-board/logic';
import { AlertList, ExtLink, btnCls, inputCls } from '@gitroom/frontend/components/media-board/ui';

const DND_TYPE = 'media-board-card';
type Status = (typeof STATUSES)[number];
type GroupBy = 'none' | 'person' | 'stream';

// Tuỳ chọn hiển thị Kanban của từng người xem (không phải dữ liệu chung).
const PREFS_KEY = 'mt-kanban';
type Prefs = { group: GroupBy; compact: boolean; collapsed: string[] };
const DEFAULT_PREFS: Prefs = { group: 'none', compact: false, collapsed: [] };
const loadPrefs = (): Prefs => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
};

const NO_PERSON = '(chưa gán)';
const NO_STREAM = 'Chưa gắn luồng';

const LinkOr: FC<{ url?: string; label: string }> = ({ url, label }) =>
  safeUrl(url) ? <ExtLink href={safeUrl(url)}>{label}</ExtLink> : <span className="text-textItemBlur">{label}: —</span>;

// Menu "⋯" trên thẻ: chuyển sang cột bất kỳ (thay kéo–thả trên điện thoại /
// bàn phím) + mở thẻ.
const CardMenu: FC<{ c: MediaCard; onOpen: (id: string) => void; onMove: (c: MediaCard, s: string) => void }> = ({
  c,
  onOpen,
  onMove,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Thao tác thẻ"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="bg-newBgColor text-textItemBlur hover:text-btnPrimary rounded-[5px] text-[12px] leading-none px-[7px] py-[4px]"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute end-0 top-[26px] z-[20] min-w-[200px] bg-newBgColorInner border border-newBgLineColor rounded-[8px] shadow-lg py-[4px] text-[12.5px]"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-start px-[12px] py-[6px] hover:bg-newBgColor"
            onClick={() => {
              setOpen(false);
              onOpen(c.id);
            }}
          >
            Mở thẻ
          </button>
          <div className="px-[12px] pt-[6px] pb-[2px] text-[11px] uppercase tracking-[.04em] text-textItemBlur">Chuyển sang</div>
          {STATUSES.filter((s) => s.id !== c.status).map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="w-full text-start px-[12px] py-[6px] hover:bg-newBgColor flex items-center gap-[8px]"
              onClick={() => {
                setOpen(false);
                onMove(c, s.id);
              }}
            >
              <span className="w-[8px] h-[8px] rounded-full shrink-0" style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Card: FC<{
  c: MediaCard;
  board: Board;
  compact: boolean;
  onOpen: (id: string) => void;
  onMove: (c: MediaCard, status: string) => void;
}> = ({ c, board, compact, onOpen, onMove }) => {
  const ref = useRef<HTMLElement>(null);
  const [{ dragging }, drag] = useDrag(
    () => ({
      type: DND_TYPE,
      item: { id: c.id },
      collect: (m) => ({ dragging: m.isDragging() }),
    }),
    [c.id]
  );
  drag(ref);
  const a = board.alertsFor(c),
    sev = sevOf(a),
    dl = board.deadlines(c);
  const canAdv = SIDX[c.status] < STATUSES.length - 1 && c.status !== 'cho-duyet';
  const subs = board.subChannelsOf(c);
  const reds = a.filter((x) => x[0] === 'red').length;
  return (
    <article
      ref={ref}
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button,[role=menu]')) return;
        onOpen(c.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(c.id);
      }}
      className={clsx(
        'relative bg-newBgColorInner border border-newBgLineColor rounded-[8px] px-[11px] cursor-pointer flex flex-col text-[13px] hover:border-btnPrimary focus-visible:outline focus-visible:outline-2 focus-visible:outline-btnPrimary transition-colors',
        compact ? 'py-[7px] gap-[4px]' : 'py-[10px] gap-[6px]',
        sev === 'red' && 'border-s-[4px] border-s-[#FF5A52]',
        sev === 'amber' && 'border-s-[4px] border-s-[#E8A33D]',
        dragging && 'opacity-40'
      )}
    >
      <div className="absolute end-[8px] top-[7px] flex gap-[4px]">
        {canAdv && (
          <button
            type="button"
            title="Chuyển sang bước tiếp theo"
            aria-label="Chuyển sang bước tiếp theo"
            onClick={(e) => {
              e.stopPropagation();
              onMove(c, STATUSES[SIDX[c.status] + 1].id);
            }}
            className="bg-newBgColor text-textItemBlur hover:text-btnPrimary rounded-[5px] text-[12px] leading-none px-[7px] py-[4px]"
          >
            →
          </button>
        )}
        <CardMenu c={c} onOpen={onOpen} onMove={onMove} />
      </div>
      {c.episode && <span className="font-mono text-[11px] font-[600] text-btnPrimary tracking-[.02em] pe-[58px]">{c.episode}</span>}
      <div className={clsx('font-[600] leading-[1.35]', !c.episode && 'pe-[58px]', compact && 'line-clamp-2')}>
        {c.title || '(chưa đặt tên)'}
      </div>
      <div className="flex flex-wrap gap-x-[10px] gap-y-[4px] text-[12px] text-textItemBlur items-center">
        <span
          className={clsx(
            'text-[11px] font-[600] px-[7px] py-[1px] rounded-[4px]',
            c.format === 'dai' ? 'bg-newBgColor text-textColor' : 'bg-btnPrimary/15 text-btnPrimary'
          )}
        >
          {c.format === 'dai' ? 'Dài' : 'Ngắn'}
          {c.duration ? ' · ' + c.duration + '′' : ''}
        </span>
        {compact ? (
          <>
            <span>{c.assignee || '—'}</span>
            <span className="font-mono text-[11.5px]">Phát {fmt(c.publishDate)}</span>
            {a.length > 0 && (
              <span
                title={a.map((x) => x[1]).join('\n')}
                className={clsx(
                  'text-[11px] font-[700] px-[6px] rounded-full',
                  reds ? 'bg-[#FF5A52]/15 text-[#FF5A52]' : 'bg-[#E8A33D]/15 text-[#D08A22]'
                )}
              >
                ⚠ {a.length}
              </span>
            )}
          </>
        ) : (
          <span>
            {c.stream || NO_STREAM}
            {c.subseries ? ' › ' + c.subseries : ''}
          </span>
        )}
      </div>
      {!compact && (
        <>
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
        </>
      )}
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

// Kết quả thêm nhanh: ok = đã tạo (giữ form để gõ thẻ kế), editor = thiếu dữ
// liệu nên đã mở editor đầy đủ (đóng form), fail = lỗi mạng (giữ nguyên).
export type QuickAddResult = 'ok' | 'editor' | 'fail';

// Thêm nhanh ngay trong cột: tiêu đề + ngày phát. Cột cần thêm dữ liệu (vd
// Chờ quay cần ngày quay) thì mở editor đầy đủ kèm lời nhắc.
const QuickAdd: FC<{
  status: Status;
  preset: Partial<MediaCard>;
  onAdd: (preset: Partial<MediaCard>) => Promise<QuickAddResult>;
  onFull: (preset: Partial<MediaCard>) => void;
  onDone: () => void;
}> = ({ status, preset, onAdd, onFull, onDone }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const data = () => ({ ...preset, title: title.trim(), publishDate: date, status: status.id });
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const r = await onAdd(data());
      if (r === 'ok') {
        setTitle('');
        setDate('');
      } else if (r === 'editor') onDone();
    } finally {
      setBusy(false);
    }
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onDone();
  };
  return (
    <form
      onSubmit={submit}
      onKeyDown={keys}
      className="flex flex-col gap-[6px] bg-newBgColorInner border border-btnPrimary rounded-[8px] p-[8px]"
    >
      <input
        autoFocus
        aria-label="Tiêu đề video"
        placeholder="Tiêu đề video…"
        className={inputCls}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="flex items-center gap-[6px] text-[11.5px] text-textItemBlur">
        Ngày phát
        <input
          type="date"
          aria-label="Ngày phát hành"
          className={clsx(inputCls, 'h-[30px] flex-1')}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-[6px]">
        <button type="submit" className={btnCls('primary', true)} disabled={busy || !title.trim()}>
          {busy ? 'Đang thêm…' : 'Thêm'}
        </button>
        <button
          type="button"
          className={btnCls('default', true)}
          onClick={() => {
            onFull(data());
            onDone();
          }}
        >
          Chi tiết…
        </button>
        <span className="flex-1" />
        <button type="button" aria-label="Đóng" className="text-textItemBlur hover:text-textColor text-[14px] px-[4px]" onClick={onDone}>
          ✕
        </button>
      </div>
    </form>
  );
};

const Column: FC<{
  status: Status;
  items: MediaCard[];
  hidden: number;
  empty: string;
  board: Board;
  compact: boolean;
  collapsed: boolean;
  preset: Partial<MediaCard>;
  onToggle: () => void;
  onOpen: (id: string) => void;
  onMove: (c: MediaCard, status: string) => void;
  onAdd: (preset: Partial<MediaCard>) => Promise<QuickAddResult>;
  onFull: (preset: Partial<MediaCard>) => void;
}> = ({ status, items, hidden, empty, board, compact, collapsed, preset, onToggle, onOpen, onMove, onAdd, onFull }) => {
  const ref = useRef<HTMLElement>(null);
  const [adding, setAdding] = useState(false);
  const [{ over, blocked }, drop] = useDrop(
    () => ({
      accept: DND_TYPE,
      drop: (item: { id: string }) => {
        const c = board.cards.find((x) => x.id === item.id);
        if (c && c.status !== status.id) onMove(c, status.id);
      },
      // Kéo qua cột còn thiếu điều kiện → báo trước lý do (thả vào vẫn mở
      // thẻ để bổ sung, như bản gốc).
      collect: (m) => {
        const item = m.getItem() as { id: string } | null;
        const c = m.isOver() && item ? board.cards.find((x) => x.id === item.id) : undefined;
        return {
          over: m.isOver(),
          blocked: c && c.status !== status.id ? prepareMove(board, c, status.id).error || '' : '',
        };
      },
    }),
    [board, onMove, status.id]
  );
  drop(ref);
  const reds = items.filter((c) => sevOf(board.alertsFor(c)) === 'red').length;

  if (collapsed) {
    return (
      <section
        ref={ref}
        aria-label={status.name}
        className={clsx(
          'bg-newBgColor rounded-[10px] w-[44px] shrink-0 flex flex-col items-center gap-[8px] py-[10px] cursor-pointer',
          over && 'outline outline-2 outline-dashed -outline-offset-2',
          over && (blocked ? 'outline-[#FF5A52]' : 'outline-btnPrimary')
        )}
        onClick={onToggle}
        title={`Mở cột “${status.name}”`}
      >
        <span className="w-[8px] h-[8px] rounded-full" style={{ background: status.color }} />
        <span className="font-mono text-[12px] text-textItemBlur">{items.length}</span>
        {reds > 0 && <span className="text-[10.5px] font-[700] text-[#FF5A52]">{reds}!</span>}
        <span className="[writing-mode:vertical-rl] rotate-180 text-[12px] font-[700] uppercase tracking-[.04em] whitespace-nowrap">
          {status.name}
        </span>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      aria-label={status.name}
      className={clsx(
        'bg-newBgColor rounded-[10px] flex flex-col min-h-[220px] flex-[1_0_252px] min-w-[252px]',
        over && 'outline outline-2 outline-dashed -outline-offset-2',
        over && (blocked ? 'outline-[#FF5A52]' : 'outline-btnPrimary')
      )}
    >
      <div className="flex items-center gap-[8px] px-[12px] pt-[10px] pb-[6px]">
        <span className="w-[8px] h-[8px] rounded-full shrink-0" style={{ background: status.color }} />
        <h2 className="m-0 text-[12.5px] font-[700] uppercase tracking-[.04em] truncate">{status.name}</h2>
        <span className="font-mono text-[12px] text-textItemBlur shrink-0">
          {items.length}
          {hidden ? ' (+' + hidden + ' lưu trữ)' : ''}
        </span>
        {reds > 0 && (
          <span title={`${reds} thẻ có cảnh báo đỏ`} className="text-[10.5px] font-[700] px-[6px] rounded-full bg-[#FF5A52]/15 text-[#FF5A52] shrink-0">
            {reds} đỏ
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          title="Thêm video vào cột này"
          aria-label={`Thêm video vào cột ${status.name}`}
          onClick={() => setAdding(true)}
          className="text-textItemBlur hover:text-btnPrimary text-[16px] leading-none px-[4px]"
        >
          +
        </button>
        <button
          type="button"
          title="Thu gọn cột"
          aria-label={`Thu gọn cột ${status.name}`}
          onClick={onToggle}
          className="text-textItemBlur hover:text-textColor text-[12px] leading-none px-[4px]"
        >
          ⇤
        </button>
      </div>
      <div className="text-[11.5px] text-textItemBlur px-[12px] pb-[8px]">{status.hint}</div>
      {over && blocked && (
        <div className="mx-[8px] mb-[8px] text-[11.5px] font-[600] px-[8px] py-[5px] rounded-[6px] bg-[#FF5A52]/15 text-[#FF5A52]">
          Chưa đủ điều kiện: {blocked} Thả vào sẽ mở thẻ để bổ sung.
        </div>
      )}
      <div className="flex flex-col gap-[8px] px-[8px] pb-[10px] flex-1">
        {adding ? (
          <QuickAdd status={status} preset={preset} onAdd={onAdd} onFull={onFull} onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full text-start text-[12.5px] text-textItemBlur hover:text-btnPrimary hover:border-btnPrimary border border-dashed border-newBgLineColor rounded-[8px] px-[10px] py-[6px] transition-colors"
          >
            + Thêm video
          </button>
        )}
        {items.length ? (
          items.map((c) => <Card key={c.id} c={c} board={board} compact={compact} onOpen={onOpen} onMove={onMove} />)
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
  basePreset: Partial<MediaCard>;
  onOpen: (id: string) => void;
  onMove: (c: MediaCard, status: string) => void;
  onAdd: (preset: Partial<MediaCard>) => Promise<QuickAddResult>;
  onFull: (preset: Partial<MediaCard>) => void;
}> = ({ board, list, loaded, basePreset, onOpen, onMove, onAdd, onFull }) => {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => setPrefs(loadPrefs()), []);
  const update = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* trình duyệt chặn localStorage — chỉ nhớ trong phiên */
      }
      return next;
    });
  const toggleCol = (id: string) =>
    update({ collapsed: prefs.collapsed.includes(id) ? prefs.collapsed.filter((x) => x !== id) : [...prefs.collapsed, id] });

  const t = today();
  const sorted = [...list].sort(
    (x, y) =>
      (x.publishDate || x.editEnd || x.shootDate || '9999').localeCompare(y.publishDate || y.editEnd || y.shootDate || '9999') ||
      codeSort(x, y)
  );

  // Làn (swimlane): theo người phụ trách hoặc theo luồng; "none" = 1 làn.
  const laneOf = (c: MediaCard) =>
    prefs.group === 'person' ? c.assignee || NO_PERSON : prefs.group === 'stream' ? c.stream || NO_STREAM : '';
  const lanes: string[] = (() => {
    if (prefs.group === 'none') return [''];
    const seen = new Set(sorted.map(laneOf));
    const known =
      prefs.group === 'person' ? board.config.people || [] : board.config.streams.map((s) => s.name);
    const head = known.filter((k) => seen.has(k));
    const rest = [...seen].filter((k) => !head.includes(k)).sort((a, b) => a.localeCompare(b, 'vi'));
    return [...head, ...rest];
  })();
  const lanePreset = (lane: string): Partial<MediaCard> => {
    if (prefs.group === 'person') return { ...basePreset, assignee: lane === NO_PERSON ? '' : lane };
    if (prefs.group === 'stream') return { ...basePreset, stream: lane === NO_STREAM ? '' : lane };
    return basePreset;
  };

  const renderRow = (lane: string) => {
    const mine = prefs.group === 'none' ? sorted : sorted.filter((c) => laneOf(c) === lane);
    return (
      <div className="flex gap-[12px] min-w-min">
        {STATUSES.map((s) => {
          let items = mine.filter((c) => (c.status || 'kich-ban') === s.id);
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
              compact={prefs.compact}
              collapsed={prefs.collapsed.includes(s.id)}
              preset={lanePreset(lane)}
              onToggle={() => toggleCol(s.id)}
              onOpen={onOpen}
              onMove={onMove}
              onAdd={onAdd}
              onFull={onFull}
            />
          );
        })}
      </div>
    );
  };

  const seg = (on: boolean) =>
    clsx(
      'px-[10px] py-[4px] rounded-[6px] text-[12px] font-[600]',
      on ? 'bg-newBgColorInner text-textColor shadow-sm' : 'text-textItemBlur hover:text-textColor'
    );

  return (
    <DNDProvider>
      <div className="flex flex-wrap items-center gap-[8px] pt-[6px] text-[12px] text-textItemBlur">
        <span>Nhóm theo</span>
        <div role="group" aria-label="Nhóm thẻ theo" className="flex bg-newBgColor rounded-[8px] p-[3px] gap-[2px]">
          {(
            [
              ['none', 'Không'],
              ['person', 'Người phụ trách'],
              ['stream', 'Luồng'],
            ] as [GroupBy, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={prefs.group === k} className={seg(prefs.group === k)} onClick={() => update({ group: k })}>
              {l}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-[6px] ms-[8px] cursor-pointer">
          <input type="checkbox" checked={prefs.compact} onChange={(e) => update({ compact: e.target.checked })} />
          Thẻ gọn
        </label>
        {prefs.collapsed.length > 0 && (
          <button type="button" className="ms-[8px] text-btnPrimary font-[600] hover:underline" onClick={() => update({ collapsed: [] })}>
            Mở lại {prefs.collapsed.length} cột đã thu gọn
          </button>
        )}
      </div>
      <div className="overflow-x-auto pt-[8px] pb-[32px] flex flex-col gap-[16px]">
        {lanes.map((lane) => {
          const n = prefs.group === 'none' ? 0 : sorted.filter((c) => laneOf(c) === lane).length;
          return (
            <div key={lane || 'all'} className="flex flex-col gap-[8px] min-w-min">
              {prefs.group !== 'none' && (
                <div className="sticky start-0 flex items-center gap-[8px] text-[13px] font-[700]">
                  <span className="w-[4px] h-[16px] rounded-full bg-btnPrimary" />
                  {lane}
                  <span className="font-mono text-[12px] font-[500] text-textItemBlur">{n} thẻ</span>
                </div>
              )}
              {renderRow(lane)}
            </div>
          );
        })}
      </div>
    </DNDProvider>
  );
};
