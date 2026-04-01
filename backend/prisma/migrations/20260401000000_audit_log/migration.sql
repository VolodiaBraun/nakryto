CREATE TABLE "audit_logs" (
    "id"           TEXT NOT NULL,
    "action"       TEXT NOT NULL,
    "actorType"    TEXT NOT NULL,
    "actorId"      TEXT,
    "actorEmail"   TEXT,
    "restaurantId" TEXT,
    "entityId"     TEXT,
    "status"       TEXT NOT NULL,
    "errorMessage" TEXT,
    "meta"         JSONB,
    "ip"           TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);
CREATE INDEX "audit_logs_restaurantId_idx" ON "audit_logs"("restaurantId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_status_idx" ON "audit_logs"("status");
