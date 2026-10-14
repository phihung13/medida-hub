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
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ViralGroupService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral-group.service';

// Tab "👥 Group FB" trên /viral: group theo dõi + bài đối tác cào + tổng hợp
// mỗi kỳ. Cả tổ chức xem được; thêm/sửa/xoá + "Làm content" là việc quản trị.
@ApiTags('Viral Groups')
@Controller('/viral-groups')
export class ViralGroupsController {
  constructor(private _service: ViralGroupService) {}

  private assertCanModerate(org: Organization) {
    const role = (org as any)?.users?.[0]?.role;
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      throw new HttpException(
        'Chỉ quản trị viên của tổ chức mới làm được thao tác này — bạn vẫn xem được mọi nội dung.',
        403
      );
    }
  }

  @Get('/')
  async overview(@GetOrgFromRequest() org: Organization) {
    const [groups, batches] = await Promise.all([
      this._service.listGroups(org.id),
      this._service.batches(org.id),
    ]);
    return { groups, batches };
  }

  // batch: id kỳ | 'open' (chưa kết kỳ) | trống = 30 ngày gần nhất
  @Get('/posts')
  posts(
    @GetOrgFromRequest() org: Organization,
    @Query('batch') batch?: string,
    @Query('group') group?: string,
    @Query('kind') kind?: string,
    @Query('topic') topic?: string,
    @Query('q') q?: string
  ) {
    return this._service.posts(org.id, { batch, group, kind, topic, q });
  }

  @Post('/groups')
  addGroup(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { url?: string; name?: string; area?: string; note?: string }
  ) {
    this.assertCanModerate(org);
    return this._service.addGroup(org.id, body || {});
  }

  @Post('/groups/:id')
  updateGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { name?: string; area?: string; note?: string; active?: boolean }
  ) {
    this.assertCanModerate(org);
    return this._service.updateGroup(org.id, id, body || {});
  }

  @Delete('/groups/:id')
  deleteGroup(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    this.assertCanModerate(org);
    return this._service.deleteGroup(org.id, id);
  }

  @Post('/posts/:id/to-content')
  toContent(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    this.assertCanModerate(org);
    return this._service.toContent(org.id, id);
  }

  @Delete('/posts/:id')
  deletePost(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    this.assertCanModerate(org);
    return this._service.deletePost(org.id, id);
  }

  @Delete('/batches/:id')
  deleteBatch(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    this.assertCanModerate(org);
    return this._service.deleteBatch(org.id, id);
  }
}
