import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Plan } from '@prisma/client';
import { DEFAULT_LANDING_SETTINGS } from '../superadmin/landing-defaults';

export interface PlanLimitsConfig {
  FREE:     { maxHalls: number | null; maxBookingsPerMonth: number | null };
  STANDARD: { maxHalls: number | null; maxBookingsPerMonth: number | null };
  PREMIUM:  { maxHalls: number | null; maxBookingsPerMonth: number | null };
}

@Injectable()
export class PlanLimitsService {
  constructor(private prisma: PrismaService) {}

  async getLimits(): Promise<PlanLimitsConfig> {
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const db = (row?.data as any)?.planLimits;
    const defaults = DEFAULT_LANDING_SETTINGS.planLimits;
    return {
      FREE:     { ...defaults.FREE,     ...(db?.FREE     ?? {}) },
      STANDARD: { ...defaults.STANDARD, ...(db?.STANDARD ?? {}) },
      PREMIUM:  { ...defaults.PREMIUM,  ...(db?.PREMIUM  ?? {}) },
    };
  }

  async getPrices(): Promise<Record<string, number>> {
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const db = (row?.data as any)?.planPrices;
    const defaults = DEFAULT_LANDING_SETTINGS.planPrices;
    return { ...defaults, ...(db ?? {}) };
  }

  // Возвращает лимит броней для плана с учётом истечения подписки
  async getBookingLimit(plan: Plan, planExpiresAt?: Date | null): Promise<number | null> {
    const effectivePlan = this.getEffectivePlan(plan, planExpiresAt);
    const limits = await this.getLimits();
    return limits[effectivePlan]?.maxBookingsPerMonth ?? null;
  }

  async getHallLimit(plan: Plan, planExpiresAt?: Date | null): Promise<number> {
    const effectivePlan = this.getEffectivePlan(plan, planExpiresAt);
    const limits = await this.getLimits();
    const val = limits[effectivePlan]?.maxHalls;
    return val === null || val === undefined ? Infinity : val;
  }

  // Если платный тариф истёк — применяем лимиты FREE
  getEffectivePlan(plan: Plan, planExpiresAt?: Date | null): Plan {
    if (plan === 'FREE') return 'FREE';
    if (planExpiresAt && planExpiresAt < new Date()) return 'FREE';
    return plan;
  }

  // Проверить превышен ли лимит броней за текущий месяц
  async isBookingLimitExceeded(restaurantId: string, plan: Plan, planExpiresAt?: Date | null): Promise<boolean> {
    const limit = await this.getBookingLimit(plan, planExpiresAt);
    if (limit === null) return false; // безлимит

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await this.prisma.booking.count({
      where: {
        restaurantId,
        source: { not: 'MANUAL' },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        createdAt: { gte: monthStart, lte: monthEnd },
      },
    });

    return count >= limit;
  }

  // Статистика для баннера в дашборде
  async getLimitStatus(restaurantId: string, plan: Plan, planExpiresAt?: Date | null) {
    const limits = await this.getLimits();
    const effectivePlan = this.getEffectivePlan(plan, planExpiresAt);
    const bookingLimit = limits[effectivePlan]?.maxBookingsPerMonth ?? null;
    const hallLimit = limits[effectivePlan]?.maxHalls ?? null;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [bookingsUsed, hallsCount] = await Promise.all([
      this.prisma.booking.count({
        where: {
          restaurantId,
          source: { not: 'MANUAL' },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.hall.count({ where: { restaurantId, isActive: true } }),
    ]);

    const bookingLimitPercent = bookingLimit === null ? 0 : Math.round((bookingsUsed / bookingLimit) * 100);
    const planExpiresSoon = planExpiresAt
      ? planExpiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
      : false;

    return {
      plan: effectivePlan,
      bookingsUsed,
      bookingLimit,
      bookingLimitPercent,
      bookingLimitExceeded: bookingLimit !== null && bookingsUsed >= bookingLimit,
      hallsUsed: hallsCount,
      hallLimit,
      planExpiresAt,
      planExpiresSoon,
    };
  }
}
