import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from './mailer.service';
import {
  verificationEmail,
  passwordResetEmail,
  newBookingStaffEmail,
  bookingReceivedGuestEmail,
  bookingConfirmedGuestEmail,
  newRestaurantSuperAdminEmail,
} from './email-templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mailer: MailerService,
  ) {}

  // ─── Auth notifications ──────────────────────────────────────────────────────

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
    const url = `${frontendUrl}/verify-email?token=${token}`;
    await this.mailer.send(to, 'Подтвердите ваш email — Накрыто', verificationEmail(name, url));
  }

  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
    const url = `${frontendUrl}/reset-password?token=${token}`;
    await this.mailer.send(to, 'Сброс пароля — Накрыто', passwordResetEmail(name, url));
  }

  // ─── Booking notifications ───────────────────────────────────────────────────

  async notifyStaffNewBooking(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        restaurant: {
          include: { users: { select: { email: true, role: true } } },
        },
        table: true,
        hall: true,
      },
    });

    if (!booking) return;

    const { restaurant, table, hall } = booking;
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
    const dashboardUrl = `${frontendUrl}/dashboard/bookings`;

    // Собираем получателей: все сотрудники + notificationEmails из настроек
    const staffEmails = restaurant.users.map((u) => u.email);
    const settings = (restaurant.settings as any) || {};
    const extraEmails: string[] = settings.notificationEmails || [];
    const allEmails = [...new Set([...staffEmails, ...extraEmails])].filter(Boolean);

    if (allEmails.length === 0) return;

    const html = newBookingStaffEmail(
      booking,
      restaurant.name,
      `№${table.label}`,
      hall.name,
      dashboardUrl,
    );

    await this.mailer.send(allEmails, `Новая бронь — ${restaurant.name}`, html);

    // Логируем в NotificationLog
    await this.prisma.notificationLog.create({
      data: {
        bookingId,
        channel: 'email',
        status: 'sent',
        payload: { to: allEmails, type: 'staff_new_booking' },
        sentAt: new Date(),
      },
    });
  }

  async notifyGuestBookingReceived(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { restaurant: true, table: true, hall: true },
    });
    if (!booking || !booking.guestEmail) return;

    const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
    const bookingUrl = `${frontendUrl}/booking/${booking.token}`;
    const { restaurant, table, hall } = booking;

    const html = bookingReceivedGuestEmail(
      booking,
      restaurant.name,
      `№${table.label}`,
      hall.name,
      bookingUrl,
    );

    await this.mailer.send(
      booking.guestEmail,
      `Заявка на бронь получена — ${restaurant.name}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bookingId,
        channel: 'email',
        status: 'sent',
        payload: { to: booking.guestEmail, type: 'guest_booking_received' },
        sentAt: new Date(),
      },
    });
  }

  async notifyGuestBookingConfirmed(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { restaurant: true, table: true, hall: true },
    });
    if (!booking || !booking.guestEmail) return;

    const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
    const bookingUrl = `${frontendUrl}/booking/${booking.token}`;
    const { restaurant, table, hall } = booking;

    const html = bookingConfirmedGuestEmail(
      booking,
      restaurant.name,
      restaurant.address ?? null,
      `№${table.label}`,
      hall.name,
      bookingUrl,
    );

    await this.mailer.send(
      booking.guestEmail,
      `Бронь подтверждена — ${restaurant.name}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bookingId,
        channel: 'email',
        status: 'sent',
        payload: { to: booking.guestEmail, type: 'guest_booking_confirmed' },
        sentAt: new Date(),
      },
    });
  }

  // ─── SuperAdmin notifications ─────────────────────────────────────────────────

  async notifySuperAdminNewRestaurant(restaurantName: string, ownerName: string, ownerEmail: string): Promise<void> {
    const superAdminEmail = this.config.get('SUPERADMIN_EMAIL', 'superadmin@nakryto.ru');
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
    const dashboardUrl = `${frontendUrl}/superadmin`;

    await this.mailer.send(
      superAdminEmail,
      `Новый ресторан: ${restaurantName}`,
      newRestaurantSuperAdminEmail(restaurantName, ownerName, ownerEmail, dashboardUrl),
    );
  }

  async notifySuperAdminNewPartner(partnerName: string, partnerEmail: string): Promise<void> {
    const superAdminEmail = this.config.get('SUPERADMIN_EMAIL', 'superadmin@nakryto.ru');
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
    const dashboardUrl = `${frontendUrl}/superadmin`;

    await this.mailer.send(
      superAdminEmail,
      `Новый партнёр: ${partnerName}`,
      newRestaurantSuperAdminEmail(`Партнёр — ${partnerName}`, partnerName, partnerEmail, dashboardUrl),
    );
  }

  // ─── SMS (stub, для будущего подключения SMSC) ────────────────────────────────

  async sendSmsToGuest(phone: string, message: string, bookingId: string): Promise<void> {
    try {
      const login = this.config.get('SMSC_LOGIN');
      const password = this.config.get('SMSC_PASSWORD');
      if (!login || !password) return;

      const url = new URL('https://smsc.ru/sys/send.php');
      url.searchParams.set('login', login);
      url.searchParams.set('psw', password);
      url.searchParams.set('phones', phone);
      url.searchParams.set('mes', message);
      url.searchParams.set('charset', 'utf-8');

      const response = await fetch(url.toString());
      const text = await response.text();
      const status = text.startsWith('ERROR') ? 'failed' : 'sent';

      await this.prisma.notificationLog.create({
        data: {
          bookingId,
          channel: 'sms',
          status,
          payload: { phone, message },
          sentAt: status === 'sent' ? new Date() : null,
        },
      });
    } catch (err) {
      this.logger.error(`SMS error: ${err.message}`);
    }
  }

  // ─── Telegram (stub, для будущего подключения) ────────────────────────────────

  async sendTelegramToRestaurant(restaurantId: string, message: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { users: { where: { role: 'OWNER' } } },
    });
    const owner = restaurant?.users[0];
    if (!owner?.telegramChatId) return;
    await this._sendTelegram(owner.telegramChatId, message);
  }

  // ─── Reminders cron ──────────────────────────────────────────────────────────

  @Cron('0 10 * * *')
  async sendReminders24h(): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0);
    const end = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);

    const bookings = await this.prisma.booking.findMany({
      where: { startsAt: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'PENDING'] } },
      include: { restaurant: true, table: true },
    });

    for (const booking of bookings) {
      const dateStr = booking.startsAt.toLocaleDateString('ru-RU');
      const timeStr = booking.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const frontendUrl = this.config.get('FRONTEND_URL', 'https://nakryto.ru');
      const msg = `Напоминание: завтра ${dateStr} в ${timeStr} бронь в ${booking.restaurant.name}, стол ${booking.table.label}. Отмена: ${frontendUrl}/booking/${booking.token}`;
      await this.sendSmsToGuest(booking.guestPhone, msg, booking.id);
    }

    this.logger.log(`Отправлено ${bookings.length} напоминаний`);
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async _sendTelegram(chatId: string, text: string): Promise<void> {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    if (!token || token === 'your_bot_token') return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
    } catch (err) {
      this.logger.error(`Telegram error: ${err.message}`);
    }
  }
}
