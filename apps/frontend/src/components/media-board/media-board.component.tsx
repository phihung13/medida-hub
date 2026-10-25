'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  DEFAULT_CONFIG,
  LONG_MIN,
  MediaCard,
  MediaConfig,
  SIDX,
  STATUSES,
  applyStreamDefaults,
  boardSummary,
  buildCsv,
  createBoard,
  filterCards,
  mergeConfig,
  normalizeCard,
  normalizeCardInput,
  prepareCardSave,
  prepareMove,
  today,
} from '@gitroom/frontend/components/media-board/logic';
import {
  useMediaBoardApi,
  useMediaBoardConfig,
  useMediaBoardVideos,
} from '@gitroom/frontend/components/media-board/media-board.hooks';
import { SEV_CLS, btnCls, inputCls } from '@gitroom/frontend/components/media-board/ui';
import { KanbanView, QuickAddResult } from '@gitroom/frontend/components/media-board/board.kanban';
import { ListView } from '@gitroom/frontend/components/media-board/list';
import { CalendarView } from '@gitroom/frontend/components/media-board/calendar';
import { StreamsView } from '@gitroom/frontend/components/media-board/streams';
import { EditorSheet } from '@gitroom/frontend/components/media-board/editor.sheet';
import { SettingsSheet } from '@gitroom/frontend/components/media-board/settings';
import { McpConnectSheet } from '@gitroom/frontend/components/media-board/mcp.connect';

// ============================================================================
//  Bảng sản xuất Media — Quay → Dựng → Duyệt → Phát hành.
//  Port native từ app 1 file media-board-app: dữ liệu qua API /media-board
//  (Prisma, tách theo tổ chức), SWR tự làm mới 10 giây + mutate() sau mỗi lần ghi.
// ============================================================================

type View = 'board' | 'list' | 'cal' | 'streams';
const VIEWS: [View, string][] = [
  ['board', 'Kanban'],
  ['list', 'Danh sách tập'],
  ['cal', 'Lịch dựng'],
  ['streams', 'Luồng'],
];
const VIEW_KEY = 'mt-view';

type SheetState =
  | { kind: 'editor'; key: number; id: string | null; preset?: Partial<MediaCard>; errMsg?: string }
  | { kind: 'settings' }
  | { kind: 'mcp' }
  | null;

const Chip: FC<{
  sev: string;
  label: string;
  n: number;
  extra?: string;
  pressed?: boolean;
  onClick?: () => void;
}> = ({ sev, label, n, extra = '', pressed, onClick }) => {
  const cls = clsx(
    'inline-flex items-center gap-[6px] rounded-full px-[11px] py-[5px] text-[12.5px] font-[600] border',
    SEV_CLS[sev],
    pressed ? 'border-current' : 'border-transparent'
  );
  const body = (
    <>
      {label} <b className="font-mono font-[600] tabular-nums">{n}</b>
      {extra}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} aria-pressed={!!pressed} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
};

const Select: FC<{ label: string; value: string; first: string; options: string[] | [string, string][]; onChange: (v: string) => void }> = ({
  label,
  value,
  first,
  options,
  onChange,
}) => (
  <select aria-label={label} className={clsx(inputCls, 'flex-[0_1_190px]')} value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{first}</option>
    {options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return (
        <option key={v} value={v}>
          {l}
        </option>
      );
    })}
  </select>
);

export const MediaBoardComponent: FC = () => {
  const toaster = useToaster();
  const toast = useCallback((m: string, ok = true) => toaster.show(m, ok ? 'success' : 'warning'), [toaster]);
  const cfg = useMediaBoardConfig();
  const vids = useMediaBoardVideos();
  const api = useMediaBoardApi();

  const [view, setViewState] = useState<View>('board');
  const [q, setQ] = useState('');
  const [fStream, setFStream] = useState('');
  const [fSub, setFSub] = useState('');
  const [fPerson, setFPerson] = useState('');
  const [fFormat, setFFormat] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  const [sheet, setSheet] = useState<SheetState>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as View | null;
      if (v && VIEWS.some(([k]) => k === v)) setViewState(v);
    } catch {
      /* trình duyệt chặn localStorage — giữ Kanban */
    }
  }, []);
  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* bỏ qua */
    }
  }, []);

  const loaded = vids.data !== undefined || !!vids.error;
  const cards = useMemo(() => (vids.data || []).map(normalizeCard), [vids.data]);
  const config: MediaConfig = useMemo(() => (cfg.data ? mergeConfig(cfg.data) : DEFAULT_CONFIG), [cfg.data]);
  const board = useMemo(() => createBoard(cards, config), [cards, config]);

  /* ---------- bộ lọc (fillSelects + visible của bản gốc) ---------- */
  const sNames = [...new Set([...config.streams.map((s) => s.name), ...cards.map((c) => c.stream).filter(Boolean)])] as string[];
  const fs = sNames.includes(fStream) ? fStream : '';
  const subs = [
    ...new Set([
      ...(fs ? board.streamOf(fs)?.subseries || [] : config.streams.flatMap((s) => s.subseries || [])),
      ...cards.filter((c) => !fs || c.stream === fs).map((c) => c.subseries).filter(Boolean),
    ]),
  ] as string[];
  const fsub = subs.includes(fSub) ? fSub : '';
  const people = board.peopleList();
  const fp = people.includes(fPerson) ? fPerson : '';

  const visible = useMemo(
    () => filterCards(board, cards, { q, stream: fs, subseries: fsub, person: fp, format: fFormat, alert: alertFilter }),
    [cards, board, q, fs, fsub, fp, fFormat, alertFilter]
  );

  /* ---------- tổng hợp ---------- */
  const { red, backlog, oldest, review, latePub, week, brk } = useMemo(() => boardSummary(board), [board]);
  const toggleAf = (k: string) => setAlertFilter((v) => (v === k ? '' : k));
  const max = config.maxLongPerSlot || 2;

  /* ---------- ghi ---------- */
  const openEditor = useCallback((id: string | null, preset: Partial<MediaCard> = {}, errMsg = '') => {
    setSheet({ kind: 'editor', key: Date.now(), id, preset, errMsg });
  }, []);
  const close = useCallback(() => setSheet(null), []);

  const move = useCallback(
    async (c: MediaCard, status: string) => {
      const r = prepareMove(board, c, status);
      if (r.error) {
        toast(r.error, false);
        openEditor(c.id, { status }, r.error);
        return;
      }
      const patch = r.patch;
      try {
        await vids.mutate(
          async () => {
            await api.patchVideo(c.id, patch);
            return undefined;
          },
          {
            optimisticData: (cur?: MediaCard[]) => (cur || []).map((x) => (x.id === c.id ? { ...x, ...patch } : x)),
            populateCache: false,
            revalidate: true,
            rollbackOnError: true,
          }
        );
        toast(
          status === 'len-lich' && c.status === 'cho-duyet'
            ? 'Đã duyệt, chuyển sang “Lên lịch phát”'
            : 'Đã chuyển sang “' + STATUSES[SIDX[status]].name + '”'
        );
      } catch {
        toast('Chưa lưu được, thử lại sau ít giây.', false);
      }
    },
    [api, board, openEditor, toast, vids]
  );

  const onCreate = useCallback(
    async (body: Partial<MediaCard>) => {
      await api.createVideo(body);
      await vids.mutate();
      close();
      toast('Đã tạo thẻ');
    },
    [api, close, toast, vids]
  );
  const onSet = useCallback(
    async (id: string, body: Partial<MediaCard>) => {
      await api.setVideo(id, body);
      await vids.mutate();
      close();
      toast('Đã lưu');
    },
    [api, close, toast, vids]
  );
  const onDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteVideo(id);
        await vids.mutate();
        close();
        toast('Đã xoá thẻ');
      } catch {
        toast('Chưa xoá được.', false);
      }
    },
    [api, close, toast, vids]
  );
  const onSaveConfig = useCallback(
    async (next: MediaConfig) => {
      await api.saveConfig(next);
      await cfg.mutate();
      close();
      toast('Đã lưu cài đặt');
    },
    [api, cfg, close, toast]
  );

  const exportCsv = useCallback(() => {
    const blob = new Blob([buildCsv(board, visible)], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `bang-san-xuat-media-${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }, [board, visible]);

  const addVideo = () =>
    openEditor(null, fs ? { stream: fs, episode: board.nextCode(fs), streamOwner: '', reviewer: '' } : {});

  // Thêm nhanh trong cột Kanban: mặc định theo bộ lọc đang chọn (luồng, người)
  // và làn; chạy đúng luật lưu của editor. Thiếu dữ liệu cho cột đích → mở
  // editor đầy đủ kèm lời nhắc.
  const basePreset = useMemo(
    () => ({ ...(fs ? { stream: fs } : {}), ...(fp ? { assignee: fp } : {}), ...(fFormat ? { format: fFormat } : {}) }),
    [fs, fp, fFormat]
  );
  const withDefaults = useCallback(
    (preset: Partial<MediaCard>) => {
      const d: Partial<MediaCard> = { format: 'dai', status: 'kich-ban', ...preset };
      return d.stream ? applyStreamDefaults(board, d) : d;
    },
    [board]
  );
  const quickAdd = useCallback(
    async (preset: Partial<MediaCard>): Promise<QuickAddResult> => {
      const d = withDefaults(preset);
      const r = prepareCardSave(board, null, normalizeCardInput(d));
      if (r.error) {
        openEditor(null, d, r.error);
        return 'editor';
      }
      try {
        await api.createVideo(r.card);
        await vids.mutate();
        toast('Đã tạo thẻ ' + (r.card.episode || '“' + r.card.title + '”'));
        return 'ok';
      } catch {
        toast('Chưa lưu được, thử lại sau ít giây.', false);
        return 'fail';
      }
    },
    [api, board, openEditor, toast, vids, withDefaults]
  );

  let content: ReactNode = null;
  if (view === 'board')
    content = (
      <KanbanView
        board={board}
        list={visible}
        loaded={loaded}
        basePreset={basePreset}
        onOpen={(id) => openEditor(id)}
        onMove={move}
        onAdd={quickAdd}
        onFull={(p) => openEditor(null, withDefaults(p))}
      />
    );
  if (view === 'list') content = <ListView board={board} list={visible} loaded={loaded} onOpen={(id) => openEditor(id)} onCsv={exportCsv} />;
  if (view === 'cal') content = <CalendarView board={board} list={visible} onOpen={(id) => openEditor(id)} onNew={(p) => openEditor(null, p)} />;
  if (view === 'streams')
    content = (
      <StreamsView
        board={board}
        loaded={loaded}
        onShowList={(name) => {
          setFStream(name);
          setView('list');
        }}
      />
    );

  return (
    <div className="bg-newBgColorInner flex-1 flex flex-col min-w-0 text-[14px] leading-[1.45]">
      <header className="border-b border-newBgLineColor px-[16px]">
        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[10px] py-[12px]">
          <h1 className="m-0 text-[18px] font-[800] tracking-[-.01em]">
            Bảng sản xuất Media
            <small className="block text-[12px] font-[500] text-textItemBlur tracking-normal">
              Quay → Dựng → Duyệt → Phát hành · Trường Việt Anh
            </small>
          </h1>
          <div className="flex-1" />
          <div className="flex flex-wrap bg-newBgColor rounded-[8px] p-[3px] gap-[2px]" role="group" aria-label="Chế độ xem">
            {VIEWS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                onClick={() => setView(k)}
                className={clsx(
                  'px-[12px] py-[6px] rounded-[6px] text-[13px] font-[600]',
                  view === k ? 'bg-newBgColorInner text-textColor shadow-sm' : 'text-textItemBlur hover:text-textColor'
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <button type="button" className={btnCls()} onClick={() => setSheet({ kind: 'settings' })}>
            Cài đặt luồng
          </button>
          {/* Lối vào kín đáo: kết nối agent AI qua MCP (tạo khoá + hướng dẫn + file tải) */}
          <button
            type="button"
            title="Kết nối agent AI (MCP)"
            aria-label="Kết nối agent AI (MCP)"
            onClick={() => setSheet({ kind: 'mcp' })}
            className="h-[36px] w-[36px] inline-flex items-center justify-center rounded-[8px] text-textItemBlur hover:text-btnPrimary hover:bg-newBgColor transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0V7Zm6 10v4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className={btnCls('primary')} onClick={addVideo}>
            + Thêm video
          </button>
        </div>
        <div className="flex flex-wrap gap-[8px] pb-[12px]">
          <input
            type="search"
            aria-label="Tìm kiếm"
            placeholder="Tìm mã tập, tiêu đề, ghi chú…"
            className={clsx(inputCls, 'flex-[1_1_200px]')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select label="Lọc theo luồng" value={fs} first="Tất cả luồng" options={sNames} onChange={setFStream} />
          <Select label="Lọc theo chuyên mục" value={fsub} first="Mọi chuyên mục" options={subs} onChange={setFSub} />
          <Select label="Lọc theo người" value={fp} first="Tất cả người" options={people} onChange={setFPerson} />
          <Select
            label="Lọc theo định dạng"
            value={fFormat}
            first="Dài + ngắn"
            options={[
              ['dai', 'Chỉ video dài'],
              ['ngan', 'Chỉ video ngắn'],
            ]}
            onChange={setFFormat}
          />
        </div>
      </header>

      <main className="px-[16px] min-w-0">
        <div className="flex flex-wrap gap-[8px] pt-[14px] pb-[4px]">
          <Chip sev={red ? 'red' : 'green'} label="Thẻ có cảnh báo đỏ" n={red} pressed={alertFilter === 'red'} onClick={() => toggleAf('red')} />
          <Chip
            sev={backlog ? 'amber' : 'green'}
            label="Đã quay chưa dựng"
            n={backlog}
            extra={backlog ? ` · cũ nhất ${oldest} ngày` : ''}
            pressed={alertFilter === 'backlog'}
            onClick={() => toggleAf('backlog')}
          />
          <Chip sev={review ? 'amber' : 'green'} label="Chờ duyệt" n={review} pressed={alertFilter === 'review'} onClick={() => toggleAf('review')} />
          <Chip sev={latePub ? 'red' : 'green'} label="Trễ phát hành" n={latePub} pressed={alertFilter === 'late-pub'} onClick={() => toggleAf('late-pub')} />
          <Chip sev="green" label="Đã phát 7 ngày qua" n={week} />
          <Chip sev={brk ? 'amber' : 'green'} label="Luồng lệch nhịp" n={brk} />
        </div>
        <div className="text-[12.5px] text-textItemBlur pt-[2px] pb-[10px]">
          Quy tắc: video dài là video <strong className="text-textColor">trên {LONG_MIN} phút</strong>; mỗi{' '}
          <strong className="text-textColor">{config.limitScope === 'team' ? 'team' : 'người dựng'}</strong> hoàn thành tối đa{' '}
          <strong className="text-textColor">{max} video dài/buổi</strong> ({max * 2}/ngày); lịch tính ngược từ ngày phát:{' '}
          <strong className="text-textColor">dựng xong trước {config.editLeadDays ?? 2} ngày</strong>,{' '}
          <strong className="text-textColor">quay trước {config.shootLeadDays ?? 4} ngày</strong>; được quay để dành, chỉ nhắc xếp lịch
          dựng khi còn {config.scheduleWarnDays ?? 3} ngày đến hạn dựng xong
          {(config.maxBacklogPerPerson || 0) > 0
            ? ` và cảnh báo khi một người tồn quá ${config.maxBacklogPerPerson} video đã quay chưa dựng`
            : ''}
          ; duyệt trong {config.reviewHours || 24} giờ. Trạng thái tự chuyển khi có link Edited hoặc URL bài đăng.
        </div>
        {(vids.error || cfg.error) && (
          <div className="bg-[#E8A33D]/15 text-[#D08A22] px-[12px] py-[10px] rounded-[8px] text-[13px] mt-[12px]">
            Không tải được dữ liệu bảng sản xuất. Tải lại trang để tiếp tục.
          </div>
        )}
        {content}
      </main>

      {sheet?.kind === 'editor' && (
        <EditorSheet
          key={sheet.key}
          board={board}
          id={sheet.id}
          preset={sheet.preset}
          errMsg={sheet.errMsg}
          onClose={close}
          onReopen={(p) => openEditor(null, p)}
          onCreate={onCreate}
          onSet={onSet}
          onDelete={onDelete}
        />
      )}
      {sheet?.kind === 'settings' && <SettingsSheet board={board} onClose={close} onSave={onSaveConfig} />}
      {sheet?.kind === 'mcp' && <McpConnectSheet onClose={close} />}
    </div>
  );
};
