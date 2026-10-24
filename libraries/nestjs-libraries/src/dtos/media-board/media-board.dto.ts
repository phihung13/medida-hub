import { IsArray, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

// Thẻ video của Bảng sản xuất Media. Thẻ được lưu nguyên khối (Json) nên DTO
// chỉ kiểm các trường hệ thống dựa vào; các trường khác (title, stream,
// episode, ngày, link, stageAt…) đi qua nguyên vẹn.
export class MediaVideoDto {
  @IsOptional()
  @IsIn([
    'kich-ban',
    'cho-quay',
    'da-quay',
    'dang-dung',
    'cho-duyet',
    'len-lich',
    'da-phat',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  title?: string;

  [key: string]: any;
}

export class MediaBoardConfigDto {
  @IsOptional()
  @IsArray()
  streams?: Record<string, any>[];

  @IsOptional()
  @IsArray()
  people?: string[];

  @IsOptional()
  @IsIn(['nguoi', 'team'])
  limitScope?: string;

  @IsOptional()
  @IsNumber()
  maxLongPerSlot?: number;

  @IsOptional()
  @IsNumber()
  scheduleWarnDays?: number;

  @IsOptional()
  @IsNumber()
  maxBacklogPerPerson?: number;

  @IsOptional()
  @IsNumber()
  reviewHours?: number;

  @IsOptional()
  @IsNumber()
  editLeadDays?: number;

  @IsOptional()
  @IsNumber()
  shootLeadDays?: number;

  [key: string]: any;
}
