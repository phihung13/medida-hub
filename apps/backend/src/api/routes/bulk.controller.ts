import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import {
  BulkImportService,
  BulkRow,
} from '@gitroom/nestjs-libraries/database/prisma/content/bulk-import.service';

// GĐ3 — "Agent Excel": nhập file lịch đăng → duyệt → bulk lên lịch.
@ApiTags('Bulk')
@Controller('/bulk')
export class BulkController {
  constructor(private _bulkImportService: BulkImportService) {}

  @Post('/parse')
  @UseInterceptors(FileInterceptor('file'))
  async parse(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File
  ) {
    return this._bulkImportService.parse(
      org.id,
      file.buffer,
      file.originalname || 'file.xlsx'
    );
  }

  @Post('/polish')
  async polish(@Body() body: { rows: BulkRow[] }) {
    return { suggestions: await this._bulkImportService.polish(body.rows || []) };
  }

  @Post('/commit')
  async commit(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { rows: BulkRow[]; fileId?: string }
  ) {
    return this._bulkImportService.commit(
      org.id,
      body.rows || [],
      body.fileId || undefined
    );
  }

  // --- Lịch sử file (hiện ở sidebar trang Agent) ---

  @Get('/files')
  async files(@GetOrgFromRequest() org: Organization) {
    return this._bulkImportService.listFiles(org.id);
  }

  @Get('/files/:id')
  async file(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return (await this._bulkImportService.getFile(org.id, id)) || {};
  }

  // Lưu bản sửa tay của bảng duyệt (không commit) — mở lại vẫn giữ chỉnh sửa.
  @Post('/files/:id/rows')
  async saveRows(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { rows: BulkRow[] }
  ) {
    await this._bulkImportService.saveRows(org.id, id, body.rows || []);
    return { ok: true };
  }

  @Post('/files/:id/delete')
  async deleteFile(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    await this._bulkImportService.deleteFile(org.id, id);
    return { ok: true };
  }
}
