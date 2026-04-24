import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingsScheduler {
  private readonly logger = new Logger(BookingsScheduler.name);

  constructor(private prisma: PrismaService) {}

  // Каждые 15 минут завершаем истёкшие брони
  @Cron('0 */15 * * * *')
  async autoComplete() {
    const now = new Date();

    const { count } = await this.prisma.booking.updateMany({
      where: {
        status: { in: ['SEATED', 'CONFIRMED'] },
        endsAt: { lt: now },
      },
      data: { status: 'COMPLETED' },
    });

    if (count > 0) {
      this.logger.log(`Auto-completed ${count} booking(s)`);
    }
  }
}
