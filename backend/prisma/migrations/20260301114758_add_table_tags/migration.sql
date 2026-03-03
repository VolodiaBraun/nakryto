-- AlterTable
ALTER TABLE "tables" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
