import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHallDto } from './dto/create-hall.dto';
import { UpdateHallDto } from './dto/update-hall.dto';
import { Plan } from '@prisma/client';

const HALL_LIMITS: Record<Plan, number> = {
  FREE: 1,
  STANDARD: 3,
  PREMIUM: Infinity,
};

// Шаблоны залов для онбординга
const HALL_TEMPLATES = {
  empty: {
    name: 'Пустой зал',
    floorPlan: { width: 800, height: 600, objects: [] },
  },
  small: {
    name: 'Зал 10 столов',
    floorPlan: {
      width: 800,
      height: 600,
      objects: Array.from({ length: 10 }, (_, i) => ({
        type: 'table',
        id: `tpl-table-${i + 1}`,
        label: String(i + 1),
        shape: 'SQUARE',
        x: 80 + (i % 5) * 140,
        y: 80 + Math.floor(i / 5) * 180,
        width: 80,
        height: 80,
        rotation: 0,
        minGuests: 1,
        maxGuests: 4,
      })),
    },
  },
  medium: {
    name: 'Зал 20 столов',
    floorPlan: {
      width: 900,
      height: 700,
      objects: Array.from({ length: 20 }, (_, i) => ({
        type: 'table',
        id: `tpl-table-${i + 1}`,
        label: String(i + 1),
        shape: i % 3 === 0 ? 'ROUND' : 'SQUARE',
        x: 80 + (i % 5) * 160,
        y: 80 + Math.floor(i / 5) * 160,
        width: 80,
        height: 80,
        rotation: 0,
        minGuests: 1,
        maxGuests: i % 3 === 0 ? 6 : 4,
      })),
    },
  },
};

@Injectable()
export class HallsService {
  constructor(private prisma: PrismaService) {}

  async findAll(restaurantId: string) {
    return this.prisma.hall.findMany({
      where: { restaurantId, isActive: true },
      include: { tables: { where: { isActive: true }, orderBy: { label: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string, restaurantId: string) {
    const hall = await this.prisma.hall.findFirst({
      where: { id, restaurantId },
      include: { tables: { where: { isActive: true } } },
    });

    if (!hall) throw new NotFoundException('Зал не найден');
    return hall;
  }

  async create(restaurantId: string, dto: CreateHallDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { plan: true },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const limit = HALL_LIMITS[restaurant.plan];
    const activeHalls = await this.prisma.hall.count({
      where: { restaurantId, isActive: true },
    });

    if (activeHalls >= limit) {
      throw new ForbiddenException('Достигнут лимит залов для вашего тарифа');
    }

    return this.prisma.hall.create({
      data: {
        restaurantId,
        name: dto.name,
        floorPlan: dto.floorPlan || { width: 800, height: 600, objects: [] },
        sortOrder: dto.sortOrder || 0,
      },
    });
  }

  async createFromTemplate(restaurantId: string, templateKey: keyof typeof HALL_TEMPLATES) {
    const template = HALL_TEMPLATES[templateKey];
    if (!template) throw new NotFoundException('Шаблон не найден');

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { plan: true },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const limit = HALL_LIMITS[restaurant.plan];
    const activeHalls = await this.prisma.hall.count({
      where: { restaurantId, isActive: true },
    });

    if (activeHalls >= limit) {
      throw new ForbiddenException('Достигнут лимит залов для вашего тарифа');
    }

    const hall = await this.prisma.hall.create({
      data: {
        restaurantId,
        name: template.name,
        floorPlan: template.floorPlan,
      },
    });

    // Создаём столы из шаблона с теми же id, что и в floorPlan
    const tableObjects = (template.floorPlan.objects as any[]).filter((o) => o.type === 'table');
    if (tableObjects.length > 0) {
      await this.prisma.table.createMany({
        data: tableObjects.map((t) => ({
          id: t.id,
          hallId: hall.id,
          label: t.label,
          shape: t.shape || 'SQUARE',
          minGuests: t.minGuests || 1,
          maxGuests: t.maxGuests || 4,
          positionX: t.x,
          positionY: t.y,
          width: t.width || 80,
          height: t.height || 80,
          rotation: t.rotation || 0,
          tags: t.tags || [],
        })),
      });
    }

    return this.findOne(hall.id, restaurantId);
  }

  async update(id: string, restaurantId: string, dto: UpdateHallDto) {
    await this.findOne(id, restaurantId);

    return this.prisma.hall.update({
      where: { id },
      data: dto,
    });
  }

  async saveFloorPlan(id: string, restaurantId: string, floorPlan: any) {
    await this.findOne(id, restaurantId);

    // Синхронизируем Table-записи с объектами на плане
    const tableObjects: any[] = ((floorPlan.objects || []) as any[]).filter(
      (o) => o.type === 'table',
    );
    const tableIds = tableObjects.map((t) => t.id);

    // Upsert каждого стола (id из floorPlan = id в БД)
    for (const t of tableObjects) {
      await this.prisma.table.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          hallId: id,
          label: t.label,
          shape: t.shape || 'SQUARE',
          minGuests: t.minGuests ?? 1,
          maxGuests: t.maxGuests ?? 4,
          positionX: t.x,
          positionY: t.y,
          width: t.width || 80,
          height: t.height || 80,
          rotation: t.rotation || 0,
          comment: t.comment || null,
          tags: t.tags || [],
          isActive: true,
        },
        update: {
          label: t.label,
          shape: t.shape || 'SQUARE',
          minGuests: t.minGuests ?? 1,
          maxGuests: t.maxGuests ?? 4,
          positionX: t.x,
          positionY: t.y,
          width: t.width || 80,
          height: t.height || 80,
          rotation: t.rotation || 0,
          comment: t.comment || null,
          tags: t.tags || [],
          isActive: true,
        },
      });
    }

    // Удаляем (soft-delete) столы, которых больше нет на плане
    if (tableIds.length > 0) {
      await this.prisma.table.updateMany({
        where: { hallId: id, isActive: true, id: { notIn: tableIds } },
        data: { isActive: false },
      });
    } else {
      await this.prisma.table.updateMany({
        where: { hallId: id, isActive: true },
        data: { isActive: false },
      });
    }

    return this.prisma.hall.update({
      where: { id },
      data: { floorPlan },
      include: { tables: { where: { isActive: true }, orderBy: { label: 'asc' } } },
    });
  }

  async remove(id: string, restaurantId: string) {
    await this.findOne(id, restaurantId);

    await this.prisma.table.updateMany({
      where: { hallId: id },
      data: { isActive: false },
    });

    return this.prisma.hall.update({
      where: { id },
      data: { isActive: false },
    });
  }

  getTemplates() {
    return Object.entries(HALL_TEMPLATES).map(([key, tpl]) => ({
      key,
      name: tpl.name,
      tablesCount: tpl.floorPlan.objects.filter((o: any) => o.type === 'table').length,
    }));
  }
}
