import { Injectable } from '@nestjs/common';
import { HubPostsTools } from '@gitroom/nestjs-libraries/chat/hub/hub.posts.tools';
import { HubInsightsTools } from '@gitroom/nestjs-libraries/chat/hub/hub.insights.tools';
import { HubAutopostTools } from '@gitroom/nestjs-libraries/chat/hub/hub.autopost.tools';
import { HubViralTools } from '@gitroom/nestjs-libraries/chat/hub/hub.viral.tools';
import { HubZaloTools } from '@gitroom/nestjs-libraries/chat/hub/hub.zalo.tools';
import { HubToolMap } from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

export const hubToolGroups = [
  HubPostsTools,
  HubInsightsTools,
  HubAutopostTools,
  HubViralTools,
  HubZaloTools,
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
    private _zalo: HubZaloTools
  ) {}

  tools(): HubToolMap {
    return {
      ...this._posts.tools(),
      ...this._insights.tools(),
      ...this._autopost.tools(),
      ...this._viral.tools(),
      ...this._zalo.tools(),
    };
  }
}
