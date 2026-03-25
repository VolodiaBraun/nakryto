# Накрыто — Правила разработки, тестирования и деплоя

## Окружения

| Окружение | URL | Ветка | База данных |
|-----------|-----|-------|-------------|
| Production | https://nakryto.ru | `main` | `nakryto_db` |
| Staging | https://staging.nakryto.ru | `develop` | `nakryto_staging` |
| Local | http://localhost:3000 | любая | локальная |

---

## Ветки

```
main          — продакшн (защищённая ветка, прямые пуши ЗАПРЕЩЕНЫ)
develop       — тестовая среда (staging.nakryto.ru)
feature/*     — новые функции (создавать от develop)
fix/*         — баг-фиксы (создавать от develop или main для hotfix)
```

### Жизненный цикл изменения

```
1. Создаёшь ветку от develop:
   git checkout develop && git pull
   git checkout -b feature/my-feature

2. Разрабатываешь, коммитишь

3. Пушишь в feature ветку:
   git push origin feature/my-feature

4. Создаёшь Pull Request: feature/* → develop
   → После merge CI автоматически деплоит на staging.nakryto.ru

5. Тестируешь на staging

6. Создаёшь Pull Request: develop → main
   → После merge CI автоматически деплоит на nakryto.ru
```

---

## Автоматический деплой (GitHub Actions)

**Триггеры:**
- Push в `develop` → деплой на **staging.nakryto.ru**
- Push в `main` → деплой на **nakryto.ru**
- Ручной запуск: GitHub → Actions → Deploy → Run workflow

**Что делает pipeline:**
1. Собирает backend TypeScript (`pnpm exec prisma generate && pnpm build`)
2. Rsync `dist/` на сервер в `/opt/nakryto/{env}/backend/dist/`
3. Rsync `prisma/migrations/` и `prisma/schema.prisma` на сервер
4. `docker cp prisma/ → контейнер`, затем `prisma migrate deploy` + `prisma generate`
5. `docker restart nakryto_{env}_backend`
6. Собирает frontend Next.js с нужным `NEXT_PUBLIC_API_URL`
7. Rsync `.next/` и `public/` на сервер
8. `docker restart nakryto_{env}_frontend`

**Время деплоя:** ~3-5 минут

---

## Настройка GitHub Secrets (разовая)

Добавить в GitHub → Settings → Secrets → Actions:

| Secret | Значение |
|--------|----------|
| `PROD_SSH_KEY` | Приватный ключ из `deploy/github_actions_deploy_key.pem` |
| `PROD_SSH_HOST` | `176.124.218.119` |
| `PROD_SSH_USER` | `root` |

---

## Структура сервера

```
/opt/nakryto/
├── prod/
│   ├── backend/
│   │   ├── dist/          ← смонтирован в контейнер nakryto_backend
│   │   ├── prisma/        ← schema.prisma + migrations/ (для migrate deploy)
│   │   ├── .env           ← переменные окружения продакшна
│   │   └── node_modules/
│   │       └── nodemailer/ ← смонтирован в контейнер
│   └── frontend/
│       ├── .next/         ← смонтирован в контейнер nakryto_frontend
│       └── public/
└── staging/
    ├── backend/
    │   ├── dist/          ← смонтирован в nakryto_staging_backend
    │   ├── prisma/        ← schema.prisma + migrations/
    │   ├── .env           ← переменные окружения staging (другая БД)
    │   └── node_modules/
    │       └── nodemailer/
    └── frontend/
        ├── .next/         ← смонтирован в nakryto_staging_frontend
        └── public/
```

**Docker контейнеры:**

| Контейнер | Порт | Окружение |
|-----------|------|-----------|
| `nakryto_backend` | 3001 | prod |
| `nakryto_frontend` | 3000 | prod |
| `nakryto_staging_backend` | 3011 | staging |
| `nakryto_staging_frontend` | 3010 | staging |
| `nakryto_postgres` | 5432 | общий |
| `nakryto_redis` | 6379 | общий |

---

## Локальная разработка

```bash
# Первый запуск
export PATH="$PATH:/c/Users/brown/AppData/Roaming/npm"
docker compose up -d postgres redis

# Backend
cd backend
pnpm install
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm start:dev           # http://localhost:3001

# Frontend (в другом терминале)
cd frontend
pnpm install
pnpm dev                 # http://localhost:3000
```

**Переменные:** backend использует `backend/.env`, frontend — `frontend/.env.local`

---

## Миграции базы данных

```bash
# Создать новую миграцию (локально, backend остановить!)
cd backend
pnpm exec prisma migrate dev --name название_миграции

# CI/CD автоматически делает migrate deploy + prisma generate при каждом деплое
# Если нужно применить вручную на сервере:
docker exec nakryto_backend npx prisma migrate deploy
docker exec nakryto_backend npx prisma generate
docker restart nakryto_backend
```

**⚠️ Важно:** При добавлении новых полей в Prisma schema:
1. Создать SQL миграцию в `backend/prisma/migrations/` (или `prisma migrate dev --name ...`)
2. Сделать `prisma generate` локально
3. Закоммитить оба файла (`schema.prisma` + новая папка миграции)
4. CI/CD автоматически применит на staging/prod при пуше

---

## Коммиты

```
feat: описание новой фичи
fix: описание баг-фикса
refactor: рефакторинг без изменения логики
chore: изменения конфигурации, зависимостей
docs: изменения документации
```

---

## Что НЕЛЬЗЯ делать

- ❌ Пушить напрямую в `main` (только через PR из `develop`)
- ❌ Мержить в `main` непроверенный код (сначала тест на staging)
- ❌ Хранить секреты (пароли, ключи) в коде или коммитах
- ❌ Деплоить бэкенд через `docker build` на сервере (заблокирован binaries.prisma.sh)
- ❌ Делать `git pull` на сервере (GitHub HTTPS заблокирован)

---

## Экстренный hotfix продакшна

```bash
# 1. Создать ветку от main
git checkout main && git pull
git checkout -b fix/critical-bug

# 2. Исправить, закоммитить

# 3. PR прямо в main (минуя develop)
git push origin fix/critical-bug
# → GitHub: создать PR fix/critical-bug → main

# 4. После merge в main → автодеплой на прод
# 5. Затем смержить main обратно в develop:
git checkout develop && git merge main && git push
```

---

## Ручной деплой (если CI/CD недоступен)

```bash
# Backend
cd backend
rm -f tsconfig.build.tsbuildinfo
pnpm build
python deploy/deploy_backend_dist.py   # или вручную через paramiko

# Frontend (prod)
cd frontend
NEXT_PUBLIC_API_URL=https://api.nakryto.ru pnpm build
python deploy/deploy_frontend.py

# Frontend (staging)
cd frontend
NEXT_PUBLIC_API_URL=https://staging.nakryto.ru pnpm build
# Затем залить .next/ и public/ в /opt/nakryto/staging/frontend/
# docker restart nakryto_staging_frontend
```

---

## Доступы продакшн

| Ресурс | Адрес / Логин |
|--------|---------------|
| Сервер SSH | `176.124.218.119` root (через paramiko) |
| Прод dashboard | https://nakryto.ru/dashboard — admin@demo.ru / admin123456 |
| Superadmin | https://nakryto.ru/superadmin — superadmin@nakryto.ru / superadmin123 |
| Staging dashboard | https://staging.nakryto.ru/dashboard — admin@demo.ru / admin123456 |
| Staging superadmin | https://staging.nakryto.ru/superadmin — superadmin@nakryto.ru / superadmin123 |
| GitHub | https://github.com/VolodiaBraun/nakryto |

---

## Контакты поддержки

Email: info@nakryto.ru
