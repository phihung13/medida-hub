import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaBoardRepository } from '@gitroom/nestjs-libraries/database/prisma/media-board/media-board.repository';

// Thẻ video lưu nguyên khối trong cột Json `data`; `status` được nhân ra cột
// riêng để lọc. Client luôn nhận thẻ phẳng dạng {id, ...data}.
const DEFAULT_STATUS = 'kich-ban';

const clean = (body: Record<string, any>) => {
  const { id, organizationId, ...rest } = body || {};
  return rest;
};

const toCard = (row: { id: string; status: string; data: any }) => ({
  ...(row.data || {}),
  id: row.id,
  status: row.status,
});

@Injectable()
export class MediaBoardService {
  constructor(private _repository: MediaBoardRepository) {}

  async getConfig(orgId: string) {
    const row = await this._repository.getConfig(orgId);
    return (row?.data as Record<string, any>) || {};
  }

  async saveConfig(orgId: string, data: Record<string, any>) {
    const row = await this._repository.saveConfig(orgId, clean(data));
    return row.data;
  }

  async listVideos(orgId: string) {
    return (await this._repository.listVideos(orgId)).map(toCard);
  }

  async createVideo(orgId: string, body: Record<string, any>) {
    const data = clean(body);
    const status = String(data.status || DEFAULT_STATUS);
    return toCard(
      await this._repository.createVideo(orgId, status, { ...data, status })
    );
  }

  // Thay cả thẻ (giống set() của bản gốc).
  async setVideo(orgId: string, id: string, body: Record<string, any>) {
    const data = clean(body);
    const status = String(data.status || DEFAULT_STATUS);
    if (!(await this._repository.updateVideo(orgId, id, status, { ...data, status }))) {
      throw new NotFoundException();
    }
    return { ...data, id, status };
  }

  // Gộp trường cấp 1 vào thẻ cũ (giống update() của bản gốc) — dùng khi kéo–thả.
  async patchVideo(orgId: string, id: string, patch: Record<string, any>) {
    const row = await this._repository.getVideo(orgId, id);
    if (!row) {
      throw new NotFoundException();
    }
    const data = { ...((row.data as Record<string, any>) || {}), ...clean(patch) };
    const status = String(data.status || row.status || DEFAULT_STATUS);
    if (!(await this._repository.updateVideo(orgId, id, status, { ...data, status }))) {
      throw new NotFoundException();
    }
    return { ...data, id, status };
  }

  async deleteVideo(orgId: string, id: string) {
    if (!(await this._repository.deleteVideo(orgId, id))) {
      throw new NotFoundException();
    }
    return { id };
  }
}
