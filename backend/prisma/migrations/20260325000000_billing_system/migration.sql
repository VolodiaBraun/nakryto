-- BalanceTransactionType enum
CREATE TYPE "BalanceTransactionType" AS ENUM ('TOPUP', 'PLAN_PAYMENT', 'ADJUSTMENT', 'REFUND');

-- BillingType enum
CREATE TYPE "BillingType" AS ENUM ('CARD', 'LEGAL_ENTITY');

-- User: balance, billingType
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "billingType" "BillingType" NOT NULL DEFAULT 'CARD';

-- Restaurant: planExpiresAt
ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "planExpiresAt" TIMESTAMP(3);

-- PaymentCard table
CREATE TABLE IF NOT EXISTS "payment_cards" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "last4"       TEXT NOT NULL,
  "brand"       TEXT NOT NULL,
  "expiryMonth" INTEGER NOT NULL,
  "expiryYear"  INTEGER NOT NULL,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_cards_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_cards"
  ADD CONSTRAINT "payment_cards_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BalanceTransaction table
CREATE TABLE IF NOT EXISTS "balance_transactions" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "type"        "BalanceTransactionType" NOT NULL,
  "amount"      DECIMAL(10,2) NOT NULL,
  "description" TEXT NOT NULL,
  "meta"        JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balance_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "balance_transactions_userId_createdAt_idx"
  ON "balance_transactions"("userId", "createdAt");

ALTER TABLE "balance_transactions"
  ADD CONSTRAINT "balance_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
