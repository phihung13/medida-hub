import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ViralService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.service';
import {
  getViralStatus,
  setViralConfig,
} from '@gitroom/nestjs-libraries/viral/viral.keys';

// "Lò Bài Thắng": tường bài viral giáo dục → AI mổ công thức → nhân bản
// thành bản nháp vào hàng chờ duyệt. Thước đo chính: lượt share.
@ApiTags('Viral')
@Controller('/viral')
export class ViralController {
  constructor(private _service: ViralService) {}

  @Get('/')
  async list(
    @GetOrgFromRequest() org: Organization,
    @Query('platform') platform: string,
    @Query('level') level: string,
    @Query('sort') sort: string,
    @Query('status') status: string
  ) {
    const [items, stats, sources, statusCounts] = await Promise.all([
      this._service.list(org.id, { platform, level, sort, status }),
      this._service.stats(org.id),
      this._service.listSources(org.id),
      this._service.statusCounts(org.id),
    ]);
    return { items, stats, sources, statusCounts };
  }

  // "Bài của mình" — bản clone AI viết lại, chấm điểm lại.
  @Get('/mine')
  async mine(@GetOrgFromRequest() org: Organization) {
    return { items: await this._service.listClones(org.id) };
  }

  // Thao tác HÀNG LOẠT: duyệt / bỏ qua / trả về chờ / xóa mềm / xóa cứng / clone.
  @Post('/bulk')
  async bulk(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { ids?: string[]; action?: string }
  ) {
    const ids = (body.ids || []).filter(Boolean).slice(0, 300);
    if (!ids.length) throw new HttpException('Chưa chọn thẻ nào.', 400);
    switch (body.action) {
      case 'approve':
        await this._service.bulkStatus(org.id, ids, 'approved');
        return { ok: true };
      case 'skip':
        await this._service.bulkStatus(org.id, ids, 'skipped');
        return { ok: true };
      case 'pending':
        await this._service.bulkStatus(org.id, ids, 'pending');
        return { ok: true };
      case 'delete':
        await this._service.bulkSoftDelete(org.id, ids);
        return { ok: true };
      case 'hard-delete':
        await this._service.hardDelete(org.id, ids);
        return { ok: true };
      case 'clone':
        return this._service.bulkCloneToMine(org.id, ids);
      default:
        throw new HttpException('Hành động không hợp lệ.', 400);
    }
  }

  // Đăng "Bài của mình" → bản nháp trên Lịch.
  @Post('/mine/:id/post')
  async postMine(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('integrationId') integrationId: string
  ) {
    if (!integrationId) throw new HttpException('Chọn kênh đích.', 400);
    const res = await this._service.postClone(org.id, id, integrationId);
    if (!res) throw new HttpException('Không đăng được — thử lại.', 400);
    return res;
  }

  // Tạo lại "Bài của mình" (viết tốt hơn + chấm lại).
  @Post('/mine/:id/regenerate')
  async regenerateMine(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const res = await this._service.regenerateClone(org.id, id);
    if (!res) throw new HttpException('Không tạo lại được — thử lại.', 400);
    return { ok: true };
  }

  @Delete('/mine/:id')
  async deleteMine(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    await this._service.deleteClone(org.id, id);
    return { ok: true };
  }

  // Xóa TOÀN BỘ Lưu trữ khỏi DB (bỏ qua + đã xóa).
  @Post('/archive/purge')
  async purgeArchive(@GetOrgFromRequest() org: Organization) {
    const r = await this._service.hardDeleteArchive(org.id);
    return { deleted: (r as any)?.count ?? 0 };
  }

  // Thêm bài viral (link / text / ảnh chụp base64) — AI tự phân tích.
  @Post('/')
  async capture(@GetOrgFromRequest() org: Organization, @Body() body: any) {
    if (!body?.url && !body?.text && !body?.images?.length) {
      throw new HttpException('Cần link, text hoặc ảnh chụp bài viral.', 400);
    }
    return this._service.capture(org.id, body);
  }

  @Post('/:id/formula')
  async formula(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const res = await this._service.formula(org.id, id);
    if (!res) throw new HttpException('Không tìm thấy bài.', 404);
    if (!res.formula)
      throw new HttpException('AI chưa mổ được công thức — thử lại.', 400);
    return res;
  }

  @Post('/:id/clone')
  async clone(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('integrationId') integrationId: string
  ) {
    if (!integrationId) throw new HttpException('Chọn kênh đích.', 400);
    const res = await this._service.clone(org.id, id, integrationId);
    if (!res) throw new HttpException('Không nhân bản được — thử lại.', 400);
    return res;
  }

  @Delete('/:id')
  async remove(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    await this._service.delete(org.id, id);
    return { ok: true };
  }

  // Cào NGAY (nút "Cào ngay") — quét TẤT CẢ nguồn, kể cả nguồn chưa bật lịch.
  @Post('/crawl')
  async crawl(@GetOrgFromRequest() org: Organization) {
    return this._service.crawlAll(org.id, true);
  }

  // Duyệt / bỏ qua / trả về chờ duyệt một bài.
  @Post('/:id/status')
  async setStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('status') status: string
  ) {
    await this._service.setStatus(org.id, id, status);
    return { ok: true };
  }

  // Chấm lại các bài chưa có điểm (nút "Chấm điểm AI").
  @Post('/score')
  async score(@GetOrgFromRequest() org: Organization) {
    const scored = await this._service.scoreUnscored(org.id);
    return { scored };
  }

  // Cấu hình instance (token Apify trả phí, key YouTube free, chu kỳ cào) —
  // biến toàn cục → chỉ quản trị hệ thống.
  @Get('/config')
  getConfig(@GetUserFromRequest() user: User) {
    if (!user?.isSuperAdmin) return getViralStatus();
    return getViralStatus();
  }

  @Post('/config')
  setConfig(
    @GetUserFromRequest() user: User,
    @Body()
    body: {
      apifyToken?: string;
      youtubeKey?: string;
      crawlEveryHours?: number;
    }
  ) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới đổi được.', 403);
    }
    setViralConfig({
      ...(typeof body.apifyToken === 'string' ? { apifyToken: body.apifyToken } : {}),
      ...(typeof body.youtubeKey === 'string' ? { youtubeKey: body.youtubeKey } : {}),
      ...(typeof body.crawlEveryHours === 'number'
        ? { crawlEveryHours: body.crawlEveryHours }
        : {}),
    });
    return { ok: true, ...getViralStatus() };
  }

  // nguồn theo dõi
  @Post('/sources')
  createSource(@GetOrgFromRequest() org: Organization, @Body() body: any) {
    return this._service.createSource(org.id, body);
  }

  @Delete('/sources/:id')
  async deleteSource(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    await this._service.deleteSource(org.id, id);
    return { ok: true };
  }

  // Bật/tắt cào tự động theo lịch cho một nguồn.
  @Post('/sources/:id/auto')
  async setSourceAuto(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('auto') auto: boolean
  ) {
    await this._service.setSourceAuto(org.id, id, !!auto);
    return { ok: true };
  }
}
