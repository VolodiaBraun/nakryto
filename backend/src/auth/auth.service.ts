import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const RESET_TOKEN_TTL = 3600; // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  async register(dto: RegisterDto) {
    const [existingUser, existingRestaurant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.restaurant.findUnique({ where: { slug: dto.slug } }),
    ]);

    if (existingUser) throw new ConflictException('Пользователь с таким email уже существует');
    if (existingRestaurant) throw new ConflictException('Этот slug уже занят, выберите другой');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const verifyToken = uuidv4();

    const result = await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          slug: dto.slug,
          name: dto.restaurantName,
          settings: {
            minBookingHours: 2,
            maxBookingDays: 30,
            slotMinutes: 30,
            bufferMinutes: 30,
            autoConfirm: false,
          },
          workingHours: {
            mon: { open: '10:00', close: '22:00', closed: false },
            tue: { open: '10:00', close: '22:00', closed: false },
            wed: { open: '10:00', close: '22:00', closed: false },
            thu: { open: '10:00', close: '22:00', closed: false },
            fri: { open: '10:00', close: '23:00', closed: false },
            sat: { open: '10:00', close: '23:00', closed: false },
            sun: { open: '11:00', close: '22:00', closed: false },
          },
        },
      });

      // Проверяем реферальный код (если указан) — сохраняем как pending (last-touch)
      let pendingReferralCode: string | null = null;
      if (dto.referralCode) {
        const referrer = await tx.user.findUnique({
          where: { referralCode: dto.referralCode },
          select: { id: true },
        });
        if (referrer) pendingReferralCode = dto.referralCode;
      }

      const user = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: 'OWNER',
          verifyToken,
          pendingReferralCode,
        },
      });

      return { restaurant, user };
    });

    // Отправляем письмо с подтверждением и уведомляем суперадмина (фоново)
    this.notifications
      .sendVerificationEmail(result.user.email, result.user.name, verifyToken)
      .catch(() => {});
    this.notifications
      .notifySuperAdminNewRestaurant(result.restaurant.name, result.user.name, result.user.email)
      .catch(() => {});

    const tokens = await this.generateTokens(result.user.id, result.user.email, result.restaurant.id, result.user.role);
    this.auditLog.log({
      action: 'auth.register',
      actorType: 'user',
      actorId: result.user.id,
      actorEmail: result.user.email,
      restaurantId: result.restaurant.id,
      entityId: result.user.id,
      status: 'ok',
      meta: { restaurantName: result.restaurant.name, slug: result.restaurant.slug },
    });
    return { user: this.sanitizeUser(result.user), restaurant: result.restaurant, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { restaurant: true },
    });

    if (!user) {
      this.auditLog.log({
        action: 'auth.login_failed',
        actorType: 'user',
        actorEmail: dto.email,
        status: 'error',
        errorMessage: 'Пользователь не найден',
      });
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      this.auditLog.log({
        action: 'auth.login_failed',
        actorType: 'user',
        actorId: user.id,
        actorEmail: user.email,
        restaurantId: user.restaurantId,
        status: 'error',
        errorMessage: 'Неверный пароль',
      });
      throw new UnauthorizedException('Неверный email или пароль');
    }

    this.auditLog.log({
      action: 'auth.login',
      actorType: 'user',
      actorId: user.id,
      actorEmail: user.email,
      restaurantId: user.restaurantId,
      entityId: user.id,
      status: 'ok',
      meta: { role: user.role },
    });
    const tokens = await this.generateTokens(user.id, user.email, user.restaurantId, user.role);
    return { user: this.sanitizeUser(user), restaurant: user.restaurant, ...tokens };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Недействительный refresh token');
      }

      return this.generateTokens(user.id, user.email, user.restaurantId, user.role);
    } catch {
      throw new UnauthorizedException('Недействительный refresh token');
    }
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({ where: { verifyToken: token } });
    if (!user) throw new NotFoundException('Ссылка недействительна или уже использована');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null },
    });

    return { message: 'Email успешно подтверждён' };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.emailVerified) return { message: 'Email уже подтверждён' };

    // Генерируем новый токен если старый потерян
    let token = user.verifyToken;
    if (!token) {
      token = uuidv4();
      await this.prisma.user.update({ where: { id: user.id }, data: { verifyToken: token } });
    }

    this.notifications.sendVerificationEmail(user.email, user.name, token).catch(() => {});
    return { message: 'Письмо с подтверждением отправлено' };
  }

  async forgotPassword(email: string) {
    // Всегда отвечаем успехом (не раскрываем существование email)
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'Если такой email зарегистрирован, вы получите письмо' };

    const token = uuidv4();
    await this.redis.set(`reset:${token}`, user.id, 'EX', RESET_TOKEN_TTL);

    this.notifications.sendPasswordResetEmail(user.email, user.name, token).catch(() => {});

    return { message: 'Если такой email зарегистрирован, вы получите письмо' };
  }

  async resetPassword(token: string, newPassword: string) {
    const userId = await this.redis.get(`reset:${token}`);
    if (!userId) throw new BadRequestException('Ссылка недействительна или истекла');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshToken: null },
    });

    await this.redis.del(`reset:${token}`);

    return { message: 'Пароль успешно изменён' };
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    return { message: 'Выход выполнен' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { restaurant: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return { user: this.sanitizeUser(user), restaurant: user.restaurant };
  }

  private async generateTokens(userId: string, email: string, restaurantId: string, role: string) {
    const payload = { sub: userId, email, restaurantId, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES') || '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES') || '30d',
      }),
    ]);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken } });
    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, refreshToken, verifyToken, ...safe } = user;
    return safe;
  }
}
