-- Generated with Prisma 5.22 as the schema diff from c2fa13e^ to c2fa13e.
-- All additions are nullable or apply only to the new evidence table, so
-- existing Message and conversation data is preserved.

-- CreateEnum
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppDeliveryMode" AS ENUM ('LIVE', 'DRY_RUN', 'OFFLINE_SIMULATION');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deliveryMode" "WhatsAppDeliveryMode",
ADD COLUMN     "deliveryStatus" "WhatsAppDeliveryStatus",
ADD COLUMN     "deliveryStatusAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WhatsAppDeliveryEvent" (
    "id" TEXT NOT NULL,
    "eventFingerprint" VARCHAR(64) NOT NULL,
    "providerMessageId" VARCHAR(100) NOT NULL,
    "messageId" TEXT,
    "status" VARCHAR(50) NOT NULL,
    "recognized" BOOLEAN NOT NULL,
    "aggregateApplied" BOOLEAN NOT NULL DEFAULT false,
    "providerTimestamp" TIMESTAMP(3),
    "recipientId" VARCHAR(50),
    "failure" JSONB,
    "conversation" JSONB,
    "pricing" JSONB,
    "rawEvent" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppDeliveryEvent_eventFingerprint_key" ON "WhatsAppDeliveryEvent"("eventFingerprint");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryEvent_providerMessageId_idx" ON "WhatsAppDeliveryEvent"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryEvent_messageId_receivedAt_idx" ON "WhatsAppDeliveryEvent"("messageId", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryEvent_status_receivedAt_idx" ON "WhatsAppDeliveryEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppDeliveryEvent_receivedAt_idx" ON "WhatsAppDeliveryEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "WhatsAppDeliveryEvent" ADD CONSTRAINT "WhatsAppDeliveryEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
