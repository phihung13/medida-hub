import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { McpKeyService } from '@gitroom/nestjs-libraries/database/prisma/mcp-keys/mcp-key.service';

// Khoá MCP riêng (Settings → Kết nối agent MCP). Khoá điều khiển được cả tổ
// chức nên chỉ quản trị viên tổ chức được tạo / xem / thu hồi. org.users[0] là
// membership của chính user đang gọi (auth.middleware chỉ include đúng user đó).
@ApiTags('MCP keys')
@Controller('/mcp-keys')
export class McpKeysController {
  constructor(private _mcpKeyService: McpKeyService) {}

  private assertAdmin(org: Organization) {
    const role = (org as any)?.users?.[0]?.role;
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      throw new ForbiddenException(
        'Chỉ quản trị viên của tổ chức được quản lý khoá MCP.'
      );
    }
  }

  @Get('/')
  list(@GetOrgFromRequest() org: Organization) {
    this.assertAdmin(org);
    return this._mcpKeyService.listKeys(org.id);
  }

  @Post('/')
  create(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { name?: string; level?: string }
  ) {
    this.assertAdmin(org);
    return this._mcpKeyService.createKey(org.id, user.id, body);
  }

  @Delete('/:id')
  async revoke(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    this.assertAdmin(org);
    await this._mcpKeyService.revokeKey(org.id, id);
    return { ok: true };
  }
}
