import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ViralGroupService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral-group.service';

// Cổng cho ĐỐI TÁC CÀO GROUP FACEBOOK (Claude) — xác thực API key org như
// /public/v1/viral. Mỗi kỳ: GET danh sách group → POST từng bài → POST /finish
// kèm chủ đề hot + câu hỏi nhiều người hỏi. Bài ở đây KHÔNG vào phễu content.
@ApiTags('Public Viral Groups')
@Controller('/public/v1/viral/groups')
export class PublicViralGroupsController {
  constructor(private _service: ViralGroupService) {}

  // Danh sách group đang bật — nguồn sự thật để biết kỳ này cào group nào.
  @Get('/')
  async groups(@GetOrgFromRequest() org: Organization) {
    const groups = await this._service.listGroups(org.id, true);
    return {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        url: g.url,
        area: g.area,
        note: g.note,
        lastCrawledAt: g.lastCrawledAt,
      })),
    };
  }

  // Đăng ký group (trùng link thì cập nhật tên/khu vực, không tạo bản 2).
  @Post('/')
  async addGroup(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { url?: string; name?: string; area?: string; note?: string }
  ) {
    const g = await this._service.addGroup(org.id, body || {});
    return { id: g.id, name: g.name, url: g.url };
  }

  // 1 bài. Bắt buộc: groupUrl + text. Nên có: url (permalink), groupName,
  // topic (nhãn chủ đề ngắn), kind (hoi|chia_se|review|phan_nan|khac),
  // likes/comments/shares, postedAt (ISO), topComments[] (≤5).
  @Post('/posts')
  capture(@GetOrgFromRequest() org: Organization, @Body() body: any) {
    return this._service.capture(org.id, body || {});
  }

  // Kết kỳ — gom bài chưa thuộc kỳ nào (4 ngày gần nhất) thành 1 kỳ. Có thể
  // gửi kèm summary, hotTopics[], askedTopics[] ({topic, posts, comments,
  // groups[], urls[], note}); thiếu thì Hub tự đếm theo nhãn topic của bài.
  @Post('/finish')
  finish(@GetOrgFromRequest() org: Organization, @Body() body: any) {
    return this._service.finish(org.id, body || {});
  }
}
