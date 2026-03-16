import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_API_URL = 'https://platform-api.max.ru';

@Injectable()
export class MaxService {
  private readonly logger = new Logger(MaxService.name);

  constructor(private prisma: PrismaService) {}

  // ─── MAX Bot API helper ───────────────────────────────────────────────────

  private async callMaxApi(token: string, method: 'GET' | 'POST', path: string, body?: object): Promise<any> {
    const res = await fetch(`${MAX_API_URL}${path}`, {
      method,
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new BadRequestException(`MAX API error: ${json.message || res.statusText}`);
    }
    return json;
  }

  // ─── Setup bot for restaurant ─────────────────────────────────────────────

  async setupBot(restaurantId: string, token: string): Promise<{ botName: string; botUsername: string }> {
    // Verify token via GET /me
    const me = await this.callMaxApi(token, 'GET', '/me');

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true, name: true },
    });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    // Save token to DB and activate
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { maxBotToken: token, maxBotActive: true },
    });

    return {
      botName: me.name ?? me.first_name ?? '',
      botUsername: me.username ?? '',
    };
  }

  async disableBot(restaurantId: string): Promise<void> {
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { maxBotActive: false },
    });
  }

  // ─── Send message to a MAX user via restaurant bot ────────────────────────

  async sendMessage(restaurantId: string, maxUserId: string, text: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { maxBotToken: true, maxBotActive: true },
    });
    if (!restaurant?.maxBotActive || !restaurant.maxBotToken) return;

    try {
      await this.callMaxApi(restaurant.maxBotToken, 'POST', '/messages', {
        recipient: { user_id: Number(maxUserId) },
        body: { text, format: 'html' },
      });
    } catch (err) {
      this.logger.warn(`Failed to send MAX message to ${maxUserId}: ${err}`);
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
    if (!(booking as any)?.maxUserId) return;

    const startsAt = new Date(booking!.startsAt);
    const endsAt = new Date(booking!.endsAt);
    const dateStr = startsAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
    const timeStr = `${startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}–${endsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

    const text =
      `🕐 <b>Заявка принята!</b>\n\n` +
      `Ресторан: <b>${booking!.restaurant.name}</b>\n` +
      `Дата: ${dateStr}, ${timeStr}\n` +
      `Стол: ${booking!.table.label} (${booking!.hall.name})\n` +
      `Гостей: ${booking!.guestCount}\n\n` +
      `Ждём подтверждения от ресторана.`;

    await this.sendMessage(booking!.restaurant.id, (booking as any).maxUserId, text);
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
    if (!(booking as any)?.maxUserId) return;

    const startsAt = new Date(booking!.startsAt);
    const endsAt = new Date(booking!.endsAt);
    const dateStr = startsAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
    const timeStr = `${startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}–${endsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

    const text =
      `✅ <b>Бронь подтверждена!</b>\n\n` +
      `Ресторан: <b>${booking!.restaurant.name}</b>\n` +
      `Дата: ${dateStr}, ${timeStr}\n` +
      `Стол: ${booking!.table.label} (${booking!.hall.name})\n` +
      `Гостей: ${booking!.guestCount}\n\n` +
      `Ждём вас! До встречи 🍽`;

    await this.sendMessage(booking!.restaurant.id, (booking as any).maxUserId, text);
  }

  async notifyBookingCancelled(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        restaurant: { select: { id: true, name: true } },
      },
    });
    if (!(booking as any)?.maxUserId) return;

    const text =
      `❌ <b>Бронь отменена</b>\n\n` +
      `Ваша заявка в ресторан <b>${booking!.restaurant.name}</b> была отменена.\n\n` +
      `Если у вас есть вопросы, свяжитесь с рестораном напрямую.`;

    await this.sendMessage(booking!.restaurant.id, (booking as any).maxUserId, text);
  }
}
