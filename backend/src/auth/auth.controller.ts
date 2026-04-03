import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterPartnerDto } from './dto/register-partner.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtGuard } from './guards/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @MinLength(8) password: string;
}

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Регистрация ресторана + владельца' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register-partner')
  @ApiOperation({ summary: 'Регистрация партнёра (без ресторана)' })
  registerPartner(@Body() dto: RegisterPartnerDto) {
    return this.authService.registerPartner(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Вход' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Обновление access token по refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Подтверждение email по ссылке из письма' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Повторная отправка письма с подтверждением email' })
  resendVerification(@CurrentUser('id') userId: string) {
    return this.authService.resendVerification(userId);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Запрос на сброс пароля (отправка письма)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Сброс пароля по токену из письма' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Выход (инвалидация refresh token)' })
  logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Текущий пользователь' })
  me(@CurrentUser('id') userId: string) {
    return this.authService.me(userId);
  }
}
