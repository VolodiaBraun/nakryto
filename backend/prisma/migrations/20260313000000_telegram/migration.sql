-- AlterTable: add Telegram fields to restaurants
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "telegramBotToken" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "telegramBotActive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: make guestEmail optional, add telegramUserId to bookings
ALTER TABLE "bookings" ALTER COLUMN "guestEmail" DROP NOT NULL;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT;
