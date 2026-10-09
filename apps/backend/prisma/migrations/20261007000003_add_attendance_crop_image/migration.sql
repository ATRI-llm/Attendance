CREATE TABLE "AttendanceCropImage" (
    "id" TEXT NOT NULL,
    "attendanceSessionId" TEXT NOT NULL,
    "studentId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "embeddingVector" JSONB NOT NULL,
    "backboneVersion" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCropImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceCropImage_attendanceSessionId_idx"
ON "AttendanceCropImage"("attendanceSessionId");

CREATE INDEX "AttendanceCropImage_studentId_idx"
ON "AttendanceCropImage"("studentId");

ALTER TABLE "AttendanceCropImage"
ADD CONSTRAINT "AttendanceCropImage_attendanceSessionId_fkey"
FOREIGN KEY ("attendanceSessionId")
REFERENCES "AttendanceSession"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "AttendanceCropImage"
ADD CONSTRAINT "AttendanceCropImage_studentId_fkey"
FOREIGN KEY ("studentId")
REFERENCES "Student"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;