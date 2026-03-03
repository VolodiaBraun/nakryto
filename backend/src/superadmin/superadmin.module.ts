import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';
import { SuperAdminJwtStrategy } from './strategies/superadmin-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminJwtStrategy],
})
export class SuperAdminModule {}
