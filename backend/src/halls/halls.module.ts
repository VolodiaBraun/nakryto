import { Module } from '@nestjs/common';
import { HallsController } from './halls.controller';
import { HallsService } from './halls.service';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports: [PlanLimitsModule],
  controllers: [HallsController],
  providers: [HallsService],
  exports: [HallsService],
})
export class HallsModule {}
