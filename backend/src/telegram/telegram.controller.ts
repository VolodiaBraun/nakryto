import { Controller, Post, Delete, Body, Req, UseGuards, HttpCode } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/restaurant/telegram')
@UseGuards(JwtGuard, RolesGuard)
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('setup')
  @Roles('OWNER')
  async setupBot(
    @Req() req: any,
    @Body() body: { token: string; frontendUrl: string },
  ) {
    const { token, frontendUrl } = body;
    return this.telegramService.setupBot(req.user.restaurantId, token, frontendUrl);
  }

  @Delete('disable')
  @Roles('OWNER')
  @HttpCode(200)
  async disableBot(@Req() req: any) {
    await this.telegramService.disableBot(req.user.restaurantId);
    return { ok: true };
  }
}
