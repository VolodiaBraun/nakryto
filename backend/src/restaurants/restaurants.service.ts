import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { CreateStaffDto } from './dto/create-staff.dto';

@Injectable()
export class RestaurantsService {
  constructor(private prisma: PrismaService) {}

  async getProfile(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) throw new NotFoundException('Ресторан не найден');
    return restaurant;
  }

  async updateProfile(restaurantId: string, dto: UpdateRestaurantDto) {
    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: dto,
    });
  }

  async updateSettings(restaurantId: string, dto: UpdateSettingsDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const currentSettings = (restaurant.settings as Record<string, any>) || {};
    const newSettings = { ...currentSettings, ...dto };

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { settings: newSettings },
    });
  }

  async updateWorkingHours(restaurantId: string, dto: UpdateWorkingHoursDto) {
    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { workingHours: dto.workingHours as any },
    });
  }

  async getStats(restaurantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [totalThisMonth, confirmedThisMonth, todayBookings, tables] = await Promise.all([
      this.prisma.booking.count({
        where: {
          restaurantId,
          startsAt: { gte: startOfMonth, lte: endOfMonth },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
      }),
      this.prisma.booking.count({
        where: {
          restaurantId,
          startsAt: { gte: startOfMonth, lte: endOfMonth },
          status: { in: ['CONFIRMED', 'SEATED', 'COMPLETED'] },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          restaurantId,
          startsAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: { table: true, hall: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.table.count({
        where: { hall: { restaurantId, isActive: true }, isActive: true },
      }),
    ]);

    return {
      thisMonth: {
        total: totalThisMonth,
        confirmed: confirmedThisMonth,
      },
      today: todayBookings,
      totalActiveTables: tables,
    };
  }

  async getWidgetSettings(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    const settings = (restaurant?.settings as any) || {};
    return {
      slug: restaurant?.slug,
      buttonText: settings.widgetButtonText || 'Забронировать стол',
      buttonColor: settings.widgetButtonColor || '#2563eb',
      buttonTextColor: settings.widgetButtonTextColor || '#ffffff',
      embedCode: this.generateEmbedCode(restaurant?.slug, settings),
    };
  }

  async updateWidgetSettings(restaurantId: string, widgetSettings: any) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    const currentSettings = (restaurant?.settings as Record<string, any>) || {};
    const newSettings = {
      ...currentSettings,
      widgetButtonText: widgetSettings.buttonText,
      widgetButtonColor: widgetSettings.buttonColor,
      widgetButtonTextColor: widgetSettings.buttonTextColor,
    };

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { settings: newSettings },
    });
  }

  // ─── Staff ─────────────────────────────────────────────────────────────────

  async listStaff(restaurantId: string, currentUserId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createStaff(restaurantId: string, dto: CreateStaffDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email уже используется');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        restaurantId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        emailVerified: true,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }

  async updateStaffRole(restaurantId: string, userId: string, role: 'MANAGER' | 'HOSTESS') {
    const target = await this.prisma.user.findFirst({ where: { id: userId, restaurantId } });
    if (!target) throw new NotFoundException('Сотрудник не найден');
    if (target.role === 'OWNER') throw new ForbiddenException('Нельзя изменить роль владельца');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  async removeStaff(restaurantId: string, userId: string, currentUserId: string) {
    if (userId === currentUserId) throw new BadRequestException('Нельзя удалить самого себя');

    const target = await this.prisma.user.findFirst({ where: { id: userId, restaurantId } });
    if (!target) throw new NotFoundException('Сотрудник не найден');
    if (target.role === 'OWNER') throw new ForbiddenException('Нельзя удалить владельца');

    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  private generateEmbedCode(slug: string, settings: any): string {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const buttonText = settings.widgetButtonText || 'Забронировать стол';
    const buttonColor = settings.widgetButtonColor || '#2563eb';

    return `<!-- Виджет бронирования Накрыто -->
<script>
  (function() {
    var btn = document.createElement('a');
    btn.href = '${baseUrl}/book/${slug}';
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.textContent = '${buttonText}';
    btn.style.cssText = 'display:inline-block;padding:12px 24px;background:${buttonColor};color:#fff;border-radius:8px;text-decoration:none;font-family:sans-serif;font-size:16px;cursor:pointer;';
    document.currentScript.parentNode.insertBefore(btn, document.currentScript);
  })();
</script>
<!-- /Виджет бронирования Накрыто -->`;
  }
}
