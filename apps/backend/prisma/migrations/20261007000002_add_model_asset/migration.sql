CREATE TABLE "ModelAsset" (
    "id" TEXT NOT NULL,
    "backboneVersion" TEXT NOT NULL,
    "classifierVersion" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "backboneUrl" TEXT NOT NULL,
    "classifierUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelAsset_sectionId_idx"
ON "ModelAsset"("sectionId");

CREATE INDEX "ModelAsset_sectionId_isActive_idx"
ON "ModelAsset"("sectionId", "isActive");

ALTER TABLE "ModelAsset"
ADD CONSTRAINT "ModelAsset_sectionId_fkey"
FOREIGN KEY ("sectionId")
REFERENCES "Section"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;