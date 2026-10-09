-- Add offline attendance metadata to attendance sessions.
ALTER TABLE "AttendanceSession"
ADD COLUMN "isOfflineSync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "backboneVersion" TEXT,
ADD COLUMN "classifierVersion" TEXT;

-- Add on-device inference metadata to attendance records.
ALTER TABLE "AttendanceRecord"
ADD COLUMN "cropImageUrl" TEXT,
ADD COLUMN "embeddingVector" JSONB,
ADD COLUMN "backboneVersion" TEXT,
ADD COLUMN "classifierVersion" TEXT;