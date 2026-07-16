import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Role, ShortLinkPreference, SubscriptionTier } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class OrganizationRepository {
  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _userOrg: PrismaRepository<'userOrganization'>,
    private _user: PrismaRepository<'user'>
  ) {}

  createMaxUser(id: string, name: string, saasName: string, email: string) {
    return this._organization.model.organization.create({
      select: {
        id: true,
        apiKey: true,
      },
      data: {
        name: name ? `${name}###${id}` : `Unnamed User###${id}`,
        apiKey: AuthService.fixedEncryption(makeId(20)),
        isTrailing: false,
        subscription: {
          create: {
            totalChannels: 1000000,
            subscriptionTier: 'ULTIMATE',
            isLifetime: true,
            period: 'YEARLY',
          },
        },
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                activated: true,
                email: email
                  ? email.split('@').join(`+${saasName}@`)
                  : `${saasName}+` + makeId(10) + '@postiz.com',
                name: name ? `${name}###${id}` : `Unnamed User###${id}`,
                providerName: 'LOCAL',
                password: AuthService.hashPassword(makeId(500)),
                timezone: 0,
              },
            },
          },
        },
      },
    });
  }

  getOrgByApiKey(api: string) {
    return this._organization.model.organization.findFirst({
      where: {
        apiKey: api,
      },
      include: {
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
          },
        },
      },
    });
  }

  getCount() {
    return this._organization.model.organization.count();
  }

  getUserOrg(id: string) {
    return this._userOrg.model.userOrganization.findFirst({
      where: {
        id,
      },
      select: {
        user: true,
        organization: {
          include: {
            users: {
              select: {
                id: true,
                disabled: true,
                role: true,
                userId: true,
              },
            },
            subscription: {
              select: {
                subscriptionTier: true,
                totalChannels: true,
                isLifetime: true,
              },
            },
          },
        },
      },
    });
  }

  getImpersonateUser(name: string) {
    return this._userOrg.model.userOrganization.findMany({
      where: {
        OR: [
          {
            organizationId: {
              contains: name,
            },
          },
          {
            user: {
              OR: [
                {
                  name: {
                    contains: name,
                  },
                },
                {
                  email: {
                    contains: name,
                  },
                },
                {
                  id: {
                    contains: name,
                  },
                },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        organization: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  updateApiKey(orgId: string) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        apiKey: AuthService.fixedEncryption(makeId(20)),
      },
    });
  }

  async getOrgsByUserId(userId: string) {
    return this._organization.model.organization.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      include: {
        users: {
          where: {
            userId,
          },
          select: {
            disabled: true,
            role: true,
          },
        },
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async getOrgById(id: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id,
      },
    });
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: 'USER' | 'ADMIN'
  ) {
    const checkIfInviteExists = await this._user.model.user.findFirst({
      where: {
        inviteId: id,
      },
    });

    if (checkIfInviteExists) {
      return false;
    }

    // Đã là thành viên org này thì thôi — create bên dưới sẽ đâm vào
    // unique(userId, organizationId) thành 500, và link mời role ADMIN không
    // được trở thành đường tự nâng cấp cho membership sẵn có.
    const alreadyMember =
      await this._userOrg.model.userOrganization.findFirst({
        where: { userId, organizationId: orgId },
      });
    if (alreadyMember) {
      return false;
    }

    const checkForSubscription =
      await this._organization.model.organization.findFirst({
        where: {
          id: orgId,
        },
        select: {
          subscription: true,
        },
      });

    if (
      process.env.STRIPE_PUBLISHABLE_KEY &&
      checkForSubscription?.subscription?.subscriptionTier ===
        SubscriptionTier.STANDARD
    ) {
      return false;
    }

    const create = await this._userOrg.model.userOrganization.create({
      data: {
        role,
        userId,
        organizationId: orgId,
      },
    });

    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        inviteId: id,
      },
    });

    return create;
  }

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & { providerId?: string },
    hasEmail: boolean,
    ip: string,
    userAgent: string
  ) {
    return this._organization.model.organization.create({
      data: {
        name: body.company,
        apiKey: AuthService.fixedEncryption(makeId(20)),
        allowTrial: true,
        isTrailing: true,
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                activated: body.provider !== 'LOCAL' || !hasEmail,
                email: body.email,
                password: body.password
                  ? AuthService.hashPassword(body.password)
                  : '',
                providerName: body.provider,
                providerId: body.providerId || '',
                timezone: 0,
                ip,
                agent: userAgent,
              },
            },
          },
        },
      },
      select: {
        id: true,
        users: {
          select: {
            user: true,
          },
        },
      },
    });
  }

  getOrgByCustomerId(customerId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        paymentId: customerId,
      },
    });
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    try {
      await this._organization.model.organization.update({
        where: {
          id: organizationId,
          ...(type === 'start'
            ? {
                streakSince: null,
              }
            : {}),
        },
        data: {
          ...(type === 'end' ? { streakSince: null } : {}),
          ...(type === 'start' ? { streakSince: new Date() } : {}),
        },
      });
    } catch (err) {}
  }

  async getTeam(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            role: true,
            disabled: true, // để UI đánh dấu + khoá nút với thành viên đang tắt
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
                sendStreakEmails: true,
              },
            },
          },
        },
      },
    });
  }

  getAllUsersOrgs(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
              },
            },
          },
        },
      },
    });
  }

  // Gộp MỌI tài khoản của instance về MỘT tổ chức (org đích = org của super
  // admin đang bấm). Vì sao cần: tự đăng ký là sinh org riêng → đồng nghiệp
  // nhìn kho /viral rỗng của chính họ thay vì kho chung.
  //   • Chưa có membership ở org đích → thêm với role USER (chỉ xem — muốn cho
  //     duyệt thì mời lại làm ADMIN qua Settings → Team).
  //   • Membership ở org đích đang disabled → bật lại (không thì bước dưới
  //     tắt nốt các org khác sẽ khoá người này khỏi toàn hệ thống).
  //   • TẮT (disabled=true) membership ở mọi org khác — getOrgsByUserId không
  //     orderBy nên còn membership khác là đăng nhập vẫn rơi nhầm org cá nhân.
  // KHÔNG xoá gì (org cá nhân rỗng vẫn nằm trong DB) → idempotent + đảo ngược
  // được; tài khoản lạc phát sinh sau này chỉ cần bấm lại nút gộp.
  async mergeAllUsersIntoOrg(targetOrgId: string) {
    const users = await this._user.model.user.findMany({
      select: { id: true, email: true },
    });
    const existing = await this._userOrg.model.userOrganization.findMany({
      where: { organizationId: targetOrgId },
    });
    const byUser = new Map(existing.map((m) => [m.userId, m]));
    const added: string[] = [];
    const reEnabled: string[] = [];
    for (const u of users) {
      const membership = byUser.get(u.id);
      if (!membership) {
        try {
          await this._userOrg.model.userOrganization.create({
            data: { userId: u.id, organizationId: targetOrgId, role: Role.USER },
          });
          added.push(u.email);
        } catch (e: any) {
          // P2002 = unique(userId, organizationId) — ai đó vừa thêm song song
          // (vd join-org qua link mời) trong lúc merge chạy → coi như đã có.
          if (e?.code !== 'P2002') throw e;
        }
      } else if (membership.disabled) {
        await this._userOrg.model.userOrganization.update({
          where: { id: membership.id },
          data: { disabled: false },
        });
        reEnabled.push(u.email);
      }
    }
    // Tắt membership ở org khác để lần đăng nhập sau rơi thẳng vào org đích —
    // nhưng CHỈ với org SOLO (đúng 1 thành viên = org cá nhân tự sinh khi đăng
    // ký). KHÔNG đụng org ĐA THÀNH VIÊN: nếu ai đó đang làm chủ một tổ chức
    // thật thì một nút "Gộp" không được khoá họ khỏi tổ chức của họ.
    // (Chỉ xét đúng các user trong snapshot — tài khoản đăng ký GIỮA lúc gộp
    // giữ nguyên org riêng, bấm Gộp lần sau mới vào.)
    const candidates = await this._userOrg.model.userOrganization.findMany({
      where: {
        userId: { in: users.map((u) => u.id) },
        organizationId: { not: targetOrgId },
        disabled: false,
      },
      select: { id: true, organizationId: true },
    });
    const sizeCache = new Map<string, number>();
    const soloIds: string[] = [];
    const skippedOrgs = new Set<string>();
    for (const m of candidates) {
      let size = sizeCache.get(m.organizationId);
      if (size == null) {
        size = await this._userOrg.model.userOrganization.count({
          where: { organizationId: m.organizationId },
        });
        sizeCache.set(m.organizationId, size);
      }
      if (size <= 1) soloIds.push(m.id);
      else skippedOrgs.add(m.organizationId);
    }
    const off = soloIds.length
      ? await this._userOrg.model.userOrganization.updateMany({
          where: { id: { in: soloIds } },
          data: { disabled: true },
        })
      : { count: 0 };
    return {
      totalUsers: users.length,
      added,
      reEnabled,
      disabledElsewhere: off.count,
      // org đa thành viên bị bỏ qua (không gộp cưỡng bức) — super admin biết
      // còn tổ chức thật chưa đưa về.
      skippedMultiMemberOrgs: skippedOrgs.size,
    };
  }

  getMembership(orgId: string, userId: string) {
    return this._userOrg.model.userOrganization.findFirst({
      where: { organizationId: orgId, userId },
    });
  }

  // Nếu user không còn membership nào ENABLED (vd vừa bị xoá khỏi org chung sau
  // khi gộp), bật lại một membership bất kỳ để họ không bị 403 toàn app. Ưu
  // tiên org "một mình" (org cá nhân tự sinh) để không lẻn vào org người khác.
  async ensureAnyEnabledMembership(userId: string) {
    const enabled = await this._userOrg.model.userOrganization.count({
      where: { userId, disabled: false },
    });
    if (enabled > 0) return;
    const all = await this._userOrg.model.userOrganization.findMany({
      where: { userId },
      select: { id: true, organizationId: true },
    });
    if (!all.length) return;
    let pick = all[0];
    for (const m of all) {
      const members = await this._userOrg.model.userOrganization.count({
        where: { organizationId: m.organizationId },
      });
      if (members === 1) {
        pick = m;
        break;
      }
    }
    await this._userOrg.model.userOrganization.update({
      where: { id: pick.id },
      data: { disabled: false },
    });
  }

  // Đổi vai một thành viên trong org (Member ↔ Admin).
  updateMemberRole(orgId: string, userId: string, role: 'USER' | 'ADMIN') {
    return this._userOrg.model.userOrganization.update({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      data: { role: role === 'ADMIN' ? Role.ADMIN : Role.USER },
    });
  }

  // Chuyển "chủ tổ chức": người nhận lên SUPERADMIN, người trao xuống ADMIN —
  // trong MỘT transaction để không bao giờ kẹt ở trạng thái 2 chủ / 0 chủ.
  // (model của PrismaRepository chính là PrismaClient — xem prisma.service.)
  // Hạ người trao bằng updateMany CÓ ĐIỀU KIỆN role=SUPERADMIN: đây là chốt
  // chống race — nếu chủ mở 2 tab bấm chuyển cho 2 người, request thứ hai chờ
  // row-lock của request đầu, thấy người trao đã thành ADMIN → count 0 → ném
  // lỗi rollback, nên chỉ MỘT lần chuyển thắng (không bao giờ ra 2 chủ).
  transferSuperAdmin(orgId: string, fromUserId: string, toUserId: string) {
    const client = this._userOrg.model as any;
    return client.$transaction(async (tx: any) => {
      const demoted = await tx.userOrganization.updateMany({
        where: {
          userId: fromUserId,
          organizationId: orgId,
          role: Role.SUPERADMIN,
        },
        data: { role: Role.ADMIN },
      });
      if (demoted.count !== 1) {
        throw new Error('Người trao không còn là chủ tổ chức.');
      }
      return tx.userOrganization.update({
        where: { userId_organizationId: { userId: toUserId, organizationId: orgId } },
        data: { role: Role.SUPERADMIN, disabled: false },
      });
    });
  }

  // User chỉ còn nằm trong các nhóm "một mình" (nhóm cá nhân tự sinh khi
  // đăng ký)? Dùng làm rào an toàn khi cho phép mời-lại đặt mật khẩu mới.
  async isUserOnlyInSoloOrgs(userId: string) {
    const orgs = await this._userOrg.model.userOrganization.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    if (!orgs.length) {
      return true;
    }
    const others = await this._userOrg.model.userOrganization.count({
      where: {
        organizationId: { in: orgs.map((o) => o.organizationId) },
        userId: { not: userId },
      },
    });
    return others === 0;
  }

  async deleteTeamMember(orgId: string, userId: string) {
    return this._userOrg.model.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });
  }

  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._userOrg.model.userOrganization.updateMany({
      where: {
        organizationId: orgId,
        role: {
          not: Role.SUPERADMIN,
        },
      },
      data: {
        disabled: disable,
      },
    });
  }

  getShortlinkPreference(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        shortlink: true,
      },
    });
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        shortlink,
      },
    });
  }
}
