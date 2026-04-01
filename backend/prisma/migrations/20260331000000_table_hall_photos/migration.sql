-- AlterTable: add photos array to tables
ALTER TABLE "tables" ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable: add photos array to halls
ALTER TABLE "halls" ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
