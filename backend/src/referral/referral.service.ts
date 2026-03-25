import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class ReferralService {
  constructor(private prisma: PrismaService) {}

  private genRandomCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
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
        referralTransactionsAsReferrer: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            paymentAmount: true,
            commissionRate: true,
            commissionAmount: true,
            planName: true,
            isFirstPayment: true,
            createdAt: true,
            referralUser: { select: { name: true, restaurant: { select: { name: true } } } },
          },
        },
        referralWithdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 10,
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

    // Считаем сумму выплаченных комиссий
    const totalPaid = await this.prisma.referralWithdrawal.aggregate({
      where: { userId, status: { in: ['COMPLETED', 'PROCESSING'] } },
      _sum: { amount: true },
    });

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
      transactions: user.referralTransactionsAsReferrer,
      withdrawals: user.referralWithdrawals,
    };
  }

  async generateCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.referralCode) return { referralCode: user.referralCode };

    // Генерируем уникальный код
    let code: string;
    let attempts = 0;
    do {
      code = this.genRandomCode();
      attempts++;
      if (attempts > 10) throw new ConflictException('Не удалось сгенерировать код, попробуйте ещё раз');
      const exists = await this.prisma.user.findUnique({ where: { referralCode: code } });
      if (!exists) break;
    } while (true);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
      select: { referralCode: true },
    });

    return { referralCode: updated.referralCode };
  }

  // Обновить pendingReferralCode (last-touch атрибуция)
  async trackReferral(userId: string, code: string) {
    if (!code || code.length < 4) return { ok: true };

    // Проверяем что код существует и не принадлежит самому пользователю
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!referrer || referrer.id === userId) return { ok: true };

    // Обновляем только если ещё не было первой оплаты (referredByUserId не заблокирован)
    await this.prisma.user.update({
      where: { id: userId },
      data: { pendingReferralCode: code },
    });

    return { ok: true };
  }

  // ─── Обработка реферала при оплате тарифа ──────────────────────────────────
  // Вызывается из BillingService и SuperAdminService при апгрейде плана
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

    // Глобальные настройки из SiteSettings
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const settings = row?.data as any ?? {};
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
      select: { customReferralConditions: true, customCommissionRate: true, customDiscountRate: true },
    });
    if (!referrer) return;

    const commissionRate = referrer.customReferralConditions && referrer.customCommissionRate !== null
      ? Number(referrer.customCommissionRate) : globalCommissionRate;
    const discountRate = referrer.customReferralConditions && referrer.customDiscountRate !== null
      ? Number(referrer.customDiscountRate) : globalDiscountRate;

    const effectivePayment = isFirstPayment && !owner.referralDiscountUsed
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
      select: { referralBalance: true },
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

    return withdrawal;
  }
}
