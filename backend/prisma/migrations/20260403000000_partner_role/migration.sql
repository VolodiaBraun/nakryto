-- Migration: partner_role
-- Adds UserType enum and makes restaurantId optional on users (for partners)

-- 1. Create UserType enum
CREATE TYPE "UserType" AS ENUM ('RESTAURANT_OWNER', 'PARTNER');

-- 2. Drop existing FK constraint (CASCADE → SET NULL)
ALTER TABLE "users" DROP CONSTRAINT "users_restaurantId_fkey";

-- 3. Make restaurantId nullable
ALTER TABLE "users" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- 4. Add FK back with SET NULL on delete
ALTER TABLE "users" ADD CONSTRAINT "users_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Add userType column
ALTER TABLE "users" ADD COLUMN "userType" "UserType" NOT NULL DEFAULT 'RESTAURANT_OWNER';
