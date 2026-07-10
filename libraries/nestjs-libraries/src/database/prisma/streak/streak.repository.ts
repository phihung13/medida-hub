import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class StreakRepository {
  constructor(private _streak: PrismaRepository<'userStreak'>) {}

  get(userId: string) {
    return this._streak.model.userStreak.findUnique({ where: { userId } });
  }

  upsert(
    userId: string,
    data: { current: number; longest: number; lastDay: string }
  ) {
    return this._streak.model.userStreak.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
