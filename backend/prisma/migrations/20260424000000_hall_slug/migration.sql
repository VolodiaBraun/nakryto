-- AlterTable
ALTER TABLE "halls" ADD COLUMN "slug" TEXT;
ALTER TABLE "halls" ADD COLUMN "oldSlugs" TEXT[] NOT NULL DEFAULT '{}';

-- CreateIndex (partial: allows multiple NULL slugs since NULL != NULL in PostgreSQL)
CREATE UNIQUE INDEX "halls_restaurantId_slug_key" ON "halls"("restaurantId", "slug");
