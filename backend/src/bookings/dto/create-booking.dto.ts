import {
  IsString,
  IsNumber,
  IsOptional,
  IsEmail,
  IsDateString,
  IsBoolean,
  Matches,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ example: 'table-uuid' })
  @IsString()
  tableId: string;

  @ApiProperty({ example: '2025-03-15T19:00:00.000Z', description: 'Начало брони (ISO 8601)' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2025-03-15T21:00:00.000Z', description: 'Конец брони (ISO 8601)' })
  @IsDateString()
  endsAt: string;

  @ApiProperty({ example: 2, description: 'Количество гостей' })
  @IsNumber()
  @Min(1)
  @Max(50)
  guestCount: number;

  @ApiProperty({ example: 'Иван Петров' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  guestName: string;

  @ApiProperty({ example: '+79001234567' })
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'Телефон должен быть в формате +7XXXXXXXXXX' })
  guestPhone: string;

  @ApiPropertyOptional({ example: 'ivan@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Некорректный email' })
  guestEmail?: string;

  @ApiPropertyOptional({ example: 'У окна, пожалуйста' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ description: 'Согласие на обработку персональных данных (152-ФЗ)' })
  @IsBoolean()
  consentGiven: boolean;
}
