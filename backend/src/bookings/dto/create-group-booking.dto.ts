import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayMinSize,
  MinLength,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupBookingDto {
  @ApiProperty({ example: ['table-uuid-1', 'table-uuid-2'], description: 'Список ID столов' })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  tableIds: string[];

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

  @ApiProperty({ example: 12 })
  @IsNumber()
  @Min(1)
  @Max(500)
  guestCount: number;

  @ApiPropertyOptional({ example: 'День рождения' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
