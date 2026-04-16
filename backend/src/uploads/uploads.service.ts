import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const ALLOWED_ICON_TYPES: Record<string, string> = {
  ...ALLOWED_TYPES,
  'image/svg+xml': '.svg',
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TABLE_PHOTOS = 5;
const MAX_HALL_PHOTOS = 15;
const PRESIGN_TTL = 300; // 5 minutes

const BUCKET = process.env.S3_BUCKET ?? '';
const PUBLIC_URL = (process.env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');

@Injectable()
export class UploadsService {
  private s3: S3Client;

  constructor(private prisma: PrismaService) {
    this.s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'ru-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      },
      forcePathStyle: true,
    });
  }

  // ─── Фото стола ─────────────────────────────────────────────────────────────

  /** Шаг 1: генерируем presigned PUT URL (без сетевого вызова к S3) */
  async presignTablePhoto(
    tableId: string,
    restaurantId: string,
    contentType: string,
  ) {
    this.validateContentType(contentType);

    const table = await this.prisma.table.findFirst({
      where: { id: tableId, hall: { restaurantId }, isActive: true },
    });
    if (!table) throw new NotFoundException('Стол не найден');
    if (table.photos.length >= MAX_TABLE_PHOTOS) {
      throw new BadRequestException(`Максимум ${MAX_TABLE_PHOTOS} фото на стол`);
    }

    return this.generatePresignedUrl(`tables/${tableId}`, contentType);
  }

  /** Шаг 2: сохраняем URL после загрузки фронтендом напрямую в S3 */
  async saveTablePhoto(
    tableId: string,
    restaurantId: string,
    publicUrl: string,
  ) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, hall: { restaurantId }, isActive: true },
    });
    if (!table) throw new NotFoundException('Стол не найден');
    if (table.photos.length >= MAX_TABLE_PHOTOS) {
      throw new BadRequestException(`Максимум ${MAX_TABLE_PHOTOS} фото на стол`);
    }

    return this.prisma.table.update({
      where: { id: tableId },
      data: { photos: { push: publicUrl } },
      select: { id: true, photos: true },
    });
  }

  async deleteTablePhoto(
    tableId: string,
    restaurantId: string,
    photoUrl: string,
  ) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, hall: { restaurantId }, isActive: true },
    });
    if (!table) throw new NotFoundException('Стол не найден');
    if (!table.photos.includes(photoUrl)) throw new BadRequestException('Фото не найдено');

    // Удаляем из БД; S3 объект остаётся (сервер не имеет исходящего HTTPS)
    return this.prisma.table.update({
      where: { id: tableId },
      data: { photos: table.photos.filter((p) => p !== photoUrl) },
      select: { id: true, photos: true },
    });
  }

  // ─── Фото зала ──────────────────────────────────────────────────────────────

  async presignHallPhoto(
    hallId: string,
    restaurantId: string,
    contentType: string,
  ) {
    this.validateContentType(contentType);

    const hall = await this.prisma.hall.findFirst({
      where: { id: hallId, restaurantId, isActive: true },
    });
    if (!hall) throw new NotFoundException('Зал не найден');
    if (hall.photos.length >= MAX_HALL_PHOTOS) {
      throw new BadRequestException(`Максимум ${MAX_HALL_PHOTOS} фото на зал`);
    }

    return this.generatePresignedUrl(`halls/${hallId}`, contentType);
  }

  async saveHallPhoto(
    hallId: string,
    restaurantId: string,
    publicUrl: string,
  ) {
    const hall = await this.prisma.hall.findFirst({
      where: { id: hallId, restaurantId, isActive: true },
    });
    if (!hall) throw new NotFoundException('Зал не найден');
    if (hall.photos.length >= MAX_HALL_PHOTOS) {
      throw new BadRequestException(`Максимум ${MAX_HALL_PHOTOS} фото на зал`);
    }

    return this.prisma.hall.update({
      where: { id: hallId },
      data: { photos: { push: publicUrl } },
      select: { id: true, photos: true },
    });
  }

  async deleteHallPhoto(
    hallId: string,
    restaurantId: string,
    photoUrl: string,
  ) {
    const hall = await this.prisma.hall.findFirst({
      where: { id: hallId, restaurantId, isActive: true },
    });
    if (!hall) throw new NotFoundException('Зал не найден');
    if (!hall.photos.includes(photoUrl)) throw new BadRequestException('Фото не найдено');

    return this.prisma.hall.update({
      where: { id: hallId },
      data: { photos: hall.photos.filter((p) => p !== photoUrl) },
      select: { id: true, photos: true },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async generatePresignedUrl(
    prefix: string,
    contentType: string,
    typeMap: Record<string, string> = ALLOWED_TYPES,
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    const ext = typeMap[contentType] ?? '.jpg';
    const key = `${prefix}/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    });

    // getSignedUrl — чисто криптографическая операция, сетевой вызов не нужен
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: PRESIGN_TTL });
    const publicUrl = `${PUBLIC_URL}/${key}`;

    return { uploadUrl, publicUrl };
  }

  // ─── Иконки столов ──────────────────────────────────────────────────────────

  /** Presigned URL для загрузки кастомной иконки стола (PREMIUM) */
  async presignIconUpload(restaurantId: string, contentType: string) {
    if (!ALLOWED_ICON_TYPES[contentType]) {
      throw new BadRequestException('Допустимые форматы: JPEG, PNG, WebP, SVG');
    }
    return this.generatePresignedUrl(`icons/${restaurantId}`, contentType, ALLOWED_ICON_TYPES);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private validateContentType(contentType: string) {
    if (!ALLOWED_TYPES[contentType]) {
      throw new BadRequestException('Допустимые форматы: JPEG, PNG, WebP');
    }
  }

  validateFileSize(size: number) {
    if (size > MAX_SIZE_BYTES) {
      throw new BadRequestException('Максимальный размер файла: 5 МБ');
    }
  }
}
