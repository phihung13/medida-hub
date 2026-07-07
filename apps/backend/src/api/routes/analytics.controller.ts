import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

@ApiTags('Analytics')
@Controller('/analytics')
export class AnalyticsController {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}

  // GĐ4 — Tổng quan mọi kênh (kiểu Meta Business Suite). PHẢI khai báo TRƯỚC
  // route '/:integration' — NestJS khớp theo thứ tự, để sau sẽ bị nuốt.
  @Get('/overview')
  async overview(
    @GetOrgFromRequest() org: Organization,
    @Query('date') date: string
  ) {
    return this._integrationService.getAnalyticsOverview(org, date || '7');
  }

  @Get('/:integration')
  async getIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    return this._integrationService.checkAnalytics(org, integration, date);
  }

  // Bài nổi bật của kênh (kể cả bài đăng ngoài Hub) — "bài chiến thắng".
  @Get('/:integration/top-posts')
  async getTopPosts(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    return this._integrationService.getTopPosts(
      org,
      integration,
      Math.max(+date || 30, 7)
    );
  }

  // AI phân tích bài chiến thắng + gợi ý content.
  @Get('/:integration/winning-analysis')
  async winningAnalysis(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string
  ) {
    return this._integrationService.getWinningAnalysis(org, integration);
  }

  // Trợ lý AI hỏi-đáp về kênh.
  @Post('/:integration/ask')
  async ask(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Body() body: { question?: string; history?: { role: string; content: string }[] }
  ) {
    if (!body?.question?.trim()) return { answer: '' };
    return this._integrationService.askAboutChannel(
      org,
      integration,
      body.question.trim(),
      Array.isArray(body.history) ? body.history : []
    );
  }

  @Get('/post/:postId')
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    return this._postsService.checkPostAnalytics(org.id, postId, +date);
  }
}
