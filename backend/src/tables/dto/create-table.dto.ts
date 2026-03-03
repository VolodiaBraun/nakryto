import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TableShape {
  ROUND = 'ROUND',
  SQUARE = 'SQUARE',
  RECTANGLE = 'RECTANGLE',
}

export class CreateTableDto {
  @ApiProperty({ example: 'st-001' })
  @IsString()
  @MaxLength(20)
  hallId: string;

  @ApiProperty({ example: '5' })
  @IsString()
  @MaxLength(20)
  label: string;

  @ApiPropertyOptional({ enum: TableShape, default: TableShape.SQUARE })
  @IsOptional()
  @IsEnum(TableShape)
  shape?: TableShape;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minGuests?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxGuests?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  positionX?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  positionY?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  rotation?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({ example: 'у окна' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  comment?: string;
}
