import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { MaxService } from '../max/max.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { ListBookingsDto } from './dto/list-bookings.dto';
import { BookingGateway } from '../websocket/websocket.gateway';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private planLimits: PlanLimitsService,
    private gateway: BookingGateway,
    private notifications: NotificationsService,
    private telegram: TelegramService,
    private max: MaxService,
    private auditLog: AuditLogService,
  ) {}

  private notify(
    slug: string,
    startsAt: Date,
    event: 'booking_created' | 'booking_cancelled',
    tableId: string,
  ) {
    try {
      const date = startsAt.toISOString().split('T')[0];
      this.gateway.notifyTableStatusChanged(slug, date, event, {
        tableId,
        datetime: startsAt.toISOString(),
      });
    } catch (_) {
      // WS не должен ломать основной флоу
    }
  }

  async findAll(restaurantId: string, filters: ListBookingsDto) {
    const { date, hallId, status, search, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: any = { restaurantId };

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.startsAt = { gte: start, lte: end };
    }

    if (hallId) where.hallId = hallId;
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { guestName: { contains: search, mode: 'insensitive' } },
        { guestPhone: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: { table: true, hall: true, confirmedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { startsAt: 'asc' },
        skip,
        take: Number(limit),
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, restaurantId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, restaurantId },
      include: { table: true, hall: true, notificationLogs: true, confirmedBy: { select: { id: true, name: true, role: true } } },
    });

    if (!booking) throw new NotFoundException('Бронь не найдена');
    return booking;
  }

  async findByToken(token: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { token },
      include: { table: true, hall: true, restaurant: true },
    });

    if (!booking) throw new NotFoundException('Бронь не найдена');
    return booking;
  }

  async create(restaurantId: string, dto: CreateBookingDto, source: 'ONLINE' | 'MANUAL' = 'MANUAL') {
    if (!dto.consentGiven) {
      throw new BadRequestException('Необходимо согласие на обработку персональных данных');
    }

    // Проверяем лимит броней для FREE-тарифа и читаем настройки (только онлайн-брони)
    let autoConfirm = false;
    if (source === 'ONLINE') {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { plan: true, planExpiresAt: true, settings: true },
      });

      autoConfirm = !!(restaurant?.settings as any)?.autoConfirm;

      if (restaurant) {
        const exceeded = await this.planLimits.isBookingLimitExceeded(
          restaurantId,
          restaurant.plan,
          restaurant.planExpiresAt,
        );
        if (exceeded) {
          throw new ForbiddenException('Достигнут лимит броней для вашего тарифа');
        }
      }
    }

    // Получаем стол и проверяем что он принадлежит ресторану
    const table = await this.prisma.table.findFirst({
      where: { id: dto.tableId, hall: { restaurantId }, isActive: true },
      include: { hall: true },
    });

    if (!table) throw new NotFoundException('Стол не найден');

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    // Проверяем вместимость
    if (dto.guestCount < table.minGuests || dto.guestCount > table.maxGuests) {
      throw new BadRequestException(
        `Стол вмещает от ${table.minGuests} до ${table.maxGuests} гостей`,
      );
    }

    // Проверяем конфликт броней
    const conflict = await this.prisma.booking.findFirst({
      where: {
        tableId: dto.tableId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        ],
      },
    });

    if (conflict) {
      throw new ConflictException('Выбранное время уже занято для этого стола');
    }

    // Проверяем закрытые периоды
    const closedPeriod = await this.prisma.closedPeriod.findFirst({
      where: {
        restaurantId,
        OR: [{ tableId: dto.tableId }, { tableId: null }],
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
      },
    });

    if (closedPeriod) {
      throw new BadRequestException('Ресторан или стол недоступен в выбранное время');
    }

    const isTwa = !!dto.telegramUserId;
    const isMax = !!dto.maxUserId;
    const isMiniApp = isTwa || isMax;

    const booking = await this.prisma.booking.create({
      data: {
        restaurantId,
        tableId: dto.tableId,
        hallId: table.hallId,
        guestName: dto.guestName,
        guestPhone: dto.guestPhone,
        guestEmail: dto.guestEmail ?? null,
        guestCount: dto.guestCount,
        telegramUserId: dto.telegramUserId ?? null,
        maxUserId: dto.maxUserId ?? null,
        startsAt,
        endsAt,
        status: autoConfirm ? 'CONFIRMED' : 'PENDING',
        source,
        notes: dto.notes,
        consentGiven: dto.consentGiven,
        consentAt: new Date(),
      },
      include: { table: true, hall: true, restaurant: true },
    });

    this.notify((booking as any).restaurant.slug, booking.startsAt, 'booking_created', booking.tableId);
    this.notifications.notifyStaffNewBooking(booking.id).catch(() => {});
    if (autoConfirm) {
      if (isMiniApp) {
        if (isTwa) this.telegram.notifyBookingConfirmed(booking.id).catch(() => {});
        if (isMax) this.max.notifyBookingConfirmed(booking.id).catch(() => {});
        if (dto.guestEmail) this.notifications.notifyGuestBookingConfirmed(booking.id).catch(() => {});
      } else {
        this.notifications.notifyGuestBookingConfirmed(booking.id).catch(() => {});
      }
    } else {
      if (isMiniApp) {
        if (isTwa) this.telegram.notifyBookingReceived(booking.id).catch(() => {});
        if (isMax) this.max.notifyBookingReceived(booking.id).catch(() => {});
        if (dto.guestEmail) this.notifications.notifyGuestBookingReceived(booking.id).catch(() => {});
      } else {
        this.notifications.notifyGuestBookingReceived(booking.id).catch(() => {});
      }
    }
    this.auditLog.log({
      action: 'booking.create',
      actorType: source === 'ONLINE' ? 'guest' : 'user',
      restaurantId,
      entityId: booking.id,
      status: 'ok',
      meta: {
        source,
        guestName: dto.guestName,
        guestCount: dto.guestCount,
        tableId: dto.tableId,
        startsAt: dto.startsAt,
        bookingStatus: booking.status,
      },
    });
    return booking;
  }

  async update(id: string, restaurantId: string, dto: UpdateBookingDto) {
    const booking = await this.findOne(id, restaurantId);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : booking.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : booking.endsAt;
    const tableId = dto.tableId ?? booking.tableId;

    // Проверяем конфликт (исключая саму бронь)
    const conflict = await this.prisma.booking.findFirst({
      where: {
        tableId,
        id: { not: id },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [{ startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }],
      },
    });
    if (conflict) throw new ConflictException('Выбранное время уже занято для этого стола');

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        tableId,
        startsAt,
        endsAt,
        ...(dto.guestCount !== undefined && { guestCount: dto.guestCount }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { table: true, hall: true, restaurant: true },
    });
    this.notify((updated as any).restaurant.slug, updated.startsAt, 'booking_created', updated.tableId);
    return updated;
  }

  async updateStatus(id: string, restaurantId: string, dto: UpdateBookingStatusDto, actorId?: string) {
    await this.findOne(id, restaurantId);

    const isConfirming = dto.status === 'CONFIRMED';

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: dto.status,
        ...(isConfirming && {
          confirmedById: actorId ?? null,
          confirmedAt: new Date(),
        }),
      },
      include: { table: true, hall: true, restaurant: true },
    });

    if (isConfirming) {
      const hasMiniApp = (updated as any).telegramUserId || (updated as any).maxUserId;
      if (hasMiniApp) {
        if ((updated as any).telegramUserId) this.telegram.notifyBookingConfirmed(updated.id).catch(() => {});
        if ((updated as any).maxUserId) this.max.notifyBookingConfirmed(updated.id).catch(() => {});
        if ((updated as any).guestEmail) this.notifications.notifyGuestBookingConfirmed(updated.id).catch(() => {});
      } else {
        this.notifications.notifyGuestBookingConfirmed(updated.id).catch(() => {});
      }
    }

    const event = dto.status === 'CANCELLED' ? 'booking_cancelled' : 'booking_created';
    this.notify((updated as any).restaurant.slug, updated.startsAt, event, updated.tableId);
    this.auditLog.log({
      action: 'booking.status_update',
      actorType: 'user',
      actorId: actorId,
      restaurantId,
      entityId: id,
      status: 'ok',
      meta: { newStatus: dto.status },
    });
    return updated;
  }

  async cancelByToken(token: string) {
    const booking = await this.prisma.booking.findUnique({ where: { token } });

    if (!booking) throw new NotFoundException('Бронь не найдена');

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(booking.status)) {
      throw new BadRequestException('Эту бронь нельзя отменить');
    }

    const cancelled = await this.prisma.booking.update({
      where: { token },
      data: { status: 'CANCELLED' },
      include: { restaurant: true },
    });
    this.notify((cancelled as any).restaurant.slug, cancelled.startsAt, 'booking_cancelled', cancelled.tableId);
    this.auditLog.log({
      action: 'booking.cancel_guest',
      actorType: 'guest',
      restaurantId: cancelled.restaurantId,
      entityId: cancelled.id,
      status: 'ok',
      meta: { token },
    });
    return cancelled;
  }

  // Получить доступные слоты на дату
  async getAvailability(restaurantId: string, date: string, guestCount: number) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const settings = (restaurant.settings as any) || {};
    const workingHours = restaurant.workingHours as any;

    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const targetDate = new Date(date);
    const dayName = dayNames[targetDate.getDay()];
    const daySchedule = workingHours[dayName];

    if (!daySchedule || daySchedule.closed) {
      return { slots: [], reason: 'Ресторан закрыт в этот день' };
    }

    const slotMinutes = settings.slotMinutes || 30;
    const bufferMinutes = settings.bufferMinutes || 30;
    const [openHour, openMin] = daySchedule.open.split(':').map(Number);
    const [rawCloseHour, closeMin] = daySchedule.close.split(':').map(Number);

    // Если закрытие после полуночи (closeHour < openHour), добавляем 24
    const closeHour = rawCloseHour < openHour ? rawCloseHour + 24 : rawCloseHour;

    const slots: string[] = [];
    let hour = openHour;
    let min = openMin;

    while (hour < closeHour || (hour === closeHour && min < closeMin)) {
      const displayHour = hour % 24;
      slots.push(`${String(displayHour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
      min += slotMinutes;
      if (min >= 60) { hour++; min -= 60; }
    }

    // Получаем занятые столы для каждого слота
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await this.prisma.booking.findMany({
      where: {
        restaurantId,
        startsAt: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    });

    const tables = await this.prisma.table.findMany({
      where: { hall: { restaurantId }, isActive: true, maxGuests: { gte: guestCount }, minGuests: { lte: guestCount } },
    });

    // Для каждого слота определяем есть ли доступные столы
    const slotsWithAvailability = slots.map((slot) => {
      const [h, m] = slot.split(':').map(Number);
      const slotStart = new Date(date);
      slotStart.setHours(h, m, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000); // стандартная бронь 2 часа

      const bookedTableIds = existingBookings
        .filter((b) => b.startsAt < slotEnd && b.endsAt > slotStart)
        .map((b) => b.tableId);

      const availableTables = tables.filter((t) => !bookedTableIds.includes(t.id));

      return {
        time: slot,
        available: availableTables.length > 0,
        availableTablesCount: availableTables.length,
      };
    });

    return { slots: slotsWithAvailability, date };
  }

  // Статусы столов для схемы зала на дату (и опционально время)
  async getTableStatuses(restaurantId: string, date: string, time?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const settings = (restaurant.settings as any) || {};
    const bufferMinutes: number = settings.bufferMinutes ?? 30;
    const minBookingHours: number = settings.minBookingHours ?? 0;
    // Буфер = максимум из bufferMinutes и minBookingHours*60:
    // стол скрывается тогда, когда уже нельзя сделать новую бронь (min advance time)
    const effectiveBufferMinutes = Math.max(bufferMinutes, minBookingHours * 60);
    const bufferMs = effectiveBufferMinutes * 60 * 1000;

    // Текущее время: переданное или серверное
    let targetDateTime: Date;
    if (time) {
      const [h, m] = time.split(':').map(Number);
      targetDateTime = new Date(date);
      targetDateTime.setHours(h, m, 0, 0);
    } else {
      targetDateTime = new Date();
    }

    // Все брони на указанный день
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await this.prisma.booking.findMany({
      where: {
        restaurantId,
        startsAt: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      orderBy: { startsAt: 'asc' },
    });

    const tables = await this.prisma.table.findMany({
      where: { hall: { restaurantId }, isActive: true },
    });

    return tables.map((t) => {
      const tableBookings = bookings.filter((b) => b.tableId === t.id);

      // Активная бронь прямо сейчас
      const activeBooking = tableBookings.find(
        (b) => b.startsAt <= targetDateTime && b.endsAt > targetDateTime,
      );

      // Ближайшая бронь в пределах буфера
      const bufferEnd = new Date(targetDateTime.getTime() + bufferMs);
      const upcomingInBuffer = tableBookings.find(
        (b) => b.startsAt > targetDateTime && b.startsAt <= bufferEnd,
      );

      const isBooked = !!activeBooking || !!upcomingInBuffer;

      // Следующая бронь после текущего момента (для подсказки "свободен до...")
      const nextBooking = tableBookings.find((b) => b.startsAt > targetDateTime);

      // freeUntil = время, когда стол станет недоступен для брони (nextBooking.startsAt - buffer)
      let freeUntil: string | null = null;
      if (!isBooked && nextBooking) {
        const cutoff = new Date(nextBooking.startsAt.getTime() - bufferMs);
        if (cutoff > targetDateTime) {
          freeUntil = cutoff.toISOString();
        }
      }

      return {
        id: t.id,
        label: t.label,
        status: isBooked ? 'BOOKED' : 'FREE',
        freeUntil,
      };
    });
  }
}
