import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { UsageService } from '@gitroom/nestjs-libraries/database/prisma/usage/usage.service';

// Thu thập sử dụng & góp ý (chuẩn Major OS v2). Email/tên luôn lấy từ phiên
// đăng nhập ở đây — không bao giờ tin email trình duyệt tự gửi lên.
const identity = (user: User) => ({
  email: user.email || undefined,
  ten: [user.name, user.lastName].filter(Boolean).join(' ') || undefined,
});

@ApiTags('Usage')
@Controller('/usage')
export class UsageController {
  constructor(private _usageService: UsageService) {}

  @Post('/events')
  @HttpCode(200)
  events(@GetUserFromRequest() user: User, @Body() body: { events?: unknown }) {
    return this._usageService.accept(body?.events, identity(user), user.id);
  }

  @Post('/feedback')
  @HttpCode(200)
  feedback(@GetUserFromRequest() user: User, @Body() body: unknown) {
    return this._usageService.feedback(body, identity(user), user.id);
  }

  // ---- key cho Major OS: key đọc được dữ liệu của MỌI người dùng Hub nên
  // chỉ quản trị hệ thống (isSuperAdmin) được tạo / xem / thu hồi.
  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Chỉ quản trị hệ thống được quản lý key Major OS');
    }
  }

  @Get('/major-os/keys')
  listKeys(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._usageService.listKeys();
  }

  @Post('/major-os/keys')
  createKey(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._usageService.createKey(user.id);
  }

  @Delete('/major-os/keys/:id')
  async revokeKey(@GetUserFromRequest() user: User, @Param('id') id: string) {
    this.assertSuperAdmin(user);
    await this._usageService.revokeKey(id);
    return { ok: true };
  }
}
