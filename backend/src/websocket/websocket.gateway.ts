import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class BookingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('WebSocket');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Клиент присоединяется к комнате ресторана на конкретную дату
  // room: "bellaroma:2025-03-15"
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { slug: string; date: string },
  ) {
    const room = `${data.slug}:${data.date}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { event: 'joined', room };
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { slug: string; date: string },
  ) {
    const room = `${data.slug}:${data.date}`;
    client.leave(room);
    return { event: 'left', room };
  }

  // Вызывается из BookingsService при создании/отмене брони
  notifyTableStatusChanged(
    slug: string,
    date: string,
    event: 'booking_created' | 'booking_cancelled',
    payload: { tableId: string; datetime: string },
  ) {
    const room = `${slug}:${date}`;
    this.server.to(room).emit(event, payload);
  }

  // Блокировка стола при выборе (до создания брони)
  notifyTableLocked(slug: string, date: string, tableId: string, expiresAt: string) {
    const room = `${slug}:${date}`;
    this.server.to(room).emit('table_locked', { tableId, expiresAt });
  }

  notifyTableUnlocked(slug: string, date: string, tableId: string) {
    const room = `${slug}:${date}`;
    this.server.to(room).emit('table_unlocked', { tableId });
  }
}
