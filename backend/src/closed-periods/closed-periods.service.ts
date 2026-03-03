import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClosedPeriodDto } from './dto/create-closed-period.dto';

@Injectable()
export class ClosedPeriodsService {
  constructor(private prisma: PrismaService) {}

  async findAll(restaurantId: string) {
    return this.prisma.closedPeriod.findMany({
      where: { restaurantId },
      include: { table: true, hall: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  async create(restaurantId: string, dto: CreateClosedPeriodDto) {
    return this.prisma.closedPeriod.create({
      data: {
        restaurantId,
        tableId: dto.tableId,
        hallId: dto.hallId,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        reason: dto.reason,
      },
    });
  }

  async remove(id: string, restaurantId: string) {
    const period = await this.prisma.closedPeriod.findFirst({
      where: { id, restaurantId },
    });

    if (!period) throw new NotFoundException('Закрытый период не найден');

    return this.prisma.closedPeriod.delete({ where: { id } });
  }
}
