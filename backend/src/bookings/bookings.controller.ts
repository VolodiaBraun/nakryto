import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateHallBookingDto } from './dto/create-hall-booking.dto';
import { CreateGroupBookingDto } from './dto/create-group-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { ListBookingsDto } from './dto/list-bookings.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Bookings (Admin)')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/restaurant/bookings')
export class BookingsController {
  constructor(private service: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Список броней с фильтрами' })
  findAll(
    @CurrentUser('restaurantId') restaurantId: string,
    @Query() filters: ListBookingsDto,
  ) {
    return this.service.findAll(restaurantId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Бронь по ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.service.findOne(id, restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать бронь вручную (администратор принял звонок)' })
  create(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: CreateBookingDto,
  ) {
    return this.service.create(restaurantId, dto, 'MANUAL');
  }

  @Post('hall')
  @ApiOperation({ summary: 'Забронировать весь зал (корпоратив)' })
  createHall(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: CreateHallBookingDto,
  ) {
    return this.service.createHallBooking(restaurantId, dto);
  }

  @Post('group')
  @ApiOperation({ summary: 'Забронировать группу столов' })
  createGroup(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: CreateGroupBookingDto,
  ) {
    return this.service.createGroupBooking(restaurantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Изменить время/стол брони' })
  update(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.service.update(id, restaurantId, dto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Изменить статус брони' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.service.updateStatus(id, restaurantId, dto, userId);
  }
}
