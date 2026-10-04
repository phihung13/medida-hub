import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ReportQuery,
  UsageService,
} from '@gitroom/nestjs-libraries/database/prisma/usage/usage.service';

// ============================================================================
//  API báo cáo CHỈ ĐỌC cho Major OS (chuẩn "Kết nối app với Major OS" v2).
//  Không qua đăng nhập Hub: xác thực bằng `Authorization: Bearer <key>` do
//  quản trị hệ thống tạo ở Cài đặt → Kết nối Major OS. Đường dẫn công khai:
//  https://<hub>/api/major-os/v1/... (nginx bỏ tiền tố /api).
//  Mô tả đầy đủ gửi Major OS: apps/frontend/public/major-os-mo-ta.md
// ============================================================================

@ApiTags('Major OS')
@Controller('/major-os/v1')
export class MajorOsReportController {
  constructor(private _usageService: UsageService) {}

  @Get('/tinh-nang')
  async features(
    @Headers('authorization') auth: string,
    @Query() query: ReportQuery
  ) {
    await this._usageService.verifyKey(auth);
    return this._usageService.featureReport(query);
  }

  @Get('/thoi-gian-dung')
  async daily(
    @Headers('authorization') auth: string,
    @Query() query: ReportQuery
  ) {
    await this._usageService.verifyKey(auth);
    return this._usageService.dailyReport(query);
  }

  @Get('/gop-y')
  async feedback(
    @Headers('authorization') auth: string,
    @Query() query: ReportQuery
  ) {
    await this._usageService.verifyKey(auth);
    return this._usageService.feedbackReport(query);
  }
}
