import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { UsageService } from '@gitroom/nestjs-libraries/usage/usage.service';

// Thu thập sử dụng & góp ý (chuẩn Major OS v1). Email/tên luôn lấy từ phiên
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
    return this._usageService.feedback(body, identity(user));
  }
}
