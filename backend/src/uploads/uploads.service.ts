import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TABLE_PHOTOS = 5;
const MAX_HALL_PHOTOS = 15;

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
      forcePathStyle: true, // обязательно для Timeweb/Yandex/Minio
    });
  }

  // ─── Таблицы ────────────────────────────────────────────────────────────────

  async uploadTablePhoto(
    tableId: string,
    restaurantId: string,
    file: Express.Multer.File,
  ) {
    this.validateFile(file);

    const table = await this.prisma.table.findFirst({
      where: { id: tableId, hall: { restaurantId }, isActive: true },
    });
    if (!table) throw new NotFoundException('Стол не найден');
    if (table.photos.length >= MAX_TABLE_PHOTOS) {
      throw new BadRequestException(`Максимум ${MAX_TABLE_PHOTOS} фото на стол`);
    }

    const url = await this.uploadToS3(file, `tables/${tableId}`);

    return this.prisma.table.update({
      where: { id: tableId },
      data: { photos: { push: url } },
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

    await this.deleteFromS3(photoUrl);

    return this.prisma.table.update({
      where: { id: tableId },
      data: { photos: table.photos.filter((p) => p !== photoUrl) },
      select: { id: true, photos: true },
    });
  }

  // ─── Залы ───────────────────────────────────────────────────────────────────

  async uploadHallPhoto(
    hallId: string,
    restaurantId: string,
    file: Express.Multer.File,
  ) {
    this.validateFile(file);

    const hall = await this.prisma.hall.findFirst({
      where: { id: hallId, restaurantId, isActive: true },
    });
    if (!hall) throw new NotFoundException('Зал не найден');
    if (hall.photos.length >= MAX_HALL_PHOTOS) {
      throw new BadRequestException(`Максимум ${MAX_HALL_PHOTOS} фото на зал`);
    }

    const url = await this.uploadToS3(file, `halls/${hallId}`);

    return this.prisma.hall.update({
      where: { id: hallId },
      data: { photos: { push: url } },
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

    await this.deleteFromS3(photoUrl);

    return this.prisma.hall.update({
      where: { id: hallId },
      data: { photos: hall.photos.filter((p) => p !== photoUrl) },
      select: { id: true, photos: true },
    });
  }

  // ─── S3 helpers ─────────────────────────────────────────────────────────────

  private async uploadToS3(file: Express.Multer.File, prefix: string): Promise<string> {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `${prefix}/${uuidv4()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    return `${PUBLIC_URL}/${key}`;
  }

  private async deleteFromS3(url: string): Promise<void> {
    try {
      // Из полного URL извлекаем ключ: убираем PUBLIC_URL + '/'
      const key = url.replace(`${PUBLIC_URL}/`, '');
      await this.s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      // Не критично — фото уже недоступно
    }
  }

  private validateFile(file: Express.Multer.File) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Допустимые форматы: JPEG, PNG, WebP');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('Максимальный размер файла: 5 МБ');
    }
  }
}
