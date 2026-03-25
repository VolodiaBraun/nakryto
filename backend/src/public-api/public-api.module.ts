import { Module } from '@nestjs/common';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { BookingsModule } from '../bookings/bookings.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports: [BookingsModule, WebsocketModule, PlanLimitsModule],
  controllers: [PublicApiController],
  providers: [PublicApiService],
})
export class PublicApiModule {}
