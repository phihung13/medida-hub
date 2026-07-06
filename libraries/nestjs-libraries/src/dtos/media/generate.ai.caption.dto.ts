import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

// Nút "bút phép thuật": AI đọc các ảnh đã upload → caption bài + caption từng ảnh.
export class GenerateAiCaptionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mediaIds: string[];

  // Nội dung nháp đang có trong editor (nếu có) để AI bám theo ý người đăng.
  @IsOptional()
  @IsString()
  context?: string;
}
