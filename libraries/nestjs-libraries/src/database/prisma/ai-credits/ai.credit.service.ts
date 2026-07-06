import { Injectable } from '@nestjs/common';
import { AiCreditRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-credits/ai.credit.repository';

// Nhà cung cấp có API lấy số dư tự động. Các bên KHÔNG có API số dư công khai
// (Anthropic/Claude, OpenAI, Google AI Studio) → nhập tay.
const AUTO_PROVIDERS = new Set(['heygen']);

@Injectable()
export class AiCreditService {
  constructor(private _repo: AiCreditRepository) {}

  list(orgId: string) {
    return this._repo.list(orgId);
  }

  supportsAuto(provider: string) {
    return AUTO_PROVIDERS.has(provider);
  }

  async save(orgId: string, body: any, id?: string) {
    if (id) {
      const existing = await this._repo.getById(orgId, id);
      if (!existing) return null;
      return this._repo.update(id, body);
    }
    return this._repo.create(orgId, body);
  }

  delete(orgId: string, id: string) {
    return this._repo.softDelete(orgId, id);
  }

  // Lấy số dư tự động (chỉ nhà cung cấp có API). HeyGen: remaining_quota.
  async refresh(orgId: string, id: string) {
    const entry = await this._repo.getById(orgId, id);
    if (!entry) return null;

    if (!AUTO_PROVIDERS.has(entry.provider) || !entry.apiKey) {
      return {
        ok: false,
        error:
          'Nhà cung cấp này không có API xem số dư — cập nhật số dư bằng tay.',
      };
    }

    try {
      if (entry.provider === 'heygen') {
        const res = await fetch(
          'https://api.heygen.com/v2/user/remaining_quota',
          {
            headers: {
              'X-Api-Key': entry.apiKey,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) {
          throw new Error(`HeyGen trả ${res.status}`);
        }
        const data: any = await res.json();
        const quota =
          data?.data?.remaining_quota ??
          data?.remaining_quota ??
          data?.data?.quota;
        if (typeof quota !== 'number') {
          throw new Error('Không đọc được số dư từ HeyGen');
        }
        // HeyGen trả quota theo đơn vị nội bộ (÷60 ≈ credit).
        const credits = Math.round((quota / 60) * 100) / 100;
        await this._repo.updateBalance(id, credits, null);
        return { ok: true, balance: credits };
      }
    } catch (e: any) {
      await this._repo.updateBalance(id, entry.balance ?? null, e?.message || 'lỗi');
      return { ok: false, error: e?.message || 'Không lấy được số dư' };
    }
    return { ok: false, error: 'Không hỗ trợ' };
  }
}
