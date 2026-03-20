import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Plan } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_LANDING_SETTINGS } from './landing-defaults';

const PLAN_PRICES: Record<string, number> = {
  FREE: 0,
  STANDARD: 990,
  PREMIUM: 2490,
};

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const superAdmin = await this.prisma.superAdmin.findUnique({ where: { email } });
    if (!superAdmin) throw new UnauthorizedException('Неверный email или пароль');

    const valid = await bcrypt.compare(password, superAdmin.passwordHash);
    if (!valid) throw new UnauthorizedException('Неверный email или пароль');

    const secret = this.config.get('SUPERADMIN_JWT_SECRET') || 'superadmin-secret-change-in-prod';
    const accessToken = this.jwtService.sign(
      { sub: superAdmin.id, email: superAdmin.email },
      { secret, expiresIn: '8h' },
    );

    return { accessToken };
  }

  async listRestaurants(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [restaurants, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          createdAt: true,
          telegramBotActive: true,
          maxBotActive: true,
          users: {
            where: { role: 'OWNER' },
            select: { email: true },
            take: 1,
          },
          _count: {
            select: { halls: { where: { isActive: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const bookingCounts = await this.prisma.booking.groupBy({
      by: ['restaurantId'],
      where: {
        restaurantId: { in: restaurants.map((r) => r.id) },
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    const countMap = new Map(bookingCounts.map((b) => [b.restaurantId, b._count]));

    const items = restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      plan: r.plan,
      createdAt: r.createdAt,
      ownerEmail: r.users[0]?.email ?? null,
      hallCount: r._count.halls,
      bookings30d: countMap.get(r.id) ?? 0,
      telegramBotActive: r.telegramBotActive,
      maxBotActive: r.maxBotActive,
    }));

    return { items, total, page, limit };
  }

  async updatePlan(restaurantId: string, plan: Plan) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        users: {
          where: { role: 'OWNER' },
          take: 1,
          select: {
            id: true,
            referredByUserId: true,
            pendingReferralCode: true,
            referralDiscountUsed: true,
            customReferralConditions: true,
            customCommissionRate: true,
            customDiscountRate: true,
          },
        },
      },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const oldPlan = restaurant.plan;
    const newPlan = plan;
    const owner = restaurant.users[0];

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { plan },
      select: { id: true, name: true, slug: true, plan: true },
    });

    // Обработка реферальных комиссий при апгрейде на платный тариф
    if (owner && newPlan !== 'FREE' && oldPlan !== newPlan) {
      const paymentAmount = PLAN_PRICES[newPlan] ?? 0;
      if (paymentAmount > 0) {
        await this.processReferralOnPlanUpgrade(owner, paymentAmount, newPlan, oldPlan);
      }
    }

    return updated;
  }

  private async processReferralOnPlanUpgrade(
    owner: {
      id: string;
      referredByUserId: string | null;
      pendingReferralCode: string | null;
      referralDiscountUsed: boolean;
      customReferralConditions: boolean;
      customCommissionRate: any;
      customDiscountRate: any;
    },
    paymentAmount: number,
    newPlan: string,
    oldPlan: string,
  ) {
    const isFirstPaidUpgrade = oldPlan === 'FREE';

    // Получаем глобальные настройки реферальной программы
    const settings = await this.getReferralSettings();
    const globalCommissionRate: number = settings.referralCommissionPercent ?? 20;
    const globalDiscountRate: number = settings.referralDiscountPercent ?? 50;

    let referrerId: string | null = owner.referredByUserId;
    let isFirstPayment = false;

    // Если первая оплата и attribution ещё не заблокирована
    if (isFirstPaidUpgrade && !owner.referredByUserId && owner.pendingReferralCode) {
      // Находим реферера по коду
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: owner.pendingReferralCode },
        select: { id: true },
      });

      if (referrer && referrer.id !== owner.id) {
        referrerId = referrer.id;
        isFirstPayment = true;

        // Блокируем атрибуцию (last-touch)
        await this.prisma.user.update({
          where: { id: owner.id },
          data: {
            referredByUserId: referrer.id,
            referralDiscountUsed: true,
          },
        });
      }
    }

    // Если нет реферера — ничего не делаем
    if (!referrerId) return;

    // Получаем данные реферера для проверки особых условий
    const referrer = await this.prisma.user.findUnique({
      where: { id: referrerId },
      select: {
        customReferralConditions: true,
        customCommissionRate: true,
        customDiscountRate: true,
      },
    });

    if (!referrer) return;

    // Определяем ставки: если особые условия → берём из аккаунта реферера, иначе глобальные
    const commissionRate = referrer.customReferralConditions && referrer.customCommissionRate !== null
      ? Number(referrer.customCommissionRate)
      : globalCommissionRate;

    const discountRate = referrer.customReferralConditions && referrer.customDiscountRate !== null
      ? Number(referrer.customDiscountRate)
      : globalDiscountRate;

    // Сумма после скидки (только для первой оплаты)
    const effectivePayment = isFirstPayment && !owner.referralDiscountUsed
      ? paymentAmount * (1 - discountRate / 100)
      : paymentAmount;

    const commissionAmount = Math.round(effectivePayment * (commissionRate / 100) * 100) / 100;

    if (commissionAmount <= 0) return;

    // Создаём транзакцию и пополняем баланс реферера
    await this.prisma.$transaction([
      this.prisma.referralTransaction.create({
        data: {
          referrerId,
          referralUserId: owner.id,
          paymentAmount,
          commissionRate,
          commissionAmount,
          planName: newPlan,
          isFirstPayment,
          discountRate: isFirstPayment ? discountRate : null,
        },
      }),
      this.prisma.user.update({
        where: { id: referrerId },
        data: { referralBalance: { increment: commissionAmount } },
      }),
    ]);
  }

  async getStats() {
    const [total, perPlan, totalBookings] = await Promise.all([
      this.prisma.restaurant.count({ where: { isActive: true } }),
      this.prisma.restaurant.groupBy({
        by: ['plan'],
        where: { isActive: true },
        _count: true,
      }),
      this.prisma.booking.count(),
    ]);

    const planCounts: Record<string, number> = { FREE: 0, STANDARD: 0, PREMIUM: 0 };
    for (const row of perPlan) {
      planCounts[row.plan] = row._count;
    }

    return {
      totalRestaurants: total,
      totalBookings,
      perPlan: planCounts,
    };
  }

  async getLandingSettings() {
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    return { ...DEFAULT_LANDING_SETTINGS, ...(row?.data as object ?? {}) };
  }

  async updateLandingSettings(data: object) {
    const row = await this.prisma.siteSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', data: data as any },
      update: { data: data as any },
    });
    return row.data;
  }

  // ─── Реферальные настройки ─────────────────────────────────────────────────

  async getReferralSettings() {
    const settings = await this.getLandingSettings() as any;
    return {
      referralDiscountPercent: settings.referralDiscountPercent ?? 50,
      referralCommissionPercent: settings.referralCommissionPercent ?? 20,
    };
  }

  async updateReferralSettings(data: { referralDiscountPercent: number; referralCommissionPercent: number }) {
    const current = await this.getLandingSettings() as any;
    return this.updateLandingSettings({
      ...current,
      referralDiscountPercent: data.referralDiscountPercent,
      referralCommissionPercent: data.referralCommissionPercent,
    });
  }

  // ─── Список реферёров ──────────────────────────────────────────────────────

  async listReferrers(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {
      role: 'OWNER',
      referralCode: { not: null },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { referralCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          referralCode: true,
          referralBalance: true,
          customReferralConditions: true,
          customCommissionRate: true,
          customDiscountRate: true,
          restaurant: { select: { name: true } },
          _count: {
            select: {
              referredUsers: true,
              referralTransactionsAsReferrer: true,
              referralWithdrawals: true,
            },
          },
        },
        orderBy: { referralBalance: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Суммы выплат по каждому
    const withdrawalSums = await this.prisma.referralWithdrawal.groupBy({
      by: ['userId'],
      where: {
        userId: { in: users.map((u) => u.id) },
        status: { in: ['COMPLETED', 'PROCESSING'] },
      },
      _sum: { amount: true },
    });
    const withdrawalMap = new Map(withdrawalSums.map((w) => [w.userId, Number(w._sum.amount ?? 0)]));

    const items = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      restaurantName: u.restaurant?.name,
      referralCode: u.referralCode,
      balance: Number(u.referralBalance),
      totalPaid: withdrawalMap.get(u.id) ?? 0,
      referredCount: u._count.referredUsers,
      transactionCount: u._count.referralTransactionsAsReferrer,
      customReferralConditions: u.customReferralConditions,
      customCommissionRate: u.customCommissionRate !== null ? Number(u.customCommissionRate) : null,
      customDiscountRate: u.customDiscountRate !== null ? Number(u.customDiscountRate) : null,
    }));

    return { items, total, page, limit };
  }

  async updateReferrerConditions(
    userId: string,
    data: {
      customReferralConditions: boolean;
      customCommissionRate?: number | null;
      customDiscountRate?: number | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        customReferralConditions: data.customReferralConditions,
        customCommissionRate: data.customReferralConditions ? (data.customCommissionRate ?? null) : null,
        customDiscountRate: data.customReferralConditions ? (data.customDiscountRate ?? null) : null,
      },
      select: {
        id: true,
        customReferralConditions: true,
        customCommissionRate: true,
        customDiscountRate: true,
      },
    });
  }

  // ─── Заявки на вывод ───────────────────────────────────────────────────────

  async listWithdrawals(page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      this.prisma.referralWithdrawal.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              restaurant: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.referralWithdrawal.count({ where }),
    ]);

    return { items: withdrawals, total, page, limit };
  }

  async updateWithdrawal(
    id: string,
    data: { status: string; adminNote?: string },
  ) {
    const withdrawal = await this.prisma.referralWithdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new NotFoundException('Заявка не найдена');

    const isCompleting = data.status === 'COMPLETED' && withdrawal.status !== 'COMPLETED';
    const isRejecting = data.status === 'REJECTED' && withdrawal.status !== 'REJECTED';

    if (isRejecting) {
      // Возвращаем сумму на баланс при отклонении
      await this.prisma.$transaction([
        this.prisma.referralWithdrawal.update({
          where: { id },
          data: {
            status: data.status as any,
            adminNote: data.adminNote,
            processedAt: new Date(),
          },
        }),
        this.prisma.user.update({
          where: { id: withdrawal.userId },
          data: { referralBalance: { increment: Number(withdrawal.amount) } },
        }),
      ]);
    } else {
      await this.prisma.referralWithdrawal.update({
        where: { id },
        data: {
          status: data.status as any,
          adminNote: data.adminNote,
          processedAt: isCompleting ? new Date() : undefined,
        },
      });
    }

    return this.prisma.referralWithdrawal.findUnique({ where: { id } });
  }
}
