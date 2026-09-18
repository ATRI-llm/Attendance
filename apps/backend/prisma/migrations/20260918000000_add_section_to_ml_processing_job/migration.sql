-- Add section information to ML processing jobs.
ALTER TABLE "MlProcessingJob"
ADD COLUMN "sectionId" TEXT;

-- Add classifier training job type.
ALTER TYPE "MlJobType"
ADD VALUE IF NOT EXISTS 'TRAIN_CLASSIFIER';