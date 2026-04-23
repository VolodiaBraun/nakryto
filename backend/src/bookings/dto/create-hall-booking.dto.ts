import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHallBookingDto {
  @ApiProperty({ example: 'hall-uuid', description: 'ID зала (весь зал блокируется)' })
  @IsString()
  hallId: string;

  @ApiProperty({ example: '2025-03-15T19:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2025-03-15T23:00:00.000Z' })
  @IsDateString()
  endsAt: string;

  @ApiProperty({ example: 'Иван Петров' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  guestName: string;

  @ApiProperty({ example: '+79001234567' })
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'Телефон должен быть в формате +7XXXXXXXXXX' })
  guestPhone: string;

  @ApiProperty({ example: 40 })
  @IsNumber()
  @Min(1)
  @Max(500)
  guestCount: number;

  @ApiPropertyOptional({ example: 'Корпоратив компании' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
