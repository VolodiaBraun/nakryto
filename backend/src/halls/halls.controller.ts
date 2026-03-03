import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HallsService } from './halls.service';
import { CreateHallDto } from './dto/create-hall.dto';
import { UpdateHallDto } from './dto/update-hall.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Halls')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/restaurant/halls')
export class HallsController {
  constructor(private service: HallsService) {}

  @Get()
  @ApiOperation({ summary: 'Список залов ресторана' })
  findAll(@CurrentUser('restaurantId') restaurantId: string) {
    return this.service.findAll(restaurantId);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Шаблоны залов для онбординга' })
  getTemplates() {
    return this.service.getTemplates();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Зал по ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.service.findOne(id, restaurantId);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Post()
  @ApiOperation({ summary: 'Создать новый зал' })
  create(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: CreateHallDto,
  ) {
    return this.service.create(restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Post('from-template/:templateKey')
  @ApiOperation({ summary: 'Создать зал из шаблона (empty | small | medium)' })
  createFromTemplate(
    @CurrentUser('restaurantId') restaurantId: string,
    @Param('templateKey') templateKey: string,
  ) {
    return this.service.createFromTemplate(restaurantId, templateKey as any);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put(':id')
  @ApiOperation({ summary: 'Обновить зал' })
  update(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateHallDto,
  ) {
    return this.service.update(id, restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put(':id/floor-plan')
  @ApiOperation({ summary: 'Сохранить схему зала (от редактора Konva.js)' })
  saveFloorPlan(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() body: { floorPlan: object },
  ) {
    return this.service.saveFloorPlan(id, restaurantId, body.floorPlan);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Delete(':id')
  @ApiOperation({ summary: 'Удалить (деактивировать) зал' })
  remove(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.service.remove(id, restaurantId);
  }
}
