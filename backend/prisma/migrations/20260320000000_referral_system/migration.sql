-- CreateEnum: WithdrawalStatus
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- AlterTable: add referral fields to users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "referralCode" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "referralBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pendingReferralCode" TEXT,
  ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "referralDiscountUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customReferralConditions" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customCommissionRate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "customDiscountRate" DECIMAL(5,2);

-- AddForeignKey: users.referredByUserId -> users.id
ALTER TABLE "users"
  ADD CONSTRAINT "users_referredByUserId_fkey"
  FOREIGN KEY ("referredByUserId") REFERENCES "users"("id") ON DELETE SET NULL;

-- CreateTable: referral_transactions
CREATE TABLE IF NOT EXISTS "referral_transactions" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referralUserId" TEXT NOT NULL,
  "paymentAmount" DECIMAL(10,2) NOT NULL,
  "commissionRate" DECIMAL(5,2) NOT NULL,
  "commissionAmount" DECIMAL(10,2) NOT NULL,
  "planName" TEXT NOT NULL,
  "isFirstPayment" BOOLEAN NOT NULL DEFAULT false,
  "discountRate" DECIMAL(5,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_transactions_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "users"("id"),
  CONSTRAINT "referral_transactions_referralUserId_fkey"
    FOREIGN KEY ("referralUserId") REFERENCES "users"("id")
);

-- CreateTable: referral_withdrawals
CREATE TABLE IF NOT EXISTS "referral_withdrawals" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
  "paymentDetails" TEXT,
  "adminNote" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_withdrawals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_withdrawals_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
);
