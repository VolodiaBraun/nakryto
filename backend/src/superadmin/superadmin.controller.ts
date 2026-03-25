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
  HttpCode,
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

  @UseGuards(SuperAdminJwtGuard)
  @Get('landing')
  getLandingSettings() {
    return this.superAdminService.getLandingSettings();
  }

  @UseGuards(SuperAdminJwtGuard)
  @Put('landing')
  @HttpCode(200)
  updateLandingSettings(@Body() data: object) {
    return this.superAdminService.updateLandingSettings(data);
  }

  // ─── Реферальные настройки ─────────────────────────────────────────────────

  @UseGuards(SuperAdminJwtGuard)
  @Get('referral-settings')
  getReferralSettings() {
    return this.superAdminService.getReferralSettings();
  }

  @UseGuards(SuperAdminJwtGuard)
  @Put('referral-settings')
  @HttpCode(200)
  updateReferralSettings(
    @Body() data: { referralDiscountPercent: number; referralCommissionPercent: number },
  ) {
    return this.superAdminService.updateReferralSettings(data);
  }

  // ─── Реферёры ──────────────────────────────────────────────────────────────

  @UseGuards(SuperAdminJwtGuard)
  @Get('referrers')
  listReferrers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.superAdminService.listReferrers(page, limit, search);
  }

  @UseGuards(SuperAdminJwtGuard)
  @Put('referrers/:userId/conditions')
  @HttpCode(200)
  updateReferrerConditions(
    @Param('userId') userId: string,
    @Body() data: {
      customReferralConditions: boolean;
      customCommissionRate?: number | null;
      customDiscountRate?: number | null;
    },
  ) {
    return this.superAdminService.updateReferrerConditions(userId, data);
  }

  // ─── Выводы ────────────────────────────────────────────────────────────────

  @UseGuards(SuperAdminJwtGuard)
  @Get('withdrawals')
  listWithdrawals(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.superAdminService.listWithdrawals(page, limit, status);
  }

  @UseGuards(SuperAdminJwtGuard)
  @Put('withdrawals/:id')
  @HttpCode(200)
  updateWithdrawal(
    @Param('id') id: string,
    @Body() data: { status: string; adminNote?: string },
  ) {
    return this.superAdminService.updateWithdrawal(id, data);
  }
}
