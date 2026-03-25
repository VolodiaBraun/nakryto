import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  Req,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/restaurant/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.billingService.getSummary(req.user.id);
  }

  @Get('limit-status')
  @Roles('OWNER', 'MANAGER', 'HOSTESS')
  getLimitStatus(@Req() req: any) {
    return this.billingService.getLimitStatus(req.user.id);
  }

  @Post('topup')
  @HttpCode(200)
  topUp(@Req() req: any, @Body() body: { amount: number }) {
    return this.billingService.topUp(req.user.id, body.amount);
  }

  @Get('transactions')
  getTransactions(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.billingService.getTransactions(req.user.id, page, limit);
  }

  @Post('upgrade')
  @HttpCode(200)
  upgradePlan(@Req() req: any, @Body() body: { plan: string; referralCode?: string }) {
    return this.billingService.upgradePlan(req.user.id, body.plan as any, body.referralCode);
  }

  @Post('cards')
  addCard(
    @Req() req: any,
    @Body() body: { last4: string; brand: string; expiryMonth: number; expiryYear: number },
  ) {
    return this.billingService.addCard(req.user.id, body);
  }

  @Delete('cards/:id')
  removeCard(@Req() req: any, @Param('id') id: string) {
    return this.billingService.removeCard(req.user.id, id);
  }

  @Put('cards/:id/default')
  @HttpCode(200)
  setDefaultCard(@Req() req: any, @Param('id') id: string) {
    return this.billingService.setDefaultCard(req.user.id, id);
  }

  @Put('billing-type')
  @HttpCode(200)
  setBillingType(@Req() req: any, @Body() body: { billingType: 'CARD' | 'LEGAL_ENTITY' }) {
    return this.billingService.setBillingType(req.user.id, body.billingType);
  }
}
