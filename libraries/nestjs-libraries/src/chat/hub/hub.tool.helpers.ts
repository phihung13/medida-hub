import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Organization } from '@prisma/client';
import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';
import type { McpLevel } from '@gitroom/nestjs-libraries/database/prisma/mcp-keys/mcp-key.service';

// ============================================================================
//  Nền chung của bộ công cụ MCP "Hub" (chỉ phục vụ /mcp, không nạp vào trang
//  Agent trong app). Mỗi công cụ khai báo mức quyền tối thiểu:
//    doc < nhap < dang   (xem McpKeyService)
//  Khoá MCP riêng mang mcpLevel; API key tổ chức / OAuth không có → toàn quyền
//  như trước (giữ nguyên hành vi cho người đang dùng).
// ============================================================================

export type HubOrg = Organization & {
  mcpLevel?: McpLevel;
  mcpKeyId?: string;
  mcpUserId?: string;
};

const RANK: Record<McpLevel, number> = { doc: 1, nhap: 2, dang: 3 };
export const LEVEL_LABEL: Record<McpLevel, string> = {
  doc: 'chỉ đọc',
  nhap: 'tạo nháp',
  dang: 'được đăng',
};

// Bài do agent ngoài tạo — mã agent trong báo cáo /noi-dung (hub.agents.ts).
export const MCP_AGENT = 'mcp-ngoai';

export class HubToolError extends Error {}

export const hubOrg = (context: any): HubOrg => {
  const auth = context?.mcp?.extra?.authInfo || getAuth();
  if (auth?.id) return auth as HubOrg;
  const raw = context?.requestContext?.get?.('organization');
  if (raw) return JSON.parse(raw) as HubOrg;
  throw new HubToolError('Chưa xác thực — gọi /mcp kèm khoá.');
};

export const hasLevel = (org: HubOrg, need: McpLevel) =>
  RANK[org.mcpLevel || 'dang'] >= RANK[need];

export const requireLevel = (org: HubOrg, need: McpLevel, what?: string) => {
  if (!hasLevel(org, need)) {
    throw new HubToolError(
      `Khoá MCP này chỉ có quyền "${LEVEL_LABEL[org.mcpLevel || 'doc']}" — ${
        what || 'thao tác này'
      } cần quyền "${LEVEL_LABEL[need]}". Nhờ quản trị viên cấp khoá mức cao hơn (Cài đặt → Kết nối agent MCP).`
    );
  }
};

// Cắt chuỗi dài / mảng dài để kết quả trả agent không phình (MCP client có
// giới hạn ngữ cảnh). Không đụng số, ngày, boolean.
export const trimDeep = (
  value: any,
  maxStr = 1500,
  maxArr = 100,
  depth = 0
): any => {
  if (value == null || depth > 8) return value;
  if (typeof value === 'string') {
    return value.length > maxStr
      ? value.slice(0, maxStr) + `… (+${value.length - maxStr} ký tự)`
      : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const out = value
      .slice(0, maxArr)
      .map((v) => trimDeep(v, maxStr, maxArr, depth + 1));
    if (value.length > maxArr) {
      out.push(`… còn ${value.length - maxArr} mục nữa (lọc hẹp lại để xem)`);
    }
    return out;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      // ảnh base64 / buffer không có ích cho agent
      if (typeof v === 'string' && v.startsWith('data:') && v.length > 200) {
        out[k] = '(dữ liệu nhị phân — bỏ qua)';
        continue;
      }
      out[k] = trimDeep(v, maxStr, maxArr, depth + 1);
    }
    return out;
  }
  return value;
};

// HTML (nội dung bài) → chữ thường, để xem trước.
export const htmlToText = (html?: string | null) =>
  String(html || '')
    .replace(/<\/(p|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Chữ thường → HTML trình soạn (mỗi dòng một <p>). Đã là HTML thì giữ nguyên.
export const toPostHtml = (text: string) => {
  const t = String(text ?? '');
  if (/<(p|h[1-3]|ul|li|strong|u)\b[^>]*>/i.test(t)) return t;
  return t
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
};

const MAX_RESULT_CHARS = 120_000;

/**
 * Tạo một công cụ MCP của Hub: kiểm quyền theo `level` (hoặc `levelOf` khi
 * mức quyền tuỳ đầu vào, vd sửa nháp ≠ sửa bài đã lên lịch), bắt lỗi thành
 * { loi } để agent đọc được và tự sửa, cắt kết quả quá dài.
 */
export const hubTool = <S extends z.ZodTypeAny>(def: {
  id: string;
  title: string;
  level: McpLevel;
  description: string;
  input: S;
  destructive?: boolean;
  openWorld?: boolean;
  // Mức 'doc' nhưng có hành động ghi (kiểm quyền cao hơn bên trong run) →
  // không gắn nhãn chỉ-đọc cho client MCP.
  writes?: boolean;
  run: (input: z.infer<S>, org: HubOrg) => Promise<any>;
}) =>
  createTool({
    id: def.id,
    description: `[Quyền tối thiểu: ${LEVEL_LABEL[def.level]}] ${def.description}`,
    mcp: {
      annotations: {
        title: def.title,
        readOnlyHint: def.level === 'doc' && !def.writes,
        destructiveHint: !!def.destructive,
        idempotentHint: def.level === 'doc' && !def.writes,
        openWorldHint: !!def.openWorld,
      },
    },
    inputSchema: def.input,
    execute: async (inputData: any, context: any) => {
      try {
        const org = hubOrg(context);
        requireLevel(org, def.level);
        const out = await def.run(inputData, org);
        const result = trimDeep(out ?? { ok: true });
        const size = JSON.stringify(result)?.length || 0;
        if (size > MAX_RESULT_CHARS) {
          return {
            canh_bao: `Kết quả quá dài (${size} ký tự) — đã cắt. Lọc hẹp lại (ngày, trạng thái, trang…) để xem đủ.`,
            du_lieu: JSON.stringify(result).slice(0, MAX_RESULT_CHARS),
          };
        }
        return result;
      } catch (e: any) {
        const msg =
          e?.response?.message ||
          e?.response?.error ||
          (typeof e?.getResponse === 'function'
            ? JSON.stringify(e.getResponse())
            : null) ||
          e?.message ||
          String(e);
        return { loi: typeof msg === 'string' ? msg : JSON.stringify(msg) };
      }
    },
  });

export type HubToolMap = Record<string, ReturnType<typeof hubTool>>;

export interface HubToolGroup {
  tools(): HubToolMap;
}
