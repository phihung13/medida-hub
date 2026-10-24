import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { MediaBoardService } from '@gitroom/nestjs-libraries/database/prisma/media-board/media-board.service';
import {
  MediaBoardConfigDto,
  MediaVideoDto,
} from '@gitroom/nestjs-libraries/dtos/media-board/media-board.dto';

@ApiTags('Media Board')
@Controller('/media-board')
export class MediaBoardController {
  constructor(private _mediaBoardService: MediaBoardService) {}

  @Get('/config')
  getConfig(@GetOrgFromRequest() org: Organization) {
    return this._mediaBoardService.getConfig(org.id);
  }

  @Put('/config')
  saveConfig(
    @GetOrgFromRequest() org: Organization,
    @Body() body: MediaBoardConfigDto
  ) {
    return this._mediaBoardService.saveConfig(org.id, body);
  }

  @Get('/videos')
  listVideos(@GetOrgFromRequest() org: Organization) {
    return this._mediaBoardService.listVideos(org.id);
  }

  @Post('/videos')
  createVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: MediaVideoDto
  ) {
    return this._mediaBoardService.createVideo(org.id, body);
  }

  @Put('/videos/:id')
  setVideo(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: MediaVideoDto
  ) {
    return this._mediaBoardService.setVideo(org.id, id, body);
  }

  @Patch('/videos/:id')
  patchVideo(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: MediaVideoDto
  ) {
    return this._mediaBoardService.patchVideo(org.id, id, body);
  }

  @Delete('/videos/:id')
  deleteVideo(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._mediaBoardService.deleteVideo(org.id, id);
  }
}
