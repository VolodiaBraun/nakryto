import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async sendTelegramToRestaurant(restaurantId: string, message: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { users: { where: { role: 'OWNER' } } },
    });

    const owner = restaurant?.users[0];
    if (!owner?.telegramChatId) {
      this.logger.warn(`Нет Telegram chat ID для ресторана ${restaurantId}`);
      return;
    }

    await this.sendTelegram(owner.telegramChatId, message);
  }

  async sendSmsToGuest(phone: string, message: string, bookingId: string) {
    try {
      const login = this.config.get('SMSC_LOGIN');
      const password = this.config.get('SMSC_PASSWORD');

      if (!login || !password) {
        this.logger.warn('SMSC не настроен, SMS не отправлен');
        return;
      }

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

      this.logger.log(`SMS [${status}] → ${phone}`);
    } catch (error) {
      this.logger.error(`Ошибка отправки SMS: ${error.message}`);
    }
  }

  async sendEmail(to: string, subject: string, html: string, bookingId: string) {
    try {
      const apiKey = this.config.get('RESEND_API_KEY');
      const from = this.config.get('EMAIL_FROM') || 'noreply@nakryto.ru';

      if (!apiKey || apiKey.startsWith('re_xxxx')) {
        this.logger.warn('Resend API не настроен');
        return;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });

      const status = response.ok ? 'sent' : 'failed';

      await this.prisma.notificationLog.create({
        data: { bookingId, channel: 'email', status, payload: { to, subject }, sentAt: status === 'sent' ? new Date() : null },
      });
    } catch (error) {
      this.logger.error(`Ошибка отправки Email: ${error.message}`);
    }
  }

  async notifyNewBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { restaurant: { include: { users: true } }, table: true, hall: true },
    });

    if (!booking) return;

    const { restaurant, table, hall } = booking;
    const dateStr = booking.startsAt.toLocaleDateString('ru-RU');
    const timeStr = booking.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const telegramMsg =
      `🍽 Новая бронь!\n\n` +
      `👤 ${booking.guestName}\n` +
      `📱 ${booking.guestPhone}\n` +
      `📅 ${dateStr} в ${timeStr}\n` +
      `🪑 Стол ${table.label} (${hall.name}), ${booking.guestCount} гостей\n` +
      `📝 ${booking.notes || 'Без комментариев'}`;

    await this.sendTelegramToRestaurant(restaurant.id, telegramMsg);

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    const smsText = `Бронь подтверждена! ${restaurant.name}, ${dateStr} ${timeStr}, стол ${table.label}. Отмена: ${frontendUrl}/booking/${booking.token}`;
    await this.sendSmsToGuest(booking.guestPhone, smsText, bookingId);

    if (booking.guestEmail) {
      await this.sendEmail(
        booking.guestEmail,
        `Бронь подтверждена — ${restaurant.name}`,
        this.buildConfirmationEmail(booking, restaurant, table, hall),
        bookingId,
      );
    }
  }

  async notifyCancellation(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { restaurant: { include: { users: true } }, table: true },
    });

    if (!booking) return;

    const { restaurant, table } = booking;
    const dateStr = booking.startsAt.toLocaleDateString('ru-RU');
    const timeStr = booking.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const telegramMsg =
      `❌ Отмена брони\n\n` +
      `👤 ${booking.guestName} (${booking.guestPhone})\n` +
      `📅 ${dateStr} в ${timeStr}, стол ${table.label}`;

    await this.sendTelegramToRestaurant(restaurant.id, telegramMsg);

    const smsText = `Ваша бронь в ${restaurant.name} на ${dateStr} ${timeStr} отменена.`;
    await this.sendSmsToGuest(booking.guestPhone, smsText, bookingId);
  }

  @Cron('0 10 * * *')
  async sendReminders24h() {
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
      const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
      const smsText = `Напоминание: завтра ${dateStr} в ${timeStr} у вас бронь в ${booking.restaurant.name}, стол ${booking.table.label}. Отмена: ${frontendUrl}/booking/${booking.token}`;
      await this.sendSmsToGuest(booking.guestPhone, smsText, booking.id);
    }

    this.logger.log(`Отправлено ${bookings.length} напоминаний`);
  }

  private async sendTelegram(chatId: string, text: string) {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    if (!token || token === 'your_bot_token') return;

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
    } catch (error) {
      this.logger.error(`Ошибка Telegram: ${error.message}`);
    }
  }

  private buildConfirmationEmail(booking: any, restaurant: any, table: any, hall: any): string {
    const dateStr = booking.startsAt.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = booking.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';

    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>Бронь подтверждена ✅</h2>
        <p>Здравствуйте, <strong>${booking.guestName}</strong>!</p>
        <p>Ваша бронь в ресторане <strong>${restaurant.name}</strong> подтверждена.</p>
        <table style="border-collapse:collapse;width:100%;">
          <tr><td style="padding:8px;border:1px solid #eee;"><strong>Дата</strong></td><td style="padding:8px;border:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px;border:1px solid #eee;"><strong>Время</strong></td><td style="padding:8px;border:1px solid #eee;">${timeStr}</td></tr>
          <tr><td style="padding:8px;border:1px solid #eee;"><strong>Стол</strong></td><td style="padding:8px;border:1px solid #eee;">${table.label} (${hall.name})</td></tr>
          <tr><td style="padding:8px;border:1px solid #eee;"><strong>Гостей</strong></td><td style="padding:8px;border:1px solid #eee;">${booking.guestCount}</td></tr>
        </table>
        <p style="margin-top:20px;">
          <a href="${frontendUrl}/booking/${booking.token}" style="background:#ef4444;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;">Отменить бронь</a>
        </p>
      </div>
    `;
  }
}
