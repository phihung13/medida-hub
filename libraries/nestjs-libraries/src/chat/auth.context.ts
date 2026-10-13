import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';
import type { McpLevel } from '@gitroom/nestjs-libraries/database/prisma/mcp-keys/mcp-key.service';
import { requireLevel } from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// `need`: mức quyền tối thiểu khi gọi bằng khoá MCP riêng (mcpLevel). API key
// tổ chức / OAuth / trang Agent trong app không có mcpLevel → không bị chặn.
export const checkAuth = (
  inputData: any,
  context: any,
  need?: McpLevel
) => {
  const auth = getAuth();
  const authInfo = context?.mcp?.extra?.authInfo || auth;
  if (need && authInfo?.mcpLevel) {
    requireLevel(authInfo, need);
  }
  if (authInfo && context?.requestContext) {
    (context.requestContext as any).set(
      'organization',
      JSON.stringify(authInfo)
    );
    (context.requestContext as any).set('ui', 'false');
  }
};
