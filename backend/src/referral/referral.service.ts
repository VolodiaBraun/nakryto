import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { randomBytes } from 'crypto';

@Injectable()
export class ReferralService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private genRandomCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  // Строит массив последних N месяцев с агрегацией по транзакциям
  private buildMonthlyChart(
    transactions: Array<{ commissionAmount: any; createdAt: Date }>,
    months = 12,
  ): Array<{ month: string; amount: number; count: number }> {
    const now = new Date();
    const result: Array<{ month: string; amount: number; count: number }> = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({ month, amount: 0, count: 0 });
    }

    for (const t of transactions) {
      const tDate = new Date(t.createdAt);
      const month = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = result.find((m) => m.month === month);
      if (entry) {
        entry.amount += Number(t.commissionAmount);
        entry.count++;
      }
    }

    return result;
  }

  async getReferralInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralCode: true,
        referralBalance: true,
        pendingReferralCode: true,
        referredByUserId: true,
        referralDiscountUsed: true,
        customReferralConditions: true,
        customCommissionRate: true,
        // Все транзакции для графика и таблицы
        referralTransactionsAsReferrer: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            paymentAmount: true,
            commissionRate: true,
            commissionAmount: true,
            planName: true,
            isFirstPayment: true,
            discountRate: true,
            createdAt: true,
            referralUser: {
              select: {
                name: true,
                restaurant: {
                  select: {
                    name: true,
                    plan: true,
                    planExpiresAt: true,
                  },
                },
              },
            },
          },
        },
        // Привлечённые пользователи для прогноза
        referredUsers: {
          select: {
            id: true,
            restaurant: {
              select: {
                name: true,
                plan: true,
                planExpiresAt: true,
              },
            },
          },
        },
        referralWithdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            amount: true,
            status: true,
            paymentDetails: true,
            adminNote: true,
            processedAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            referredUsers: true,
            referralTransactionsAsReferrer: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    // Сумма выплат
    const totalPaid = await this.prisma.referralWithdrawal.aggregate({
      where: { userId, status: { in: ['COMPLETED', 'PROCESSING'] } },
      _sum: { amount: true },
    });

    // Глобальные настройки (план-цены, % комиссии)
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const settings = (row?.data as any) ?? {};
    const globalCommissionRate: number = settings.referralCommissionPercent ?? 20;
    const planPrices: Record<string, number> = settings.planPrices ?? {
      STANDARD: 990,
      PREMIUM: 1990,
    };

    const commissionRate =
      user.customReferralConditions && user.customCommissionRate !== null
        ? Number(user.customCommissionRate)
        : globalCommissionRate;

    // Данные для графика (последние 12 месяцев)
    const chartData = this.buildMonthlyChart(user.referralTransactionsAsReferrer);

    // Прогноз: привлечённые рестораны с платным тарифом, истекающим в ближайшие 12 месяцев
    const now = new Date();
    const oneYearLater = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    const forecastData = user.referredUsers
      .filter(
        (u) =>
          u.restaurant &&
          u.restaurant.plan !== 'FREE' &&
          u.restaurant.planExpiresAt,
      )
      .filter((u) => {
        const expires = new Date(u.restaurant!.planExpiresAt!);
        return expires >= now && expires <= oneYearLater;
      })
      .map((u) => {
        const restaurant = u.restaurant!;
        const price = planPrices[restaurant.plan] ?? 0;
        const expectedCommission = Math.round(price * (commissionRate / 100) * 100) / 100;
        return {
          date: restaurant.planExpiresAt!.toISOString(),
          month: restaurant.planExpiresAt!.toISOString().slice(0, 7),
          restaurantName: restaurant.name,
          planName: restaurant.plan,
          expectedCommission,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalForecast = forecastData.reduce((s, f) => s + f.expectedCommission, 0);

    return {
      referralCode: user.referralCode,
      referralBalance: Number(user.referralBalance),
      totalEarned: user.referralTransactionsAsReferrer.reduce(
        (sum, t) => sum + Number(t.commissionAmount),
        0,
      ),
      totalPaid: Number(totalPaid._sum.amount ?? 0),
      totalReferrals: user._count.referredUsers,
      totalTransactions: user._count.referralTransactionsAsReferrer,
      referralDiscountUsed: user.referralDiscountUsed,
      // Последние 50 транзакций для таблицы
      transactions: user.referralTransactionsAsReferrer.slice(0, 50),
      chartData,
      forecastData,
      totalForecast,
      withdrawals: user.referralWithdrawals,
    };
  }

  async generateCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, userType: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.referralCode) return { referralCode: user.referralCode };

    let code: string;
    let attempts = 0;
    do {
      code = this.genRandomCode();
      attempts++;
      if (attempts > 10)
        throw new ConflictException('Не удалось сгенерировать код, попробуйте ещё раз');
      const exists = await this.prisma.user.findUnique({ where: { referralCode: code } });
      if (!exists) break;
    } while (true);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
      select: { referralCode: true },
    });

    this.auditLog.log({
      action: user.userType === 'PARTNER' ? 'partner.referral_code_generated' : 'referral.code_generated',
      actorType: user.userType === 'PARTNER' ? 'partner' : 'user',
      actorId: userId,
      entityId: userId,
      status: 'ok',
      meta: { code: updated.referralCode },
    });

    return { referralCode: updated.referralCode };
  }

  // Обновить pendingReferralCode (last-touch атрибуция, только для RESTAURANT_OWNER)
  async trackReferral(userId: string, code: string) {
    if (!code || code.length < 4) return { ok: true };

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });

    // Партнёры не отслеживают входящие реф-коды (у них нет подписки для скидки)
    if (currentUser?.userType === 'PARTNER') return { ok: true };

    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!referrer || referrer.id === userId) return { ok: true };

    await this.prisma.user.update({
      where: { id: userId },
      data: { pendingReferralCode: code },
    });

    return { ok: true };
  }

  // ─── Обработка реферала при оплате тарифа ──────────────────────────────────
  async processReferralOnPlanUpgrade(
    owner: {
      id: string;
      referredByUserId: string | null;
      pendingReferralCode: string | null;
      referralDiscountUsed: boolean;
    },
    paymentAmount: number,
    newPlan: string,
    oldPlan: string,
  ) {
    const isFirstPaidUpgrade = oldPlan === 'FREE';

    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const settings = (row?.data as any) ?? {};
    const globalCommissionRate: number = settings.referralCommissionPercent ?? 20;
    const globalDiscountRate: number = settings.referralDiscountPercent ?? 50;

    let referrerId: string | null = owner.referredByUserId;
    let isFirstPayment = false;

    if (isFirstPaidUpgrade && !owner.referredByUserId && owner.pendingReferralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: owner.pendingReferralCode },
        select: { id: true },
      });
      if (referrer && referrer.id !== owner.id) {
        referrerId = referrer.id;
        isFirstPayment = true;
        await this.prisma.user.update({
          where: { id: owner.id },
          data: { referredByUserId: referrer.id, referralDiscountUsed: true },
        });
      }
    }

    if (!referrerId) return;

    const referrer = await this.prisma.user.findUnique({
      where: { id: referrerId },
      select: {
        customReferralConditions: true,
        customCommissionRate: true,
        customDiscountRate: true,
      },
    });
    if (!referrer) return;

    const commissionRate =
      referrer.customReferralConditions && referrer.customCommissionRate !== null
        ? Number(referrer.customCommissionRate)
        : globalCommissionRate;
    const discountRate =
      referrer.customReferralConditions && referrer.customDiscountRate !== null
        ? Number(referrer.customDiscountRate)
        : globalDiscountRate;

    const effectivePayment =
      isFirstPayment && !owner.referralDiscountUsed
        ? paymentAmount * (1 - discountRate / 100)
        : paymentAmount;
    const commissionAmount = Math.round(effectivePayment * (commissionRate / 100) * 100) / 100;
    if (commissionAmount <= 0) return;

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

  async requestWithdrawal(userId: string, amount: number, paymentDetails?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralBalance: true, userType: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    const balance = Number(user.referralBalance);
    if (amount > balance) {
      throw new BadRequestException(`Недостаточно средств на балансе. Доступно: ${balance} ₽`);
    }

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { referralBalance: { decrement: amount } },
      });

      return tx.referralWithdrawal.create({
        data: {
          userId,
          amount,
          paymentDetails: paymentDetails || null,
        },
      });
    });

    this.auditLog.log({
      action: user.userType === 'PARTNER' ? 'partner.withdrawal_requested' : 'referral.withdrawal_requested',
      actorType: user.userType === 'PARTNER' ? 'partner' : 'user',
      actorId: userId,
      entityId: withdrawal.id,
      status: 'ok',
      meta: { amount, paymentDetails },
    });

    return withdrawal;
  }
}
