import { Controller, Post, Delete, Body, Req, UseGuards, HttpCode } from '@nestjs/common';
import { MaxService } from './max.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/restaurant/max')
@UseGuards(JwtGuard, RolesGuard)
export class MaxController {
  constructor(private readonly maxService: MaxService) {}

  @Post('setup')
  @Roles('OWNER')
  async setupBot(
    @Req() req: any,
    @Body() body: { token: string },
  ) {
    return this.maxService.setupBot(req.user.restaurantId, body.token);
  }

  @Delete('disable')
  @Roles('OWNER')
  @HttpCode(200)
  async disableBot(@Req() req: any) {
    await this.maxService.disableBot(req.user.restaurantId);
    return { ok: true };
  }
}
