import { Injectable } from '@nestjs/common';
import { HubPostsTools } from '@gitroom/nestjs-libraries/chat/hub/hub.posts.tools';
import { HubInsightsTools } from '@gitroom/nestjs-libraries/chat/hub/hub.insights.tools';
import { HubAutopostTools } from '@gitroom/nestjs-libraries/chat/hub/hub.autopost.tools';
import { HubViralTools } from '@gitroom/nestjs-libraries/chat/hub/hub.viral.tools';
import { HubZaloTools } from '@gitroom/nestjs-libraries/chat/hub/hub.zalo.tools';
import { HubImageTools } from '@gitroom/nestjs-libraries/chat/hub/hub.image.tools';
import { HubComposeTools } from '@gitroom/nestjs-libraries/chat/hub/hub.compose.tools';
import { HubChannelsTools } from '@gitroom/nestjs-libraries/chat/hub/hub.channels.tools';
import { HubViralExtraTools } from '@gitroom/nestjs-libraries/chat/hub/hub.viral.extra.tools';
import { HubAutomationTools } from '@gitroom/nestjs-libraries/chat/hub/hub.automation.tools';
import { HubZaloAdminTools } from '@gitroom/nestjs-libraries/chat/hub/hub.zalo.admin.tools';
import { HubShareTools } from '@gitroom/nestjs-libraries/chat/hub/hub.share.tools';
import { HubReportTools } from '@gitroom/nestjs-libraries/chat/hub/hub.report.tools';
import { HubToolMap } from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

export const hubToolGroups = [
  HubPostsTools,
  HubInsightsTools,
  HubAutopostTools,
  HubViralTools,
  HubZaloTools,
  HubImageTools,
  HubComposeTools,
  HubChannelsTools,
  HubViralExtraTools,
  HubAutomationTools,
  HubZaloAdminTools,
  HubShareTools,
  HubReportTools,
];

// Gộp mọi nhóm công cụ Hub cho máy chủ MCP (start.mcp.ts). Không nạp vào
// agent trong app (trang /agents) để agent đó không bị ngợp công cụ.
@Injectable()
export class HubToolsService {
  constructor(
    private _posts: HubPostsTools,
    private _insights: HubInsightsTools,
    private _autopost: HubAutopostTools,
    private _viral: HubViralTools,
    private _zalo: HubZaloTools,
    private _image: HubImageTools,
    private _compose: HubComposeTools,
    private _channels: HubChannelsTools,
    private _viralExtra: HubViralExtraTools,
    private _automation: HubAutomationTools,
    private _zaloAdmin: HubZaloAdminTools,
    private _share: HubShareTools,
    private _report: HubReportTools
  ) {}

  tools(): HubToolMap {
    return {
      ...this._posts.tools(),
      ...this._insights.tools(),
      ...this._autopost.tools(),
      ...this._viral.tools(),
      ...this._zalo.tools(),
      ...this._image.tools(),
      ...this._compose.tools(),
      ...this._channels.tools(),
      ...this._viralExtra.tools(),
      ...this._automation.tools(),
      ...this._zaloAdmin.tools(),
      ...this._share.tools(),
      ...this._report.tools(),
    };
  }
}
