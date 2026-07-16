import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { Injectable } from '@nestjs/common';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { Organization, ShortLinkPreference } from '@prisma/client';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';

@Injectable()
export class OrganizationService {
  constructor(
    private _organizationRepository: OrganizationRepository,
    private _notificationsService: NotificationService
  ) {}
  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & { providerId?: string },
    ip: string,
    userAgent: string
  ) {
    return this._organizationRepository.createOrgAndUser(
      body,
      this._notificationsService.hasEmailProvider(),
      ip,
      userAgent
    );
  }

  async getCount() {
    return this._organizationRepository.getCount();
  }

  async createMaxUser(id: string, name: string, saasName: string, email: string) {
    return this._organizationRepository.createMaxUser(id, name, saasName, email);
  }

  addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: 'USER' | 'ADMIN'
  ) {
    return this._organizationRepository.addUserToOrg(userId, id, orgId, role);
  }

  getOrgById(id: string) {
    return this._organizationRepository.getOrgById(id);
  }

  getOrgByApiKey(api: string) {
    return this._organizationRepository.getOrgByApiKey(api);
  }

  getUserOrg(id: string) {
    return this._organizationRepository.getUserOrg(id);
  }

  getOrgsByUserId(userId: string) {
    return this._organizationRepository.getOrgsByUserId(userId);
  }

  updateApiKey(orgId: string) {
    return this._organizationRepository.updateApiKey(orgId);
  }

  getTeam(orgId: string) {
    return this._organizationRepository.getTeam(orgId);
  }

  // Gộp mọi tài khoản về 1 tổ chức — chi tiết & lý do xem repository.
  mergeAllUsersIntoOrg(targetOrgId: string) {
    return this._organizationRepository.mergeAllUsersIntoOrg(targetOrgId);
  }

  // Đổi vai Member ↔ Admin. Luật: chỉ CHỦ tổ chức (role SUPERADMIN) đổi được,
  // không tự đổi mình, không đụng vào SUPERADMIN khác (chủ chỉ đổi qua
  // "chuyển giao" bên dưới). Trả null nếu vi phạm — controller báo 400.
  async changeMemberRole(
    org: Organization,
    callerId: string,
    targetUserId: string,
    role: 'USER' | 'ADMIN'
  ) {
    const myRole = (org as any).users?.[0]?.role;
    if (myRole !== 'SUPERADMIN' || targetUserId === callerId) {
      return null;
    }
    const target = await this._organizationRepository.getMembership(
      org.id,
      targetUserId
    );
    // target.disabled: nâng người đang bị tắt là no-op câm (auth.middleware
    // vẫn lọc họ ra) — chặn cho khớp transferSuperAdmin bên dưới.
    if (
      !target ||
      target.disabled ||
      target.role === 'SUPERADMIN' ||
      target.role === role
    ) {
      return null;
    }
    return this._organizationRepository.updateMemberRole(
      org.id,
      targetUserId,
      role
    );
  }

  // Chuyển giao CHỦ tổ chức: người nhận lên SUPERADMIN, người trao xuống
  // ADMIN (vẫn duyệt/sản xuất được, chỉ thôi quản chuyện thành viên).
  // LƯU Ý: cờ isSuperAdmin (quản trị HỆ THỐNG: key AI, cấu hình instance) là
  // thuộc tính của User, KHÔNG đổi theo — đổi cờ đó là việc DB, làm riêng.
  async transferSuperAdmin(
    org: Organization,
    callerId: string,
    targetUserId: string
  ) {
    const myRole = (org as any).users?.[0]?.role;
    if (myRole !== 'SUPERADMIN' || targetUserId === callerId) {
      return null;
    }
    const target = await this._organizationRepository.getMembership(
      org.id,
      targetUserId
    );
    if (!target || target.disabled) {
      return null;
    }
    // transferSuperAdmin ném khi thua race (chủ đã bị hạ ở request song song
    // khác) — nuốt để controller trả 400 "không chuyển được" thay vì 500.
    try {
      return await this._organizationRepository.transferSuperAdmin(
        org.id,
        callerId,
        targetUserId
      );
    } catch {
      return null;
    }
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    return this._organizationRepository.setStreak(organizationId, type);
  }

  getOrgByCustomerId(customerId: string) {
    return this._organizationRepository.getOrgByCustomerId(customerId);
  }

  // origin: địa chỉ admin đang truy cập (tunnel/LAN) — để link mở được từ xa,
  // KHÔNG kẹt localhost. Chỉ nhận origin http(s) hợp lệ, còn lại fallback env.
  private safeBase(origin?: string) {
    const o = (origin || '').trim();
    if (/^https?:\/\/[^\s]+$/i.test(o)) return o.replace(/\/+$/, '');
    return process.env.FRONTEND_URL || '';
  }

  async inviteTeamMember(
    orgId: string,
    body: AddTeamMemberDto,
    origin?: string
  ) {
    const timeLimit = dayjs().add(2, 'day').format('YYYY-MM-DD HH:mm:ss');
    const id = makeId(5);
    const url =
      this.safeBase(origin) +
      `/?org=${AuthService.signJWT({ ...body, orgId, timeLimit, id })}`;
    if (body.sendEmail) {
      await this._notificationsService.sendEmail(
        body.email,
        'You have been invited to join an organization',
        `You have been invited to join an organization. Click <a href="${url}">here</a> to join.<br />The link will expire in 2 days.`
      );
    }
    return { url };
  }

  // Admin đặt lại mật khẩu cho 1 thành viên: sinh link đặt mật khẩu (dùng đúng
  // token mà /auth/forgot/<token> + /forgot-return chấp nhận) để admin đưa cho
  // người đó. KHÔNG cần email. Verify userId đúng là thành viên org trước.
  async generateMemberResetLink(
    org: Organization,
    userId: string,
    origin?: string
  ) {
    const userOrgs = await this._organizationRepository.getOrgsByUserId(userId);
    const target = userOrgs.find((o) => o.id === org.id);
    if (!target) {
      return null;
    }
    // Chỉ được đặt lại mật khẩu cho người CẤP THẤP HƠN HẲN mình (khớp UI
    // canManage = myLevel > level). Không có rào này thì — vì CheckPolicies
    // vô hiệu trên self-host thiếu Stripe — một Member trong org chung có thể
    // xin link reset của chính superadmin và chiếm tài khoản.
    const level = (r?: string) => (r === 'SUPERADMIN' ? 2 : r === 'ADMIN' ? 1 : 0);
    if (level((org as any).users?.[0]?.role) <= level(target.users[0]?.role)) {
      return null;
    }
    const token = AuthService.signJWT({
      id: userId,
      expires: dayjs().add(2, 'day').format('YYYY-MM-DD HH:mm:ss'),
    });
    return { url: `${this.safeBase(origin)}/login/forgot/${token}` };
  }

  isUserOnlyInSoloOrgs(userId: string) {
    return this._organizationRepository.isUserOnlyInSoloOrgs(userId);
  }

  async deleteTeamMember(org: Organization, userId: string) {
    const userOrgs = await this._organizationRepository.getOrgsByUserId(userId);
    const findOrgToDelete = userOrgs.find((orgUser) => orgUser.id === org.id);
    if (!findOrgToDelete) {
      throw new Error('User is not part of this organization');
    }

    // @ts-ignore
    const myRole = org.users[0].role;
    const userRole = findOrgToDelete.users[0].role;
    const myLevel = myRole === 'USER' ? 0 : myRole === 'ADMIN' ? 1 : 2;
    const userLevel = userRole === 'USER' ? 0 : userRole === 'ADMIN' ? 1 : 2;

    // CẤP CAO HƠN HẲN mới xoá được (khớp UI canManage = myLevel > level):
    // chặn cả ngang cấp — không thì sau khi gộp org, một Member xoá được
    // Member khác (0 < 0 = false lọt qua bản cũ).
    if (myLevel <= userLevel) {
      throw new Error('You do not have permission to delete this user');
    }

    await this._organizationRepository.deleteTeamMember(org.id, userId);
    // "Rời team" không được biến thành "khoá khỏi cả app". Sau khi gộp tài
    // khoản, org cá nhân tự sinh của người này đã bị TẮT; xoá họ khỏi org chung
    // là hết membership enabled → 403 toàn app. Bật lại một membership khác để
    // họ rơi về org cá nhân như thiết kế gốc Postiz.
    await this._organizationRepository
      .ensureAnyEnabledMembership(userId)
      .catch(() => null);
    return { ok: true };
  }

  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._organizationRepository.disableOrEnableNonSuperAdminUsers(
      orgId,
      disable
    );
  }

  getShortlinkPreference(orgId: string) {
    return this._organizationRepository.getShortlinkPreference(orgId);
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organizationRepository.updateShortlinkPreference(
      orgId,
      shortlink
    );
  }
}
