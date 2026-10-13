import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  level: true,
  last4: true,
  createdAt: true,
  lastUsedAt: true,
} as const;

@Injectable()
export class McpKeyRepository {
  constructor(
    private _keys: PrismaRepository<'mcpKey'>,
    private _organization: PrismaRepository<'organization'>
  ) {}

  activeKeys(organizationId: string) {
    return this._keys.model.mcpKey.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: PUBLIC_FIELDS,
    });
  }

  createKey(data: {
    organizationId: string;
    name: string;
    level: string;
    hash: string;
    last4: string;
    createdBy: string;
  }) {
    return this._keys.model.mcpKey.create({ data, select: PUBLIC_FIELDS });
  }

  revokeKey(organizationId: string, id: string) {
    return this._keys.model.mcpKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  findActiveKey(hash: string) {
    return this._keys.model.mcpKey.findFirst({
      where: { hash, revokedAt: null },
      select: {
        id: true,
        organizationId: true,
        level: true,
        createdBy: true,
        lastUsedAt: true,
      },
    });
  }

  touchKey(id: string) {
    return this._keys.model.mcpKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  // Cùng dạng getOrgByApiKey (kèm subscription) để tool dùng như org thường.
  getOrganization(id: string) {
    return this._organization.model.organization.findUnique({
      where: { id },
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
}
