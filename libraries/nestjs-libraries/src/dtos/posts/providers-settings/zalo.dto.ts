import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// Cấu hình đăng bài Zalo OA. Bỏ trống thì provider tự suy: title = dòng đầu
// caption, author = tiêu đề. Trần ký tự lấy đúng theo tài liệu Zalo
// (title ≤150, author ≤50) — trước đây để 100/100 là đoán sai.
export class ZaloDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  author?: string;

  // Zalo cho phép bật/tắt bình luận trên từng bài (trường `comment`).
  // Mặc định (bỏ trống) = cho bình luận, đúng mặc định của Zalo.
  @IsOptional()
  @IsBoolean()
  allowComment?: boolean;
}
