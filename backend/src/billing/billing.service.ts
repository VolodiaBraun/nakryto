import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { ReferralService } from '../referral/referral.service';
import { Plan } from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private planLimits: PlanLimitsService,
    private referralService: ReferralService,
  ) {}

  async getSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        balance: true,
        billingType: true,
        paymentCards: { orderBy: { createdAt: 'desc' } },
        restaurant: {
          select: {
            id: true,
            plan: true,
            planExpiresAt: true,
          },
        },
      },
    });
    if (!user || !user.restaurant) throw new NotFoundException('Пользователь или ресторан не найден');

    const [limitStatus, prices] = await Promise.all([
      this.planLimits.getLimitStatus(
        user.restaurant.id,
        user.restaurant.plan,
        user.restaurant.planExpiresAt,
      ),
      this.planLimits.getPrices(),
    ]);

    return {
      balance: Number(user.balance),
      billingType: user.billingType,
      cards: user.paymentCards,
      restaurant: {
        id: user.restaurant.id,
        plan: user.restaurant.plan,
        planExpiresAt: user.restaurant.planExpiresAt,
      },
      limitStatus,
      prices,
    };
  }

  async getLimitStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurant: { select: { id: true, plan: true, planExpiresAt: true } } },
    });
    if (!user?.restaurant) throw new NotFoundException('Ресторан не найден');

    return this.planLimits.getLimitStatus(
      user.restaurant.id,
      user.restaurant.plan,
      user.restaurant.planExpiresAt,
    );
  }

  async topUp(userId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Сумма должна быть больше 0');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } },
      }),
      this.prisma.balanceTransaction.create({
        data: {
          userId,
          type: 'TOPUP',
          amount,
          description: `Пополнение баланса на ${amount} ₽`,
        },
      }),
    ]);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    return { balance: Number(user!.balance) };
  }

  async getTransactions(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.balanceTransaction.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async upgradePlan(
    userId: string,
    newPlan: Plan,
    referralCode?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        balance: true,
        referredByUserId: true,
        pendingReferralCode: true,
        referralDiscountUsed: true,
        restaurant: { select: { id: true, plan: true, planExpiresAt: true } },
      },
    });
    if (!user || !user.restaurant) throw new NotFoundException('Ресторан не найден');
    if (newPlan === 'FREE') throw new BadRequestException('Нельзя перейти на бесплатный тариф через биллинг');

    const prices = await this.planLimits.getPrices();
    let price = prices[newPlan] ?? 0;
    const oldPlan = user.restaurant.plan;

    // Применить реферальный код если передан (обновить last-touch)
    if (referralCode) {
      await this.referralService.trackReferral(userId, referralCode);
      // Перечитываем с обновлённым pendingReferralCode
      const refreshed = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { pendingReferralCode: true, referralDiscountUsed: true },
      });
      if (refreshed) {
        user.pendingReferralCode = refreshed.pendingReferralCode;
        user.referralDiscountUsed = refreshed.referralDiscountUsed;
      }
    }

    // Скидка для первой оплаты рефералов
    const isFirstPaidUpgrade = oldPlan === 'FREE';
    const settings = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const sData = settings?.data as any ?? {};
    const discountRate: number = sData.referralDiscountPercent ?? 50;

    let discountApplied = 0;
    if (
      isFirstPaidUpgrade &&
      !user.referralDiscountUsed &&
      (user.pendingReferralCode || referralCode)
    ) {
      discountApplied = Math.round(price * discountRate) / 100;
      price = price - discountApplied;
    }

    const balance = Number(user.balance);
    if (balance < price) {
      throw new ForbiddenException(
        `Недостаточно средств. Необходимо: ${price} ₽, на балансе: ${balance} ₽`,
      );
    }

    // Списываем с баланса и обновляем тариф
    const planExpiresAt = new Date();
    planExpiresAt.setMonth(planExpiresAt.getMonth() + 1);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: price } },
      }),
      this.prisma.balanceTransaction.create({
        data: {
          userId,
          type: 'PLAN_PAYMENT',
          amount: -price,
          description: `Оплата тарифа ${newPlan}${discountApplied > 0 ? ` (скидка ${discountRate}%)` : ''}`,
          meta: { plan: newPlan, discountApplied, originalPrice: prices[newPlan] },
        },
      }),
      this.prisma.restaurant.update({
        where: { id: user.restaurant.id },
        data: { plan: newPlan, planExpiresAt },
      }),
    ]);

    // Начислить реферальную комиссию
    if (oldPlan !== newPlan) {
      await this.referralService.processReferralOnPlanUpgrade(
        user, prices[newPlan] ?? 0, newPlan, oldPlan,
      );
    }

    return {
      plan: newPlan,
      planExpiresAt,
      paid: price,
      discountApplied,
    };
  }

  async addCard(userId: string, dto: {
    last4: string;
    brand: string;
    expiryMonth: number;
    expiryYear: number;
  }) {
    // Снять флаг isDefault с существующих карт
    await this.prisma.paymentCard.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    return this.prisma.paymentCard.create({
      data: { userId, ...dto, isDefault: true },
    });
  }

  async removeCard(userId: string, cardId: string) {
    const card = await this.prisma.paymentCard.findFirst({ where: { id: cardId, userId } });
    if (!card) throw new NotFoundException('Карта не найдена');
    await this.prisma.paymentCard.delete({ where: { id: cardId } });
    return { ok: true };
  }

  async setDefaultCard(userId: string, cardId: string) {
    const card = await this.prisma.paymentCard.findFirst({ where: { id: cardId, userId } });
    if (!card) throw new NotFoundException('Карта не найдена');

    await this.prisma.$transaction([
      this.prisma.paymentCard.updateMany({ where: { userId }, data: { isDefault: false } }),
      this.prisma.paymentCard.update({ where: { id: cardId }, data: { isDefault: true } }),
    ]);

    return { ok: true };
  }

  async setBillingType(userId: string, billingType: 'CARD' | 'LEGAL_ENTITY') {
    await this.prisma.user.update({ where: { id: userId }, data: { billingType: billingType as any } });
    return { billingType };
  }
}
