-- Add offline meal metadata to meal sessions.
ALTER TABLE "MealSession"
ADD COLUMN "isOfflineSync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "detectorVersion" TEXT;