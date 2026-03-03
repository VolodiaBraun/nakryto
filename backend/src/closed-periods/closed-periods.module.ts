import { Module } from '@nestjs/common';
import { ClosedPeriodsController } from './closed-periods.controller';
import { ClosedPeriodsService } from './closed-periods.service';

@Module({
  controllers: [ClosedPeriodsController],
  providers: [ClosedPeriodsService],
})
export class ClosedPeriodsModule {}
