import { Controller, Get, Put, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Restaurant')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/restaurant')
export class RestaurantsController {
  constructor(private service: RestaurantsService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Получить профиль ресторана' })
  getProfile(@CurrentUser('restaurantId') restaurantId: string) {
    return this.service.getProfile(restaurantId);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put('profile')
  @ApiOperation({ summary: 'Обновить профиль ресторана' })
  updateProfile(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.service.updateProfile(restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put('settings')
  @ApiOperation({ summary: 'Обновить настройки (слоты, буфер, горизонт брони)' })
  updateSettings(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.service.updateSettings(restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put('working-hours')
  @ApiOperation({ summary: 'Обновить расписание работы по дням недели' })
  updateWorkingHours(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateWorkingHoursDto,
  ) {
    return this.service.updateWorkingHours(restaurantId, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Статистика: брони за месяц, сегодня, заполнение' })
  getStats(@CurrentUser('restaurantId') restaurantId: string) {
    return this.service.getStats(restaurantId);
  }

  @Get('widget-settings')
  @ApiOperation({ summary: 'Настройки виджета + embed-код' })
  getWidgetSettings(@CurrentUser('restaurantId') restaurantId: string) {
    return this.service.getWidgetSettings(restaurantId);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put('widget-settings')
  @ApiOperation({ summary: 'Обновить настройки виджета' })
  updateWidgetSettings(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() body: any,
  ) {
    return this.service.updateWidgetSettings(restaurantId, body);
  }

  // ─── Staff ───────────────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Get('staff')
  @ApiOperation({ summary: 'Список сотрудников ресторана' })
  listStaff(
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.service.listStaff(restaurantId, currentUserId);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Post('staff')
  @ApiOperation({ summary: 'Создать сотрудника' })
  createStaff(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.service.createStaff(restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Put('staff/:id/role')
  @ApiOperation({ summary: 'Изменить роль сотрудника' })
  updateStaffRole(
    @CurrentUser('restaurantId') restaurantId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateStaffRoleDto,
  ) {
    return this.service.updateStaffRole(restaurantId, userId, dto.role);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Delete('staff/:id')
  @ApiOperation({ summary: 'Удалить сотрудника' })
  removeStaff(
    @CurrentUser('restaurantId') restaurantId: string,
    @Param('id') userId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.service.removeStaff(restaurantId, userId, currentUserId);
  }
}
