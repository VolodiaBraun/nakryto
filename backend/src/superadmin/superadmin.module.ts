import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';
import { SuperAdminJwtStrategy } from './strategies/superadmin-jwt.strategy';
import { ReferralModule } from '../referral/referral.module';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    ReferralModule,
    PlanLimitsModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminJwtStrategy],
})
export class SuperAdminModule {}
