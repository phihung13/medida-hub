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
