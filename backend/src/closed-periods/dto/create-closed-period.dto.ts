import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClosedPeriodDto {
  @ApiProperty({ example: '2025-03-20T00:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2025-03-20T23:59:59.000Z' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ description: 'ID стола (если null — закрывается весь ресторан)' })
  @IsOptional()
  @IsString()
  tableId?: string;

  @ApiPropertyOptional({ description: 'ID зала (если null — закрывается весь ресторан)' })
  @IsOptional()
  @IsString()
  hallId?: string;

  @ApiPropertyOptional({ example: 'Санитарный день' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: 'Иван Петров', description: 'Имя клиента (для корпоративных мероприятий)' })
  @IsOptional()
  @IsString()
  guestName?: string;

  @ApiPropertyOptional({ example: '+79001234567', description: 'Телефон клиента' })
  @IsOptional()
  @IsString()
  guestPhone?: string;
}
