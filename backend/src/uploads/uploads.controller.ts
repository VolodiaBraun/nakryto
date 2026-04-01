import {
  Controller, Post, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/uploads')
export class UploadsController {
  constructor(private service: UploadsService) {}

  // ─── Фото стола ─────────────────────────────────────────────────────────────

  /** Шаг 1: получить presigned URL для загрузки фото стола */
  @Post('tables/:tableId/presign')
  @ApiOperation({ summary: 'Получить presigned URL для загрузки фото стола' })
  @ApiQuery({ name: 'contentType', example: 'image/jpeg' })
  presignTablePhoto(
    @Param('tableId') tableId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Query('contentType') contentType: string,
  ) {
    return this.service.presignTablePhoto(tableId, restaurantId, contentType);
  }

  /** Шаг 2: сохранить URL фото после загрузки в S3 */
  @Post('tables/:tableId/photo')
  @ApiOperation({ summary: 'Сохранить URL фото стола после загрузки в S3' })
  @ApiBody({ schema: { type: 'object', properties: { url: { type: 'string' } } } })
  saveTablePhoto(
    @Param('tableId') tableId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body('url') url: string,
  ) {
    return this.service.saveTablePhoto(tableId, restaurantId, url);
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

  @Post('halls/:hallId/presign')
  @ApiOperation({ summary: 'Получить presigned URL для загрузки фото зала' })
  @ApiQuery({ name: 'contentType', example: 'image/jpeg' })
  presignHallPhoto(
    @Param('hallId') hallId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Query('contentType') contentType: string,
  ) {
    return this.service.presignHallPhoto(hallId, restaurantId, contentType);
  }

  @Post('halls/:hallId/photo')
  @ApiOperation({ summary: 'Сохранить URL фото зала после загрузки в S3' })
  @ApiBody({ schema: { type: 'object', properties: { url: { type: 'string' } } } })
  saveHallPhoto(
    @Param('hallId') hallId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body('url') url: string,
  ) {
    return this.service.saveHallPhoto(hallId, restaurantId, url);
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
