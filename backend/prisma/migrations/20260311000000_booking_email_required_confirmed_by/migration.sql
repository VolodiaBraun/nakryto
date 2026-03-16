-- Делаем guestEmail обязательным (заполняем NULL значения перед NOT NULL)
UPDATE "bookings" SET "guestEmail" = '' WHERE "guestEmail" IS NULL;
ALTER TABLE "bookings" ALTER COLUMN "guestEmail" SET NOT NULL;

-- Добавляем поля для отслеживания кто подтвердил бронь
ALTER TABLE "bookings" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "bookings" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- FK на пользователя
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
