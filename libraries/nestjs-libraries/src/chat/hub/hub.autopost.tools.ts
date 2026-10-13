import { Injectable, ValidationPipe } from '@nestjs/common';
import { z } from 'zod';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import {
  BulkImportService,
  BulkRow,
} from '@gitroom/nestjs-libraries/database/prisma/content/bulk-import.service';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  HubToolError,
  HubToolGroup,
  HubToolMap,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Đăng tự động": nguồn RSS autopost + nhập lịch đăng hàng loạt từ
//  file Excel/CSV (đọc file → AI chuốt → lưu bảng → lên lịch).
// ============================================================================

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const rowSchema = z
  .object({
    row: z.number(),
    channel: z.string(),
    integrationId: z.string().nullable(),
    integrationName: z.string().nullable().optional(),
    platform: z.string().nullable().optional(),
    title: z.string(),
    content: z.string(),
    tags: z.string().default(''),
    mediaUrl: z.string().default(''),
    scheduledAt: z.string().nullable(),
    errors: z.array(z.string()).default([]),
    aiPolished: z.boolean().optional(),
  })
  .passthrough();

const rowsField = z
  .array(rowSchema)
  .min(1)
  .max(300)
  .describe(
    'Các dòng đúng dạng hub_excel_doc_file trả về (sửa title/content/scheduledAt/integrationId tuỳ ý). Dòng đã qua AI chuốt đặt aiPolished=true.'
  );

const autopostView = (a: any) => ({
  id: a.id,
  ten: a.title,
  rss: a.url,
  dang_chay: a.active,
  dang_vao_gio_trong: a.onSlot,
  chi_lay_bai_moi_nhat: a.syncLast,
  them_anh: a.addPicture,
  ai_viet_lai: a.generateContent,
  mau_noi_dung: a.content || undefined,
  bai_cuoi: a.lastUrl || undefined,
  kenh: (() => {
    try {
      return JSON.parse(a.integrations || '[]').map((i: any) => i.id);
    } catch {
      return [];
    }
  })(),
});

@Injectable()
export class HubAutopostTools implements HubToolGroup {
  constructor(
    private _autopostService: AutopostService,
    private _bulkImportService: BulkImportService
  ) {}

  private async toAutopostDto(input: any) {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: { enableImplicitConversion: true },
    });
    return (await pipe.transform(input, {
      type: 'body',
      metatype: AutopostDto,
    })) as AutopostDto;
  }

  tools(): HubToolMap {
    return {
      hub_autopost_danh_sach: hubTool({
        id: 'hub_autopost_danh_sach',
        title: 'Danh sách nguồn RSS tự đăng',
        level: 'doc',
        description:
          'Các nguồn RSS autopost: link, kênh đích, đang bật hay tắt, có AI viết lại / thêm ảnh không.',
        input: z.object({}),
        run: async (_i, org) =>
          (await this._autopostService.getAutoposts(org.id)).map(autopostView),
      }),

      hub_autopost_luu: hubTool({
        id: 'hub_autopost_luu',
        title: 'Thêm / sửa nguồn RSS tự đăng',
        level: 'dang',
        openWorld: true,
        description:
          'Thêm nguồn RSS mới (bỏ trống id) hoặc sửa nguồn có sẵn (truyền id). Nguồn đang bật sẽ TỰ ĐĂNG bài mới lên các kênh đích.',
        input: z.object({
          id: z.string().optional(),
          ten: z.string().min(1),
          rss: z.string().url().describe('Link RSS công khai (https)'),
          kenh: z.array(z.string()).min(1).describe('id kênh đích'),
          dang_chay: z.boolean().default(true),
          dang_vao_gio_trong: z
            .boolean()
            .default(true)
            .describe('true: xếp vào giờ trống kế tiếp; false: đăng ngay khi có bài'),
          chi_lay_bai_moi_nhat: z.boolean().default(true),
          them_anh: z.boolean().default(true),
          ai_viet_lai: z.boolean().default(true),
          mau_noi_dung: z
            .string()
            .optional()
            .describe('Hướng dẫn viết cho AI (khi ai_viet_lai = true)'),
        }),
        run: async (input, org) => {
          const dto = await this.toAutopostDto({
            title: input.ten,
            url: input.rss,
            integrations: input.kenh.map((id) => ({ id })),
            active: input.dang_chay,
            onSlot: input.dang_vao_gio_trong,
            syncLast: input.chi_lay_bai_moi_nhat,
            addPicture: input.them_anh,
            generateContent: input.ai_viet_lai,
            content: input.mau_noi_dung || '',
          });
          if (input.id) {
            const own = (await this._autopostService.getAutoposts(org.id)).some(
              (a: any) => a.id === input.id
            );
            if (!own) throw new HubToolError('Không tìm thấy nguồn RSS này.');
          }
          const saved: any = await this._autopostService.createAutopost(
            org.id,
            dto,
            input.id
          );
          return { ok: true, id: saved?.id || input.id };
        },
      }),

      hub_autopost_bat_tat: hubTool({
        id: 'hub_autopost_bat_tat',
        title: 'Bật / tắt nguồn RSS',
        level: 'dang',
        description: 'Bật hoặc tạm dừng một nguồn RSS tự đăng.',
        input: z.object({ id: z.string(), dang_chay: z.boolean() }),
        run: async (input, org) => {
          await this._autopostService.changeActive(
            org.id,
            input.id,
            input.dang_chay
          );
          return { ok: true };
        },
      }),

      hub_autopost_xoa: hubTool({
        id: 'hub_autopost_xoa',
        title: 'Xoá nguồn RSS',
        level: 'dang',
        destructive: true,
        description: 'Xoá một nguồn RSS tự đăng (bài đã tạo trên Lịch giữ nguyên).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          await this._autopostService.deleteAutopost(org.id, input.id);
          return { ok: true };
        },
      }),

      hub_excel_doc_file: hubTool({
        id: 'hub_excel_doc_file',
        title: 'Đọc file lịch đăng Excel/CSV',
        level: 'nhap',
        openWorld: true,
        description: `Tải file lịch đăng (.xlsx hoặc .csv, link công khai, tối đa 10MB) rồi đọc thành bảng dòng: kênh, tiêu đề, nội dung, tag, link media, ngày giờ.
Cột nhận diện theo tên: Kênh | Tiêu đề | Nội dung | Tags | Link (Drive/URL) | Ngày giờ (DD/MM/YYYY HH:mm).
Hub tự khớp kênh và báo lỗi từng dòng. Bảng được lưu lại (fileId) để mở tiếp trên giao diện. CHƯA lên lịch gì cả.`,
        input: z.object({
          link_file: z.string().url(),
          ten_file: z
            .string()
            .optional()
            .describe('Tên file kèm đuôi .xlsx/.csv nếu link không có đuôi'),
        }),
        run: async (input, org) => {
          const res = await fetch(input.link_file, {
            // @ts-ignore — undici option, không có trong lib.dom
            dispatcher: ssrfSafeDispatcher,
          });
          if (!res.ok) throw new HubToolError(`Không tải được file (${res.status}).`);
          const size = Number(res.headers.get('content-length') || 0);
          if (size > MAX_FILE_BYTES) throw new HubToolError('File quá 10MB.');
          const buffer = Buffer.from(await res.arrayBuffer());
          if (buffer.length > MAX_FILE_BYTES) throw new HubToolError('File quá 10MB.');
          const urlName = new URL(input.link_file).pathname.split('/').pop() || '';
          const type = res.headers.get('content-type') || '';
          const name =
            input.ten_file ||
            (/\.(xlsx|csv)$/i.test(urlName)
              ? urlName
              : /csv/i.test(type)
              ? 'file.csv'
              : 'file.xlsx');
          const out = await this._bulkImportService.parse(org.id, buffer, name);
          return {
            fileId: out.fileId,
            so_dong: out.rows.length,
            so_dong_loi: out.rows.filter((r) => r.errors?.length).length,
            kenh_co_the_dung: out.channels,
            dong: out.rows,
          };
        },
      }),

      hub_excel_ai_chuot: hubTool({
        id: 'hub_excel_ai_chuot',
        title: 'AI chuốt các dòng lịch đăng',
        level: 'nhap',
        openWorld: true,
        description:
          'AI viết lại tiêu đề + nội dung các dòng cho hay hơn. Trả về gợi ý theo số dòng — không tự lưu; áp gợi ý vào dòng (đặt aiPolished=true) rồi hub_excel_luu_bang / hub_excel_len_lich.',
        input: z.object({ dong: rowsField }),
        run: async (input) => ({
          goi_y: await this._bulkImportService.polish(input.dong as BulkRow[]),
        }),
      }),

      hub_excel_luu_bang: hubTool({
        id: 'hub_excel_luu_bang',
        title: 'Lưu bảng lịch đăng (chưa lên lịch)',
        level: 'nhap',
        description: 'Lưu bản sửa của bảng dòng vào file đã đọc (mở lại trên giao diện vẫn thấy).',
        input: z.object({ fileId: z.string(), dong: rowsField }),
        run: async (input, org) => {
          await this._bulkImportService.saveRows(
            org.id,
            input.fileId,
            input.dong as BulkRow[]
          );
          return { ok: true };
        },
      }),

      hub_excel_len_lich: hubTool({
        id: 'hub_excel_len_lich',
        title: 'Lên lịch hàng loạt từ bảng',
        level: 'dang',
        openWorld: true,
        description:
          'Tạo bài ĐÃ LÊN LỊCH cho từng dòng (tải media từ link, đăng đúng giờ scheduledAt). Dòng thiếu kênh/giờ bị bỏ qua và báo lỗi.',
        input: z.object({
          dong: rowsField,
          fileId: z.string().optional(),
        }),
        run: async (input, org) =>
          this._bulkImportService.commit(
            org.id,
            input.dong as BulkRow[],
            input.fileId
          ),
      }),

      hub_excel_lich_su: hubTool({
        id: 'hub_excel_lich_su',
        title: 'Các file lịch đăng đã nhập',
        level: 'doc',
        description:
          'Danh sách file Excel đã nhập; truyền fileId để xem toàn bộ dòng của một file.',
        input: z.object({ fileId: z.string().optional() }),
        run: async (input, org) =>
          input.fileId
            ? (await this._bulkImportService.getFile(org.id, input.fileId)) ||
              { loi: 'Không tìm thấy file.' }
            : this._bulkImportService.listFiles(org.id),
      }),
    };
  }
}
