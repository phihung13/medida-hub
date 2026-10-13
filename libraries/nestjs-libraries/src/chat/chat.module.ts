import { Global, Module } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import {
  HubToolsService,
  hubToolGroups,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tools.service';

@Global()
@Module({
  providers: [
    MastraService,
    LoadToolsService,
    ...toolList,
    ...hubToolGroups,
    HubToolsService,
  ],
  get exports() {
    return this.providers;
  },
})
export class ChatModule {}
