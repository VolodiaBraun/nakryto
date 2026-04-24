import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsScheduler } from './bookings.scheduler';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { MaxModule } from '../max/max.module';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports: [WebsocketModule, NotificationsModule, TelegramModule, MaxModule, PlanLimitsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsScheduler],
  exports: [BookingsService],
})
export class BookingsModule {}
