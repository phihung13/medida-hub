import { Controller, Get, Post, Query } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ContentSyncService } from '@gitroom/nestjs-libraries/database/prisma/content/content-sync.service';

// Sync bài từ Meta (ExternalPost) — gồm bài đăng tay/hẹn giờ NGOÀI app trên
// Business Suite — phục vụ LỚP PHỦ chỉ-đọc trên Calendar. (Trang /content
// riêng đã bỏ theo quyết định user — calendar là nguồn nhìn duy nhất.)
@ApiTags('Content')
@Controller('/content')
export class ContentController {
  constructor(private _contentSyncService: ContentSyncService) {}

  @Get('/calendar')
  async calendar(
    @GetOrgFromRequest() org: Organization,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return this._contentSyncService.getCalendarItems(
      org.id,
      startDate,
      endDate
    );
  }

  @Post('/sync')
  async sync(
    @GetOrgFromRequest() org: Organization,
    @Query('force') force?: string
  ) {
    return this._contentSyncService.syncOrganization(org.id, force === 'true');
  }
}
