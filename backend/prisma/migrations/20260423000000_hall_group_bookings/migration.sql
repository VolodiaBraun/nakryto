-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('STANDARD', 'HALL', 'GROUP');

-- AlterTable: make tableId nullable, add bookingType and groupId
ALTER TABLE "bookings" ALTER COLUMN "tableId" DROP NOT NULL;
ALTER TABLE "bookings" ADD COLUMN "bookingType" "BookingType" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "bookings" ADD COLUMN "groupId" TEXT;

-- AlterTable: add guestName and guestPhone to closed_periods
ALTER TABLE "closed_periods" ADD COLUMN "guestName" TEXT;
ALTER TABLE "closed_periods" ADD COLUMN "guestPhone" TEXT;
