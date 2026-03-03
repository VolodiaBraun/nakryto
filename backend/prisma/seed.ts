import { PrismaClient, TableShape } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Сид базы данных...');

  // Тестовый ресторан
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'demo-restaurant' },
    update: {},
    create: {
      slug: 'demo-restaurant',
      name: 'Демо Ресторан',
      address: 'Москва, ул. Тестовая, 1',
      phone: '+7 495 000-00-00',
      description: 'Тестовый ресторан для разработки',
      timezone: 'Europe/Moscow',
      workingHours: {
        mon: { open: '10:00', close: '22:00', closed: false },
        tue: { open: '10:00', close: '22:00', closed: false },
        wed: { open: '10:00', close: '22:00', closed: false },
        thu: { open: '10:00', close: '22:00', closed: false },
        fri: { open: '10:00', close: '23:00', closed: false },
        sat: { open: '10:00', close: '23:00', closed: false },
        sun: { open: '11:00', close: '22:00', closed: false },
      },
      settings: {
        minBookingHours: 2,
        maxBookingDays: 30,
        slotMinutes: 30,
        bufferMinutes: 30,
        autoConfirm: true,
      },
    },
  });

  // Администратор
  const passwordHash = await bcrypt.hash('admin123456', 12);
  await prisma.user.upsert({
    where: { email: 'admin@demo.ru' },
    update: {},
    create: {
      restaurantId: restaurant.id,
      email: 'admin@demo.ru',
      passwordHash,
      name: 'Администратор',
      role: 'OWNER',
      emailVerified: true,
    },
  });

  // Столы — генерируем id заранее, чтобы floorPlan.objects и Table-записи совпадали
  const tableDefs = [
    { id: uuidv4(), label: '1', shape: TableShape.SQUARE,     minGuests: 1, maxGuests: 2, x: 80,  y: 80,  w: 80,  h: 80,  comment: 'У окна'    },
    { id: uuidv4(), label: '2', shape: TableShape.SQUARE,     minGuests: 1, maxGuests: 2, x: 220, y: 80,  w: 80,  h: 80,  comment: null         },
    { id: uuidv4(), label: '3', shape: TableShape.SQUARE,     minGuests: 2, maxGuests: 4, x: 360, y: 80,  w: 80,  h: 80,  comment: null         },
    { id: uuidv4(), label: '4', shape: TableShape.SQUARE,     minGuests: 2, maxGuests: 4, x: 500, y: 80,  w: 80,  h: 80,  comment: null         },
    { id: uuidv4(), label: '5', shape: TableShape.ROUND,      minGuests: 2, maxGuests: 6, x: 640, y: 80,  w: 80,  h: 80,  comment: 'VIP'        },
    { id: uuidv4(), label: '6', shape: TableShape.RECTANGLE,  minGuests: 4, maxGuests: 8, x: 80,  y: 300, w: 160, h: 80,  comment: 'Банкетный'  },
    { id: uuidv4(), label: '7', shape: TableShape.SQUARE,     minGuests: 1, maxGuests: 2, x: 360, y: 300, w: 80,  h: 80,  comment: null         },
    { id: uuidv4(), label: '8', shape: TableShape.SQUARE,     minGuests: 1, maxGuests: 2, x: 500, y: 300, w: 80,  h: 80,  comment: null         },
  ];

  // floorPlan содержит те же id, что и Table-записи
  const floorPlanObjects = tableDefs.map((t) => ({
    type: 'table',
    id: t.id,
    label: t.label,
    shape: t.shape,
    x: t.x,
    y: t.y,
    width: t.w,
    height: t.h,
    rotation: 0,
    minGuests: t.minGuests,
    maxGuests: t.maxGuests,
    comment: t.comment,
  }));

  // Основной зал
  const hall = await prisma.hall.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Основной зал',
      floorPlan: {
        width: 800,
        height: 600,
        objects: floorPlanObjects,
      },
      sortOrder: 0,
    },
  });

  // Создаём Table-записи с теми же id
  await prisma.table.createMany({
    data: tableDefs.map((t) => ({
      id: t.id,
      hallId: hall.id,
      label: t.label,
      shape: t.shape,
      minGuests: t.minGuests,
      maxGuests: t.maxGuests,
      positionX: t.x,
      positionY: t.y,
      width: t.w,
      height: t.h,
      rotation: 0,
      comment: t.comment,
    })),
  });

  // Супер-администратор
  await prisma.superAdmin.upsert({
    where: { email: 'superadmin@nakryto.ru' },
    update: {},
    create: {
      email: 'superadmin@nakryto.ru',
      passwordHash: await bcrypt.hash('superadmin123', 12),
    },
  });

  console.log('✅ Сид завершён!');
  console.log('📧 Логин: admin@demo.ru');
  console.log('🔑 Пароль: admin123456');
  console.log(`🌐 Страница брони: /book/demo-restaurant`);
  console.log('🛡️  Супер-админ: superadmin@nakryto.ru / superadmin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
