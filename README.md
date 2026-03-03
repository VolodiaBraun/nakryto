# Накрыто или Столик — SaaS для бронирования столов

## Быстрый старт

### 1. Запустить инфраструктуру (Postgres + Redis)

```bash
# Запустить Docker Desktop, затем:
docker compose up -d
```

pgAdmin доступен на http://localhost:5050 (admin@nakryto.ru / admin)

### 2. Backend

```bash
cd backend

# Скопировать .env (если ещё не сделано)
cp .env.example .env

# Установить зависимости
pnpm install

# Создать таблицы в БД
pnpm db:migrate

# Заполнить тестовыми данными
pnpm db:seed

# Запустить в режиме разработки
pnpm start:dev
```

API: http://localhost:3001
Swagger: http://localhost:3001/api/docs

### 3. Frontend (следующий спринт)

```bash
cd frontend
pnpm install
pnpm dev
```

---

## Архитектура

```
.
├── backend/                  # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma     # Схема БД
│   │   └── seed.ts           # Тестовые данные
│   └── src/
│       ├── auth/             # JWT auth (register, login, refresh)
│       ├── restaurants/      # Профиль, настройки, статистика, виджет
│       ├── halls/            # Залы + схемы (Konva.js JSON)
│       ├── tables/           # Столы (CRUD + bulk positions)
│       ├── bookings/         # Брони (CRUD, статусы, доступность)
│       ├── closed-periods/   # Закрытые периоды
│       ├── public-api/       # Публичное API для гостей
│       ├── notifications/    # Telegram, SMS, Email + cron
│       └── websocket/        # Socket.io (real-time статусы столов)
├── frontend/                 # Next.js (Спринт 2-5)
├── docker-compose.yml
└── .env.example
```

## Тестовые данные (после seed)

- **URL брони:** `/book/demo-restaurant`
- **Email:** admin@demo.ru
- **Пароль:** admin123456

## API Endpoints

### Публичные (для гостей)
| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/public/{slug}` | Профиль ресторана |
| GET | `/api/public/{slug}/halls` | Залы со схемами |
| GET | `/api/public/{slug}/availability?date=&guests=` | Свободные слоты |
| GET | `/api/public/{slug}/tables/status?date=&time=` | Статусы столов |
| POST | `/api/public/{slug}/bookings` | Создать бронь |
| GET | `/api/public/bookings/{token}` | Просмотр брони |
| DELETE | `/api/public/bookings/{token}` | Отмена брони |

### Приватные (для ЛК ресторана)
| Метод | URL | Описание |
|-------|-----|----------|
| GET/PUT | `/api/restaurant/profile` | Профиль |
| PUT | `/api/restaurant/settings` | Настройки |
| PUT | `/api/restaurant/working-hours` | Расписание |
| GET | `/api/restaurant/stats` | Статистика |
| GET/POST/PUT | `/api/restaurant/halls` | CRUD залов |
| PUT | `/api/restaurant/halls/{id}/floor-plan` | Сохранить схему зала |
| GET/POST/PUT | `/api/restaurant/tables` | CRUD столов |
| PUT | `/api/restaurant/tables/bulk-positions` | Массовое обновление позиций |
| GET/POST | `/api/restaurant/bookings` | Управление бронями |
| PUT | `/api/restaurant/bookings/{id}/status` | Изменить статус |
| GET/POST/DELETE | `/api/restaurant/closed-periods` | Закрытые периоды |
| GET/PUT | `/api/restaurant/widget-settings` | Настройки виджета |

## WebSocket

Подключение: `ws://localhost:3001/ws`

```js
socket.emit('join_room', { slug: 'demo-restaurant', date: '2025-03-15' });
socket.on('booking_created', ({ tableId, datetime }) => { /* обновить карту */ });
socket.on('table_locked', ({ tableId, expiresAt }) => { /* показать блокировку */ });
```
