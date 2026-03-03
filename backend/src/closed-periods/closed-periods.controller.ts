import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClosedPeriodsService } from './closed-periods.service';
import { CreateClosedPeriodDto } from './dto/create-closed-period.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Closed Periods')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('api/restaurant/closed-periods')
export class ClosedPeriodsController {
  constructor(private service: ClosedPeriodsService) {}

  @Get()
  @ApiOperation({ summary: 'Список закрытых периодов' })
  findAll(@CurrentUser('restaurantId') restaurantId: string) {
    return this.service.findAll(restaurantId);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Post()
  @ApiOperation({ summary: 'Закрыть ресторан / стол на период' })
  create(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: CreateClosedPeriodDto,
  ) {
    return this.service.create(restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  @ApiOperation({ summary: 'Удалить закрытый период' })
  remove(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.service.remove(id, restaurantId);
  }
}
