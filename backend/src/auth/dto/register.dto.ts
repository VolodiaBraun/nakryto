import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'owner@bellaroma.ru' })
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;

  @ApiProperty({ example: 'SecretPass123!' })
  @IsString()
  @MinLength(8, { message: 'Пароль минимум 8 символов' })
  @MaxLength(64)
  password: string;

  @ApiProperty({ example: 'Иван Петров' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Белла Рома' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  restaurantName: string;

  @ApiProperty({ example: 'bellaroma', description: 'Уникальный slug для URL страницы бронирования' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug может содержать только строчные латинские буквы, цифры и дефис' })
  slug: string;
}
