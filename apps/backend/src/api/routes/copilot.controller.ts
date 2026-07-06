import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
  Body,
  HttpException,
} from '@nestjs/common';
import {
  ANTHROPIC_MODELS,
  getAnthropicKey,
  getAnthropicModel,
  setAnthropicKey,
  setAnthropicModel,
} from '@gitroom/nestjs-libraries/openai/anthropic.key';
import {
  getImageGenStatus,
  setImageGenConfig,
  ImageProvider,
} from '@gitroom/nestjs-libraries/openai/image.key';
import {
  CopilotRuntime,
  AnthropicAdapter,
  copilotRuntimeNodeHttpEndpoint,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

export type ChannelsContext = {
  integrations: string;
  organization: string;
  ui: string;
};

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService
  ) {}

  // Key Claude là biến TOÀN CỤC của cả instance (dùng chung mọi org) → chỉ chủ
  // hệ thống (super admin) được xem/đổi/đồng bộ, tránh thành viên team ghi đè.
  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new HttpException('Chỉ quản trị hệ thống mới đổi được cấu hình này.', 403);
    }
  }

  // Trạng thái key Claude (cho UI Settings hiển thị đã lưu chưa).
  @Get('/anthropic-key')
  anthropicKeyStatus(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const k = getAnthropicKey();
    return {
      hasKey: !!k,
      masked: k ? k.slice(0, 12) + '…' : '',
      model: getAnthropicModel(),
      models: ANTHROPIC_MODELS,
    };
  }

  // Lưu key Claude nhập từ UI Settings (ghi file + set runtime, không cần .env).
  @Post('/anthropic-key')
  saveAnthropicKey(
    @GetUserFromRequest() user: User,
    @Body() body: { key?: string; model?: string; clear?: boolean }
  ) {
    this.assertSuperAdmin(user);
    if (body?.clear) {
      setAnthropicKey('');
      return { ok: true, cleared: true };
    }
    // Đổi model (có thể gửi riêng, không kèm key) — đồng bộ luôn sang bot Zalo
    // (best-effort: bot tắt thì model Hub vẫn đổi, bot nhận khi sync kế tiếp).
    if (body?.model) {
      if (!(ANTHROPIC_MODELS as readonly string[]).includes(body.model)) {
        throw new HttpException({ msg: 'Model không hợp lệ' }, 400);
      }
      setAnthropicModel(body.model);
      const botUrl = process.env.ZALO_BOT_URL || 'http://localhost:8088';
      fetch(`${botUrl}/api/claude/key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: body.model }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
    const key = (body?.key || '').trim();
    if (!key) {
      if (body?.model) return { ok: true, model: getAnthropicModel() };
      throw new HttpException({ msg: 'Thiếu key hoặc model' }, 400);
    }
    if (!key.startsWith('sk-ant-')) {
      throw new HttpException(
        { msg: 'Key không hợp lệ (phải bắt đầu bằng sk-ant-)' },
        400
      );
    }
    setAnthropicKey(key);
    return { ok: true, model: getAnthropicModel() };
  }

  // Kiểm tra key Claude có chạy không (gọi thử API thật) — cho nút "Kiểm tra" ở UI.
  @Get('/anthropic-key/test')
  async testAnthropicKey(): Promise<{
    ok: boolean;
    model?: string;
    error?: string;
  }> {
    const key = getAnthropicKey();
    if (!key) return { ok: false, error: 'Chưa có key — hãy Lưu key trước.' };
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: key });
      const msg = await client.messages.create({
        model: getAnthropicModel(),
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true, model: msg.model };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Gọi Claude lỗi' };
    }
  }

  // Dùng CHUNG key Claude của Media Hub cho bot Zalo: backend gửi thẳng key
  // sang bot (server→server trong máy, key không đi qua trình duyệt) rồi test.
  // → user không phải quản lý 2 key riêng cho 2 hệ nữa.
  @Post('/anthropic-key/sync-zalo-bot')
  async syncAnthropicKeyToZaloBot(
    @GetUserFromRequest() user: User
  ): Promise<{
    ok: boolean;
    model?: string;
    error?: string;
  }> {
    this.assertSuperAdmin(user);
    const key = getAnthropicKey();
    if (!key) {
      throw new HttpException(
        'Media Hub chưa có key Claude — vào Settings dán key trước.',
        400
      );
    }
    const botUrl = process.env.ZALO_BOT_URL || 'http://localhost:8088';
    try {
      const save = await fetch(`${botUrl}/api/claude/key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, model: getAnthropicModel() }),
        signal: AbortSignal.timeout(8000), // bot treo → không chờ 5 phút
      });
      if (!save.ok) {
        const detail = await save.text().catch(() => '');
        throw new Error(`bot trả ${save.status}: ${detail.slice(0, 120)}`);
      }
      const test: any = await (
        await fetch(`${botUrl}/api/claude/test`, { signal: AbortSignal.timeout(8000) })
      ).json();
      return { ok: !!test.ok, model: test.model, error: test.error };
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        'Không gửi được key sang bot Zalo: ' + (e?.message || 'lỗi kết nối'),
        400
      );
    }
  }

  // Cấu hình tạo ảnh AI (nhà cung cấp + key) — biến toàn cục instance → super admin.
  @Get('/image-key')
  imageKeyStatus(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return getImageGenStatus();
  }

  @Post('/image-key')
  saveImageKey(
    @GetUserFromRequest() user: User,
    @Body() body: { provider?: string; key?: string; clear?: boolean }
  ) {
    this.assertSuperAdmin(user);
    const provider: ImageProvider = body?.provider === 'fal' ? 'fal' : 'openai';
    if (body?.clear) {
      setImageGenConfig(provider, '');
      return { ok: true, cleared: true };
    }
    setImageGenConfig(provider, (body?.key || '').trim());
    return { ok: true, ...getImageGenStatus() };
  }

  @Post('/chat')
  chatAgent(@Req() req: Request, @Res() res: Response) {
    if (!getAnthropicKey()) {
      Logger.warn('Anthropic (Claude) API key not set, chat functionality will not work');
      // Trả lỗi rõ ràng thay vì treo request (client sẽ hiện thông báo thay vì "[Network] Unknown error")
      res.status(400).json({
        error:
          'Chưa cấu hình Claude API key. Vào Settings → "Claude API key" để thêm.',
      });
      return;
    }

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      runtime: new CopilotRuntime(),
      serviceAdapter: new AnthropicAdapter({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      }),
    });

    return copilotRuntimeHandler(req, res);
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    if (!getAnthropicKey()) {
      Logger.warn('Anthropic (Claude) API key not set, chat functionality will not work');
      // Trả lỗi rõ ràng thay vì treo request (client sẽ hiện thông báo thay vì "[Network] Unknown error")
      res.status(400).json({
        error:
          'Chưa cấu hình Claude API key. Vào Settings → "Claude API key" để thêm.',
      });
      return;
    }
    const mastra = await this._mastraService.mastra();
    const requestContext = new RequestContext<ChannelsContext>();
    requestContext.set(
      'integrations',
      req?.body?.variables?.properties?.integrations || []
    );

    requestContext.set('organization', JSON.stringify(organization));
    requestContext.set('ui', 'true');

    // Mastra 1.21: listAgents() là ASYNC, còn @ag-ui/mastra 1.0.1 gọi SYNC bên trong
    // getLocalAgents → Object.entries(Promise) = [] → agent "postiz" biến mất.
    // Tự build map agent, tương thích cả sync lẫn async.
    const registered: Record<string, any> =
      (await Promise.resolve((mastra as any).listAgents?.() ?? {})) || {};
    const agents: Record<string, any> = {};
    for (const [agentId, agentInstance] of Object.entries(registered)) {
      agents[agentId] = new MastraAgent({
        agentId,
        agent: agentInstance,
        resourceId: organization.id,
        requestContext: requestContext as any,
      } as any);
    }
    if (!Object.keys(agents).length) {
      // Dự phòng: lấy thẳng agent "postiz" nếu registry không liệt kê được
      try {
        const single = await Promise.resolve(
          (mastra as any).getAgentById?.('postiz') ??
            (mastra as any).getAgent?.('postiz')
        );
        if (single) {
          agents['postiz'] = new MastraAgent({
            agentId: 'postiz',
            agent: single,
            resourceId: organization.id,
            requestContext: requestContext as any,
          } as any);
        }
      } catch {
        /* không có agent — availableAgents sẽ rỗng */
      }
    }

    const runtime = new CopilotRuntime({
      agents,
    });

    const copilotRuntimeHandler = copilotRuntimeNextJSAppRouterEndpoint({
      endpoint: '/copilot/agent',
      runtime,
      // properties: req.body.variables.properties,
      serviceAdapter: new AnthropicAdapter({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      }),
    });

    return copilotRuntimeHandler.handleRequest(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    const list = await memory.listThreads({
      filter: { resourceId: organization.id },
      perPage: 100000,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }

  // Xóa 1 cuộc chat — verify thread thuộc đúng org trước khi xóa (không cho
  // xóa chat của org khác).
  @Post('/list/:id/delete')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async deleteThread(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string
  ) {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    const thread = await memory.getThreadById({ threadId: id });
    if (!thread || thread.resourceId !== organization.id) {
      throw new HttpException('Không tìm thấy cuộc chat.', 404);
    }
    await memory.deleteThread(id);
    return { ok: true };
  }
}
