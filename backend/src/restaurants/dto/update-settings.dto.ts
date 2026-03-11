import { IsNumber, IsBoolean, IsOptional, Min, Max, IsArray, IsEmail } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Минимум часов до брони', example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(72)
  minBookingHours?: number;

  @ApiPropertyOptional({ description: 'Максимум дней вперёд', example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  maxBookingDays?: number;

  @ApiPropertyOptional({ description: 'Длительность слота в минутах', enum: [15, 30, 60] })
  @IsOptional()
  @IsNumber()
  slotMinutes?: number;

  @ApiPropertyOptional({ description: 'Буфер между бронями (минуты)', example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  bufferMinutes?: number;

  @ApiPropertyOptional({ description: 'Автоматически подтверждать брони', example: true })
  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;

  @ApiPropertyOptional({ description: 'Email-адреса для уведомлений о бронях', example: ['manager@restaurant.ru'] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  notificationEmails?: string[];
}
