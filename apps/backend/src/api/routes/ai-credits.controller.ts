import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { AiCreditService } from '@gitroom/nestjs-libraries/database/prisma/ai-credits/ai.credit.service';

// Dashboard theo dõi credit/số dư các công cụ AI ngoài (HeyGen tự lấy, còn lại
// nhập tay) + cảnh báo ngưỡng. KHÔNG trả apiKey thật về client.
@ApiTags('AiCredits')
@Controller('/ai-credits')
export class AiCreditsController {
  constructor(private _service: AiCreditService) {}

  private mask(row: any) {
    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      hasKey: !!row.apiKey,
      balance: row.balance,
      unit: row.unit,
      threshold: row.threshold,
      auto: row.auto,
      supportsAuto: this._service.supportsAuto(row.provider),
      lastChecked: row.lastChecked,
      lastError: row.lastError,
    };
  }

  @Get('/')
  async list(@GetOrgFromRequest() org: Organization) {
    const rows = await this._service.list(org.id);
    return { items: rows.map((r) => this.mask(r)) };
  }

  @Post('/')
  async create(
    @GetOrgFromRequest() org: Organization,
    @Body() body: any
  ) {
    const row = await this._service.save(org.id, body);
    return this.mask(row);
  }

  @Put('/:id')
  async update(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: any
  ) {
    const row = await this._service.save(org.id, body, id);
    if (!row) throw new HttpException('Không tìm thấy.', 404);
    return this.mask(row);
  }

  @Delete('/:id')
  async remove(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    await this._service.delete(org.id, id);
    return { ok: true };
  }

  @Post('/:id/refresh')
  async refresh(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const res = await this._service.refresh(org.id, id);
    if (res === null) throw new HttpException('Không tìm thấy.', 404);
    return res;
  }
}
