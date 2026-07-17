import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { ShortlinkPreferenceDto } from '@gitroom/nestjs-libraries/dtos/settings/shortlink-preference.dto';
import { ApiTags } from '@nestjs/swagger';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  getSocialKeysStatus,
  setSocialKeys,
  SocialKeyStatus,
} from '@gitroom/nestjs-libraries/keys/social.keys';
import {
  getEmailStatus,
  setEmailConfig,
  EmailConfig,
} from '@gitroom/nestjs-libraries/emails/email.config';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';

@ApiTags('Settings')
@Controller('/settings')
export class SettingsController {
  constructor(
    private _organizationService: OrganizationService,
    private _notificationService: NotificationService
  ) {}

  // @CheckPolicies KHÔNG chặn gì trên self-host thiếu Stripe (permissions
  // .service cấp mọi quyền khi !STRIPE_PUBLISHABLE_KEY) → các thao tác quản
  // lý thành viên phải chốt role tường minh. org.users[0] = membership của
  // CHÍNH user đang gọi (auth.middleware chỉ include đúng user đó).
  private assertOrgAdmin(org: Organization) {
    const role = (org as any)?.users?.[0]?.role;
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      throw new HttpException(
        'Chỉ quản trị viên của tổ chức mới quản lý được thành viên.',
        403
      );
    }
  }

  @Get('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async getTeam(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getTeam(org.id);
  }

  @Post('/team')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async inviteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AddTeamMemberDto,
    @Body('origin') origin: string
  ) {
    this.assertOrgAdmin(org);
    return this._organizationService.inviteTeamMember(org.id, body, origin);
  }

  // Admin đặt lại mật khẩu cho 1 thành viên → trả link để copy (không email).
  @Post('/team/:id/reset-password')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async resetMemberPassword(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('origin') origin: string
  ) {
    this.assertOrgAdmin(org);
    const res = await this._organizationService.generateMemberResetLink(
      org,
      id,
      origin
    );
    if (!res) {
      throw new HttpException('Không tìm thấy thành viên trong tổ chức.', 404);
    }
    return res;
  }

  @Delete('/team/:id')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  deleteTeamMember(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    this.assertOrgAdmin(org);
    return this._organizationService.deleteTeamMember(org, id);
  }

  // Đổi vai Member ↔ Admin cho một thành viên. Luật ở organization.service
  // .changeMemberRole (chỉ CHỦ tổ chức — role SUPERADMIN — đổi được).
  @Post('/team/:id/role')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async changeMemberRole(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body('role') role: string
  ) {
    if (role !== 'USER' && role !== 'ADMIN') {
      throw new HttpException('Vai không hợp lệ.', 400);
    }
    const res = await this._organizationService.changeMemberRole(
      org,
      user.id,
      id,
      role
    );
    if (!res) {
      throw new HttpException(
        'Không đổi được vai — chỉ CHỦ tổ chức đổi được, không tự đổi mình, không đụng chủ khác.',
        400
      );
    }
    return { ok: true };
  }

  // Chuyển giao CHỦ tổ chức (SUPERADMIN) cho một thành viên khác; người trao
  // xuống ADMIN. Cờ quản trị HỆ THỐNG (isSuperAdmin — key AI, cấu hình) không
  // đổi theo. Luật ở organization.service.transferSuperAdmin.
  @Post('/team/:id/transfer-superadmin')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.TEAM_MEMBERS],
    [AuthorizationActions.Create, Sections.ADMIN]
  )
  async transferSuperAdmin(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    const res = await this._organizationService.transferSuperAdmin(
      org,
      user.id,
      id
    );
    if (!res) {
      throw new HttpException(
        'Không chuyển được — chỉ CHỦ tổ chức chuyển được, người nhận phải là thành viên đang hoạt động.',
        400
      );
    }
    return { ok: true };
  }

  // Gộp MỌI tài khoản của instance về tổ chức của super admin đang bấm — chữa
  // cảnh "tự đăng ký sinh org riêng, vào /viral thấy kho rỗng". Chi tiết thuật
  // toán ở organization.repository.mergeAllUsersIntoOrg. Chỉ super admin: đây
  // là thao tác TOÀN INSTANCE (đụng membership của mọi org), không phải việc
  // của admin một tổ chức.
  @Post('/team/merge-all')
  async mergeAllUsers(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User
  ) {
    this.assertSuperAdmin(user);
    return this._organizationService.mergeAllUsersIntoOrg(org.id);
  }

  @Get('/shortlink')
  async getShortlinkPreference(@GetOrgFromRequest() org: Organization) {
    return this._organizationService.getShortlinkPreference(org.id);
  }

  @Post('/shortlink')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateShortlinkPreference(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ShortlinkPreferenceDto
  ) {
    return this._organizationService.updateShortlinkPreference(
      org.id,
      body.shortlink
    );
  }

  // ==== OAuth keys các kênh — nhập từ UI Settings (ghi .env + hiệu lực ngay) ====
  // OAuth key ghi vào .env TOÀN CỤC instance → chỉ super admin được xem/đổi.
  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới đổi được cấu hình này.', 403);
    }
  }

  @Get('/social-keys')
  getSocialKeys(@GetUserFromRequest() user: User): SocialKeyStatus {
    this.assertSuperAdmin(user);
    return getSocialKeysStatus();
  }

  @Post('/social-keys')
  saveSocialKeys(
    @GetUserFromRequest() user: User,
    @Body() body: { vars?: Record<string, string> }
  ): {
    ok: boolean;
    saved: string[];
  } {
    this.assertSuperAdmin(user);
    return setSocialKeys(body?.vars || {});
  }

  // ==== Cấu hình GỬI EMAIL (Gmail/SMTP hoặc Resend) — nhập từ UI, ăn ngay ====
  @Get('/email-config')
  getEmailConfig(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return getEmailStatus();
  }

  @Post('/email-config')
  saveEmailConfig(
    @GetUserFromRequest() user: User,
    @Body() body: Partial<EmailConfig>
  ) {
    this.assertSuperAdmin(user);
    setEmailConfig(body || {});
    return { ok: true, ...getEmailStatus() };
  }

  // Gửi email THỬ tới chính mình (hoặc địa chỉ nhập) để kiểm cấu hình.
  @Post('/email-config/test')
  async testEmailConfig(
    @GetUserFromRequest() user: User,
    @Body() body: { to?: string }
  ) {
    this.assertSuperAdmin(user);
    const to = (body?.to || (user as any)?.email || '').trim();
    if (!to) throw new HttpException('Thiếu địa chỉ email để gửi thử.', 400);
    if (!this._notificationService.hasEmailProvider()) {
      throw new HttpException('Chưa cấu hình nhà gửi email (điền + Lưu trước).', 400);
    }
    const ok = await this._notificationService.sendReportEmail(
      to,
      'Email thử — Media Hub',
      '<p>Nếu bạn nhận được email này thì cấu hình gửi email đã hoạt động. 🎉</p>'
    );
    if (!ok) {
      throw new HttpException(
        'Gửi thử THẤT BẠI — kiểm lại host/cổng/tài khoản/mật khẩu ứng dụng.',
        400
      );
    }
    return { ok: true, to };
  }
}
