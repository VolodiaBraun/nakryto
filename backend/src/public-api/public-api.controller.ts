import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PublicApiService } from './public-api.service';
import { CreateBookingDto } from '../bookings/dto/create-booking.dto';

@ApiTags('Public API (для гостей)')
@Controller('api/public')
export class PublicApiController {
  constructor(private service: PublicApiService) {}

  @Get('landing-settings')
  @ApiOperation({ summary: 'Публичные настройки лендинга (тарифы)' })
  getLandingSettings() {
    return this.service.getLandingSettings();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Профиль ресторана по slug' })
  getRestaurant(@Param('slug') slug: string) {
    return this.service.getRestaurantBySlug(slug);
  }

  @Get(':slug/halls')
  @ApiOperation({ summary: 'Залы со схемами (для рендера карты)' })
  getHalls(@Param('slug') slug: string) {
    return this.service.getHalls(slug);
  }

  @Get(':slug/availability')
  @ApiOperation({ summary: 'Доступные слоты на дату' })
  @ApiQuery({ name: 'date', example: '2025-03-15' })
  @ApiQuery({ name: 'guests', example: '2' })
  getAvailability(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('guests') guests: string,
  ) {
    return this.service.getAvailability(slug, date, parseInt(guests) || 2);
  }

  @Get(':slug/tables/status')
  @ApiOperation({ summary: 'Статусы столов на дату (FREE / BOOKED / LOCKED)' })
  @ApiQuery({ name: 'date', example: '2025-03-15' })
  @ApiQuery({ name: 'time', example: '19:00', required: false })
  getTableStatuses(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('time') time?: string,
  ) {
    return this.service.getTableStatuses(slug, date, time);
  }

  // ─── Блокировка стола ────────────────────────────────────────────────────────

  @Post(':slug/tables/:tableId/lock')
  @ApiOperation({ summary: 'Заблокировать стол на 5 минут (при выборе гостем)' })
  lockTable(
    @Param('slug') slug: string,
    @Param('tableId') tableId: string,
    @Body() body: { date: string; lockId: string },
  ) {
    return this.service.lockTable(slug, tableId, body.date, body.lockId);
  }

  @Delete(':slug/tables/:tableId/lock')
  @ApiOperation({ summary: 'Снять блокировку стола' })
  unlockTable(
    @Param('slug') slug: string,
    @Param('tableId') tableId: string,
    @Query('date') date: string,
    @Query('lockId') lockId: string,
  ) {
    return this.service.unlockTable(slug, tableId, date, lockId);
  }

  // ─── Брони ──────────────────────────────────────────────────────────────────

  @Post(':slug/bookings')
  @ApiOperation({ summary: 'Создать бронь (от гостя)' })
  createBooking(
    @Param('slug') slug: string,
    @Body() dto: CreateBookingDto,
  ) {
    return this.service.createBooking(slug, dto);
  }

  @Get('bookings/:token')
  @ApiOperation({ summary: 'Просмотр брони гостем по токену' })
  getBookingByToken(@Param('token') token: string) {
    return this.service.getBookingByToken(token);
  }

  @Delete('bookings/:token')
  @ApiOperation({ summary: 'Отмена брони гостем по токену' })
  cancelBooking(@Param('token') token: string) {
    return this.service.cancelBooking(token);
  }
}
