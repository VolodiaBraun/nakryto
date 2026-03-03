import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Tables')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/restaurant/tables')
export class TablesController {
  constructor(private service: TablesService) {}

  @Get()
  @ApiOperation({ summary: 'Список столов (опционально фильтр по залу)' })
  @ApiQuery({ name: 'hallId', required: false })
  findAll(
    @CurrentUser('restaurantId') restaurantId: string,
    @Query('hallId') hallId?: string,
  ) {
    return this.service.findAll(restaurantId, hallId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Стол по ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.service.findOne(id, restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать стол' })
  create(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: CreateTableDto,
  ) {
    return this.service.create(restaurantId, dto);
  }

  @Put('bulk-positions')
  @ApiOperation({ summary: 'Массовое обновление позиций столов (drag-and-drop)' })
  bulkUpdatePositions(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() body: { updates: Array<{ id: string; positionX: number; positionY: number; rotation?: number }> },
  ) {
    return this.service.bulkUpdatePositions(restaurantId, body.updates);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Обновить стол' })
  update(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.service.update(id, restaurantId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить (деактивировать) стол' })
  remove(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.service.remove(id, restaurantId);
  }
}
