import { Injectable } from '@nestjs/common';
import { StreakRepository } from '@gitroom/nestjs-libraries/database/prisma/streak/streak.repository';

// Cột mốc streak (kiểu Duolingo) — chạm mốc lần đầu → UI bắn hiệu ứng lửa lớn.
export const STREAK_MILESTONES = [
  3, 7, 14, 30, 50, 100, 200, 300, 365, 500, 1000,
];

// Chuỗi ngày VÀO APP, tính theo ngày giờ VN (UTC+7): hôm nay đã ping → giữ
// nguyên; hôm qua có → +1; đứt ngày → về 1. longest = kỷ lục mọi thời.
@Injectable()
export class StreakService {
  constructor(private _repo: StreakRepository) {}

  private vnDay(offsetDays = 0): string {
    return new Date(Date.now() + 7 * 3600 * 1000 - offsetDays * 86400000)
      .toISOString()
      .slice(0, 10);
  }

  async get(userId: string) {
    const row = await this._repo.get(userId);
    const current =
      // đứt quá 1 ngày mà chưa ping lại → hiển thị 0 (chuỗi đã tắt)
      row && (row.lastDay === this.vnDay() || row.lastDay === this.vnDay(1))
        ? row.current
        : 0;
    return {
      current,
      longest: row?.longest || 0,
      nextMilestone: STREAK_MILESTONES.find((m) => m > current) || null,
    };
  }

  async ping(userId: string) {
    const today = this.vnDay();
    const yesterday = this.vnDay(1);
    const row = await this._repo.get(userId);
    let current = 1;
    let increased = true;
    if (row?.lastDay === today) {
      current = row.current;
      increased = false; // hôm nay đã tính rồi
    } else if (row?.lastDay === yesterday) {
      current = row.current + 1; // nối chuỗi
    } // else: đứt chuỗi (hoặc lần đầu) → về 1
    const longest = Math.max(current, row?.longest || 0);
    await this._repo.upsert(userId, { current, longest, lastDay: today });
    return {
      current,
      longest,
      increased,
      // chạm mốc ĐÚNG lúc tăng → hiệu ứng ăn mừng 1 lần duy nhất
      milestone: increased && STREAK_MILESTONES.includes(current) ? current : null,
      nextMilestone: STREAK_MILESTONES.find((m) => m > current) || null,
    };
  }
}
