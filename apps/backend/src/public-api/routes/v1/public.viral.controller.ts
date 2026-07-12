import { Body, Controller, Get, HttpException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ViralService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.service';

// Cổng cho ĐỐI TÁC CÀO (Claude Cowork) — xác thực bằng API key của org
// (PublicAuthMiddleware, header Authorization). Giao thức 3 bước mỗi kỳ:
// POST từng bài thô → POST /finish kết mẻ → GET đối chiếu số liệu phễu.
@ApiTags('Public Viral')
@Controller('/public/v1/viral')
export class PublicViralController {
  constructor(private _viralService: ViralService) {}

  // Nhận 1 bài thô. Trả {id} khi nhận, {duplicated:true} khi URL đã thấy rồi.
  @Post('/')
  async capture(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body: {
      url?: string;
      text?: string;
      images?: { base64: string; mediaType: string }[];
      platform?: string;
      level?: string;
    }
  ) {
    if (!body?.url && !body?.text && !body?.images?.length) {
      throw new HttpException('Cần url, text hoặc images (base64).', 400);
    }
    const images = (body.images || []).slice(0, 4);
    if (images.some((i) => String(i?.base64 || '').length > 4_200_000)) {
      throw new HttpException('Ảnh quá lớn — mỗi ảnh tối đa ~3MB.', 400);
    }
    const level = ['mn', 'th', 'cs', 'pt', 'all'].includes(body.level || '')
      ? body.level
      : 'all';
    return this._viralService.capturePartner(org.id, {
      url: body.url,
      text: body.text,
      images,
      platform: body.platform,
      level,
    });
  }

  // Kết mẻ — gọi đúng 1 lần sau bài cuối. Trả về ngay, pipeline (cào RSS/News
  // nội bộ → gom cụm chung → chấm điểm → bản tin) chạy nền vài phút.
  @Post('/finish')
  finish(@GetOrgFromRequest() org: Organization) {
    this._viralService.finishPartnerBatch(org.id).catch(() => null);
    return {
      ok: true,
      note: 'Đã nhận tín hiệu kết mẻ — đang cào RSS/News + gom cụm + chấm điểm nền. Gọi GET /public/v1/viral sau vài phút để đối chiếu.',
    };
  }

  // Số liệu phễu để đối tác đối chiếu log sau mỗi mẻ.
  @Get('/')
  async status(@GetOrgFromRequest() org: Organization) {
    const [posts, topics, stats] = await Promise.all([
      this._viralService.statusCounts(org.id),
      this._viralService.topicStatusCounts(org.id),
      this._viralService.stats(org.id),
    ]);
    return { posts, topics, stats };
  }
}
