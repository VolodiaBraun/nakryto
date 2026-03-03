import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface SuperAdminJwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class SuperAdminJwtStrategy extends PassportStrategy(Strategy, 'superadmin-jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('SUPERADMIN_JWT_SECRET') || 'superadmin-secret-change-in-prod',
    });
  }

  async validate(payload: SuperAdminJwtPayload) {
    const superAdmin = await this.prisma.superAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (!superAdmin) {
      throw new UnauthorizedException('Супер-администратор не найден');
    }

    return { id: superAdmin.id, email: superAdmin.email };
  }
}
