// ============================================================================
//  Bảng sản xuất Media — logic nghiệp vụ THUẦN, dùng chung cho giao diện và
//  công cụ MCP của backend. Port nguyên văn từ app gốc media-board-app
//  (web/index.html). KHÔNG đổi công thức: hạn quay/dựng tính ngược từ ngày
//  phát, giới hạn video dài/buổi, cảnh báo, tự suy trạng thái.
//  Khác bản gốc duy nhất ở chỗ `cards` + `config` không còn là biến toàn cục:
//  createBoard(cards, config) trả về đúng bộ hàm cũ đã gắn sẵn ngữ cảnh.
// ============================================================================

export type StatusId =
  | 'kich-ban'
  | 'cho-quay'
  | 'da-quay'
  | 'dang-dung'
  | 'cho-duyet'
  | 'len-lich'
  | 'da-phat';

export type Slot = 'sang' | 'chieu';
export type Sev = 'red' | 'amber';
export type Alert = [Sev, string];

export interface MediaCard {
  id: string;
  title?: string;
  stream?: string;
  subseries?: string;
  episode?: string;
  parentCode?: string;
  duration?: string;
  format?: 'dai' | 'ngan' | string;
  channel?: string;
  subChannels?: string[] | string;
  assignee?: string;
  streamOwner?: string;
  reviewer?: string;
  goal?: string;
  status: StatusId | string;
  publishDate?: string;
  publishUrl?: string;
  shootDate?: string;
  shootTime?: string;
  scriptUrl?: string;
  editStart?: string;
  editEnd?: string;
  editSlot?: Slot | '' | string;
  editedUrl?: string;
  notes?: string;
  stageAt?: Record<string, string>;
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  editDate?: string;
  [key: string]: any;
}

export interface MediaStream {
  name: string;
  code?: string;
  group?: string;
  owner?: string;
  reviewer?: string;
  goal?: string;
  channel?: string;
  subChannels?: string[] | string;
  pubLong?: number | null;
  pubShort?: number | null;
  shootPerWeek?: number | null;
  subseries?: string[];
}

export interface MediaConfig {
  streams: MediaStream[];
  people: string[];
  limitScope: 'nguoi' | 'team' | string;
  maxLongPerSlot: number;
  scheduleWarnDays: number;
  maxBacklogPerPerson: number;
  reviewHours: number;
  editLeadDays: number;
  shootLeadDays: number;
  updatedAt?: string;
}

export const STATUSES: { id: StatusId; name: string; hint: string; color: string }[] = [
  { id: 'kich-ban', name: 'Kịch bản', hint: 'Có ý tưởng, đang viết/duyệt kịch bản', color: 'var(--new-textItemBlur)' },
  { id: 'cho-quay', name: 'Chờ quay', hint: 'Có kịch bản và ngày quay', color: 'var(--new-textItemBlur)' },
  { id: 'da-quay', name: 'Đã quay · chờ dựng', hint: 'Được quay để dành · xếp lịch dựng trước hạn dựng xong', color: '#E8A33D' },
  { id: 'dang-dung', name: 'Đang dựng', hint: 'Video dài: tối đa 2 video/buổi/người', color: 'var(--new-btn-primary)' },
  { id: 'cho-duyet', name: 'Chờ duyệt', hint: 'Có link Edited; người duyệt xử lý trong 24 giờ', color: 'var(--new-btn-primary)' },
  { id: 'len-lich', name: 'Lên lịch phát', hint: 'Đã duyệt, có ngày phát hành', color: '#2FB37A' },
  { id: 'da-phat', name: 'Đã phát hành', hint: '14 ngày gần nhất · xem đủ ở Danh sách tập', color: '#2FB37A' },
];
export const SIDX: Record<string, number> = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]));
export const SLOT_NAME: Record<string, string> = { sang: 'Sáng', chieu: 'Chiều' };
export const DEFAULT_GOALS = [
  'Đăng ký kênh',
  'Qlead',
  'Vào Zalo Group',
  'Làm quiz bản đồ phát triển',
  'Bản đồ học tập (tripwire 200k)',
  'Đặt lịch tham quan',
  'Học thử 4 tuần',
  'Nhận diện thương hiệu',
];
export const LONG_MIN = 5; // trên 5 phút là video dài
export const COMMON_CHANNELS = ['Facebook Reels', 'YouTube Shorts', 'TikTok', 'Instagram Reels', 'Zalo Video'];
export const DEFAULT_CONFIG: MediaConfig = {
  streams: [],
  people: [],
  limitScope: 'nguoi',
  maxLongPerSlot: 2,
  scheduleWarnDays: 3,
  maxBacklogPerPerson: 20,
  reviewHours: 24,
  editLeadDays: 2,
  shootLeadDays: 4,
};

/* ---------- ngày ---------- */
export const pad = (n: number | string, w = 2) => String(n).padStart(w, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const x = parse(s);
  x.setDate(x.getDate() + n);
  return iso(x);
};
export const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
export const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const fmt = (s?: string) => {
  if (!s) return '—';
  const x = parse(s);
  return `${WD[x.getDay()]} ${pad(x.getDate())}/${pad(x.getMonth() + 1)}`;
};
export const safeUrl = (u?: string) => {
  try {
    const x = new URL(String(u));
    return /^https?:$/.test(x.protocol) ? x.href : '';
  } catch {
    return '';
  }
};
export const nowIso = () => new Date().toISOString();
export const hoursSince = (t?: string) => (t ? (Date.now() - Date.parse(t)) / 3600000 : 0);

/* ---------- tiện ích không cần ngữ cảnh ---------- */
export const codeSort = (a: MediaCard, b: MediaCard) =>
  String(a.episode || '~').localeCompare(String(b.episode || '~'), 'vi', { numeric: true });
export const splitList = (v: any): string[] =>
  Array.isArray(v)
    ? v
    : String(v || '')
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean);
export const sevOf = (a: Alert[]): Sev | '' => (a.some((x) => x[0] === 'red') ? 'red' : a.length ? 'amber' : '');

export function checkDates(c: Partial<MediaCard>) {
  if (c.shootDate && c.editStart && c.editStart < c.shootDate) return 'Ngày bắt đầu dựng đang trước ngày quay.';
  if (c.editStart && c.editEnd && c.editEnd < c.editStart) return 'Ngày hoàn thành dựng đang trước ngày bắt đầu dựng.';
  if (c.publishDate && c.editEnd && c.editEnd > c.publishDate) return 'Ngày hoàn thành dựng đang sau ngày phát hành.';
  if (c.publishDate && c.shootDate && c.shootDate > c.publishDate) return 'Ngày quay đang sau ngày phát hành.';
  return '';
}

export function checkStage(c: Partial<MediaCard>, status: string) {
  const i = SIDX[status];
  if (i >= SIDX['cho-quay'] && !c.shootDate) return 'Cần có ngày quay trước khi chuyển sang “Chờ quay”.';
  if (i >= SIDX['dang-dung'] && (!c.editStart || !c.editEnd))
    return 'Cần có ngày bắt đầu và ngày hoàn thành dựng trước khi chuyển sang “Đang dựng”.';
  if (i >= SIDX['cho-duyet'] && !safeUrl(c.editedUrl))
    return 'Cần dán link file đã dựng (folder Edited) trước khi chuyển sang “Chờ duyệt”.';
  if (i >= SIDX['len-lich'] && !c.publishDate) return 'Cần có ngày phát hành trước khi chuyển sang “Lên lịch phát”.';
  if (i >= SIDX['da-phat'] && !safeUrl(c.publishUrl)) return 'Cần dán URL bài đã đăng trước khi chuyển sang “Đã phát hành”.';
  return '';
}

/* Tự chuyển trạng thái theo dữ liệu vừa nhập — chỉ đi tới, không lùi */
export function inferStatus(d: Partial<MediaCard>) {
  let s = d.status || 'kich-ban';
  const up = (t: string) => {
    if (SIDX[t] > SIDX[s]) s = t;
  };
  if (safeUrl(d.publishUrl)) up('da-phat');
  else if (safeUrl(d.editedUrl) && SIDX[s] < SIDX['cho-duyet']) up('cho-duyet');
  else if (d.shootDate && safeUrl(d.scriptUrl)) up('cho-quay');
  return s;
}

// Thẻ cũ có thể còn trường editDate (bản trước) — chuẩn hoá như lúc tải ở bản gốc.
export const normalizeCard = (x: MediaCard): MediaCard => {
  const c = { ...x };
  if (!c.editEnd && c.editDate) c.editEnd = c.editDate;
  if (!c.editStart && c.editEnd) c.editStart = c.editEnd;
  return c;
};

export const mergeConfig = (d?: Partial<MediaConfig> | null): MediaConfig => ({
  ...DEFAULT_CONFIG,
  ...(d || {}),
  streams: d?.streams || [],
  people: d?.people || DEFAULT_CONFIG.people,
});

/* ---------- các hàm cần ngữ cảnh (cards + config) ---------- */
export function createBoard(cards: MediaCard[], config: MediaConfig) {
  /* luồng & mã tập */
  const streamOf = (name?: string) => config.streams.find((s) => s.name === name);
  const reviewerOf = (c: Partial<MediaCard>) => c.reviewer || streamOf(c.stream)?.reviewer || '';
  const ownerOf = (c: Partial<MediaCard>) => c.streamOwner || streamOf(c.stream)?.owner || '';
  function nextCode(streamName?: string) {
    const s = streamOf(streamName);
    if (!s?.code) return '';
    const pre = s.code.toUpperCase();
    let max = 0;
    cards.forEach((c) => {
      const m = String(c.episode || '').match(
        new RegExp('^' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$', 'i')
      );
      if (m) max = Math.max(max, +m[1]);
    });
    return `${pre}-${pad(max + 1, 3)}`;
  }

  /* bản cắt & tồn kho */
  const childrenOf = (c: Partial<MediaCard>) =>
    c.episode ? cards.filter((x) => (x.parentCode || '').toUpperCase() === String(c.episode).toUpperCase()) : [];
  const subChannelsOf = (c: Partial<MediaCard>) =>
    c.parentCode ? [] : splitList(c.subChannels !== undefined ? c.subChannels : streamOf(c.stream)?.subChannels);
  const missingCuts = (c: Partial<MediaCard>) => {
    const kids = childrenOf(c).map((k) => (k.channel || '').toLowerCase());
    return subChannelsOf(c).filter((ch) => !kids.includes(ch.toLowerCase()));
  };
  const backlogOf = (person?: string) =>
    cards.filter((x) => x.status === 'da-quay' && (x.assignee || '') === (person || '')).length;

  /* Lịch tính ngược từ ngày phát hành */
  function deadlines(c: Partial<MediaCard>) {
    if (!c.publishDate) return { editBy: '', shootBy: '' };
    return {
      editBy: addDays(c.publishDate, -(config.editLeadDays ?? 2)),
      shootBy: addDays(c.publishDate, -(config.shootLeadDays ?? 4)),
    };
  }
  function longEditsOn(date: string, person: string | undefined, excludeId: string | null | undefined, slot?: string) {
    return cards.filter(
      (c) =>
        c.format === 'dai' &&
        c.editEnd === date &&
        c.id !== excludeId &&
        (!slot || c.editSlot === slot) &&
        (config.limitScope === 'team' || (c.assignee || '') === (person || ''))
    );
  }
  function checkCapacity(c: Partial<MediaCard>) {
    if (c.format !== 'dai' || !c.editEnd) return '';
    if (!c.editSlot) return 'Video dài phải chọn buổi hoàn thành dựng (sáng hoặc chiều).';
    const max = config.maxLongPerSlot || 2;
    const same = longEditsOn(c.editEnd, c.assignee, c.id, c.editSlot);
    const who = config.limitScope === 'team' ? 'Cả team' : c.assignee || 'Người chưa gán';
    if (same.length >= max)
      return `${who} đã có ${same.length} video dài hoàn thành dựng trong buổi ${SLOT_NAME[c.editSlot].toLowerCase()} ${fmt(
        c.editEnd
      )} (${same.map((x) => '“' + (x.episode ? x.episode + ' ' : '') + x.title + '”').join(', ')}). Giới hạn ${max} video dài/buổi — chọn buổi khác.`;
    return '';
  }

  function alertsFor(c: MediaCard): Alert[] {
    const t = today(),
      out: Alert[] = [],
      i = SIDX[c.status] ?? 0,
      dl = deadlines(c);
    if (c.status !== 'da-phat' && !c.publishDate) out.push(['red', 'Thiếu ngày phát hành — chưa tính ngược được lịch']);
    if (i <= SIDX['cho-quay'] && dl.shootBy && t > dl.shootBy)
      out.push(['red', `Quá hạn quay (hạn ${fmt(dl.shootBy)}) — sẽ trễ phát`]);
    else if (i <= SIDX['cho-quay'] && dl.shootBy && c.shootDate && c.shootDate > dl.shootBy)
      out.push(['amber', `Lịch quay muộn hơn hạn ${fmt(dl.shootBy)}`]);
    if (i === SIDX['cho-quay'] && c.shootDate && c.shootDate < t)
      out.push(['red', 'Quá ngày quay ' + fmt(c.shootDate) + ' — đã quay thì chuyển cột']);
    if (i <= SIDX['dang-dung'] && dl.editBy) {
      if (t > dl.editBy) out.push(['red', `Quá hạn dựng xong (hạn ${fmt(dl.editBy)})`]);
      else if (c.editEnd && c.editEnd > dl.editBy) out.push(['amber', `Dựng xong sát ngày phát (hạn ${fmt(dl.editBy)})`]);
    }
    if (c.status === 'da-quay' && !c.editEnd && dl.editBy) {
      const left = diffDays(t, dl.editBy);
      if (left >= 0 && left <= (config.scheduleWarnDays ?? 3))
        out.push([left <= 1 ? 'red' : 'amber', `Chưa có lịch dựng — còn ${left} ngày đến hạn dựng xong`]);
    }
    if (c.status === 'da-quay' && (config.maxBacklogPerPerson || 0) > 0) {
      const n = backlogOf(c.assignee);
      if (n > config.maxBacklogPerPerson)
        out.push(['amber', `Tồn kho đã quay chưa dựng của ${c.assignee || 'người chưa gán'}: ${n}/${config.maxBacklogPerPerson}`]);
    }
    if (!c.parentCode && SIDX[c.status] >= SIDX['cho-duyet']) {
      const miss = missingCuts(c);
      if (miss.length) {
        const late = c.status === 'da-phat' && !!c.publishDate && diffDays(c.publishDate, t) >= 2;
        out.push([late ? 'red' : 'amber', `Chưa có thẻ bản cắt cho: ${miss.join(', ')}`]);
      }
    }
    if ((c.status === 'da-quay' || c.status === 'dang-dung') && c.editEnd && c.editEnd < t)
      out.push(['red', 'Trễ dựng (hẹn ' + fmt(c.editEnd) + ')']);
    if (c.status === 'cho-duyet') {
      const h = hoursSince(c.stageAt?.['cho-duyet']);
      if (h > (config.reviewHours || 24))
        out.push(['red', `Chờ duyệt ${Math.floor(h)} giờ — ${reviewerOf(c) || 'chưa có người duyệt'}`]);
      if (!reviewerOf(c)) out.push(['amber', 'Chưa có người duyệt']);
    }
    if (c.status !== 'da-phat' && c.publishDate && c.publishDate < t)
      out.push(['red', 'Trễ phát hành (hẹn ' + fmt(c.publishDate) + ')']);
    const bad = checkDates(c);
    if (c.status !== 'da-phat' && bad) out.push(['red', bad]);
    if (c.format === 'dai' && c.editEnd && i <= SIDX['dang-dung']) {
      if (!c.editSlot) out.push(['amber', 'Video dài chưa chọn buổi hoàn thành']);
      else if (longEditsOn(c.editEnd, c.assignee, c.id, c.editSlot).length >= (config.maxLongPerSlot || 2))
        out.push(['red', 'Vượt giới hạn video dài/buổi']);
    }
    if (!c.assignee) out.push(['amber', 'Chưa có người phụ trách']);
    if (!c.goal) out.push(['amber', 'Chưa ghi mục tiêu']);
    return out;
  }

  /* Luồng — nhịp cam kết */
  function cadenceCheck(
    items: MediaCard[],
    perWeek: any,
    dateKey: 'publishDate' | 'shootDate',
    label: string,
    extraFilter?: (c: MediaCard) => boolean
  ) {
    const per = Number(perWeek) || 0;
    if (!per) return null;
    const t = today();
    const windowDays = per >= 1 ? 7 : Math.round(7 / per);
    const need = per >= 1 ? Math.round(per) : 1;
    const got = items.filter(
      (c) =>
        c[dateKey] &&
        (c[dateKey] as string) >= t &&
        (c[dateKey] as string) <= addDays(t, windowDays - 1) &&
        (!extraFilter || extraFilter(c))
    ).length;
    return { label, need, got, windowDays, ok: got >= need };
  }
  function streamHealth() {
    const t = today();
    return config.streams.map((s) => {
      const mine = cards.filter((c) => c.stream === s.name);
      const upcoming = mine
        .filter((c) => c.status !== 'da-phat' && c.publishDate && c.publishDate >= t)
        .sort((a, b) => (a.publishDate as string).localeCompare(b.publishDate as string));
      const lastPub = mine
        .filter((c) => c.status === 'da-phat' && c.publishDate)
        .map((c) => c.publishDate as string)
        .sort()
        .pop();
      const checks = [
        cadenceCheck(mine, s.pubLong, 'publishDate', 'Phát video dài', (c) => c.format === 'dai'),
        cadenceCheck(mine, s.pubShort, 'publishDate', 'Phát video ngắn', (c) => c.format !== 'dai'),
        cadenceCheck(mine, s.shootPerWeek, 'shootDate', 'Quay'),
      ].filter(Boolean) as NonNullable<ReturnType<typeof cadenceCheck>>[];
      const counts: Record<string, number> = Object.fromEntries(
        STATUSES.map((x) => [x.id, mine.filter((c) => c.status === x.id).length])
      );
      const issues: Alert[] = [];
      if (!s.owner) issues.push(['amber', 'Luồng chưa có người chủ']);
      if (!s.reviewer) issues.push(['amber', 'Luồng chưa có người duyệt']);
      checks
        .filter((k) => !k.ok)
        .forEach((k) => issues.push(['red', `${k.label}: ${k.windowDays} ngày tới mới lên lịch ${k.got}/${k.need}`]));
      return { ...s, mine, upcoming, lastPub, checks, counts, issues };
    });
  }

  function peopleList() {
    const s = new Set<string>(config.people || []);
    cards.forEach((c) => {
      [c.assignee, c.streamOwner, c.reviewer].forEach((p) => p && s.add(p));
    });
    config.streams.forEach((x) => {
      [x.owner, x.reviewer].forEach((p) => p && s.add(p));
    });
    return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
  }

  return {
    cards,
    config,
    streamOf,
    reviewerOf,
    ownerOf,
    nextCode,
    childrenOf,
    subChannelsOf,
    missingCuts,
    backlogOf,
    deadlines,
    longEditsOn,
    checkCapacity,
    alertsFor,
    streamHealth,
    peopleList,
  };
}

export type Board = ReturnType<typeof createBoard>;

export const cadText = (s: MediaStream) => {
  const p: string[] = [];
  if (+(s.pubLong || 0))
    p.push(+(s.pubLong as number) >= 1 ? `${s.pubLong} dài/tuần` : `1 dài/${Math.round(1 / (s.pubLong as number))} tuần`);
  if (+(s.pubShort || 0)) p.push(`${s.pubShort} ngắn/tuần`);
  if (+(s.shootPerWeek || 0)) p.push(`quay ${s.shootPerWeek}/tuần`);
  return p.join(' · ') || 'chưa đặt';
};

export const editRange = (c: Partial<MediaCard>) => {
  const end = c.editEnd ? fmt(c.editEnd) + (c.editSlot ? ' ' + SLOT_NAME[c.editSlot].toLowerCase() : '') : '—';
  if (c.editStart && c.editStart !== c.editEnd) return `${fmt(c.editStart)} → ${end}`;
  return end;
};

/* ---------- CSV ---------- */
export const CSV_COLS = [
  'episode', 'title', 'stream', 'subseries', 'format', 'duration', 'assignee', 'streamOwner', 'reviewer', 'channel', 'goal',
  'status', 'publishDate', 'shootDate', 'shootTime', 'scriptUrl', 'editStart', 'editEnd', 'editSlot', 'editedUrl',
  'publishUrl', 'parentCode', 'notes',
];
export function buildCsv(board: Board, list: MediaCard[]) {
  const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [CSV_COLS.join(',')].concat(
    [...list].sort(codeSort).map((c) =>
      CSV_COLS.map((k) =>
        q(
          k === 'status'
            ? STATUSES[SIDX[c.status] ?? 0].name
            : k === 'reviewer'
            ? board.reviewerOf(c)
            : k === 'streamOwner'
            ? board.ownerOf(c)
            : c[k]
        )
      ).join(',')
    )
  );
  return '\uFEFF' + lines.join('\n');
}

/* ============================================================================
 *  THAO TÁC — dùng chung cho giao diện (editor, kéo–thả, lịch) và công cụ MCP
 *  của backend, để agent bị kiểm ĐÚNG các luật như người bấm tay.
 * ========================================================================== */

// Các trường của form thẻ (read() của editor) — chuẩn hoá như lúc đọc form.
export function normalizeCardInput(d: Partial<MediaCard>): Partial<MediaCard> {
  const t = (v: any) => (v === undefined || v === null ? '' : String(v)).trim();
  const parentCode = t(d.parentCode).toUpperCase();
  return {
    title: t(d.title),
    stream: d.stream === undefined || d.stream === null ? '' : String(d.stream),
    subseries: t(d.subseries),
    episode: t(d.episode).toUpperCase(),
    parentCode,
    duration: d.duration === undefined || d.duration === null ? '' : String(d.duration),
    // ô chọn chỉ có 2 giá trị — thẻ thiếu format được lưu là "ngan" như bản gốc
    format: d.format === 'dai' ? 'dai' : 'ngan',
    channel: t(d.channel),
    assignee: t(d.assignee),
    streamOwner: t(d.streamOwner),
    reviewer: t(d.reviewer),
    status: d.status || 'kich-ban',
    shootDate: d.shootDate || '',
    shootTime: d.shootTime || '',
    scriptUrl: t(d.scriptUrl),
    editStart: d.editStart || '',
    editEnd: d.editEnd || '',
    editSlot: d.editSlot || '',
    subChannels: parentCode ? [] : splitList(d.subChannels),
    editedUrl: t(d.editedUrl),
    publishDate: d.publishDate || '',
    publishUrl: t(d.publishUrl),
    goal: t(d.goal),
    notes: t(d.notes),
  };
}

type Result<K extends string, V> = ({ error: string } & { [P in K]?: undefined }) | ({ error?: undefined } & { [P in K]: V });

// Bấm "Lưu" trong editor: kiểm hợp lệ → thẻ đầy đủ để ghi (hoặc lỗi để báo).
// `input` đã qua normalizeCardInput. Thẻ mới: trả thẻ để POST; sửa: thẻ thay cả khối.
export function prepareCardSave(
  board: Board,
  base: MediaCard | null,
  input: Partial<MediaCard>,
  now = nowIso()
): Result<'card', Partial<MediaCard>> {
  const x: Partial<MediaCard> = { ...input };
  const id = base ? base.id : null;
  if (!x.title) return { error: 'Cần đặt tiêu đề video.' };
  if (!x.publishDate && x.status !== 'da-phat')
    return { error: 'Cần điền ngày phát hành ngay sau tiêu đề và thời lượng — lịch quay và dựng được tính ngược từ ngày này.' };
  const badDates = checkDates(x);
  if (badDates) return { error: badDates };
  if (x.editEnd && !x.editStart) x.editStart = x.editEnd;
  for (const [k, lab] of [
    ['scriptUrl', 'Link kịch bản'],
    ['editedUrl', 'Link file đã dựng'],
    ['publishUrl', 'URL bài đăng'],
  ] as const)
    if (x[k] && !safeUrl(x[k])) return { error: `${lab} phải bắt đầu bằng https://` };
  if (x.episode && board.cards.some((y) => y.id !== id && (y.episode || '').toUpperCase() === x.episode))
    return { error: `Mã tập ${x.episode} đã được dùng. Chọn mã khác.` };
  x.status = inferStatus(x);
  const stage = checkStage(x, x.status);
  if (stage) return { error: stage };
  const cap = board.checkCapacity({ ...x, id: id as string });
  if (cap) return { error: cap };
  const stageAt = { ...(base?.stageAt || {}) };
  if (!base || base.status !== x.status) stageAt[x.status as string] = now;
  const body: Partial<MediaCard> = { ...x, stageAt, updatedAt: now };
  if (base) {
    if (base.status === 'cho-duyet' && SIDX[x.status as string] >= SIDX['len-lich'] && !base.approvedAt) body.approvedAt = now;
    const full: Partial<MediaCard> = { ...base, ...body, createdAt: base.createdAt || now };
    delete full.id;
    delete full.editDate;
    return { card: full };
  }
  return { card: { ...body, createdAt: now } };
}

// Kéo thẻ sang cột khác / bấm "→" / "Duyệt ✓": kiểm điều kiện cột đích rồi
// trả bản vá (PATCH gộp cấp 1). Lỗi → giao diện mở editor kèm lời nhắc.
export function prepareMove(board: Board, c: MediaCard, status: string, now = nowIso()): Result<'patch', Partial<MediaCard>> {
  const forward = SIDX[status] > SIDX[c.status];
  const msg = forward ? checkStage(c, status) : '';
  if (msg) return { error: msg };
  if (status === 'dang-dung') {
    const cap = board.checkCapacity(c);
    if (cap) return { error: cap };
  }
  const patch: Partial<MediaCard> = { status, updatedAt: now, stageAt: { ...(c.stageAt || {}), [status]: now } };
  if (c.status === 'cho-duyet' && status === 'len-lich') patch.approvedAt = now;
  return { patch };
}

// Nút "Điền lịch theo hạn": chỉ điền ô còn trống (quay → bắt đầu dựng → xong dựng).
export function fillByDeadline(board: Board, d: Partial<MediaCard>, t = today()) {
  if (!d.publishDate) return null;
  const dl = board.deadlines(d);
  const shootDate = d.shootDate || (dl.shootBy < t ? t : dl.shootBy);
  const editStart = d.editStart || (addDays(shootDate, 1) > dl.editBy ? shootDate : addDays(shootDate, 1));
  const editEnd = d.editEnd || (dl.editBy < editStart ? editStart : dl.editBy);
  return { shootDate, editStart, editEnd };
}

// Chọn luồng: điền các ô còn trống theo luồng (chủ luồng, người duyệt, mục
// tiêu, kênh chính, kênh phụ) và đánh mã tập kế tiếp nếu chưa có mã.
export function applyStreamDefaults(board: Board, d: Partial<MediaCard>): Partial<MediaCard> {
  const st = board.streamOf(d.stream);
  if (!st) return d;
  const n = { ...d };
  if (!n.streamOwner) n.streamOwner = st.owner || '';
  if (!n.reviewer) n.reviewer = st.reviewer || '';
  if (!n.goal) n.goal = st.goal || '';
  if (!n.channel) n.channel = (st.channel || '').split(/[,;]/)[0].trim();
  if (!splitList(n.subChannels).length && !String(n.parentCode || '').trim()) n.subChannels = splitList(st.subChannels);
  if (!n.episode) n.episode = board.nextCode(st.name);
  return n;
}

// "+ Tạo bản cắt": thẻ mới cho kênh phụ còn thiếu, mã <gốc>-C<n>.
export function cutPreset(board: Board, base: MediaCard, x: Partial<MediaCard>, channel?: string): Result<'preset', Partial<MediaCard>> {
  if (!x.episode) return { error: 'Cần có mã tập cho bản gốc trước khi tạo bản cắt.' };
  const ch = channel ?? (board.missingCuts({ ...base, ...x })[0] || '');
  let n = board.childrenOf({ episode: x.episode }).length + 1,
    code: string;
  do {
    code = `${x.episode}-C${n++}`;
  } while (board.cards.some((y) => (y.episode || '').toUpperCase() === code));
  return {
    preset: {
      stream: x.stream,
      subseries: x.subseries,
      parentCode: x.episode,
      episode: code,
      format: 'ngan',
      channel: ch,
      title: `${x.title}${ch ? ' — ' + ch : ' — bản cắt'}`,
      assignee: x.assignee,
      streamOwner: x.streamOwner,
      reviewer: x.reviewer,
      goal: x.goal,
      publishDate: x.publishDate ? addDays(x.publishDate, 1) : '',
      shootDate: x.shootDate,
      shootTime: x.shootTime,
      scriptUrl: x.scriptUrl,
      status: x.shootDate ? 'da-quay' : 'kich-ban',
      notes: `Bản cắt từ ${x.episode}.`,
    },
  };
}

// "+ Tập khác cùng buổi quay".
export function siblingPreset(board: Board, base: MediaCard, x: Partial<MediaCard>): Partial<MediaCard> {
  return {
    stream: x.stream,
    subseries: x.subseries,
    episode: board.nextCode(x.stream),
    format: x.format,
    duration: x.duration,
    channel: x.channel,
    assignee: x.assignee,
    streamOwner: x.streamOwner,
    reviewer: x.reviewer,
    goal: x.goal,
    shootDate: x.shootDate,
    shootTime: x.shootTime,
    status: SIDX[base.status] <= SIDX['da-quay'] ? base.status : 'da-quay',
    notes: `Quay cùng buổi với ${x.episode || x.title}.`,
  };
}

/* ---------- bộ lọc + tổng hợp (thanh lọc và dải chip đầu trang) ---------- */
export interface CardFilter {
  q?: string;
  stream?: string;
  subseries?: string;
  person?: string;
  format?: string;
  alert?: string; // '' | 'red' | 'backlog' | 'review' | 'late-pub'
}

export function filterCards(board: Board, cards: MediaCard[], f: CardFilter) {
  const qq = (f.q || '').trim().toLowerCase();
  return cards.filter((c) => {
    if (f.stream && c.stream !== f.stream) return false;
    if (f.subseries && c.subseries !== f.subseries) return false;
    if (f.person && c.assignee !== f.person && board.ownerOf(c) !== f.person && board.reviewerOf(c) !== f.person) return false;
    if (f.format && c.format !== f.format) return false;
    if (qq && !`${c.episode} ${c.title} ${c.notes} ${c.goal} ${c.stream} ${c.subseries}`.toLowerCase().includes(qq)) return false;
    if (f.alert) {
      const a = board.alertsFor(c);
      if (f.alert === 'red' && sevOf(a) !== 'red') return false;
      if (f.alert === 'backlog' && c.status !== 'da-quay') return false;
      if (f.alert === 'review' && c.status !== 'cho-duyet') return false;
      if (f.alert === 'late-pub' && !a.some((x) => x[1].startsWith('Trễ phát hành'))) return false;
    }
    return true;
  });
}

export function boardSummary(board: Board) {
  const { cards } = board;
  const t = today();
  const backlog = cards.filter((c) => c.status === 'da-quay');
  return {
    red: cards.filter((c) => sevOf(board.alertsFor(c)) === 'red').length,
    backlog: backlog.length,
    oldest: backlog.reduce((m, c) => (c.shootDate ? Math.max(m, diffDays(c.shootDate, t)) : m), 0),
    review: cards.filter((c) => c.status === 'cho-duyet').length,
    latePub: cards.filter((c) => board.alertsFor(c).some((x) => x[1].startsWith('Trễ phát hành'))).length,
    week: cards.filter(
      (c) => c.status === 'da-phat' && c.publishDate && diffDays(c.publishDate, t) >= 0 && diffDays(c.publishDate, t) < 7
    ).length,
    brk: board.streamHealth().filter((s) => s.issues.length).length,
  };
}

// Dòng "Quy tắc: …" dưới dải chip, dạng chữ thường.
export function rulesText(config: MediaConfig) {
  const max = config.maxLongPerSlot || 2;
  return `Quy tắc: video dài là video trên ${LONG_MIN} phút; mỗi ${
    config.limitScope === 'team' ? 'team' : 'người dựng'
  } hoàn thành tối đa ${max} video dài/buổi (${max * 2}/ngày); lịch tính ngược từ ngày phát: dựng xong trước ${
    config.editLeadDays ?? 2
  } ngày, quay trước ${config.shootLeadDays ?? 4} ngày; được quay để dành, chỉ nhắc xếp lịch dựng khi còn ${
    config.scheduleWarnDays ?? 3
  } ngày đến hạn dựng xong${
    (config.maxBacklogPerPerson || 0) > 0
      ? ` và cảnh báo khi một người tồn quá ${config.maxBacklogPerPerson} video đã quay chưa dựng`
      : ''
  }; duyệt trong ${config.reviewHours || 24} giờ. Trạng thái tự chuyển khi có link Edited hoặc URL bài đăng.`;
}

/* ---------- Lịch dựng: ngày × người dựng (hoặc cả team) × buổi ---------- */
export function calendarData(board: Board, list: MediaCard[], start = today(), n = 14) {
  const { config } = board;
  const t = today();
  const team = config.limitScope === 'team';
  const who = (c: MediaCard) => c.assignee || '(chưa gán)';
  const editors = team
    ? ['Cả team']
    : (() => {
        const s = new Set(list.filter((c) => c.editEnd).map(who));
        (config.people || []).forEach((p) => s.add(p));
        return [...s].sort((a, b) => a.localeCompare(b, 'vi'));
      })();
  const max = config.maxLongPerSlot || 2;
  const days = Array.from({ length: n }, (_, i) => {
    const d = addDays(start, i);
    const wd = parse(d).getDay();
    return {
      date: d,
      isToday: d === t,
      weekend: wd === 0 || wd === 6,
      cells: editors.map((p) => {
        const mine = list.filter((c) => c.editEnd === d && (team || who(c) === p));
        const longs = mine.filter((c) => c.format === 'dai');
        const slots: Record<Slot, MediaCard[]> = {
          sang: longs.filter((c) => c.editSlot === 'sang'),
          chieu: longs.filter((c) => c.editSlot === 'chieu'),
        };
        return {
          editor: p,
          slots,
          noSlot: longs.filter((c) => !c.editSlot),
          ongoing: list.filter(
            (c) => c.editStart && c.editEnd && c.editStart <= d && d < c.editEnd && (team || who(c) === p)
          ),
          shorts: mine.filter((c) => c.format !== 'dai'),
        };
      }),
    };
  });
  const backlog = list.filter((c) => c.status === 'da-quay' && !c.editEnd);
  return { team, editors, max, days, backlog };
}

/* ---------- Cài đặt luồng & quy tắc (nút "Lưu cài đặt") ---------- */
const numOrNull = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v));
const listOf = (v: any) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((x: any) => String(x).trim())
    .filter(Boolean);

export function sanitizeStream(r: Record<string, any>): MediaStream {
  return {
    name: String(r.name || '').trim(),
    code: String(r.code || '').trim().toUpperCase(),
    group: r.group || '',
    owner: String(r.owner || '').trim(),
    reviewer: String(r.reviewer || '').trim(),
    goal: String(r.goal || '').trim(),
    channel: String(r.channel || '').trim(),
    subChannels: splitList(r.subChannels),
    pubLong: numOrNull(r.pubLong),
    pubShort: numOrNull(r.pubShort),
    shootPerWeek: numOrNull(r.shootPerWeek),
    subseries: listOf(r.subseries),
  };
}

export function sanitizeConfig(r: Record<string, any>, now = nowIso()): MediaConfig {
  return {
    streams: (r.streams || []).map(sanitizeStream).filter((s: MediaStream) => s.name),
    people: listOf(r.people),
    maxLongPerSlot: Math.max(1, Number(r.maxLongPerSlot) || 2),
    limitScope: r.limitScope === 'team' ? 'team' : 'nguoi',
    scheduleWarnDays: Math.max(0, Number(r.scheduleWarnDays) || 0),
    maxBacklogPerPerson: Math.max(0, Number(r.maxBacklogPerPerson) || 0),
    reviewHours: Math.max(1, Number(r.reviewHours) || 24),
    editLeadDays: Math.max(0, Number(r.editLeadDays) || 0),
    shootLeadDays: Math.max(0, Number(r.shootLeadDays) || 0),
    updatedAt: now,
  };
}
