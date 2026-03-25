import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [PlanLimitsModule, ReferralModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
