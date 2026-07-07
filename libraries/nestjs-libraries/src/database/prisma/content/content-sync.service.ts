import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  ExternalPostRepository,
  ExternalPostInput,
} from '@gitroom/nestjs-libraries/database/prisma/content/external-post.repository';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

// ============================================================================
//  Content sync Meta: kéo bài ĐÃ ĐĂNG + bài HẸN GIỜ của Trang FB / tài khoản
//  IG business về bảng ExternalPost — gồm cả bài đăng tay/hẹn ngoài app.
//  Trang Content gộp 3 nguồn: Post local (app) + ExternalPost (nền tảng),
//  lọc trùng bài app đã đăng bằng releaseId.
// ============================================================================

const SYNC_COOLDOWN_SECONDS = 15 * 60; // mở trang trong 15' không sync lại
const GRAPH = 'https://graph.facebook.com/v20.0';

@Injectable()
export class ContentSyncService {
  constructor(
    private _externalPostRepository: ExternalPostRepository,
    private _integrationService: IntegrationService,
    private _post: PrismaRepository<'post'>
  ) {}

  private async graph(url: string): Promise<any> {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return res.json();
  }

  private mapFbAttachments(p: any): { type: string; url: string }[] {
    const out: { type: string; url: string }[] = [];
    if (p.full_picture) out.push({ type: 'image', url: p.full_picture });
    for (const att of p.attachments?.data || []) {
      for (const sub of att.subattachments?.data || []) {
        const src = sub.media?.image?.src;
        if (src && !out.some((m) => m.url === src)) {
          out.push({ type: sub.media_type || 'image', url: src });
        }
      }
    }
    return out.slice(0, 10);
  }

  private async syncFacebook(integration: {
    id: string;
    organizationId: string;
    internalId: string;
    token: string;
  }) {
    // Bài đã đăng (gồm đăng tay ngoài app) — cùng endpoint/fields với
    // getTopPosts (đã chạy ổn với bộ quyền hiện tại).
    const RICH =
      'message,full_picture,permalink_url,created_time,shares,reactions.summary(true),comments.summary(true),attachments{media_type,subattachments}';
    const BASIC =
      'message,full_picture,permalink_url,created_time,attachments{media_type,subattachments}';
    let published = await this.graph(
      `${GRAPH}/${integration.internalId}/posts?fields=${RICH}&limit=100&access_token=${integration.token}`
    );
    if (published?.error) {
      published = await this.graph(
        `${GRAPH}/${integration.internalId}/posts?fields=${BASIC}&limit=100&access_token=${integration.token}`
      );
    }
    if (!published?.error) {
      const items: ExternalPostInput[] = (published?.data || []).map(
        (p: any) => ({
          externalId: p.id,
          status: 'PUBLISHED' as const,
          content: (p.message || '').slice(0, 5000),
          mediaUrls: this.mapFbAttachments(p),
          permalink: p.permalink_url || null,
          publishDate: new Date(p.created_time),
          insights: {
            reactions: p.reactions?.summary?.total_count ?? null,
            comments: p.comments?.summary?.total_count ?? null,
            shares: p.shares?.count ?? null,
          },
        })
      );
      await this._externalPostRepository.upsertMany(
        integration.organizationId,
        integration.id,
        'facebook',
        items
      );
    }

    // Bài hẹn giờ trên Meta (Business Suite). Cần pages_manage_posts —
    // thiếu quyền thì bỏ qua êm (trả note cho UI hiển thị).
    const scheduled = await this.graph(
      `${GRAPH}/${integration.internalId}/scheduled_posts?fields=message,full_picture,permalink_url,scheduled_publish_time,attachments{media_type,subattachments}&limit=100&access_token=${integration.token}`
    );
    let scheduledError: string | null = null;
    if (scheduled?.error) {
      scheduledError = String(scheduled.error?.message || 'Graph error').slice(
        0,
        200
      );
    } else {
      const items: ExternalPostInput[] = (scheduled?.data || [])
        .filter((p: any) => p.scheduled_publish_time)
        .map((p: any) => ({
          externalId: p.id,
          status: 'SCHEDULED' as const,
          content: (p.message || '').slice(0, 5000),
          mediaUrls: this.mapFbAttachments(p),
          permalink: p.permalink_url || null,
          publishDate: new Date(
            typeof p.scheduled_publish_time === 'number'
              ? p.scheduled_publish_time * 1000
              : p.scheduled_publish_time
          ),
        }));
      await this._externalPostRepository.upsertMany(
        integration.organizationId,
        integration.id,
        'facebook',
        items
      );
      await this._externalPostRepository.removeStaleScheduled(
        integration.id,
        items.map((i) => i.externalId)
      );
    }
    return { scheduledError };
  }

  private async syncInstagram(integration: {
    id: string;
    organizationId: string;
    internalId: string;
    token: string;
  }) {
    // IG token là chuỗi ghép "pageToken___userToken" (xem instagram.provider).
    const token = integration.token.split('___')[0];
    const media = await this.graph(
      `${GRAPH}/${integration.internalId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=100&access_token=${token}`
    );
    if (media?.error) {
      return {
        error: String(media.error?.message || 'Graph error').slice(0, 200),
      };
    }
    const items: ExternalPostInput[] = (media?.data || []).map((p: any) => ({
      externalId: p.id,
      status: 'PUBLISHED' as const,
      content: (p.caption || '').slice(0, 5000),
      mediaUrls: [
        {
          type: p.media_type === 'VIDEO' ? 'video' : 'image',
          url: p.thumbnail_url || p.media_url || '',
        },
      ].filter((m) => m.url),
      permalink: p.permalink || null,
      publishDate: new Date(p.timestamp),
      insights: {
        reactions: p.like_count ?? null,
        comments: p.comments_count ?? null,
      },
    }));
    await this._externalPostRepository.upsertMany(
      integration.organizationId,
      integration.id,
      'instagram',
      items
    );
    // IG API không cho xem bài hẹn giờ → không có SCHEDULED cho IG.
    return {};
  }

  async syncOrganization(orgId: string, force = false) {
    const integrations = await this._integrationService.getIntegrationsList(
      orgId
    );
    const targets = integrations.filter(
      (i: any) =>
        !i.disabled &&
        i.type === 'social' &&
        ['facebook', 'instagram'].includes(i.providerIdentifier)
    );
    const results: Record<string, any> = {};
    for (const integration of targets) {
      const cooldownKey = `content-sync:${integration.id}`;
      if (!force && (await ioRedis.get(cooldownKey))) {
        results[integration.id] = { skipped: true };
        continue;
      }
      try {
        results[integration.id] =
          integration.providerIdentifier === 'facebook'
            ? await this.syncFacebook(integration)
            : await this.syncInstagram(integration);
        await ioRedis.set(cooldownKey, '1', 'EX', SYNC_COOLDOWN_SECONDS);
      } catch (e: any) {
        results[integration.id] = {
          error: String(e?.message || e).slice(0, 200),
        };
      }
    }
    return { synced: Object.keys(results).length, results };
  }

  // ---- Danh sách gộp cho trang Content -------------------------------------

  private postShape(p: any) {
    return {
      id: p.id,
      source: 'app' as const,
      state: p.state,
      platform: p.integration?.providerIdentifier || '',
      integrationId: p.integrationId,
      integrationName: p.integration?.name || '',
      integrationPicture: p.integration?.picture || null,
      content: p.content || '',
      mediaUrls: [] as { type: string; url: string }[],
      image: p.image || null,
      permalink: p.releaseURL || null,
      publishDate: p.publishDate,
      insights: null as Record<string, number | null> | null,
      releaseId: p.releaseId || null,
    };
  }

  private externalShape(p: any, integrationsById: Record<string, any>) {
    const integration = integrationsById[p.integrationId];
    let mediaUrls: { type: string; url: string }[] = [];
    let insights: Record<string, number | null> | null = null;
    try {
      mediaUrls = JSON.parse(p.mediaUrls || '[]');
    } catch {
      /* giữ rỗng */
    }
    try {
      insights = p.insights ? JSON.parse(p.insights) : null;
    } catch {
      /* giữ null */
    }
    return {
      id: p.id,
      source: 'platform' as const,
      state: p.status,
      platform: p.platform,
      integrationId: p.integrationId,
      integrationName: integration?.name || '',
      integrationPicture: integration?.picture || null,
      content: p.content,
      mediaUrls,
      image: mediaUrls[0]?.url || null,
      permalink: p.permalink,
      publishDate: p.publishDate,
      insights,
      releaseId: p.externalId,
    };
  }

  async getContent(
    orgId: string,
    type: 'published' | 'scheduled' | 'draft',
    integrationId?: string
  ) {
    const integrations = await this._integrationService.getIntegrationsList(
      orgId
    );
    const integrationsById = Object.fromEntries(
      integrations.map((i: any) => [i.id, i])
    );

    if (type === 'draft') {
      const drafts = await this._post.model.post.findMany({
        where: {
          organizationId: orgId,
          state: 'DRAFT',
          deletedAt: null,
          parentPostId: null,
          ...(integrationId ? { integrationId } : {}),
        },
        include: { integration: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
      return { items: drafts.map((p) => this.postShape(p)) };
    }

    if (type === 'scheduled') {
      const [local, external] = await Promise.all([
        this._post.model.post.findMany({
          where: {
            organizationId: orgId,
            state: 'QUEUE',
            deletedAt: null,
            parentPostId: null,
            publishDate: { gte: new Date() },
            ...(integrationId ? { integrationId } : {}),
          },
          include: { integration: true },
          orderBy: { publishDate: 'asc' },
          take: 200,
        }),
        this._externalPostRepository.list(orgId, 'SCHEDULED', integrationId),
      ]);
      const items = [
        ...local.map((p) => this.postShape(p)),
        ...external.map((p) => this.externalShape(p, integrationsById)),
      ].sort(
        (a, b) =>
          new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime()
      );
      return { items };
    }

    // published: bài app đã đăng + bài trên nền tảng, lọc trùng theo releaseId
    const [local, external] = await Promise.all([
      this._post.model.post.findMany({
        where: {
          organizationId: orgId,
          state: 'PUBLISHED',
          deletedAt: null,
          parentPostId: null,
          ...(integrationId ? { integrationId } : {}),
        },
        include: { integration: true },
        orderBy: { publishDate: 'desc' },
        take: 200,
      }),
      this._externalPostRepository.list(orgId, 'PUBLISHED', integrationId),
    ]);
    const appReleaseIds = new Set(
      local.map((p) => p.releaseId).filter(Boolean)
    );
    const items = [
      ...local.map((p) => this.postShape(p)),
      ...external
        .filter((p) => !appReleaseIds.has(p.externalId))
        .map((p) => this.externalShape(p, integrationsById)),
    ].sort(
      (a, b) =>
        new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
    );
    return { items };
  }
}
