import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Bot API helper ───────────────────────────────────────────────────────

  private async callBotApi(token: string, method: string, body?: object): Promise<any> {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new BadRequestException(`Telegram API error: ${json.description}`);
    }
    return json.result;
  }

  // ─── Setup bot for restaurant ─────────────────────────────────────────────

  async setupBot(restaurantId: string, token: string, frontendUrl: string): Promise<{ botUsername: string }> {
    // Verify token is valid by calling getMe
    const me = await this.callBotApi(token, 'getMe');

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true, name: true },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const webAppUrl = `${frontendUrl}/twa/${restaurant.slug}`;

    // Set menu button (persistent Web App button in chat)
    await this.callBotApi(token, 'setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: 'Забронировать стол',
        web_app: { url: webAppUrl },
      },
    });

    // Set bot description
    await this.callBotApi(token, 'setMyDescription', {
      description: `Бот ресторана «${restaurant.name}» — бронирование столиков онлайн`,
    });

    // Set short description
    await this.callBotApi(token, 'setMyShortDescription', {
      short_description: `Забронируйте стол в «${restaurant.name}»`,
    });

    // Save token to DB and activate
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { telegramBotToken: token, telegramBotActive: true },
    });

    return { botUsername: me.username };
  }

  async disableBot(restaurantId: string): Promise<void> {
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { telegramBotActive: false },
    });
  }

  // ─── Send message to a Telegram user via restaurant bot ──────────────────

  async sendMessage(restaurantId: string, telegramUserId: string, text: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { telegramBotToken: true, telegramBotActive: true },
    });
    if (!restaurant?.telegramBotActive || !restaurant.telegramBotToken) return;

    try {
      await this.callBotApi(restaurant.telegramBotToken, 'sendMessage', {
        chat_id: telegramUserId,
        text,
        parse_mode: 'HTML',
      });
    } catch (err) {
      this.logger.warn(`Failed to send Telegram message to ${telegramUserId}: ${err}`);
    }
  }

  // ─── Notify guest about booking status ───────────────────────────────────

  async notifyBookingReceived(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        restaurant: { select: { id: true, name: true } },
        hall: { select: { name: true } },
        table: { select: { label: true } },
      },
    });
    if (!booking?.telegramUserId) return;

    const startsAt = new Date(booking.startsAt);
    const endsAt = new Date(booking.endsAt);
    const dateStr = startsAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
    const timeStr = `${startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}–${endsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

    const text =
      `🕐 <b>Заявка принята!</b>\n\n` +
      `Ресторан: <b>${booking.restaurant.name}</b>\n` +
      `Дата: ${dateStr}, ${timeStr}\n` +
      `Стол: ${booking.table.label} (${booking.hall.name})\n` +
      `Гостей: ${booking.guestCount}\n\n` +
      `Ждём подтверждения от ресторана.`;

    await this.sendMessage(booking.restaurant.id, booking.telegramUserId, text);
  }

  async notifyBookingConfirmed(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        restaurant: { select: { id: true, name: true } },
        hall: { select: { name: true } },
        table: { select: { label: true } },
      },
    });
    if (!booking?.telegramUserId) return;

    const startsAt = new Date(booking.startsAt);
    const endsAt = new Date(booking.endsAt);
    const dateStr = startsAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
    const timeStr = `${startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}–${endsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

    const text =
      `✅ <b>Бронь подтверждена!</b>\n\n` +
      `Ресторан: <b>${booking.restaurant.name}</b>\n` +
      `Дата: ${dateStr}, ${timeStr}\n` +
      `Стол: ${booking.table.label} (${booking.hall.name})\n` +
      `Гостей: ${booking.guestCount}\n\n` +
      `Ждём вас! До встречи 🍽`;

    await this.sendMessage(booking.restaurant.id, booking.telegramUserId, text);
  }

  async notifyBookingCancelled(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        restaurant: { select: { id: true, name: true } },
      },
    });
    if (!booking?.telegramUserId) return;

    const text =
      `❌ <b>Бронь отменена</b>\n\n` +
      `Ваша заявка в ресторан <b>${booking.restaurant.name}</b> была отменена.\n\n` +
      `Если у вас есть вопросы, свяжитесь с рестораном напрямую.`;

    await this.sendMessage(booking.restaurant.id, booking.telegramUserId, text);
  }
}
