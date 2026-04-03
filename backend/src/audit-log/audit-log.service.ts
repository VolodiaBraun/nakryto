import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogEntry {
  action: string;
  actorType: 'user' | 'guest' | 'superadmin' | 'partner';
  actorId?: string;
  actorEmail?: string;
  restaurantId?: string;
  entityId?: string;
  status: 'ok' | 'error';
  errorMessage?: string;
  meta?: Record<string, any>;
  ip?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  /** Записываем лог; ошибки пишем в console.error, но не ломаем бизнес-логику */
  log(entry: LogEntry): void {
    this.prisma.auditLog
      .create({ data: entry })
      .catch((err) => console.error('[AuditLog] write failed:', err));
  }

  async findAll(opts: {
    page: number;
    limit: number;
    restaurantId?: string;
    restaurantName?: string;
    action?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, limit, restaurantId, restaurantName, action, status, dateFrom, dateTo } = opts;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Фильтр по названию: ищем рестораны по имени, берём их id
    if (restaurantName) {
      const matched = await this.prisma.restaurant.findMany({
        where: { name: { contains: restaurantName, mode: 'insensitive' } },
        select: { id: true },
      });
      where.restaurantId = { in: matched.map((r) => r.id) };
    } else if (restaurantId) {
      where.restaurantId = restaurantId;
    }

    if (action)  where.action = { contains: action };
    if (status)  where.status = status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Обогащаем строки названием ресторана
    const uniqueIds = [...new Set(rows.map((r) => r.restaurantId).filter(Boolean))] as string[];
    const restaurants = uniqueIds.length
      ? await this.prisma.restaurant.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(restaurants.map((r) => [r.id, r.name]));

    const enriched = rows.map((r) => ({
      ...r,
      restaurantName: r.restaurantId ? (nameMap[r.restaurantId] ?? null) : null,
    }));

    return { rows: enriched, total, page, limit };
  }
}
