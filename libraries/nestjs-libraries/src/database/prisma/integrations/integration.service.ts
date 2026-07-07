import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsData,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration, Organization } from '@prisma/client';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { difference, uniq } from 'lodash';
import utc from 'dayjs/plugin/utc';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { TemporalService } from 'nestjs-temporal-core';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

dayjs.extend(utc);

@Injectable()
export class IntegrationService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _autopostsRepository: AutopostRepository,
    private _integrationManager: IntegrationManager,
    private _notificationService: NotificationService,
    @Inject(forwardRef(() => RefreshIntegrationService))
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _openaiService: OpenaiService
  ) {}

  async changeActiveCron(orgId: string) {
    const data = await this._autopostsRepository.getAutoposts(orgId);

    for (const item of data.filter((f) => f.active)) {
      try {
        await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
      } catch (err) {}
    }

    return true;
  }

  getMentions(platform: string, q: string) {
    return this._integrationRepository.getMentions(platform, q);
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    return this._integrationRepository.insertMentions(platform, mentions);
  }

  async setTimes(
    orgId: string,
    integrationId: string,
    times: IntegrationTimeDto
  ) {
    return this._integrationRepository.setTimes(orgId, integrationId, times);
  }

  updateProviderSettings(org: string, id: string, additionalSettings: string) {
    return this._integrationRepository.updateProviderSettings(
      org,
      id,
      additionalSettings
    );
  }

  checkPreviousConnections(org: string, id: string) {
    return this._integrationRepository.checkPreviousConnections(org, id);
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    const uploadedPicture = picture
      ? picture?.indexOf('imagedelivery.net') > -1
        ? picture
        : await this.storage.uploadSimple(picture)
      : undefined;

    return this._integrationRepository.createOrUpdateIntegration(
      additionalSettings,
      oneTimeToken,
      org,
      name,
      uploadedPicture,
      type,
      internalId,
      provider,
      token,
      refreshToken,
      expiresIn,
      username,
      isBetweenSteps,
      refresh,
      timezone,
      customInstanceDetails
    );
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integrationRepository.updateIntegrationGroup(org, id, group);
  }

  updateOnCustomerName(org: string, id: string, name: string) {
    return this._integrationRepository.updateOnCustomerName(org, id, name);
  }

  getIntegrationsList(org: string) {
    return this._integrationRepository.getIntegrationsList(org);
  }

  // Trang Facebook đã kết nối (Add Channel) KÈM page token — cho bot Zalo đăng
  // thẳng lên Trang mà không phải cấp token riêng lần hai. Chỉ trả kênh facebook
  // còn hoạt động; caller (public API) đã xác thực bằng API key của org.
  async getFacebookPagesWithTokens(org: string) {
    const list = await this._integrationRepository.getIntegrationsList(org);
    return list
      .filter(
        (i) =>
          i.providerIdentifier === 'facebook' &&
          !i.disabled &&
          !i.refreshNeeded &&
          i.token
      )
      .map((i) => ({
        // internalId = ID Trang thật trên Facebook (dùng gọi Graph API)
        pageId: i.internalId,
        name: i.name,
        token: i.token,
        picture: i.picture,
        expiresAt: i.tokenExpiration ? i.tokenExpiration.getTime() : null,
      }));
  }

  getIntegrationForOrder(id: string, order: string, user: string, org: string) {
    return this._integrationRepository.getIntegrationForOrder(
      id,
      order,
      user,
      org
    );
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integrationRepository.updateNameAndUrl(id, name, url);
  }

  getIntegrationById(org: string, id: string) {
    return this._integrationRepository.getIntegrationById(org, id);
  }

  // Chân bài (footer) cố định cho từng kênh — verify org trước khi ghi.
  async updatePostFooter(org: string, id: string, footer: string) {
    const integration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!integration) {
      return null;
    }
    await this._integrationRepository.updateIntegration(id, {
      postFooter: (footer || '').trim() || null,
    } as any);
    return { ok: true };
  }

  async refreshToken(provider: SocialProvider, refresh: string) {
    try {
      const { refreshToken, accessToken, expiresIn } =
        await provider.refreshToken(refresh);

      if (!refreshToken || !accessToken || !expiresIn) {
        return false;
      }

      return { refreshToken, accessToken, expiresIn };
    } catch (e) {
      return false;
    }
  }

  async disconnectChannel(orgId: string, integration: Integration) {
    await this._integrationRepository.disconnectChannel(orgId, integration.id);
    await this.informAboutRefreshError(orgId, integration);
  }

  async informAboutRefreshError(
    orgId: string,
    integration: Integration,
    err = ''
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}`,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}. Please go back to the system and connect it again ${process.env.FRONTEND_URL}/launches`,
      true,
      false,
      'info'
    );
  }

  async refreshNeeded(org: string, id: string) {
    return this._integrationRepository.refreshNeeded(org, id);
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integrationRepository.setBetweenRefreshSteps(id);
  }

  async refreshTokens() {
    const integrations = await this._integrationRepository.needsToBeRefreshed();
    for (const integration of integrations) {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      const data = await this.refreshToken(provider, integration.refreshToken!);

      if (!data) {
        await this.informAboutRefreshError(
          integration.organizationId,
          integration
        );
        await this._integrationRepository.refreshNeeded(
          integration.organizationId,
          integration.id
        );
        return;
      }

      const { refreshToken, accessToken, expiresIn } = data;

      await this.createOrUpdateIntegration(
        undefined,
        !!provider.oneTimeToken,
        integration.organizationId,
        integration.name,
        undefined,
        'social',
        integration.internalId,
        integration.providerIdentifier,
        accessToken,
        refreshToken,
        expiresIn
      );
    }
  }

  async disableChannel(org: string, id: string) {
    return this._integrationRepository.disableChannel(org, id);
  }

  async enableChannel(org: string, totalChannels: number, id: string) {
    const integrations = (
      await this._integrationRepository.getIntegrationsList(org)
    ).filter((f) => !f.disabled);
    if (
      !!process.env.STRIPE_PUBLISHABLE_KEY &&
      integrations.length >= totalChannels
    ) {
      throw new Error('You have reached the maximum number of channels');
    }

    return this._integrationRepository.enableChannel(org, id);
  }

  async getPostsForChannel(org: string, id: string) {
    return this._integrationRepository.getPostsForChannel(org, id);
  }

  async deleteChannel(org: string, id: string) {
    return this._integrationRepository.deleteChannel(org, id);
  }

  async disableIntegrations(org: string, totalChannels: number) {
    return this._integrationRepository.disableIntegrations(org, totalChannels);
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
  }

  async saveProviderPage(org: string, id: string, data: any) {
    const getIntegration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!getIntegration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (!getIntegration.inBetweenSteps) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    const provider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (!provider.fetchPageInformation) {
      throw new HttpException(
        'Provider does not support page selection',
        HttpStatus.BAD_REQUEST
      );
    }

    // Hỗ trợ chọn NHIỀU kênh vệ tinh 1 lần (Page FB, location Google Business,
    // company LinkedIn, channel YouTube...). data.pages = mảng OBJECT data —
    // mỗi phần tử có cùng shape như bản chọn 1 (tuỳ provider: {page}, {id},
    // {id,pageId}...). Tương thích ngược: không có data.pages thì dùng nguyên
    // `data` như 1 lựa chọn.
    const pageDataList: any[] =
      Array.isArray(data?.pages) && data.pages.length ? data.pages : [data];

    // Kênh ĐẦU TIÊN: biến integration between-steps hiện tại thành kênh đó.
    const first = await provider.fetchPageInformation(
      getIntegration.token,
      pageDataList[0]
    );
    await this.checkForDeletedOnceAndUpdate(org, String(first.id));
    await this._integrationRepository.updateIntegration(id, {
      picture: first.picture,
      internalId: String(first.id),
      organizationId: org,
      name: first.name,
      inBetweenSteps: false,
      token: first.access_token,
      profile: first.username,
    });

    // Các kênh CÒN LẠI: mỗi kênh tạo một integration MỚI (dùng chung token).
    for (const pageData of pageDataList.slice(1)) {
      try {
        const info = await provider.fetchPageInformation(
          getIntegration.token,
          pageData
        );
        await this.checkForDeletedOnceAndUpdate(org, String(info.id));
        await this.createOrUpdateIntegration(
          undefined,
          !!provider.oneTimeToken,
          org,
          info.name,
          info.picture,
          'social',
          String(info.id),
          getIntegration.providerIdentifier,
          info.access_token,
          '',
          undefined,
          info.username,
          false
        );
      } catch (e) {
        // 1 kênh lỗi không làm hỏng cả nhóm — bỏ qua kênh đó
      }
    }

    return { success: true, count: pageDataList.length };
  }

  // GĐ4 — Tổng quan mọi kênh: gọi checkAnalytics từng kênh song song (đã có
  // cache Redis 1h) rồi tóm tắt: tổng kỳ, % thay đổi, series để vẽ sparkline.
  // Metric dạng "số dư" (follower count...) lấy giá trị CUỐI thay vì cộng dồn.
  async getAnalyticsOverview(org: Organization, date: string) {
    const list = (await this.getIntegrationsList(org.id)).filter(
      (i: any) => !i.disabled && i.type === 'social'
    );
    const CUMULATIVE_HINTS = ['follower', 'following', 'subscriber', 'fan'];
    const channels = await Promise.all(
      list.map(async (integration: any) => {
        const base = {
          id: integration.id,
          name: integration.name,
          picture: integration.picture,
          identifier: integration.providerIdentifier,
        };
        try {
          const analytics = await this.checkAnalytics(
            org,
            integration.id,
            date
          );
          const metrics = (analytics || []).map((m) => {
            const values = (m.data || []).map((d) => Number(d.total) || 0);
            const isBalance = CUMULATIVE_HINTS.some((h) =>
              m.label?.toLowerCase().includes(h)
            );
            const total = isBalance
              ? values.filter(Boolean).slice(-1)[0] || 0
              : values.reduce((s, v) => s + v, 0);
            return {
              label: m.label,
              total,
              percentageChange: m.percentageChange ?? 0,
              series: (m.data || []).map((d) => ({
                date: d.date,
                value: Number(d.total) || 0,
              })),
            };
          });
          return { ...base, metrics };
        } catch {
          return { ...base, metrics: [], error: true };
        }
      })
    );
    return {
      channels: channels.filter(
        (c) => c.metrics.length || (c as any).error
      ),
    };
  }

  async checkAnalytics(
    org: Organization,
    integration: string,
    date: string,
    forceRefresh = false
  ): Promise<AnalyticsData[]> {
    const getIntegration = await this.getIntegrationById(org.id, integration);

    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    if (getIntegration.type !== 'social') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this.disconnectChannel(org.id, getIntegration);
        return [];
      }
    }

    const getIntegrationData = await ioRedis.get(
      `integration:${org.id}:${integration}:${date}`
    );
    if (getIntegrationData) {
      return JSON.parse(getIntegrationData);
    }

    if (integrationProvider.analytics) {
      try {
        const loadAnalytics = await integrationProvider.analytics(
          getIntegration.internalId,
          getIntegration.token,
          +date
        );
        await ioRedis.set(
          `integration:${org.id}:${integration}:${date}`,
          JSON.stringify(loadAnalytics),
          'EX',
          !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
            ? 1
            : 3600
        );
        return loadAnalytics;
      } catch (e) {
        if (e instanceof RefreshToken) {
          return this.checkAnalytics(org, integration, date, true);
        }
      }
    }

    return [];
  }

  // Bài nổi bật của page FB — đọc bài của CHÍNH kênh (kể cả bài đăng ngoài Hub)
  // bằng page token. Xếp theo engagement → "bài chiến thắng".
  // reactions/comments cần pages_read_user_content: thử bản đầy đủ trước, nếu
  // token chưa có quyền (chưa Refresh Channel) → tự lùi về share-only, không vỡ.
  async getTopPosts(org: Organization, integration: string, days: number) {
    const getIntegration = await this.getIntegrationById(org.id, integration);
    if (
      !getIntegration ||
      getIntegration.type !== 'social' ||
      getIntegration.providerIdentifier !== 'facebook'
    ) {
      return { posts: [] };
    }
    const cacheKey = `integration:top-posts:${org.id}:${integration}:${days}`;
    const cached = await ioRedis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const since = dayjs().subtract(days, 'day').unix();
    const base = `https://graph.facebook.com/v20.0/${getIntegration.internalId}/posts`;
    const query = (fields: string) =>
      `${base}?fields=${fields}&since=${since}&limit=50&access_token=${getIntegration.token}`;
    const RICH =
      'message,full_picture,permalink_url,created_time,shares,reactions.summary(true),comments.summary(true)';
    const BASIC = 'message,full_picture,permalink_url,created_time,shares';

    const call = async (fields: string) => {
      const res = await fetch(query(fields), {
        signal: AbortSignal.timeout(15000),
      });
      return res.json() as Promise<any>;
    };

    try {
      // Thử bản đầy đủ (có reactions/comments). Lỗi quyền (#10/#200) → lùi BASIC.
      let data = await call(RICH);
      let hasEngagement = true;
      if (data?.error) {
        const code = data.error?.code;
        if (code === 10 || code === 200 || code === 100) {
          data = await call(BASIC);
          hasEngagement = false;
        }
      }
      if (data?.error) {
        return {
          posts: [],
          error: String(data.error?.message || 'Graph error').slice(0, 200),
        };
      }
      const engagement = (p: any) =>
        (p.shares || 0) * 3 + (p.reactions || 0) + (p.comments || 0) * 2;
      const posts = (data?.data || [])
        .map((p: any) => ({
          id: p.id,
          message: (p.message || '').slice(0, 600),
          picture: p.full_picture || null,
          url: p.permalink_url,
          createdAt: p.created_time,
          shares: p.shares?.count || 0,
          reactions: p.reactions?.summary?.total_count ?? null,
          comments: p.comments?.summary?.total_count ?? null,
          clicks: null as number | null,
          views: null as number | null,
          reactionTypes: null as Record<string, number> | null,
        }))
        .sort((a: any, b: any) =>
          hasEngagement ? engagement(b) - engagement(a) : b.shares - a.shares
        );

      // Làm giàu top ~24 bài: clicks + video views + phân loại reaction — 1 batch.
      if (hasEngagement && posts.length) {
        const topIds = posts.slice(0, 24).map((p: any) => p.id);
        const ins = await this.fbBatchInsights(
          getIntegration.token,
          topIds,
          'post_clicks,post_video_views,post_reactions_by_type_total'
        ).catch(() => ({} as Record<string, any>));
        for (const p of posts) {
          const m = ins[p.id];
          if (m) {
            p.clicks = typeof m.post_clicks === 'number' ? m.post_clicks : null;
            p.views =
              typeof m.post_video_views === 'number' && m.post_video_views > 0
                ? m.post_video_views
                : null;
            p.reactionTypes = m.post_reactions_by_type_total || null;
          }
        }
      }

      // Tổng hợp toàn kênh cho dashboard.
      const totals = posts.reduce(
        (a: any, p: any) => ({
          shares: a.shares + (p.shares || 0),
          reactions: a.reactions + (p.reactions || 0),
          comments: a.comments + (p.comments || 0),
          clicks: a.clicks + (p.clicks || 0),
          views: a.views + (p.views || 0),
        }),
        { shares: 0, reactions: 0, comments: 0, clicks: 0, views: 0 }
      );
      const out = { posts, hasEngagement, totals, count: posts.length };
      await ioRedis.set(cacheKey, JSON.stringify(out), 'EX', 1800);
      return out;
    } catch {
      return { posts: [] };
    }
  }

  // Gọi Graph Batch API (1 HTTP call) lấy insights cho nhiều post. Trả map
  // id → { metricName: value }.
  private async fbBatchInsights(
    token: string,
    ids: string[],
    metrics: string
  ): Promise<Record<string, Record<string, any>>> {
    if (!ids.length) return {};
    const batch = ids.map((id) => ({
      method: 'GET',
      relative_url: `${id}/insights?metric=${metrics}`,
    }));
    const body = new URLSearchParams();
    body.set('access_token', token);
    body.set('batch', JSON.stringify(batch));
    const res = await fetch('https://graph.facebook.com/v23.0/', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(20000),
    });
    const arr: any[] = await res.json();
    const out: Record<string, Record<string, any>> = {};
    if (!Array.isArray(arr)) return out;
    arr.forEach((r, i) => {
      if (!r || r.code !== 200) return;
      try {
        const parsed = JSON.parse(r.body);
        const m: Record<string, any> = {};
        for (const d of parsed.data || []) m[d.name] = d.values?.[0]?.value;
        out[ids[i]] = m;
      } catch {
        /* bỏ qua bài lỗi */
      }
    });
    return out;
  }

  // AI phân tích "bài chiến thắng" của kênh + gợi ý content. Cache 1h.
  async getWinningAnalysis(org: Organization, integration: string) {
    const getIntegration = await this.getIntegrationById(org.id, integration);
    if (!getIntegration) return null;
    const cacheKey = `integration:winning:${org.id}:${integration}`;
    const cached = await ioRedis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const top = await this.getTopPosts(org, integration, 90);
    const posts = (top?.posts || []).filter((p: any) => (p.message || '').trim());
    if (!posts.length) return { empty: true };
    const analysis = await this._openaiService
      .analyzeChannelWinners(getIntegration.name, posts.slice(0, 20))
      .catch(() => null);
    if (!analysis) return { empty: true };
    await ioRedis.set(cacheKey, JSON.stringify(analysis), 'EX', 3600);
    return analysis;
  }

  // AI trả lời câu hỏi về hiệu suất kênh (dùng dữ liệu bài + tổng hợp làm ngữ cảnh).
  async askAboutChannel(
    org: Organization,
    integration: string,
    question: string,
    history: { role: string; content: string }[]
  ) {
    const getIntegration = await this.getIntegrationById(org.id, integration);
    if (!getIntegration) return { answer: '' };
    const top = await this.getTopPosts(org, integration, 90);
    const posts = (top?.posts || []).slice(0, 15);
    const context =
      `Kênh: ${getIntegration.name} (Facebook).\n` +
      `Tổng (90 ngày, ${top?.count || 0} bài): ${JSON.stringify(top?.totals || {})}.\n` +
      `Top bài (message | reactions/comments/shares/clicks):\n` +
      posts
        .map(
          (p: any) =>
            `- "${(p.message || '').slice(0, 140).replace(/\n/g, ' ')}" | ${p.reactions ?? '-'}/${p.comments ?? '-'}/${p.shares ?? 0}/${p.clicks ?? '-'}`
        )
        .join('\n');
    const answer = await this._openaiService
      .answerAboutChannel(context, question, history)
      .catch(() => '');
    return { answer };
  }

  customers(orgId: string) {
    return this._integrationRepository.customers(orgId);
  }

  getPlugsByIntegrationId(org: string, integrationId: string) {
    return this._integrationRepository.getPlugsByIntegrationId(
      org,
      integrationId
    );
  }

  async processInternalPlug(
    data: {
      post: string;
      originalIntegration: string;
      integration: string;
      plugName: string;
      orgId: string;
      delay: number;
      information: any;
    },
    forceRefresh = false
  ): Promise<any> {
    const originalIntegration =
      await this._integrationRepository.getIntegrationById(
        data.orgId,
        data.originalIntegration
      );

    const getIntegration = await this._integrationRepository.getIntegrationById(
      data.orgId,
      data.integration
    );

    if (!getIntegration || !originalIntegration) {
      return;
    }

    const getAllInternalPlugs = this._integrationManager
      .getInternalPlugs(getIntegration.providerIdentifier)
      .internalPlugs.find((p: any) => p.identifier === data.plugName);

    if (!getAllInternalPlugs) {
      return;
    }

    const getSocialIntegration = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    // @ts-ignore
    await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(
      getIntegration,
      originalIntegration,
      data.post,
      data.information
    );

    return;
  }

  async processPlugs(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    const getPlugById = await this._integrationRepository.getPlug(data.plugId);
    if (!getPlugById) {
      return true;
    }

    const integration = this._integrationManager.getSocialIntegration(
      getPlugById.integration.providerIdentifier
    );

    // @ts-ignore
    const process = await integration[getPlugById.plugFunction](
      getPlugById.integration,
      data.postId,
      JSON.parse(getPlugById.data).reduce((all: any, current: any) => {
        all[current.name] = current.value;
        return all;
      }, {})
    );

    if (process) {
      return true;
    }

    if (data.totalRuns === data.currentRun) {
      return true;
    }

    return false;
  }

  async createOrUpdatePlug(
    orgId: string,
    integrationId: string,
    body: PlugDto
  ) {
    const { activated } = await this._integrationRepository.createOrUpdatePlug(
      orgId,
      integrationId,
      body
    );

    return {
      activated,
    };
  }

  async changePlugActivation(orgId: string, plugId: string, status: boolean) {
    const { id, integrationId, plugFunction } =
      await this._integrationRepository.changePlugActivation(
        orgId,
        plugId,
        status
      );

    return { id };
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._integrationRepository.getPlugs(orgId, integrationId);
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    const exisingData = await this._integrationRepository.loadExisingData(
      methodName,
      integrationId,
      id
    );
    const loadOnlyIds = exisingData.map((p) => p.value);
    return difference(id, loadOnlyIds);
  }

  async findFreeDateTime(
    orgId: string,
    integrationsId?: string
  ): Promise<number[]> {
    const findTimes = await this._integrationRepository.getPostingTimes(
      orgId,
      integrationsId
    );
    return uniq(
      findTimes.reduce((all: any, current: any) => {
        return [
          ...all,
          ...JSON.parse(current.postingTimes).map(
            (p: { time: number }) => p.time
          ),
        ];
      }, [] as number[])
    );
  }
}
