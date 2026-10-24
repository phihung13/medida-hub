import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

// Bảng sản xuất Media — mọi truy vấn đều lọc theo organizationId, kể cả khi
// sửa/xoá theo id (không bao giờ chạm thẻ của tổ chức khác).
@Injectable()
export class MediaBoardRepository {
  constructor(
    private _video: PrismaRepository<'mediaVideo'>,
    private _config: PrismaRepository<'mediaBoardConfig'>
  ) {}

  getConfig(orgId: string) {
    return this._config.model.mediaBoardConfig.findUnique({
      where: { organizationId: orgId },
    });
  }

  saveConfig(orgId: string, data: Record<string, any>) {
    return this._config.model.mediaBoardConfig.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, data },
      update: { data },
    });
  }

  listVideos(orgId: string) {
    return this._video.model.mediaVideo.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  getVideo(orgId: string, id: string) {
    return this._video.model.mediaVideo.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  createVideo(orgId: string, status: string, data: Record<string, any>) {
    return this._video.model.mediaVideo.create({
      data: { organizationId: orgId, status, data },
    });
  }

  async updateVideo(
    orgId: string,
    id: string,
    status: string,
    data: Record<string, any>
  ) {
    const { count } = await this._video.model.mediaVideo.updateMany({
      where: { id, organizationId: orgId },
      data: { status, data },
    });
    return count > 0;
  }

  async deleteVideo(orgId: string, id: string) {
    const { count } = await this._video.model.mediaVideo.deleteMany({
      where: { id, organizationId: orgId },
    });
    return count > 0;
  }
}
