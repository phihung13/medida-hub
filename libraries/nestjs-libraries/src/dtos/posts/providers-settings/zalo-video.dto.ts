import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Tuỳ chọn của form đăng Zalo Video (đọc từ chính form trên video.zalo.me).
// Nội dung bài = phần mô tả video (≤4000 ký tự), video lấy từ media đính kèm.
// Mọi trường đều tuỳ chọn — bỏ trống là mặc định của Zalo.
export class ZaloVideoDto {
  // Giây lấy khung làm ảnh bìa. Bỏ trống = khung đầu (Zalo tự chọn sẵn).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(36000)
  coverTime?: number;

  // Tên danh sách phát trên kênh; chưa có thì bot tạo mới (Zalo: 3–40 ký tự).
  @ValidateIf((o) => !!o.playlist)
  @IsString()
  @MinLength(3, { message: 'Tên danh sách phát cần 3–40 ký tự' })
  @MaxLength(40, { message: 'Tên danh sách phát cần 3–40 ký tự' })
  playlist?: string;

  // Công tắc "Nội dung do AI tạo" của Zalo.
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;
}
