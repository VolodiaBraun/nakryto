import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { SuperAdminService } from './superadmin.service';
import { SuperAdminJwtGuard } from './guards/superadmin-jwt.guard';
import { LoginSuperAdminDto } from './dto/login-superadmin.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Controller('api/superadmin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('auth/login')
  login(@Body() dto: LoginSuperAdminDto) {
    return this.superAdminService.login(dto.email, dto.password);
  }

  @UseGuards(SuperAdminJwtGuard)
  @Get('restaurants')
  listRestaurants(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.superAdminService.listRestaurants(page, limit, search);
  }

  @UseGuards(SuperAdminJwtGuard)
  @Put('restaurants/:id/plan')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.superAdminService.updatePlan(id, dto.plan);
  }

  @UseGuards(SuperAdminJwtGuard)
  @Get('stats')
  getStats() {
    return this.superAdminService.getStats();
  }
}
