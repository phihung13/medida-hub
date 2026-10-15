import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ShareReportService } from '@gitroom/nestjs-libraries/database/prisma/share-stats/share-report.service';
import { UsageService } from '@gitroom/nestjs-libraries/database/prisma/usage/usage.service';

// Đặc tả v2 "ưu tiên share": báo cáo tuần + đánh dấu blog đã lên website.
@ApiTags('Share report')
@Controller('/share-report')
export class ShareReportController {
  constructor(
    private _shareReportService: ShareReportService,
    private _usageService: UsageService
  ) {}

  // GET /share-report/weekly?tu=2026-10-17T00:00:00+07:00&den=...
  @Get('/weekly')
  weekly(
    @GetOrgFromRequest() org: Organization,
    @Query('tu') tu?: string,
    @Query('den') den?: string
  ) {
    const { from, to } = this._shareReportService.range(tu, den);
    return this._shareReportService.weekly(org.id, from, to);
  }

  @Post('/blog/:id/web')
  markBlogOnWeb(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('url') url: string
  ) {
    return this._usageService.markBlogOnWeb(org.id, id, url);
  }
}
