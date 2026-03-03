import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll(restaurantId: string, hallId?: string) {
    return this.prisma.table.findMany({
      where: {
        hall: { restaurantId },
        ...(hallId ? { hallId } : {}),
        isActive: true,
      },
      orderBy: { label: 'asc' },
    });
  }

  async findOne(id: string, restaurantId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id, hall: { restaurantId } },
      include: { hall: true },
    });

    if (!table) throw new NotFoundException('Стол не найден');
    return table;
  }

  async create(restaurantId: string, dto: CreateTableDto) {
    // Проверяем, что зал принадлежит ресторану
    const hall = await this.prisma.hall.findFirst({
      where: { id: dto.hallId, restaurantId },
    });

    if (!hall) throw new NotFoundException('Зал не найден или не принадлежит ресторану');

    return this.prisma.table.create({
      data: {
        hallId: dto.hallId,
        label: dto.label,
        shape: dto.shape || 'SQUARE',
        minGuests: dto.minGuests || 1,
        maxGuests: dto.maxGuests || 4,
        positionX: dto.positionX || 100,
        positionY: dto.positionY || 100,
        rotation: dto.rotation || 0,
        width: dto.width || 80,
        height: dto.height || 80,
        comment: dto.comment,
      },
    });
  }

  async update(id: string, restaurantId: string, dto: UpdateTableDto) {
    await this.findOne(id, restaurantId);

    return this.prisma.table.update({
      where: { id },
      data: dto,
    });
  }

  // Массовое обновление позиций столов после перетаскивания в редакторе
  async bulkUpdatePositions(
    restaurantId: string,
    updates: Array<{ id: string; positionX: number; positionY: number; rotation?: number }>,
  ) {
    const updates$ = updates.map((u) =>
      this.prisma.table.updateMany({
        where: { id: u.id, hall: { restaurantId } },
        data: {
          positionX: u.positionX,
          positionY: u.positionY,
          ...(u.rotation !== undefined ? { rotation: u.rotation } : {}),
        },
      }),
    );

    await Promise.all(updates$);
    return { updated: updates.length };
  }

  async remove(id: string, restaurantId: string) {
    await this.findOne(id, restaurantId);

    return this.prisma.table.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
