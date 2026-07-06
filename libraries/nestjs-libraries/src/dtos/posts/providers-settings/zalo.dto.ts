import { IsOptional, IsString, MaxLength } from 'class-validator';

// Cấu hình đăng bài Zalo OA (Article API). Tất cả tùy chọn — nếu bỏ trống thì
// provider tự suy: title = dòng đầu caption, author = tên OA.
export class ZaloDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  author?: string;
}
