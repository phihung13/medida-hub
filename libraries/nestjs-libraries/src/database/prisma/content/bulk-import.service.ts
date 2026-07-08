import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  getAnthropicKey,
  getAnthropicModel,
} from '@gitroom/nestjs-libraries/openai/anthropic.key';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Readable } from 'stream';

dayjs.extend(utc);
dayjs.extend(customParseFormat);

// ============================================================================
//  GĐ3 — Nhập lịch đăng hàng loạt từ Excel/CSV ("Agent Excel"):
//  parse → validate từng dòng → (tùy chọn) AI chuốt tiêu đề/mô tả →
//  tải media từ link (Drive/URL trực tiếp) → tạo Post QUEUE hàng loạt.
//  Pipeline TRUNG LẬP THEO KÊNH: kênh nào có trong file thì đăng kênh đó
//  (Facebook/Zalo dùng được ngay; YouTube dùng sau khi nối ở GĐ2).
// ============================================================================

export interface BulkRow {
  row: number; // số dòng trong file (để user đối chiếu)
  channel: string; // tên kênh như trong file
  integrationId: string | null; // khớp được với kênh đã kết nối
  integrationName: string | null;
  platform: string | null;
  title: string;
  content: string;
  tags: string;
  mediaUrl: string;
  scheduledAt: string | null; // ISO UTC
  errors: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  channel: ['kênh', 'kenh', 'channel', 'trang', 'page'],
  title: ['tiêu đề', 'tieu de', 'title'],
  content: ['nội dung', 'noi dung', 'mô tả', 'mo ta', 'description', 'content', 'caption'],
  tags: ['tags', 'tag', 'thẻ', 'the', 'hashtag', 'hashtags'],
  mediaUrl: ['link', 'drive', 'url', 'video', 'media', 'ảnh', 'anh', 'file'],
  scheduledAt: ['ngày giờ', 'ngay gio', 'thời gian', 'thoi gian', 'giờ đăng', 'gio dang', 'lịch', 'lich', 'schedule', 'time', 'date', 'datetime', 'ngày', 'ngay'],
};

const DATE_FORMATS = [
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY H:mm',
  'D/M/YYYY HH:mm',
  'D/M/YYYY H:mm',
  'YYYY-MM-DD HH:mm',
  'DD-MM-YYYY HH:mm',
  'DD/MM/YYYY HH:mm:ss',
  'YYYY-MM-DDTHH:mm',
];

@Injectable()
export class BulkImportService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _bulkFile: PrismaRepository<'bulkFile'>
  ) {}

  // ---- Lịch sử file (trang Agent) -------------------------------------------

  async listFiles(orgId: string) {
    const files = await this._bulkFile.model.bulkFile.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        rows: true,
        results: true,
        createdAt: true,
      },
    });
    return {
      files: files.map((f) => {
        let total = 0;
        let done = 0;
        try {
          total = JSON.parse(f.rows).length;
        } catch {
          /* rows hỏng — coi như 0 */
        }
        try {
          done = JSON.parse(f.results).filter((r: any) => r.ok).length;
        } catch {
          /* chưa commit */
        }
        return {
          id: f.id,
          name: f.name,
          createdAt: f.createdAt,
          total,
          done,
        };
      }),
    };
  }

  async getFile(orgId: string, id: string) {
    const f = await this._bulkFile.model.bulkFile.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!f) return null;
    const integrations = (
      await this._integrationService.getIntegrationsList(orgId)
    ).filter((i: any) => !i.disabled && i.type === 'social');
    let rows: BulkRow[] = [];
    let results: any[] = [];
    try {
      rows = JSON.parse(f.rows);
    } catch {
      /* giữ rỗng */
    }
    try {
      results = JSON.parse(f.results);
    } catch {
      /* giữ rỗng */
    }
    return {
      id: f.id,
      name: f.name,
      createdAt: f.createdAt,
      rows,
      results,
      channels: this.channelList(integrations),
    };
  }

  saveRows(orgId: string, id: string, rows: BulkRow[]) {
    return this._bulkFile.model.bulkFile.updateMany({
      where: { id, organizationId: orgId },
      data: { rows: JSON.stringify(rows || []) },
    });
  }

  deleteFile(orgId: string, id: string) {
    return this._bulkFile.model.bulkFile.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  // ---- 1. PARSE -------------------------------------------------------------

  private matchHeader(raw: string): string | null {
    const norm = String(raw || '').trim().toLowerCase();
    if (!norm) return null;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => norm === a || norm.startsWith(a))) return field;
    }
    return null;
  }

  private cellToString(v: any): string {
    if (v == null) return '';
    if (v instanceof Date) return dayjs(v).format('DD/MM/YYYY HH:mm');
    if (typeof v === 'object') {
      // exceljs rich text / hyperlink / formula
      if (v.hyperlink) return String(v.hyperlink);
      if (v.text) return String(v.text);
      if (v.richText) return v.richText.map((r: any) => r.text).join('');
      if (v.result != null) return String(v.result);
      return '';
    }
    return String(v).trim();
  }

  private async extractGrid(
    buffer: Buffer,
    filename: string
  ): Promise<string[][]> {
    if (/\.csv$/i.test(filename)) {
      // CSV đơn giản: hỗ trợ ô có dấu phẩy trong ngoặc kép
      const text = buffer.toString('utf8').replace(/^﻿/, '');
      return text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((line) => {
          const cells: string[] = [];
          let cur = '';
          let inQ = false;
          for (const ch of line) {
            if (ch === '"') inQ = !inQ;
            else if (ch === ',' && !inQ) {
              cells.push(cur.trim());
              cur = '';
            } else cur += ch;
          }
          cells.push(cur.trim());
          return cells;
        });
    }
    const wb = new Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      // cell 1-indexed; giữ đúng vị trí cột để khớp header
      for (let c = 1; c <= ws.columnCount; c++) {
        cells.push(this.cellToString(row.getCell(c).value));
      }
      grid.push(cells);
    });
    return grid;
  }

  private parseDate(raw: string): string | null {
    const s = String(raw || '').trim();
    if (!s) return null;
    for (const f of DATE_FORMATS) {
      const d = dayjs(s, f, true);
      if (d.isValid()) return d.utc().format();
    }
    const loose = dayjs(s);
    return loose.isValid() ? loose.utc().format() : null;
  }

  async parse(
    orgId: string,
    buffer: Buffer,
    filename: string
  ): Promise<{ fileId: string | null; rows: BulkRow[]; channels: any[] }> {
    const integrations = (
      await this._integrationService.getIntegrationsList(orgId)
    ).filter((i: any) => !i.disabled && i.type === 'social');

    const grid = await this.extractGrid(buffer, filename);
    if (grid.length < 2) {
      return {
        fileId: null,
        rows: [],
        channels: this.channelList(integrations),
      };
    }

    // Dòng đầu = header; map cột theo alias
    const colMap: Record<number, string> = {};
    grid[0].forEach((h, idx) => {
      const field = this.matchHeader(h);
      if (field && !Object.values(colMap).includes(field)) {
        colMap[idx] = field;
      }
    });

    const rows: BulkRow[] = [];
    for (let r = 1; r < grid.length; r++) {
      const raw: Record<string, string> = {};
      grid[r].forEach((cell, idx) => {
        const field = colMap[idx];
        if (field) raw[field] = cell;
      });
      if (!Object.values(raw).some((v) => v)) continue; // dòng trống

      const errors: string[] = [];
      // Khớp kênh: theo tên (chứa) hoặc identifier
      const chRaw = (raw.channel || '').toLowerCase().trim();
      const integration = chRaw
        ? integrations.find(
            (i: any) =>
              i.name?.toLowerCase().includes(chRaw) ||
              chRaw.includes(i.name?.toLowerCase()) ||
              i.providerIdentifier === chRaw
          )
        : integrations.length === 1
        ? integrations[0]
        : null;
      if (!integration) {
        errors.push(
          chRaw
            ? `Không tìm thấy kênh khớp "${raw.channel}"`
            : 'Thiếu cột kênh (có nhiều kênh đang kết nối, phải chỉ rõ)'
        );
      }

      const scheduledAt = this.parseDate(raw.scheduledAt || '');
      if (!scheduledAt) {
        errors.push(
          raw.scheduledAt
            ? `Không đọc được ngày giờ "${raw.scheduledAt}" (dùng DD/MM/YYYY HH:mm)`
            : 'Thiếu ngày giờ đăng'
        );
      } else if (dayjs(scheduledAt).isBefore(dayjs())) {
        errors.push('Ngày giờ đăng nằm trong quá khứ');
      }

      if (!raw.content && !raw.title) {
        errors.push('Thiếu cả tiêu đề lẫn nội dung');
      }

      rows.push({
        row: r + 1,
        channel: raw.channel || '',
        integrationId: integration?.id || null,
        integrationName: integration?.name || null,
        platform: integration?.providerIdentifier || null,
        title: raw.title || '',
        content: raw.content || '',
        tags: raw.tags || '',
        mediaUrl: (raw.mediaUrl || '').trim(),
        scheduledAt,
        errors,
      });
    }
    // Lưu vào lịch sử file (mở lại được từ trang Agent)
    const saved = await this._bulkFile.model.bulkFile.create({
      data: {
        organizationId: orgId,
        name: filename,
        rows: JSON.stringify(rows),
      },
      select: { id: true },
    });
    return { fileId: saved.id, rows, channels: this.channelList(integrations) };
  }

  private channelList(integrations: any[]) {
    return integrations.map((i: any) => ({
      id: i.id,
      name: i.name,
      identifier: i.providerIdentifier,
      picture: i.picture,
    }));
  }

  // ---- 2. AI chuốt tiêu đề/mô tả (tùy chọn) ---------------------------------

  async polish(rows: BulkRow[]): Promise<Record<number, { title: string; content: string }>> {
    const key = getAnthropicKey();
    if (!key || !rows.length) return {};
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });
    const payload = rows.slice(0, 40).map((r) => ({
      row: r.row,
      title: r.title,
      content: r.content,
      tags: r.tags,
      platform: r.platform,
    }));
    const msg = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `Bạn là chuyên gia content mạng xã hội tiếng Việt. Với mỗi bài dưới đây, viết lại "title" (ngắn gọn, hút click, chuẩn SEO, giữ ý gốc) và "content" (mô tả tự nhiên, thêm hashtag phù hợp từ tags nếu có). Giữ nguyên ngôn ngữ gốc. Trả về DUY NHẤT một JSON array: [{"row":số,"title":"...","content":"..."}].\n\n${JSON.stringify(payload, null, 1)}`,
        },
      ],
    });
    const text = msg.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');
    try {
      const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
      const out: Record<number, { title: string; content: string }> = {};
      for (const item of arr) {
        if (item?.row != null) {
          out[item.row] = {
            title: String(item.title || ''),
            content: String(item.content || ''),
          };
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  // ---- 3. COMMIT — tải media + tạo Post QUEUE từng dòng ----------------------

  // Link Google Drive dạng chia sẻ → link tải trực tiếp. File phải để chế độ
  // "Anyone with the link". Trả null nếu không nhận dạng được (dùng URL gốc).
  private driveDirectUrl(url: string): string | null {
    const m =
      url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ||
      url.match(/drive\.google\.com\/open\?id=([\w-]+)/) ||
      url.match(/[?&]id=([\w-]+)/);
    if (!m) return null;
    return `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`;
  }

  private async downloadMedia(
    orgId: string,
    url: string
  ): Promise<{ id: string; path: string; name: string }> {
    const target = url.includes('drive.google.com')
      ? this.driveDirectUrl(url) || url
      : url;
    const res = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(300000), // video lớn — cho 5 phút
    });
    if (!res.ok) throw new Error(`Tải media thất bại (HTTP ${res.status})`);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error(
        'Link Drive trả về trang web thay vì file — kiểm tra file đã để "Anyone with the link" chưa'
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const { fromBuffer } = await import('file-type');
    const detected = await fromBuffer(buffer);
    if (!detected) throw new Error('Không nhận dạng được loại file');
    const uploaded = await this.storage.uploadFile({
      buffer,
      mimetype: detected.mime,
      size: buffer.length,
      path: '',
      fieldname: '',
      destination: '',
      stream: new Readable(),
      filename: '',
      originalname: `bulk.${detected.ext}`,
      encoding: '',
    } as any);
    const saved = await this._mediaService.saveFile(
      orgId,
      uploaded.originalname,
      uploaded.path
    );
    return { id: saved.id, path: saved.path, name: saved.name };
  }

  // Settings tối thiểu theo kênh để qua validate khi schedule.
  private settingsFor(platform: string, row: BulkRow): any {
    if (platform === 'youtube') {
      return {
        __type: 'youtube',
        title: (row.title || row.content.slice(0, 90)).slice(0, 100),
        type: 'public',
        tags: row.tags
          ? row.tags.split(/[,;#]/).map((t) => ({ value: t.trim(), label: t.trim() })).filter((t) => t.value)
          : [],
      };
    }
    return { __type: platform };
  }

  async commit(
    orgId: string,
    rows: BulkRow[],
    fileId?: string
  ): Promise<{ results: { row: number; ok: boolean; error?: string }[] }> {
    const results: { row: number; ok: boolean; error?: string }[] = [];
    for (const row of rows) {
      try {
        if (!row.integrationId || !row.scheduledAt) {
          throw new Error(row.errors?.join('; ') || 'Dòng thiếu dữ liệu');
        }
        const image: { id: string; path: string }[] = [];
        if (row.mediaUrl) {
          const media = await this.downloadMedia(orgId, row.mediaUrl);
          image.push({ id: media.id, path: media.path });
        }
        const contentHtml = [
          row.title ? `<p><strong>${row.title}</strong></p>` : '',
          row.content
            ? `<p>${row.content.replace(/\n/g, '<br/>')}</p>`
            : '',
        ]
          .filter(Boolean)
          .join('');
        const body = await this._postsService.mapTypeToPost(
          {
            type: 'schedule',
            shortLink: false,
            date: row.scheduledAt,
            tags: [],
            posts: [
              {
                integration: { id: row.integrationId },
                value: [{ content: contentHtml || '<p></p>', image }],
                settings: this.settingsFor(row.platform || '', row),
              },
            ],
          } as any,
          orgId,
          false
        );
        body.type = 'schedule';
        const validation = await this._postsService.validatePosts(
          orgId,
          body.posts as any
        );
        for (const item of validation) {
          if (item.emptyContent) throw new Error('Bài trống nội dung');
          if (!item.valid)
            throw new Error(item.settingsError || 'Cấu hình kênh chưa hợp lệ');
          if (item.errors !== true) throw new Error(String(item.errors));
          if (item.tooLong) throw new Error('Nội dung quá dài cho kênh này');
        }
        await this._postsService.createPost(orgId, body as any, 'API');
        results.push({ row: row.row, ok: true });
      } catch (e: any) {
        results.push({
          row: row.row,
          ok: false,
          error: String(e?.message || e).slice(0, 300),
        });
      }
    }
    // Ghi lại vào lịch sử file: rows (bản đã sửa tay) + kết quả GỘP với các
    // lần commit trước (mỗi lần chỉ gửi dòng chưa lên lịch).
    if (fileId) {
      try {
        const existing = await this._bulkFile.model.bulkFile.findFirst({
          where: { id: fileId, organizationId: orgId },
          select: { results: true, rows: true },
        });
        if (existing) {
          let prev: any[] = [];
          let prevRows: BulkRow[] = [];
          try {
            prev = JSON.parse(existing.results);
          } catch {
            /* chưa có */
          }
          try {
            prevRows = JSON.parse(existing.rows);
          } catch {
            /* chưa có */
          }
          const byRow = new Map(prev.map((r: any) => [r.row, r]));
          for (const r of results) byRow.set(r.row, r);
          const mergedRows = prevRows.map(
            (pr) => rows.find((r) => r.row === pr.row) || pr
          );
          await this._bulkFile.model.bulkFile.updateMany({
            where: { id: fileId, organizationId: orgId },
            data: {
              results: JSON.stringify([...byRow.values()]),
              rows: JSON.stringify(mergedRows.length ? mergedRows : rows),
            },
          });
        }
      } catch {
        /* lưu lịch sử lỗi — không chặn kết quả commit */
      }
    }
    return { results };
  }
}
