import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ReferralService } from './referral.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';

@Controller('api/restaurant/referral')
@UseGuards(JwtGuard, RolesGuard)
@Roles('OWNER')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get()
  getReferralInfo(@CurrentUser('id') userId: string) {
    return this.referralService.getReferralInfo(userId);
  }

  @Post('code')
  @HttpCode(200)
  generateCode(@CurrentUser('id') userId: string) {
    return this.referralService.generateCode(userId);
  }

  @Post('track')
  @HttpCode(200)
  trackReferral(
    @CurrentUser('id') userId: string,
    @Body('code') code: string,
  ) {
    return this.referralService.trackReferral(userId, code);
  }

  @Post('withdraw')
  requestWithdrawal(
    @CurrentUser('id') userId: string,
    @Body() dto: RequestWithdrawalDto,
  ) {
    return this.referralService.requestWithdrawal(userId, dto.amount, dto.paymentDetails);
  }
}
