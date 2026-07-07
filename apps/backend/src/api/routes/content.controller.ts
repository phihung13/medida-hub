import { Controller, Get, Post, Query } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ContentSyncService } from '@gitroom/nestjs-libraries/database/prisma/content/content-sync.service';

// Trang Content: gộp bài của app (Post) + bài sync từ Meta (ExternalPost) —
// gồm cả bài đăng tay/hẹn giờ NGOÀI app trên Business Suite.
@ApiTags('Content')
@Controller('/content')
export class ContentController {
  constructor(private _contentSyncService: ContentSyncService) {}

  @Get('/list')
  async list(
    @GetOrgFromRequest() org: Organization,
    @Query('type') type: 'published' | 'scheduled' | 'draft',
    @Query('integrationId') integrationId?: string
  ) {
    return this._contentSyncService.getContent(
      org.id,
      type || 'published',
      integrationId || undefined
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
