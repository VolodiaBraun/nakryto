import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Plan } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_LANDING_SETTINGS } from './landing-defaults';

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

    // Брони за последние 30 дней
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
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { plan },
      select: { id: true, name: true, slug: true, plan: true },
    });
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
    // Мёрджим с дефолтами чтобы новые поля всегда были доступны
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
}

