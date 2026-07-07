import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface ExternalPostInput {
  externalId: string;
  status: 'PUBLISHED' | 'SCHEDULED';
  content: string;
  mediaUrls: { type: string; url: string }[];
  permalink?: string | null;
  publishDate: Date;
  insights?: Record<string, number | null> | null;
}

@Injectable()
export class ExternalPostRepository {
  constructor(private _externalPost: PrismaRepository<'externalPost'>) {}

  async upsertMany(
    orgId: string,
    integrationId: string,
    platform: string,
    items: ExternalPostInput[]
  ) {
    for (const item of items) {
      await this._externalPost.model.externalPost.upsert({
        where: {
          integrationId_externalId: {
            integrationId,
            externalId: item.externalId,
          },
        },
        create: {
          organizationId: orgId,
          integrationId,
          platform,
          externalId: item.externalId,
          status: item.status,
          content: item.content,
          mediaUrls: JSON.stringify(item.mediaUrls || []),
          permalink: item.permalink || null,
          publishDate: item.publishDate,
          insights: item.insights ? JSON.stringify(item.insights) : null,
        },
        update: {
          status: item.status,
          content: item.content,
          mediaUrls: JSON.stringify(item.mediaUrls || []),
          permalink: item.permalink || null,
          publishDate: item.publishDate,
          insights: item.insights ? JSON.stringify(item.insights) : null,
          deletedAt: null,
        },
      });
    }
  }

  // Bài SCHEDULED trên nền tảng không còn trong danh sách hẹn nữa (đã đăng
  // hoặc bị hủy bên Meta) → soft-delete; nếu đã đăng thì lượt sync published
  // sẽ upsert lại thành PUBLISHED.
  removeStaleScheduled(integrationId: string, keepExternalIds: string[]) {
    return this._externalPost.model.externalPost.updateMany({
      where: {
        integrationId,
        status: 'SCHEDULED',
        deletedAt: null,
        ...(keepExternalIds.length
          ? { externalId: { notIn: keepExternalIds } }
          : {}),
      },
      data: { deletedAt: new Date() },
    });
  }

  list(
    orgId: string,
    status: 'PUBLISHED' | 'SCHEDULED',
    integrationId?: string
  ) {
    return this._externalPost.model.externalPost.findMany({
      where: {
        organizationId: orgId,
        status,
        deletedAt: null,
        ...(integrationId ? { integrationId } : {}),
      },
      orderBy: { publishDate: status === 'SCHEDULED' ? 'asc' : 'desc' },
      take: 200,
    });
  }

  async lastSyncedAt(integrationId: string): Promise<Date | null> {
    const row = await this._externalPost.model.externalPost.findFirst({
      where: { integrationId },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });
    return row?.syncedAt || null;
  }
}
