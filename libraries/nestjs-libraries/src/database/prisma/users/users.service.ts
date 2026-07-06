import { Injectable } from '@nestjs/common';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { Provider } from '@prisma/client';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@gitroom/nestjs-libraries/dtos/users/email-notifications.dto';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';

@Injectable()
export class UsersService {
  constructor(
    private _usersRepository: UsersRepository,
    private _organizationRepository: OrganizationRepository
  ) {}

  getUserByEmail(email: string) {
    return this._usersRepository.getUserByEmail(email);
  }

  getUserById(id: string) {
    return this._usersRepository.getUserById(id);
  }

  getImpersonateUser(name: string) {
    return this._organizationRepository.getImpersonateUser(name);
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._usersRepository.getUserByProvider(providerId, provider);
  }

  activateUser(id: string) {
    return this._usersRepository.activateUser(id);
  }

  updatePassword(id: string, password: string) {
    return this._usersRepository.updatePassword(id, password);
  }

  // Tự đổi mật khẩu: phải nhập đúng mật khẩu hiện tại (chỉ tài khoản LOCAL).
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await this._usersRepository.getUserById(userId);
    if (
      !user ||
      user.providerName !== Provider.LOCAL ||
      !AuthChecker.comparePassword(currentPassword, user.password)
    ) {
      return false;
    }
    await this._usersRepository.updatePassword(userId, newPassword);
    return true;
  }

  // Tự đổi email (xác nhận bằng mật khẩu). Trả 'invalid' | 'exists' | 'ok'.
  async changeEmail(userId: string, password: string, newEmail: string) {
    const user = await this._usersRepository.getUserById(userId);
    if (
      !user ||
      user.providerName !== Provider.LOCAL ||
      !AuthChecker.comparePassword(password, user.password)
    ) {
      return 'invalid';
    }
    const existing = await this._usersRepository.getUserByEmail(
      newEmail.toLowerCase()
    );
    if (existing && existing.id !== userId) {
      return 'exists';
    }
    await this._usersRepository.changeEmail(userId, newEmail);
    return 'ok';
  }

  getPersonal(userId: string) {
    return this._usersRepository.getPersonal(userId);
  }

  changePersonal(userId: string, body: UserDetailDto) {
    return this._usersRepository.changePersonal(userId, body);
  }

  getEmailNotifications(userId: string) {
    return this._usersRepository.getEmailNotifications(userId);
  }

  updateEmailNotifications(userId: string, body: EmailNotificationsDto) {
    return this._usersRepository.updateEmailNotifications(userId, body);
  }
}
