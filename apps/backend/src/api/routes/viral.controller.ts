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
  saveBgm,
  deleteBgm,
} from '@gitroom/nestjs-libraries/viral/viral.keys';
import {
  listSkills,
  setSkill,
  resetSkill,
} from '@gitroom/nestjs-libraries/viral/viral.skills';

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

  // ── CHỦ ĐỀ (đơn vị chính): cụm nhiều nguồn cùng nói → 1 content tổng hợp ───
  @Get('/topics')
  async topics(
    @GetOrgFromRequest() org: Organization,
    @Query('sort') sort: string,
    @Query('status') status: string
  ) {
    const [topics, counts, stats, sources] = await Promise.all([
      this._service.listTopics(org.id, { sort, status }),
      this._service.topicStatusCounts(org.id),
      this._service.stats(org.id),
      this._service.listSources(org.id),
    ]);
    return { topics, counts, stats, sources };
  }

  @Get('/topics/:id')
  async topicDetail(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const res = await this._service.topicDetail(org.id, id);
    if (!res) throw new HttpException('Không tìm thấy chủ đề.', 404);
    return res;
  }

  // Duyệt / bỏ qua / trả về chờ / xóa hàng loạt chủ đề.
  @Post('/topics/bulk')
  async topicsBulk(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { ids?: string[]; action?: string }
  ) {
    const ids = (body.ids || []).filter(Boolean).slice(0, 300);
    if (!ids.length) throw new HttpException('Chưa chọn chủ đề nào.', 400);
    const map: Record<string, string> = {
      approve: 'approved',
      skip: 'skipped',
      pending: 'pending',
      delete: 'delete',
    };
    const target = map[body.action || ''];
    if (!target) throw new HttpException('Hành động không hợp lệ.', 400);
    await this._service.bulkTopicStatus(org.id, ids, target);
    return { ok: true };
  }

  // Viết lại 1 chủ đề thành "Bài của mình" (đưa vào hàng Chờ đăng).
  @Post('/topics/:id/clone')
  async topicClone(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const res = await this._service.cloneTopic(org.id, id);
    if (!res) throw new HttpException('Không viết lại được — thử lại.', 400);
    return res;
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
      minimaxKey?: string;
      minimaxGroupId?: string;
      reportZaloThreadId?: string;
      clusterMode?: 'ai' | 'embeddings';
      convergenceMin?: number;
      clusterThreshold?: number;
      autoApproveMin?: number;
      autoSkipMax?: number;
      rewriteMaxRounds?: number;
      autoProduce?: boolean;
    }
  ) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới đổi được.', 403);
    }
    setViralConfig({
      ...(typeof body.apifyToken === 'string' ? { apifyToken: body.apifyToken } : {}),
      ...(typeof body.youtubeKey === 'string' ? { youtubeKey: body.youtubeKey } : {}),
      ...(typeof body.minimaxKey === 'string' ? { minimaxKey: body.minimaxKey } : {}),
      ...(typeof body.minimaxGroupId === 'string'
        ? { minimaxGroupId: body.minimaxGroupId }
        : {}),
      ...(typeof body.reportZaloThreadId === 'string'
        ? { reportZaloThreadId: body.reportZaloThreadId }
        : {}),
      ...(typeof body.crawlEveryHours === 'number'
        ? { crawlEveryHours: body.crawlEveryHours }
        : {}),
      ...(body.clusterMode === 'ai' || body.clusterMode === 'embeddings'
        ? { clusterMode: body.clusterMode }
        : {}),
      ...(typeof body.convergenceMin === 'number'
        ? { convergenceMin: body.convergenceMin }
        : {}),
      ...(typeof body.clusterThreshold === 'number'
        ? { clusterThreshold: body.clusterThreshold }
        : {}),
      ...(typeof body.autoApproveMin === 'number'
        ? { autoApproveMin: body.autoApproveMin }
        : {}),
      ...(typeof body.autoSkipMax === 'number'
        ? { autoSkipMax: body.autoSkipMax }
        : {}),
      ...(typeof body.rewriteMaxRounds === 'number'
        ? { rewriteMaxRounds: body.rewriteMaxRounds }
        : {}),
      ...(typeof body.autoProduce === 'boolean'
        ? { autoProduce: body.autoProduce }
        : {}),
    });
    return { ok: true, ...getViralStatus() };
  }

  // Tạo bản tin tuần NGAY (không đợi lịch T2-4-6/CN) — lưu tab 📰 + gửi 3 kênh.
  @Post('/report/test')
  async testReport(@GetOrgFromRequest() org: Organization) {
    return this._service.sendWeeklyReport(org.id, 'manual');
  }

  // Danh sách bản tin đã tạo (tab 📰 Bản tin).
  @Get('/reports')
  async reports(@GetOrgFromRequest() org: Organization) {
    return { items: await this._service.listReports(org.id) };
  }

  @Delete('/reports/:id')
  async deleteReport(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    await this._service.deleteReport(org.id, id);
    return { ok: true };
  }

  // Nhạc nền podcast: upload mp3 (base64) / xoá — lưu CONFIG_DIR, bền Docker.
  @Post('/config/bgm')
  setBgm(
    @GetUserFromRequest() user: User,
    @Body() body: { base64?: string }
  ) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới đổi được.', 403);
    }
    const b64 = String(body?.base64 || '');
    if (!b64) throw new HttpException('Thiếu file nhạc.', 400);
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 10000 || buf.length > 30 * 1024 * 1024) {
      throw new HttpException('File nhạc phải là mp3, 10KB–30MB.', 400);
    }
    saveBgm(buf);
    return { ok: true, ...getViralStatus() };
  }

  @Delete('/config/bgm')
  removeBgm(@GetUserFromRequest() user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới đổi được.', 403);
    }
    deleteBgm();
    return { ok: true, ...getViralStatus() };
  }

  // ── SẢN XUẤT: blog / infographic / podcast từ bài đã duyệt ────────────────
  @Post('/produce')
  async produce(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { ids?: string[]; source?: string; formats?: string[]; bgm?: boolean }
  ) {
    const res = await this._service
      .produce(org.id, body)
      .catch((e) => {
        throw new HttpException(String(e?.message || 'Không tạo được job.'), 400);
      });
    if (!res.queued) {
      throw new HttpException('Chưa chọn bài hoặc định dạng hợp lệ.', 400);
    }
    return res;
  }

  @Get('/products')
  async products(@GetOrgFromRequest() org: Organization) {
    return { items: await this._service.listProducts(org.id) };
  }

  @Post('/products/:id/retry')
  async retryProduct(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const ok = await this._service.retryProduct(org.id, id);
    if (!ok) throw new HttpException('Không tìm thấy sản phẩm.', 404);
    return { ok: true };
  }

  // Blog → .docx (base64) — frontend tự tạo file tải về.
  @Get('/products/:id/docx')
  async productDocx(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const out = await this._service.productDocx(org.id, id);
    if (!out) throw new HttpException('Sản phẩm không phải blog hoặc chưa xong.', 404);
    return out;
  }

  @Delete('/products/:id')
  async deleteProduct(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    await this._service.deleteProduct(org.id, id);
    return { ok: true };
  }

  // ── KHO SKILL (tab 🧪 Công thức AI): xem / sửa / reset về mặc định ────────
  @Get('/skills')
  listSkills() {
    return { items: listSkills() };
  }

  @Post('/skills/:key')
  saveSkill(
    @GetUserFromRequest() user: User,
    @Param('key') key: string,
    @Body('content') content: string
  ) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới sửa được công thức.', 403);
    }
    if (typeof content !== 'string' || content.length > 60000) {
      throw new HttpException('Nội dung không hợp lệ (tối đa 60.000 ký tự).', 400);
    }
    if (!setSkill(key, content)) {
      throw new HttpException('Không có công thức này.', 404);
    }
    return { ok: true };
  }

  @Delete('/skills/:key')
  resetSkillToDefault(
    @GetUserFromRequest() user: User,
    @Param('key') key: string
  ) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới sửa được công thức.', 403);
    }
    if (!resetSkill(key)) throw new HttpException('Không có công thức này.', 404);
    return { ok: true };
  }

  // 8 chân dung khách hàng (persona động — AI tự làm giàu sau mỗi lần cào).
  @Get('/personas')
  async personas(@GetOrgFromRequest() org: Organization) {
    return { items: await this._service.listPersonas(org.id) };
  }

  // nguồn theo dõi
  @Post('/sources')
  createSource(@GetOrgFromRequest() org: Organization, @Body() body: any) {
    return this._service.createSource(org.id, body);
  }

  // Nhập bộ nguồn mặc định (KOL/đối thủ/group từ workflow n8n + 10 keyword
  // Google News) — bỏ qua nguồn trùng.
  @Post('/sources/import-defaults')
  async importDefaultSources(@GetOrgFromRequest() org: Organization) {
    const added = await this._service.importDefaultSources(org.id);
    return { added };
  }

  @Delete('/sources/:id')
  async deleteSource(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    await this._service.deleteSource(org.id, id);
    return { ok: true };
  }

  // Đổi loại nguồn (kol | school | group | news | other) — school+kol = đối thủ
  // (tính vào mục "động tĩnh đối thủ" của bản tin tuần).
  @Post('/sources/:id/type')
  async setSourceType(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('type') type: string
  ) {
    await this._service.setSourceType(org.id, id, type);
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
