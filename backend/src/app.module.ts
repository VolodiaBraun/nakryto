import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { HallsModule } from './halls/halls.module';
import { TablesModule } from './tables/tables.module';
import { BookingsModule } from './bookings/bookings.module';
import { ClosedPeriodsModule } from './closed-periods/closed-periods.module';
import { PublicApiModule } from './public-api/public-api.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WebsocketModule } from './websocket/websocket.module';
import { RedisModule } from './redis/redis.module';
import { SuperAdminModule } from './superadmin/superadmin.module';
import { TelegramModule } from './telegram/telegram.module';
import { MaxModule } from './max/max.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RedisModule,
    PrismaModule,
    AuthModule,
    RestaurantsModule,
    HallsModule,
    TablesModule,
    BookingsModule,
    ClosedPeriodsModule,
    PublicApiModule,
    NotificationsModule,
    WebsocketModule,
    SuperAdminModule,
    TelegramModule,
    MaxModule,
  ],
})
export class AppModule {}
