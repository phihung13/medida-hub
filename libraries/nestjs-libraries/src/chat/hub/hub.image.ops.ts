import sharp from 'sharp';
import { execFile } from 'child_process';

// ============================================================================
//  Xử lý ảnh thuần (sharp) cho bộ công cụ MCP "Ảnh" — KHÔNG phụ thuộc Nest.
//   • editImage: chuỗi thao tác (cắt tỉ lệ, xoay, chỉnh màu, chèn chữ, logo,
//     viền, đệm nền mờ, nén…) → ảnh MỚI (không bao giờ ghi đè ảnh gốc).
//   • collage: ghép nhiều ảnh theo bố cục.
//   • measureQuality / scoreQuality / findDuplicateGroups: chấm điểm kỹ thuật
//     (mờ, tối, cháy sáng, độ phân giải) + tìm ảnh trùng bằng dHash.
//   • extractVideoFrame: cắt 1 khung hình video — chỉ khi máy có ffmpeg.
//  Ảnh trung gian giữ ở dạng RAW (không nén lại sau mỗi bước → không vỡ ảnh).
// ============================================================================

// Chặn "decompression bomb" (ảnh khai báo kích thước khổng lồ).
export const LIMIT_INPUT_PIXELS = 80_000_000;
const MAX_SIDE = 8000;

export type Anchor =
  | 'tren_trai'
  | 'tren'
  | 'tren_phai'
  | 'trai'
  | 'giua'
  | 'phai'
  | 'duoi_trai'
  | 'duoi'
  | 'duoi_phai';

export const ANCHORS: [Anchor, ...Anchor[]] = [
  'tren_trai',
  'tren',
  'tren_phai',
  'trai',
  'giua',
  'phai',
  'duoi_trai',
  'duoi',
  'duoi_phai',
];

export const RATIOS = [
  '1:1',
  '4:5',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '2:3',
  '3:2',
  '1.91:1',
] as const;
export type RatioName = (typeof RATIOS)[number];
/** Tỉ lệ dạng tên ('4:5') hoặc số rộng/cao (0.8). */
export type Ratio = RatioName | number;

export type OutFormat = 'jpeg' | 'png' | 'webp';

export type ImageOp =
  | { op: 'cat_ti_le'; ti_le: Ratio; tam?: Anchor | 'thong_minh' | 'chi_tiet' }
  | {
      op: 'cat_vung';
      x: number;
      y: number;
      rong: number;
      cao: number;
      don_vi?: 'px' | '%';
    }
  | { op: 'xoay'; goc: number; nen?: string }
  | { op: 'lat'; huong: 'doc' | 'ngang' }
  | {
      op: 'doi_co';
      rong?: number;
      cao?: number;
      kieu?: 'cover' | 'contain' | 'inside' | 'fill';
      nen?: string;
    }
  | { op: 'phong_to'; he_so: 2 | 3 | 4 }
  | {
      op: 'chinh_mau';
      do_sang?: number;
      tuong_phan?: number;
      bao_hoa?: number;
    }
  | { op: 'lam_net'; muc?: number }
  | { op: 'lam_mo'; muc: number }
  | { op: 'den_trang' }
  | {
      op: 'chu';
      noi_dung: string;
      vi_tri?: Anchor;
      co_chu?: number;
      mau?: string;
      nen?: string;
      dam?: boolean;
      le?: number;
    }
  | {
      op: 'logo';
      anh: Buffer;
      vi_tri?: Anchor;
      ti_le?: number;
      do_mo?: number;
      le?: number;
    }
  | { op: 'vien'; mau?: string; day?: number }
  | { op: 'dem_ti_le'; ti_le: Ratio; nen?: string }
  | { op: 'nen'; toi_da_kb?: number; chat_luong?: number }
  | { op: 'dinh_dang'; kieu: OutFormat; chat_luong?: number };

export interface EditResult {
  buffer: Buffer;
  format: OutFormat;
  width: number;
  height: number;
  bytes: number;
  /** false khi đã nén hết mức mà vẫn lớn hơn toi_da_kb */
  dat_dung_luong: boolean;
}

// ---------------------------------------------------------------------------
//  Tiện ích chung
// ---------------------------------------------------------------------------

interface Raw {
  data: Buffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
}

const fromSharp = async (s: sharp.Sharp): Promise<Raw> => {
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels as Raw['channels'],
  };
};

const toSharp = (r: Raw) =>
  sharp(r.data, {
    raw: { width: r.width, height: r.height, channels: r.channels },
  });

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export class ImageOpError extends Error {}

export const parseRatio = (r: Ratio | string): number => {
  if (typeof r === 'number') {
    if (!(r > 0) || r > 10) throw new ImageOpError(`Tỉ lệ không hợp lệ: ${r}`);
    return r;
  }
  const m = String(r).match(/^\s*([\d.]+)\s*[:/x]\s*([\d.]+)\s*$/);
  if (!m) {
    const n = Number(r);
    if (n > 0 && n <= 10) return n;
    throw new ImageOpError(`Tỉ lệ không hợp lệ: "${r}" (vd "4:5", "9:16").`);
  }
  const v = Number(m[1]) / Number(m[2]);
  if (!(v > 0) || v > 10) throw new ImageOpError(`Tỉ lệ không hợp lệ: "${r}"`);
  return v;
};

/** Màu → {hex, alpha} cho SVG; chấp nhận #rgb, #rrggbb, #rrggbbaa, rgb()/rgba(). */
const parseColor = (s: string | undefined, def: string) => {
  const v = (s || def).trim();
  let m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m) return { hex: `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`, a: 1 };
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    return { hex: `#${m[1]}`, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  m = v.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
  );
  if (m) {
    const hex =
      '#' +
      [m[1], m[2], m[3]]
        .map((x) => clamp(Number(x), 0, 255).toString(16).padStart(2, '0'))
        .join('');
    return { hex, a: m[4] != null ? clamp(Number(m[4]), 0, 1) : 1 };
  }
  // tên màu CSS (white, black, red…) — chỉ nhận chữ cái để khỏi chèn SVG
  if (/^[a-z]{3,20}$/i.test(v)) return { hex: v, a: 1 };
  return { hex: def, a: 1 };
};

/** Màu cho tham số background của sharp. */
const sharpColor = (s: string | undefined, def: string) => {
  const { hex, a } = parseColor(s, def);
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex; // tên màu CSS — sharp tự hiểu
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
    alpha: a,
  };
};

const xml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const RESIZE_POS: Record<Anchor, string> = {
  tren_trai: 'left top',
  tren: 'top',
  tren_phai: 'right top',
  trai: 'left',
  giua: 'centre',
  phai: 'right',
  duoi_trai: 'left bottom',
  duoi: 'bottom',
  duoi_phai: 'right bottom',
};

/** Toạ độ góc trên-trái của một hộp bw×bh đặt ở anchor trong khung W×H. */
const place = (
  anchor: Anchor,
  W: number,
  H: number,
  bw: number,
  bh: number,
  margin: number
) => {
  const h = anchor.includes('trai')
    ? 'l'
    : anchor.includes('phai')
    ? 'r'
    : 'c';
  const v = anchor.startsWith('tren')
    ? 't'
    : anchor.startsWith('duoi')
    ? 'b'
    : 'm';
  const left =
    h === 'l' ? margin : h === 'r' ? W - margin - bw : Math.round((W - bw) / 2);
  const top =
    v === 't' ? margin : v === 'b' ? H - margin - bh : Math.round((H - bh) / 2);
  return {
    left: clamp(Math.round(left), 0, Math.max(0, W - bw)),
    top: clamp(Math.round(top), 0, Math.max(0, H - bh)),
    h,
  };
};

// Ngắt dòng theo số ký tự ước lượng (đủ dùng cho chữ chèn lên ảnh).
const wrapText = (text: string, maxChars: number): string[] => {
  const out: string[] = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (let w of words) {
      while ([...w].length > maxChars) {
        if (line) {
          out.push(line);
          line = '';
        }
        const chars = [...w];
        out.push(chars.slice(0, maxChars).join(''));
        w = chars.slice(maxChars).join('');
      }
      const next = line ? `${line} ${w}` : w;
      if ([...next].length > maxChars && line) {
        out.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out;
};

// Phông có dấu tiếng Việt: Arial (Windows/mac), Noto Sans / DejaVu Sans (Linux,
// Docker) đều đủ glyph có dấu.
const FONT_FAMILY = "Arial, 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', sans-serif";

// ---------------------------------------------------------------------------
//  Từng thao tác
// ---------------------------------------------------------------------------

const opCropRatio = async (
  r: Raw,
  ratio: Ratio,
  tam: Anchor | 'thong_minh' | 'chi_tiet' = 'thong_minh'
) => {
  const R = parseRatio(ratio);
  let w = r.width;
  let h = r.height;
  if (w / h > R) w = Math.max(1, Math.round(h * R));
  else h = Math.max(1, Math.round(w / R));
  if (w === r.width && h === r.height) return r;
  const position =
    tam === 'thong_minh'
      ? sharp.strategy.attention
      : tam === 'chi_tiet'
      ? sharp.strategy.entropy
      : RESIZE_POS[tam] || 'centre';
  return fromSharp(toSharp(r).resize(w, h, { fit: 'cover', position }));
};

const opCropBox = async (
  r: Raw,
  o: Extract<ImageOp, { op: 'cat_vung' }>
) => {
  const pct = o.don_vi === '%';
  const conv = (v: number, total: number) =>
    Math.round(pct ? (v / 100) * total : v);
  const left = clamp(conv(o.x, r.width), 0, r.width - 1);
  const top = clamp(conv(o.y, r.height), 0, r.height - 1);
  const width = clamp(conv(o.rong, r.width), 1, r.width - left);
  const height = clamp(conv(o.cao, r.height), 1, r.height - top);
  return fromSharp(toSharp(r).extract({ left, top, width, height }));
};

const opText = async (r: Raw, o: Extract<ImageOp, { op: 'chu' }>) => {
  const W = r.width;
  const H = r.height;
  const fs = Math.max(8, Math.round((W * clamp(o.co_chu ?? 5, 1, 30)) / 100));
  const pad = Math.round(fs * 0.5);
  const margin = Math.round((Math.min(W, H) * clamp(o.le ?? 4, 0, 30)) / 100);
  const bold = o.dam !== false;
  const charW = fs * (bold ? 0.6 : 0.55);
  const maxTextW = Math.max(charW, W - 2 * margin - 2 * pad);
  const lines = wrapText(o.noi_dung, Math.max(1, Math.floor(maxTextW / charW)));
  if (!lines.length) return r;
  const lineH = Math.round(fs * 1.25);
  const longest = Math.max(...lines.map((l) => [...l].length));
  const boxW = Math.min(W - 2 * margin, Math.round(longest * charW + 2 * pad));
  const boxH = Math.min(H, lines.length * lineH + 2 * pad);
  const { left, top, h } = place(o.vi_tri || 'duoi', W, H, boxW, boxH, margin);
  const anchor = h === 'l' ? 'start' : h === 'r' ? 'end' : 'middle';
  const tx = h === 'l' ? left + pad : h === 'r' ? left + boxW - pad : left + boxW / 2;
  const fg = parseColor(o.mau, '#ffffff');
  const noBg = (o.nen || '').trim().toLowerCase() === 'none';
  const bg = parseColor(noBg ? undefined : o.nen, 'rgba(0,0,0,0.55)');
  const rect = noBg
    ? ''
    : `<rect x="${left}" y="${top}" width="${boxW}" height="${boxH}" rx="${Math.round(
        fs * 0.25
      )}" fill="${xml(bg.hex)}" fill-opacity="${bg.a}"/>`;
  // Không nền → viền chữ tối để đọc được trên mọi ảnh.
  const stroke = noBg
    ? ` stroke="#000000" stroke-opacity="0.6" stroke-width="${Math.max(
        1,
        Math.round(fs * 0.08)
      )}" paint-order="stroke"`
    : '';
  const tspans = lines
    .map(
      (l, i) =>
        `<tspan x="${Math.round(tx)}" y="${Math.round(
          top + pad + i * lineH + fs * 0.92
        )}">${xml(l)}</tspan>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rect}<text font-family="${xml(
    FONT_FAMILY
  )}" font-size="${fs}" font-weight="${bold ? 'bold' : 'normal'}" fill="${xml(
    fg.hex
  )}" fill-opacity="${fg.a}" text-anchor="${anchor}"${stroke}>${tspans}</text></svg>`;
  return fromSharp(
    toSharp(r).composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
  );
};

const opLogo = async (r: Raw, o: Extract<ImageOp, { op: 'logo' }>) => {
  const W = r.width;
  const H = r.height;
  const targetW = clamp(Math.round((W * clamp(o.ti_le ?? 18, 1, 100)) / 100), 8, W);
  let logo = await sharp(o.anh, { limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate()
    .resize({ width: targetW, height: H, fit: 'inside' })
    .ensureAlpha()
    .png()
    .toBuffer();
  const opacity = clamp(o.do_mo ?? 0.85, 0, 1);
  if (opacity < 1) {
    logo = await sharp(logo)
      .composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();
  }
  const lm = await sharp(logo).metadata();
  const margin = Math.round((Math.min(W, H) * clamp(o.le ?? 3, 0, 30)) / 100);
  const { left, top } = place(
    o.vi_tri || 'duoi_phai',
    W,
    H,
    lm.width || targetW,
    lm.height || targetW,
    margin
  );
  return fromSharp(toSharp(r).composite([{ input: logo, left, top }]));
};

const opPadRatio = async (
  r: Raw,
  ratio: Ratio,
  nen: string | undefined
) => {
  const R = parseRatio(ratio);
  let cw = r.width;
  let ch = r.height;
  if (r.width / r.height > R) ch = Math.round(r.width / R);
  else cw = Math.round(r.height * R);
  if (cw === r.width && ch === r.height) return r;
  if (cw > MAX_SIDE || ch > MAX_SIDE) {
    throw new ImageOpError('Ảnh sau khi đệm quá lớn — thu nhỏ (doi_co) trước.');
  }
  const left = Math.floor((cw - r.width) / 2);
  const top = Math.floor((ch - r.height) / 2);
  const original = {
    input: r.data,
    raw: { width: r.width, height: r.height, channels: r.channels },
    left,
    top,
  };
  if (!nen || nen === 'mo') {
    // Nền mờ: phóng ảnh phủ kín khung ở độ phân giải thấp, làm mờ, tối nhẹ —
    // rẻ hơn nhiều so với blur trên ảnh to.
    const small = await toSharp(r)
      .resize(Math.max(8, Math.round(cw / 8)), Math.max(8, Math.round(ch / 8)), {
        fit: 'cover',
      })
      .blur(4)
      .modulate({ brightness: 0.85 })
      .removeAlpha()
      .png()
      .toBuffer();
    return fromSharp(
      sharp(small).resize(cw, ch, { fit: 'fill' }).composite([original])
    );
  }
  return fromSharp(
    toSharp(r).extend({
      top,
      bottom: ch - r.height - top,
      left,
      right: cw - r.width - left,
      background: sharpColor(nen, '#ffffff'),
    })
  );
};

const opAdjust = (r: Raw, o: Extract<ImageOp, { op: 'chinh_mau' }>) => {
  let s = toSharp(r);
  const bri = o.do_sang;
  const sat = o.bao_hoa;
  if ((bri != null && bri !== 1) || (sat != null && sat !== 1)) {
    s = s.modulate({
      brightness: clamp(bri ?? 1, 0, 5),
      saturation: clamp(sat ?? 1, 0, 5),
    });
  }
  const con = o.tuong_phan;
  if (con != null && con !== 1) {
    const a = clamp(con, 0, 5);
    const colour = r.channels === 4 || r.channels === 2 ? r.channels - 1 : r.channels;
    const as: number[] = [];
    const bs: number[] = [];
    for (let i = 0; i < r.channels; i++) {
      // giữ nguyên kênh alpha
      as.push(i < colour ? a : 1);
      bs.push(i < colour ? 128 * (1 - a) : 0);
    }
    s = s.linear(as, bs);
  }
  return fromSharp(s);
};

const applyOp = async (r: Raw, o: ImageOp): Promise<Raw> => {
  switch (o.op) {
    case 'cat_ti_le':
      return opCropRatio(r, o.ti_le, o.tam);
    case 'cat_vung':
      return opCropBox(r, o);
    case 'xoay':
      return fromSharp(
        toSharp(r).rotate(o.goc, { background: sharpColor(o.nen, '#ffffff') })
      );
    case 'lat':
      return fromSharp(o.huong === 'doc' ? toSharp(r).flip() : toSharp(r).flop());
    case 'doi_co': {
      if (!o.rong && !o.cao) throw new ImageOpError('doi_co cần rong hoặc cao.');
      return fromSharp(
        toSharp(r).resize({
          width: o.rong ? clamp(Math.round(o.rong), 1, MAX_SIDE) : undefined,
          height: o.cao ? clamp(Math.round(o.cao), 1, MAX_SIDE) : undefined,
          fit: o.kieu || 'inside',
          background: sharpColor(o.nen, '#ffffff'),
          kernel: sharp.kernel.lanczos3,
        })
      );
    }
    case 'phong_to': {
      const k = o.he_so || 2;
      const w = Math.min(MAX_SIDE, r.width * k);
      return fromSharp(
        toSharp(r)
          .resize({ width: w, kernel: sharp.kernel.lanczos3 })
          .sharpen({ sigma: 0.8 })
      );
    }
    case 'chinh_mau':
      return opAdjust(r, o);
    case 'lam_net':
      return fromSharp(toSharp(r).sharpen({ sigma: clamp(o.muc ?? 1, 0.3, 10) }));
    case 'lam_mo':
      return fromSharp(toSharp(r).blur(clamp(o.muc, 0.3, 100)));
    case 'den_trang':
      return fromSharp(toSharp(r).modulate({ saturation: 0 }));
    case 'chu':
      return opText(r, o);
    case 'logo':
      return opLogo(r, o);
    case 'vien': {
      const d = Math.round(
        o.day != null ? clamp(o.day, 1, 500) : Math.max(2, Math.min(r.width, r.height) * 0.02)
      );
      return fromSharp(
        toSharp(r).extend({
          top: d,
          bottom: d,
          left: d,
          right: d,
          background: sharpColor(o.mau, '#ffffff'),
        })
      );
    }
    case 'dem_ti_le':
      return opPadRatio(r, o.ti_le, o.nen);
    case 'nen':
    case 'dinh_dang':
      return r; // xử lý lúc mã hoá
    default:
      throw new ImageOpError(`Thao tác không hỗ trợ: ${(o as any)?.op}`);
  }
};

// ---------------------------------------------------------------------------
//  Mã hoá đầu ra (+ nén về dưới X KB)
// ---------------------------------------------------------------------------

const encodeOnce = (r: Raw, fmt: OutFormat, q: number) => {
  const hasAlpha = r.channels === 2 || r.channels === 4;
  if (fmt === 'png') return toSharp(r).png({ compressionLevel: 9 }).toBuffer();
  if (fmt === 'webp') return toSharp(r).webp({ quality: q }).toBuffer();
  const s = hasAlpha ? toSharp(r).flatten({ background: '#ffffff' }) : toSharp(r);
  return s.jpeg({ quality: q, mozjpeg: true }).toBuffer();
};

const encode = async (
  r: Raw,
  fmt: OutFormat,
  quality: number,
  maxKb?: number
): Promise<EditResult> => {
  let cur = r;
  let q = clamp(Math.round(quality), 30, 100);
  for (let attempt = 0; attempt < 16; attempt++) {
    const buf = await encodeOnce(cur, fmt, q);
    const ok = !maxKb || buf.length <= maxKb * 1024;
    const tooSmall = cur.width < 480 || cur.height < 480;
    if (ok || (tooSmall && (fmt === 'png' || q <= 45))) {
      return {
        buffer: buf,
        format: fmt,
        width: cur.width,
        height: cur.height,
        bytes: buf.length,
        dat_dung_luong: ok,
      };
    }
    if (fmt !== 'png' && q > 45) {
      q = Math.max(45, q - 10);
      continue;
    }
    cur = await fromSharp(
      toSharp(cur).resize({ width: Math.round(cur.width * 0.85) })
    );
  }
  const buf = await encodeOnce(cur, fmt, q);
  return {
    buffer: buf,
    format: fmt,
    width: cur.width,
    height: cur.height,
    bytes: buf.length,
    dat_dung_luong: !maxKb || buf.length <= maxKb * 1024,
  };
};

const loadRaw = async (input: Buffer) => {
  const meta = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) {
    throw new ImageOpError('Không đọc được ảnh (file hỏng hoặc không phải ảnh).');
  }
  // .rotate() không tham số = xoay theo EXIF → mọi bước sau làm trên ảnh "đứng".
  const raw = await fromSharp(
    sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).rotate()
  );
  return { raw, meta };
};

/** Áp chuỗi thao tác lên ảnh → ảnh mới đã mã hoá. */
export async function editImage(
  input: Buffer,
  ops: ImageOp[]
): Promise<EditResult> {
  const { raw, meta } = await loadRaw(input);
  let r = raw;
  let fmt: OutFormat =
    meta.format === 'png' ? 'png' : meta.format === 'webp' ? 'webp' : 'jpeg';
  let quality = 90;
  let maxKb: number | undefined;
  for (const o of ops) {
    if (o.op === 'dinh_dang') {
      fmt = o.kieu;
      if (o.chat_luong) quality = o.chat_luong;
      continue;
    }
    if (o.op === 'nen') {
      if (o.chat_luong) quality = o.chat_luong;
      if (o.toi_da_kb) {
        maxKb = o.toi_da_kb;
        // PNG khó nén về KB mong muốn → đổi JPEG (trừ khi đã chọn định dạng)
        if (fmt === 'png') fmt = 'jpeg';
      }
      continue;
    }
    r = await applyOp(r, o);
    if (r.width > MAX_SIDE || r.height > MAX_SIDE) {
      throw new ImageOpError(`Ảnh vượt ${MAX_SIDE}px — thu nhỏ lại.`);
    }
  }
  // định dạng chọn sau cùng thắng: nếu người dùng chọn PNG rõ ràng sau 'nen'
  const lastFmt = [...ops].reverse().find((o) => o.op === 'dinh_dang') as
    | Extract<ImageOp, { op: 'dinh_dang' }>
    | undefined;
  if (lastFmt) fmt = lastFmt.kieu;
  return encode(r, fmt, quality, maxKb);
}

// ---------------------------------------------------------------------------
//  Ghép ảnh (collage)
// ---------------------------------------------------------------------------

export type CollageLayout = 'grid' | '1+2' | '1+3' | 'ngang' | 'doc';

export interface CollageOptions {
  layout: CollageLayout;
  gap?: number;
  bg?: string;
  /** chiều rộng ảnh ghép (px) */
  size?: number;
}

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

const collageCells = (
  n: number,
  layout: CollageLayout,
  W: number,
  g: number
): { cells: Cell[]; H: number } => {
  const row = (count: number, y: number, h: number): Cell[] => {
    const w = (W - g * (count + 1)) / count;
    return Array.from({ length: count }, (_, i) => ({
      x: Math.round(g + i * (w + g)),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    }));
  };
  if (layout === '1+2' || layout === '1+3') {
    const k = layout === '1+2' ? 2 : 3;
    const H = W;
    const topH = Math.round((H - 3 * g) * 0.62);
    const botH = H - 3 * g - topH;
    return {
      cells: [{ x: g, y: g, w: W - 2 * g, h: topH }, ...row(k, 2 * g + topH, botH)],
      H,
    };
  }
  if (layout === 'ngang') {
    const H = Math.round(W * (n <= 2 ? 0.5 : 0.6));
    return { cells: row(n, g, H - 2 * g), H };
  }
  if (layout === 'doc') {
    const cellH = Math.round((W - 2 * g) * 0.56);
    const H = n * cellH + (n + 1) * g;
    return {
      cells: Array.from({ length: n }, (_, i) => ({
        x: g,
        y: g + i * (cellH + g),
        w: W - 2 * g,
        h: cellH,
      })),
      H,
    };
  }
  // grid
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cw = (W - g * (cols + 1)) / cols;
  const H = Math.round(rows * cw + (rows + 1) * g);
  const cells: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const rIdx = Math.floor(i / cols);
    const cIdx = i % cols;
    // hàng cuối thiếu ô → căn giữa
    const inRow = rIdx === rows - 1 ? n - rIdx * cols : cols;
    const offset = ((cols - inRow) * (cw + g)) / 2;
    cells.push({
      x: Math.round(g + offset + cIdx * (cw + g)),
      y: Math.round(g + rIdx * (cw + g)),
      w: Math.round(cw),
      h: Math.round(cw),
    });
  }
  return { cells, H };
};

export const COLLAGE_COUNT: Record<CollageLayout, [number, number]> = {
  grid: [2, 9],
  '1+2': [3, 3],
  '1+3': [4, 4],
  ngang: [2, 6],
  doc: [2, 6],
};

export async function collage(
  bufs: Buffer[],
  opts: CollageOptions
): Promise<EditResult> {
  const [min, max] = COLLAGE_COUNT[opts.layout];
  if (bufs.length < min || bufs.length > max) {
    throw new ImageOpError(
      `Bố cục "${opts.layout}" cần ${min === max ? min : `${min}-${max}`} ảnh (đang có ${bufs.length}).`
    );
  }
  const W = clamp(Math.round(opts.size || 2048), 400, 4096);
  const g = clamp(Math.round(opts.gap ?? Math.round(W * 0.01)), 0, 200);
  const { cells, H } = collageCells(bufs.length, opts.layout, W, g);
  const layers: sharp.OverlayOptions[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const tile = await sharp(bufs[i], { limitInputPixels: LIMIT_INPUT_PIXELS })
      .rotate()
      .resize(Math.max(1, c.w), Math.max(1, c.h), {
        fit: 'cover',
        position: sharp.strategy.attention,
      })
      .removeAlpha()
      .png()
      .toBuffer();
    layers.push({ input: tile, left: c.x, top: c.y });
  }
  const bg = sharpColor(opts.bg, '#ffffff');
  const buf = await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: typeof bg === 'string' ? bg : { r: bg.r, g: bg.g, b: bg.b },
    },
  })
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return {
    buffer: buf,
    format: 'jpeg',
    width: W,
    height: H,
    bytes: buf.length,
    dat_dung_luong: true,
  };
}

// ---------------------------------------------------------------------------
//  Chấm điểm chất lượng kỹ thuật
// ---------------------------------------------------------------------------

export interface QualityMetrics {
  width: number;
  height: number;
  /** rộng / cao */
  ratio: number;
  bytes: number;
  /** phương sai Laplacian trên ảnh xám ≤800px — càng cao càng nét */
  sharpness: number;
  /** độ sáng trung bình 0-255 */
  brightness: number;
  /** % điểm ảnh rất tối (<25) */
  pctDark: number;
  /** % điểm ảnh cháy sáng (>250) */
  pctBlown: number;
  /** độ lệch chuẩn độ sáng (tương phản) */
  contrast: number;
  /** dHash 64-bit, 16 ký tự hex */
  dhash: string;
}

export interface QualityScore {
  score: number;
  reasons: string[];
}

const dhashOf = async (buf: Buffer): Promise<string> => {
  const px = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate()
    .removeAlpha()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let nibbleHi = 0;
    let nibbleLo = 0;
    for (let x = 0; x < 8; x++) {
      const bit = px[y * 9 + x] > px[y * 9 + x + 1] ? 1 : 0;
      if (x < 4) nibbleHi = (nibbleHi << 1) | bit;
      else nibbleLo = (nibbleLo << 1) | bit;
    }
    hex += nibbleHi.toString(16) + nibbleLo.toString(16);
  }
  return hex;
};

export async function measureQuality(buf: Buffer): Promise<QualityMetrics> {
  const meta = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) {
    throw new ImageOpError('Không đọc được ảnh.');
  }
  const swap = (meta.orientation || 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;

  const grey = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate()
    .removeAlpha()
    .greyscale()
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = grey.info.channels;
  const n = grey.info.width * grey.info.height;
  let sum = 0;
  let sum2 = 0;
  let dark = 0;
  let blown = 0;
  for (let i = 0; i < n; i++) {
    const v = grey.data[i * ch];
    sum += v;
    sum2 += v * v;
    if (v < 25) dark++;
    if (v > 250) blown++;
  }
  const mean = sum / n;
  const stdev = Math.sqrt(Math.max(0, sum2 / n - mean * mean));

  // Laplacian qua sharp.convolve; offset 128 để giữ cả giá trị âm (bị cắt ở biên
  // 0/255 — chấp nhận được cho ước lượng độ nét).
  const lap = await sharp(grey.data, {
    raw: { width: grey.info.width, height: grey.info.height, channels: ch },
  })
    .convolve({
      width: 3,
      height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
      scale: 1,
      offset: 128,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lw = lap.info.width;
  const lh = lap.info.height;
  const lc = lap.info.channels;
  let ls = 0;
  let ls2 = 0;
  let ln = 0;
  for (let y = 1; y < lh - 1; y++) {
    for (let x = 1; x < lw - 1; x++) {
      const v = lap.data[(y * lw + x) * lc] - 128;
      ls += v;
      ls2 += v * v;
      ln++;
    }
  }
  const lmean = ln ? ls / ln : 0;
  const sharpness = ln ? ls2 / ln - lmean * lmean : 0;

  return {
    width,
    height,
    ratio: Math.round((width / height) * 1000) / 1000,
    bytes: buf.length,
    sharpness: Math.round(sharpness * 10) / 10,
    brightness: Math.round(mean * 10) / 10,
    pctDark: Math.round((dark / n) * 1000) / 10,
    pctBlown: Math.round((blown / n) * 1000) / 10,
    contrast: Math.round(stdev * 10) / 10,
    dhash: await dhashOf(buf),
  };
}

/** Điểm 0-100 + lý do (tiếng Việt). minSide: cạnh ngắn tối thiểu mong muốn. */
export function scoreQuality(m: QualityMetrics, minSide = 1080): QualityScore {
  let score = 100;
  const reasons: string[] = [];
  const short = Math.min(m.width, m.height);
  if (short < 600) {
    score -= 30;
    reasons.push(`độ phân giải thấp (cạnh ngắn ${short}px)`);
  } else if (short < minSide) {
    score -= 10;
    reasons.push(`nhỏ hơn ${minSide}px (cạnh ngắn ${short}px)`);
  }
  if (m.sharpness < 40) {
    score -= 35;
    reasons.push('mờ / nhoè (thiếu nét)');
  } else if (m.sharpness < 110) {
    score -= 15;
    reasons.push('hơi mờ');
  }
  if (m.brightness < 55) {
    score -= 20;
    reasons.push('tối');
  } else if (m.pctDark > 45) {
    score -= 10;
    reasons.push('nhiều vùng quá tối');
  }
  if (m.brightness > 215 || m.pctBlown > 25) {
    score -= 20;
    reasons.push('cháy sáng');
  } else if (m.pctBlown > 10) {
    score -= 8;
    reasons.push('có vùng cháy sáng');
  }
  if (m.contrast < 28) {
    score -= 10;
    reasons.push('thiếu tương phản (ảnh bệt)');
  }
  return { score: clamp(score, 0, 100), reasons };
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export const hamming = (a: string, b: string) => {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return d + Math.abs(a.length - b.length) * 4;
};

/** Nhóm ảnh gần trùng (dHash Hamming ≤ maxDist). Trả các nhóm ≥ 2 phần tử (chỉ số 0-based). */
export function findDuplicateGroups(hashes: string[], maxDist = 6): number[][] {
  const parent = hashes.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      if (hashes[i] && hashes[j] && hamming(hashes[i], hashes[j]) <= maxDist) {
        parent[find(j)] = find(i);
      }
    }
  }
  const groups = new Map<number, number[]>();
  hashes.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) || []), i]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Thông tin nhanh của ảnh (không giải mã toàn bộ). */
export async function imageInfo(buf: Buffer) {
  const meta = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
  const swap = (meta.orientation || 1) >= 5;
  const width = (swap ? meta.height : meta.width) || 0;
  const height = (swap ? meta.width : meta.height) || 0;
  return {
    width,
    height,
    ratio: height ? width / height : 0,
    bytes: buf.length,
    format: meta.format,
  };
}

/** Chuẩn hoá ảnh về JPEG (cạnh dài ≤ maxSide) — để gửi AI / bot. */
export async function toJpeg(buf: Buffer, maxSide = 2560, quality = 90) {
  return sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/** PNG (cạnh dài ≤ maxSide) — ảnh tham chiếu cho model ảnh. */
export async function toPng(buf: Buffer, maxSide = 1536) {
  return sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
//  Khung hình video (ffmpeg trong PATH — Dockerfile có cài; không có thì bỏ)
// ---------------------------------------------------------------------------

let ffmpegChecked: Promise<boolean> | null = null;

export const hasFfmpeg = (): Promise<boolean> => {
  if (!ffmpegChecked) {
    ffmpegChecked = new Promise((resolve) => {
      execFile('ffmpeg', ['-version'], { timeout: 5000 }, (err) =>
        resolve(!err)
      );
    });
  }
  return ffmpegChecked;
};

/**
 * Cắt 1 khung hình JPEG tại giây `seconds`. `input` là đường dẫn file trên đĩa
 * hoặc URL https của kho media (caller tự kiểm nguồn — không nhận link lạ).
 */
export async function extractVideoFrame(
  input: string,
  seconds: number
): Promise<Buffer> {
  if (!(await hasFfmpeg())) {
    throw new ImageOpError('Máy chủ không có ffmpeg.');
  }
  if (input.startsWith('-')) throw new ImageOpError('Nguồn video không hợp lệ.');
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-protocol_whitelist',
    'file,http,https,tcp,tls,crypto',
    '-ss',
    String(Math.max(0, seconds)),
    '-i',
    input,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    'pipe:1',
  ];
  const out = await new Promise<Buffer>((resolve, reject) => {
    execFile(
      'ffmpeg',
      args,
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new ImageOpError(
              `ffmpeg lỗi: ${String(stderr || err.message).slice(0, 200)}`
            )
          );
          return;
        }
        resolve(stdout as Buffer);
      }
    );
  });
  if (!out.length) {
    throw new ImageOpError('Không cắt được khung hình (giây vượt độ dài video?).');
  }
  return out;
}
