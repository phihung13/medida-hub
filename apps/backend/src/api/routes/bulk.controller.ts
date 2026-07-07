import {
  Body,
  Controller,
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
    @Body() body: { rows: BulkRow[] }
  ) {
    return this._bulkImportService.commit(org.id, body.rows || []);
  }
}
