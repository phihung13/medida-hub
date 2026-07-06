import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import {
  getImageProvider,
  hasImageGenKey,
} from '@gitroom/nestjs-libraries/openai/image.key';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { GenerateAiCaptionDto } from '@gitroom/nestjs-libraries/dtos/media/generate.ai.caption.dto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    // Chưa cấu hình key tạo ảnh → báo rõ, KHÔNG tạo ảnh hỏng.
    if (!hasImageGenKey()) {
      throw new HttpException(
        'Chưa cấu hình key tạo ảnh. Vào Cài đặt → "Tạo ảnh AI" để thêm key (OpenAI hoặc Fal).',
        400
      );
    }
    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
          }
          // Định tuyến theo nhà cung cấp đã chọn (đa nhà cung cấp).
          if (getImageProvider() === 'fal') {
            return this.generateImageFal(prompt);
          }
          return this._openAi.generateImage(prompt);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  // Fal trả URL ảnh → tải về, đổi sang base64 để đồng nhất với OpenAI
  // (controller bọc thành data:image/...;base64,).
  private async generateImageFal(prompt: string): Promise<string> {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: 'square_hd',
        num_images: 1,
        output_format: 'jpeg',
      }),
    });
    if (!res.ok) {
      throw new Error(`Fal lỗi ${res.status}: ${(await res.text()).slice(0, 120)}`);
    }
    const data: any = await res.json();
    const url = data?.images?.[0]?.url;
    if (!url) throw new Error('Fal không trả ảnh');
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    return buf.toString('base64');
  }

  // Nút "bút phép thuật" trong composer: đọc ảnh từ đĩa (storage local) hoặc
  // fetch URL (storage cloud) → Claude vision viết caption bài + caption từng ảnh.
  async generateAiCaptions(org: Organization, body: GenerateAiCaptionDto) {
    const images: { id: string; base64: string; mediaType: string }[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const id of body.mediaIds) {
      const media = await this._mediaRepository.getMediaById(id);
      // getMediaById không lọc org — bắt buộc tự kiểm để không lộ ảnh org khác.
      if (!media || media.organizationId !== org.id || media.deletedAt) {
        skipped.push({ id, reason: 'không tìm thấy ảnh' });
        continue;
      }
      const ext = (media.path.split('?')[0].split('.').pop() || '').toLowerCase();
      if (['mp4', 'mov', 'webm', 'mp3', 'wav', 'm4a'].includes(ext)) {
        skipped.push({ id, reason: 'video/audio — AI chỉ đọc ảnh' });
        continue;
      }
      try {
        const buffer = await this.loadMediaBuffer(media.path);
        // Chặn ảnh quá lớn (giữ bộ nhớ ổn định khi nhiều ảnh × nhiều user).
        if (buffer.length > 20 * 1024 * 1024) {
          skipped.push({ id, reason: 'ảnh quá lớn (>20MB)' });
          continue;
        }
        // Claude vision chỉ nhận jpeg/png/gif/webp, ảnh ≤5MB — quy hết về JPEG ≤1568px.
        // limitInputPixels chặn "decompression bomb" (ảnh pixel khổng lồ).
        const jpeg = await sharp(buffer, { limitInputPixels: 50_000_000 })
          .rotate()
          .resize({
            width: 1568,
            height: 1568,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        images.push({
          id,
          base64: jpeg.toString('base64'),
          mediaType: 'image/jpeg',
        });
      } catch {
        skipped.push({ id, reason: 'không đọc được file ảnh' });
      }
    }

    if (!images.length) {
      throw new HttpException(
        'Không đọc được ảnh nào để viết caption (chỉ hỗ trợ ảnh, không hỗ trợ video).',
        400
      );
    }

    let result;
    try {
      result = await this._openAi.generateCaptionsForImages(
        images.map(({ base64, mediaType }) => ({ base64, mediaType })),
        body.context
      );
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Giữ nguyên message hữu ích (vd "Chưa có key Claude...") cho frontend —
      // Error thường sẽ bị Nest nuốt thành "Internal server error" vô nghĩa.
      throw new HttpException(
        err?.message || 'Không viết được caption — thử lại lần nữa.',
        400
      );
    }

    if (!result) {
      throw new HttpException(
        'AI không trả về kết quả hợp lệ — thử lại lần nữa.',
        500
      );
    }

    return {
      postCaption: result.postCaption,
      images: images.map((img, i) => ({
        id: img.id,
        caption: result.imageCaptions[i] || '',
      })),
      skipped,
    };
  }

  // path trong DB (local) = FRONTEND_URL + /uploads/YYYY/MM/DD/x.ext — file thật
  // nằm ở UPLOAD_DIRECTORY; storage cloud thì path là URL công khai → fetch.
  private async loadMediaBuffer(dbPath: string): Promise<Buffer> {
    const marker = '/uploads/';
    const idx = dbPath.indexOf(marker);
    if (idx >= 0 && process.env.UPLOAD_DIRECTORY) {
      const rel = dbPath.slice(idx + marker.length).split('?')[0];
      return await readFile(join(process.env.UPLOAD_DIRECTORY, rel));
    }
    const res = await fetch(dbPath);
    if (!res.ok) {
      throw new Error(`fetch media HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._mediaRepository.saveFile(org, fileName, filePath, originalName);
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const totalCredits = await this._subscriptionService.checkCredits(
        org,
        'ai_videos'
      );

      if (totalCredits.credits <= 0) {
        throw new SubscriptionException({
          action: AuthorizationActions.Create,
          section: Sections.VIDEOS_PER_MONTH,
        });
      }

      const video = this._videoManager.getVideoByName(body.type);
      if (!video) {
        throw new Error(`Video type ${body.type} not found`);
      }

      if (!video.trial && org.isTrailing) {
        throw new HttpException(
          'This video is not available in trial mode',
          406
        );
      }

      console.log(body.customParams);
      await video.instance.processAndValidate(body.customParams);
      console.log('no err');

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const loadedData = await video.instance.process(
            body.output,
            body.customParams
          );

          const file = await this.storage.uploadSimple(loadedData);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
