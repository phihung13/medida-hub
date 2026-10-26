import {
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateIf,
  IsUrl,
} from 'class-validator';

export class FacebookDto {
  @IsOptional()
  @ValidateIf((p) => p.url)
  @IsUrl()
  url?: string;

  // Bài tạo qua API / bot Zalo lưu post_type = "" (ô chọn chỉ tự đặt "post"
  // khi khung cài đặt được mở) → coi rỗng như chưa chọn = bài thường, thay vì
  // chặn Lên lịch / Đăng ngay với lỗi "post_type must be one of…".
  @ValidateIf((p) => !!p.post_type)
  @IsIn(['post', 'story'])
  @IsOptional()
  post_type?: 'post' | 'story';

  // Chỉ có tác dụng với KHỐI BÌNH LUẬN (khối thứ 2 trở đi):
  //  - false / bỏ trống (mặc định): bình luận RIÊNG, gắn thẳng vào bài.
  //  - true: TRẢ LỜI bình luận ngay phía trên, tạo bình luận con.
  // Trước đây không có lựa chọn này và code luôn chạy theo nhánh "true",
  // nên bình luận thứ 2 luôn bị lồng vào bình luận thứ nhất.
  @IsOptional()
  @IsBoolean()
  replyToPrevious?: boolean;
}
