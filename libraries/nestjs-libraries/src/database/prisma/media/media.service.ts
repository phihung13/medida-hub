import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { GeminiService } from '@gitroom/nestjs-libraries/openai/gemini.service';
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
import { Readable } from 'stream';
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
    private _videoManager: VideoManager,
    private _gemini: GeminiService
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

  // Link Google Drive dạng chia sẻ → link tải trực tiếp. File phải để chế độ
  // "Anyone with the link". Trả null nếu không nhận dạng được ID.
  private driveDirectUrl(url: string): string | null {
    const m =
      url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ||
      url.match(/drive\.google\.com\/open\?id=([\w-]+)/) ||
      url.match(/[?&]id=([\w-]+)/);
    if (!m) return null;
    return `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`;
  }

  // Tải file từ URL công khai (hỗ trợ riêng link Google Drive) rồi lưu vào thư
  // viện media của tổ chức. Dùng cho ô "dán link Drive" ở màn soạn bài — video
  // tải về trở thành media chính của bài đăng. Trả về media record đã lưu.
  async downloadFromUrl(
    orgId: string,
    url: string
  ): Promise<{ id: string; path: string; name: string }> {
    const clean = (url || '').trim();
    if (!/^https?:\/\//i.test(clean)) {
      throw new HttpException('Link không hợp lệ (phải bắt đầu bằng http/https)', 400);
    }
    const target = clean.includes('drive.google.com')
      ? this.driveDirectUrl(clean) || clean
      : clean;

    const res = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(300000), // video lớn — cho 5 phút
    });
    if (!res.ok) {
      throw new HttpException(`Tải media thất bại (HTTP ${res.status})`, 400);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new HttpException(
        'Link Drive trả về trang web thay vì file — kiểm tra file đã để "Anyone with the link" chưa',
        400
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const { fromBuffer } = await import('file-type');
    const detected = await fromBuffer(buffer);
    if (!detected) {
      throw new HttpException('Không nhận dạng được loại file', 400);
    }
    const uploaded = await this.storage.uploadFile({
      buffer,
      mimetype: detected.mime,
      size: buffer.length,
      path: '',
      fieldname: '',
      destination: '',
      stream: new Readable(),
      filename: '',
      originalname: `drive.${detected.ext}`,
      encoding: '',
    } as any);
    const saved = await this.saveFile(
      orgId,
      uploaded.originalname,
      uploaded.path
    );
    return { id: saved.id, path: saved.path, name: saved.name };
  }

  // AI viết tiêu đề + mô tả cho video YouTube. Hai engine:
  //   • chatgpt: nhận các KHUNG HÌNH (base64) trình duyệt cắt sẵn → OpenAI vision
  //   • gemini : nhận URL video → Gemini XEM VIDEO trực tiếp (File API)
  async generateYoutubeContent(
    org: Organization,
    body: {
      engine?: 'chatgpt' | 'gemini';
      context?: string;
      frames?: string[];
      videoPath?: string;
    }
  ): Promise<{ title: string; description: string }> {
    const engine = body.engine === 'gemini' ? 'gemini' : 'chatgpt';

    if (engine === 'gemini') {
      if (!body.videoPath) {
        throw new HttpException('Thiếu video để Gemini xem.', 400);
      }
      const out = await this._gemini.videoToYoutubeContent(
        body.videoPath,
        body.context
      );
      if (!out) throw new HttpException('Gemini không trả về nội dung.', 400);
      return out;
    }

    // chatgpt: các khung hình base64 (dạng data URL hoặc base64 thuần).
    const frames = (body.frames || []).filter(Boolean).slice(0, 8);
    if (!frames.length) {
      throw new HttpException('Thiếu khung hình video để AI đọc.', 400);
    }
    const images = frames.map((f) => {
      const m = f.match(/^data:(.+?);base64,(.*)$/);
      return m
        ? { mediaType: m[1], base64: m[2] }
        : { mediaType: 'image/jpeg', base64: f };
    });
    const out = await this._openAi.generateYoutubeContentFromImages(
      images,
      body.context
    );
    if (!out) throw new HttpException('AI không trả về nội dung.', 400);
    return out;
  }

  // AI tạo thumbnail YouTube (ảnh ngang 16:9) → lưu vào thư viện, trả {id,path}.
  // Engine: 'gemini' (nano banana) hoặc 'openai' (gpt-image).
  async generateYoutubeThumbnail(
    org: Organization,
    body: { engine?: 'gemini' | 'openai'; prompt?: string }
  ): Promise<{ id: string; path: string }> {
    const prompt = (body.prompt || '').trim();
    if (!prompt) throw new HttpException('Thiếu mô tả thumbnail.', 400);
    const engine = body.engine === 'gemini' ? 'gemini' : 'openai';
    const fullPrompt =
      'YouTube thumbnail, tỉ lệ 16:9 ngang, bố cục nổi bật, tương phản cao, ' +
      'chủ thể rõ ràng, bắt mắt, chữ ít và to nếu có. ' +
      prompt;

    const b64 =
      engine === 'gemini'
        ? await this._gemini.generateImage(fullPrompt)
        : await this._openAi.generateLandscapeImage(fullPrompt);
    if (!b64) throw new HttpException('Không tạo được ảnh thumbnail.', 400);

    const file = await this.storage.uploadSimple(
      `data:image/png;base64,${b64}`
    );
    const saved = await this.saveFile(org.id, file.split('/').pop()!, file);
    return { id: saved.id, path: saved.path };
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
