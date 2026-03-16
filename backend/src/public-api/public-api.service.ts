import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DEFAULT_LANDING_SETTINGS } from '../superadmin/landing-defaults';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { BookingGateway } from '../websocket/websocket.gateway';
import { CreateBookingDto } from '../bookings/dto/create-booking.dto';
import { REDIS_CLIENT } from '../redis/redis.module';
import type Redis from 'ioredis';

const LOCK_TTL = 300; // 5 минут

@Injectable()
export class PublicApiService {
  constructor(
    private prisma: PrismaService,
    private bookingsService: BookingsService,
    private gateway: BookingGateway,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  private lockKey(tableId: string, date: string) {
    return `lock:table:${tableId}:${date}`;
  }

  // ─── Lock / Unlock ──────────────────────────────────────────────────────────

  async lockTable(slug: string, tableId: string, date: string, lockId: string) {
    const key = this.lockKey(tableId, date);

    // Если стол уже заблокирован тем же lockId — продлить TTL (идемпотентность)
    const existing = await this.redis.get(key);
    if (existing) {
      const existingLock = JSON.parse(existing);
      if (existingLock.lockId !== lockId) {
        throw new ConflictException('Стол уже бронируется другим гостем');
      }
    }

    const expiresAt = new Date(Date.now() + LOCK_TTL * 1000).toISOString();
    const value = JSON.stringify({ lockId, slug, expiresAt });
    await this.redis.set(key, value, 'EX', LOCK_TTL);

    this.gateway.notifyTableLocked(slug, date, tableId, expiresAt);
    return { success: true, expiresAt };
  }

  async unlockTable(slug: string, tableId: string, date: string, lockId: string) {
    const key = this.lockKey(tableId, date);
    const raw = await this.redis.get(key);
    if (!raw) return { success: false };

    const lock = JSON.parse(raw);
    if (lock.lockId !== lockId) return { success: false };

    await this.redis.del(key);
    this.gateway.notifyTableUnlocked(slug, date, tableId);
    return { success: true };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getRestaurantBySlug(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug, isActive: true },
      select: {
        id: true, slug: true, name: true, address: true, phone: true,
        description: true, logoUrl: true, timezone: true,
        workingHours: true, settings: true, telegramBotActive: true, maxBotActive: true,
      },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');
    return restaurant;
  }

  async getHalls(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug, isActive: true },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    return this.prisma.hall.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      include: {
        tables: {
          where: { isActive: true },
          select: {
            id: true, label: true, shape: true, minGuests: true, maxGuests: true,
            positionX: true, positionY: true, rotation: true, width: true, height: true,
            comment: true, tags: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getAvailability(slug: string, date: string, guestCount: number) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug } });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');
    return this.bookingsService.getAvailability(restaurant.id, date, guestCount);
  }

  async getTableStatuses(slug: string, date: string, time?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug } });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    // Статусы из БД (FREE / BOOKED)
    const statuses: any[] = await this.bookingsService.getTableStatuses(restaurant.id, date, time);
    if (statuses.length === 0) return statuses;

    // Накладываем Redis-блокировки на FREE столы
    const lockKeys = statuses.map((t) => this.lockKey(t.id, date));
    const lockValues = await this.redis.mget(...lockKeys);

    return statuses.map((t, i) => {
      if (t.status === 'FREE' && lockValues[i]) {
        try {
          const lock = JSON.parse(lockValues[i]);
          return { ...t, status: 'LOCKED', lockedUntil: lock.expiresAt };
        } catch {}
      }
      return t;
    });
  }

  async createBooking(slug: string, dto: CreateBookingDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug, isActive: true },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const booking = await this.bookingsService.create(restaurant.id, dto, 'ONLINE');

    // Снимаем Redis-блокировку после успешного создания брони
    const date = new Date(dto.startsAt).toISOString().split('T')[0];
    await this.redis.del(this.lockKey(dto.tableId, date));

    return booking;
  }

  async getBookingByToken(token: string) {
    return this.bookingsService.findByToken(token);
  }

  async cancelBooking(token: string) {
    return this.bookingsService.cancelByToken(token);
  }

  async getLandingSettings() {
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    return { ...DEFAULT_LANDING_SETTINGS, ...(row?.data as object ?? {}) };
  }
}
