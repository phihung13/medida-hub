import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { McpKeyRepository } from '@gitroom/nestjs-libraries/database/prisma/mcp-keys/mcp-key.repository';

// ============================================================================
//  Khoá MCP riêng cho agent ngoài (Hermes…). Khác API key của tổ chức (toàn
//  quyền), mỗi khoá này có một mức quyền và thu hồi riêng được:
//    doc  — chỉ đọc (lịch, kênh, số liệu, hàng chờ Zalo…)
//    nhap — thêm: tạo/sửa bài NHÁP, chạy AI, tải media, ghi chú nội bộ
//    dang — thêm: lên lịch / đăng ngay / duyệt đăng Zalo, đổi cấu hình, xoá
// ============================================================================

export const MCP_LEVELS = ['doc', 'nhap', 'dang'] as const;
export type McpLevel = (typeof MCP_LEVELS)[number];

export const MCP_KEY_PREFIX = 'hub_mcp_';
const MAX_ACTIVE_KEYS = 10;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class McpKeyService {
  constructor(private _repository: McpKeyRepository) {}

  listKeys(organizationId: string) {
    return this._repository.activeKeys(organizationId);
  }

  async createKey(
    organizationId: string,
    createdBy: string,
    body: { name?: string; level?: string }
  ) {
    const level = body?.level as McpLevel;
    if (!MCP_LEVELS.includes(level)) {
      throw new BadRequestException('Mức quyền phải là doc, nhap hoặc dang.');
    }
    const name = String(body?.name || '').trim().slice(0, 60);
    if (!name) {
      throw new BadRequestException('Đặt tên cho khoá (vd: Hermes).');
    }
    const active = await this._repository.activeKeys(organizationId);
    if (active.length >= MAX_ACTIVE_KEYS) {
      throw new BadRequestException(
        `Đã có ${MAX_ACTIVE_KEYS} khoá — thu hồi bớt khoá cũ trước khi tạo khoá mới.`
      );
    }
    const key = `${MCP_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
    const row = await this._repository.createKey({
      organizationId,
      name,
      level,
      hash: sha256(key),
      last4: key.slice(-4),
      createdBy,
    });
    return { ...row, key };
  }

  revokeKey(organizationId: string, id: string) {
    return this._repository.revokeKey(organizationId, id);
  }

  /**
   * Khoá → tổ chức kèm mức quyền (mcpLevel) và người tạo khoá (mcpUserId,
   * dùng làm tác giả ghi chú nội bộ). Sai / đã thu hồi → null.
   */
  async resolve(token: string) {
    if (!token?.startsWith(MCP_KEY_PREFIX)) return null;
    const row = await this._repository.findActiveKey(sha256(token));
    if (!row) return null;
    const organization = await this._repository.getOrganization(
      row.organizationId
    );
    if (!organization) return null;
    // Ghi "lần cuối dùng" thưa thôi (5 phút/lần), đỡ ghi DB mỗi lượt gọi.
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
      this._repository.touchKey(row.id).catch(() => undefined);
    }
    return {
      ...organization,
      mcpLevel: row.level as McpLevel,
      mcpKeyId: row.id,
      mcpUserId: row.createdBy || undefined,
    };
  }
}
