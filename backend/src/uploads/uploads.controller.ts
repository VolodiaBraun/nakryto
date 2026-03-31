import {
  Controller, Post, Delete, Param, Body, UseGuards,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { UploadsService } from './uploads.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const multerOptions = { storage: memoryStorage() };

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/uploads')
export class UploadsController {
  constructor(private service: UploadsService) {}

  // ─── Фото стола ─────────────────────────────────────────────────────────────

  @Post('tables/:tableId/photo')
  @ApiOperation({ summary: 'Загрузить фото стола (до 5 шт, макс 5 МБ)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', multerOptions))
  uploadTablePhoto(
    @Param('tableId') tableId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadTablePhoto(tableId, restaurantId, file);
  }

  @Delete('tables/:tableId/photo')
  @ApiOperation({ summary: 'Удалить фото стола' })
  deleteTablePhoto(
    @Param('tableId') tableId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body('url') url: string,
  ) {
    return this.service.deleteTablePhoto(tableId, restaurantId, url);
  }

  // ─── Фото зала ──────────────────────────────────────────────────────────────

  @Post('halls/:hallId/photo')
  @ApiOperation({ summary: 'Загрузить фото зала (до 15 шт, макс 5 МБ)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', multerOptions))
  uploadHallPhoto(
    @Param('hallId') hallId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadHallPhoto(hallId, restaurantId, file);
  }

  @Delete('halls/:hallId/photo')
  @ApiOperation({ summary: 'Удалить фото зала' })
  deleteHallPhoto(
    @Param('hallId') hallId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body('url') url: string,
  ) {
    return this.service.deleteHallPhoto(hallId, restaurantId, url);
  }
}
