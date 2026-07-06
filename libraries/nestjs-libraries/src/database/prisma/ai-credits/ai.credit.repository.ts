import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AiCreditRepository {
  constructor(private _ai: PrismaRepository<'aiCredit'>) {}

  list(orgId: string) {
    return this._ai.model.aiCredit.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  getById(orgId: string, id: string) {
    return this._ai.model.aiCredit.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
  }

  private normalize(body: any) {
    const num = (v: any) =>
      v === '' || v === null || v === undefined
        ? null
        : typeof v === 'number'
        ? v
        : parseFloat(v);
    return {
      provider: String(body.provider || 'other'),
      label: String(body.label || '').trim() || 'AI',
      apiKey: body.apiKey ? String(body.apiKey).trim() : null,
      balance: num(body.balance),
      unit: String(body.unit || 'credits'),
      threshold: num(body.threshold),
      auto: !!body.auto,
    };
  }

  create(orgId: string, body: any) {
    return this._ai.model.aiCredit.create({
      data: { organizationId: orgId, ...this.normalize(body) },
    });
  }

  update(id: string, body: any) {
    return this._ai.model.aiCredit.update({
      where: { id },
      data: this.normalize(body),
    });
  }

  updateBalance(id: string, balance: number | null, lastError?: string | null) {
    return this._ai.model.aiCredit.update({
      where: { id },
      data: {
        balance,
        lastChecked: new Date(),
        lastError: lastError || null,
      },
    });
  }

  softDelete(orgId: string, id: string) {
    return this._ai.model.aiCredit.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }
}
