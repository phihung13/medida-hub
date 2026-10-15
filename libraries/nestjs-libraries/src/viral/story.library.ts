// ============================================================================
//  THƯ VIỆN CÂU CHUYỆN THẬT (đặc tả v2, 15/10/2026) — nguồn đọc cho mọi agent.
//  Nguồn: Google Sheet "Thư viện Testimonials" (sheet chính + sheet IELTS).
//  Cấu hình (env, chỉ là ĐỊA CHỈ sheet — không phải bí mật):
//    TESTIMONIALS_SHEET_ID    id trong link docs.google.com/spreadsheets/d/<id>
//    TESTIMONIALS_SHEET_GIDS  danh sách gid các tab, cách nhau dấu phẩy (mặc định "0")
//  Sheet phải mở quyền "ai có link đều xem được" để Hub đọc bản CSV.
//  Quy tắc lọc theo skill thu-vien-cau-chuyen:
//    - CHỈ dòng có đồng ý = "Có"; bỏ dòng 46, 76–79 và dòng ghi chú "cần kiểm";
//    - chọn theo cấp học + "Nỗi lo chính"; tôn trọng "Khi nào KHÔNG nên gửi";
//    - mỗi câu chuyện không dùng lại trong 30 ngày (ghi vào CONFIG_DIR).
// ============================================================================

import * as fs from 'fs';
import { configPath } from '@gitroom/nestjs-libraries/keys/config.dir';

export interface Story {
  key: string; // "<gid>:<dòng>"
  row: number; // số dòng trên sheet (1 = tiêu đề)
  title: string;
  capHoc: string;
  noiLo: string;
  tomTat: string;
  cauNoiHay: string;
  nguoiNoi: string;
  khongNenGui: string;
  video: string;
  coSo: string;
}

const EXCLUDED_ROWS = new Set([46, 76, 77, 78, 79]);
const REUSE_DAYS = 30;
const CACHE_MS = 30 * 60 * 1000;

let cache: { at: number; stories: Story[] } | null = null;

const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

// CSV chuẩn RFC 4180 (ô có dấu phẩy / xuống dòng trong ngoặc kép).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Tìm cột theo tên gần đúng (không dấu, chứa cụm) — tên cột trên sheet có thể đổi nhẹ.
const col = (header: string[], ...names: string[]) => {
  const h = header.map(norm);
  for (const n of names.map(norm)) {
    const i = h.findIndex((x) => x === n);
    if (i >= 0) return i;
  }
  for (const n of names.map(norm)) {
    const i = h.findIndex((x) => x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
};

export function rowsToStories(gid: string, rows: string[][]): Story[] {
  if (!rows.length) return [];
  const header = rows[0];
  const c = {
    title: col(header, 'tieu de video', 'tieu de', 'ten video'),
    dongY: col(header, 'dong y dung truyen thong cong khai', 'dong y'),
    capHoc: col(header, 'cap hoc', 'cap'),
    noiLo: col(header, 'noi lo chinh', 'noi lo'),
    tomTat: col(header, 'tom tat', 'noi dung'),
    cauNoiHay: col(header, 'cau noi hay'),
    nguoiNoi: col(header, 'nguoi noi', 'ai noi', 'nhan vat'),
    khongNenGui: col(header, 'khi nao khong nen gui'),
    video: col(header, 'link video', 'youtube', 'video'),
    coSo: col(header, 'co so'),
    ghiChu: col(header, 'ghi chu'),
  };
  const get = (r: string[], i: number) => (i >= 0 ? String(r[i] || '').trim() : '');
  const out: Story[] = [];
  rows.slice(1).forEach((r, idx) => {
    const rowNo = idx + 2;
    if (gid === '0' && EXCLUDED_ROWS.has(rowNo)) return;
    if (norm(get(r, c.dongY)) !== 'co') return;
    if (norm(get(r, c.ghiChu)).includes('can kiem')) return;
    const s: Story = {
      key: `${gid}:${rowNo}`,
      row: rowNo,
      title: get(r, c.title),
      capHoc: get(r, c.capHoc),
      noiLo: get(r, c.noiLo),
      tomTat: get(r, c.tomTat),
      cauNoiHay: get(r, c.cauNoiHay),
      nguoiNoi: get(r, c.nguoiNoi),
      khongNenGui: get(r, c.khongNenGui),
      video: get(r, c.video),
      coSo: get(r, c.coSo),
    };
    if (s.tomTat || s.cauNoiHay) out.push(s);
  });
  return out;
}

export function storyLibraryConfigured() {
  return !!process.env.TESTIMONIALS_SHEET_ID;
}

export async function loadStories(force = false): Promise<Story[]> {
  const id = process.env.TESTIMONIALS_SHEET_ID;
  if (!id) return [];
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.stories;
  const gids = (process.env.TESTIMONIALS_SHEET_GIDS || '0')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
  const all: Story[] = [];
  for (const gid of gids) {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Không đọc được sheet thư viện (gid ${gid}): ${res.status}`);
    all.push(...rowsToStories(gid, parseCsv(await res.text())));
  }
  // Bỏ trùng (cùng câu nói hay hoặc cùng tóm tắt) — sheet có dòng lặp.
  const seen = new Set<string>();
  const stories = all.filter((s) => {
    const k = norm(s.cauNoiHay || s.tomTat).slice(0, 120);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  cache = { at: Date.now(), stories };
  return stories;
}

// ── chống dùng lại trong 30 ngày ───────────────────────────────────────────
const usedFile = () => configPath('story-library-used.json');
const readUsed = (): Record<string, number> => {
  try {
    return JSON.parse(fs.readFileSync(usedFile(), 'utf8'));
  } catch {
    return {};
  }
};
export function markStoryUsed(key: string) {
  const used = readUsed();
  used[key] = Date.now();
  try {
    fs.writeFileSync(usedFile(), JSON.stringify(used), 'utf8');
  } catch {
    /* không ghi được — lần sau có thể chọn lại, không sao */
  }
}

/**
 * Chọn tối đa `limit` câu chuyện hợp: cấp học khớp người đọc VÀ nỗi lo khớp
 * chủ đề bài; bỏ câu chuyện dùng trong 30 ngày qua và câu chuyện mà cột
 * "Khi nào KHÔNG nên gửi" trúng chủ đề.
 */
export async function pickStories(opts: { capHoc?: string; topic: string; limit?: number }) {
  const stories = await loadStories();
  const used = readUsed();
  const cutoff = Date.now() - REUSE_DAYS * 86400000;
  const topicWords = norm(opts.topic)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  const cap = norm(opts.capHoc || '');
  const scored = stories
    .filter((s) => !(used[s.key] && used[s.key] > cutoff))
    .filter((s) => !cap || !s.capHoc || norm(s.capHoc).includes(cap) || cap.includes(norm(s.capHoc)))
    .filter((s) => {
      const avoid = norm(s.khongNenGui);
      return !avoid || !topicWords.some((w) => avoid.includes(w));
    })
    .map((s) => {
      const hay = norm(`${s.noiLo} ${s.tomTat}`);
      const score = topicWords.reduce((n, w) => n + (hay.includes(w) ? (norm(s.noiLo).includes(w) ? 3 : 1) : 0), 0);
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.limit || 3).map((x) => x.s);
}

// Khối đưa vào prompt (bên viết) và người chấm (nguồn sự thật cho G1).
export function storyBlock(s: Story) {
  return [
    `CÂU CHUYỆN THẬT (thư viện, dòng ${s.row}${s.capHoc ? ` · ${s.capHoc}` : ''}${s.noiLo ? ` · nỗi lo: ${s.noiLo}` : ''}):`,
    s.tomTat ? `Tóm tắt (viết lại bằng lời mình, không chép): ${s.tomTat}` : '',
    s.cauNoiHay ? `Câu nói hay (trích NGUYÊN VĂN, nói rõ ai nói${s.nguoiNoi ? ` — ${s.nguoiNoi}` : ''}): "${s.cauNoiHay}"` : '',
    s.title ? `Tên được dùng: chỉ tên có trong tiêu đề video "${s.title}".` : 'Không nêu tên người.',
    s.video ? `Link video: ${s.video}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
