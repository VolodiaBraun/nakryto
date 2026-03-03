import { Module } from '@nestjs/common';
import { BookingGateway } from './websocket.gateway';

@Module({
  providers: [BookingGateway],
  exports: [BookingGateway],
})
export class WebsocketModule {}
