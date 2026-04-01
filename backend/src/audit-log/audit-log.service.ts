import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogEntry {
  action: string;
  actorType: 'user' | 'guest' | 'superadmin';
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
    action?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, limit, restaurantId, action, status, dateFrom, dateTo } = opts;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (restaurantId) where.restaurantId = restaurantId;
    if (action)       where.action = { contains: action };
    if (status)       where.status = status;
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

    return { rows, total, page, limit };
  }
}
