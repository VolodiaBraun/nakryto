import { IsString, IsOptional, IsNumber, IsObject, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHallDto {
  @ApiProperty({ example: 'Основной зал' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Схема зала в формате Konva.js JSON' })
  @IsOptional()
  @IsObject()
  floorPlan?: object;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
