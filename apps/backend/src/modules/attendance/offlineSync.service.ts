import prisma from "../../database/prisma";
import { saveLocalBuffer } from "../../common/utils/localStorage";

// ─────────────────────────────────────────────────────────────────
// offlineSyncService
// Receives an offline attendance batch from the teacher mobile app.
//
// Flow:
//  1. Validate teacher & section
//  2. Create AttendanceSession (marked as offline sync)
//  3. For each record:
//     a. Create AttendanceRecord
//     b. If crop image is present: save locally in crop_attendance folder,
//        create AttendanceCropImage (crop + 512-dim embedding)
//  4. Mark session as PROCESSED (no ML queue needed — already done on device)
// ─────────────────────────────────────────────────────────────────
export interface OfflineSyncRecord {
  studentId: string;
  rollNumber: number;
  status: "PRESENT" | "ABSENT" | "MANUAL";
  confidence: number;
  cropImageBase64?: string;        // face crop from group photo (base64)
  embeddingVector?: number[];       // 512-dim MobileFaceNet embedding (for retraining)
  capturedAt: string;              // ISO timestamp
}

export interface OfflineSyncPayload {
  sectionId: string;
  date: string;                     // ISO date string "YYYY-MM-DD"
  deviceId: string;
  backboneVersion: string;          // e.g. "MobileFaceNet-v1"
  classifierVersion: string;        // e.g. "nn-classifier-v2"
  records: OfflineSyncRecord[];
}

export const offlineSyncService = async (
  userId: string,
  payload: OfflineSyncPayload
) => {
  // 1. Validate teacher & section assignment
  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: { userId },
      sectionId: payload.sectionId,
    },
    include: {
      section: {
        include: {
          standard: {
            include: {
              school: true,
            },
          },
        },
      },
    },
  });

  if (!teacherSection) {
    throw new Error("Section not assigned to this teacher");
  }

  const school = teacherSection.section.standard.school;
  const standard = teacherSection.section.standard;
  const section = teacherSection.section;
  const sanitizedSectionName = section.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dateFolder = payload.date;

  // 2. Upsert AttendanceSession (offline sync)
  // This merges all offline syncs for the same day into a single backend session
  const session = await prisma.attendanceSession.upsert({
    where: {
      sectionId_date: {
        sectionId: payload.sectionId,
        date: new Date(payload.date),
      }
    },
    update: {
      deviceId: payload.deviceId,
      backboneVersion: payload.backboneVersion,
      classifierVersion: payload.classifierVersion,
    },
    create: {
      sectionId: payload.sectionId,
      teacherUserId: userId,
      date: new Date(payload.date),
      status: "PROCESSED",           // Already processed on device — skip ML queue
      isOfflineSync: true,
      deviceId: payload.deviceId,
      backboneVersion: payload.backboneVersion,
      classifierVersion: payload.classifierVersion,
    },
  });

  let cropCount = 0;

  // 3. Process each attendance record
  for (const rec of payload.records) {
    const isUnknown = rec.studentId?.startsWith("UNKNOWN_");
    let targetStudentId = isUnknown ? undefined : (rec.studentId || undefined);

    // 3a. Remove existing record for this student in this session (if any) to prevent duplicates
    if (targetStudentId) {
      const studentExists = await prisma.student.findUnique({
        where: { id: targetStudentId },
      });
      if (!studentExists) {
        console.warn(`[offlineSync] Student ${targetStudentId} no longer exists. Marking as UNKNOWN.`);
        targetStudentId = undefined;
      } else {
        await prisma.attendanceRecord.deleteMany({
          where: {
            attendanceSessionId: session.id,
            studentId: targetStudentId,
          }
        });
      }
    }

    // 3b. Create the attendance record
    const attendanceRecord = await prisma.attendanceRecord.create({
      data: {
        attendanceSessionId: session.id,
        studentId: targetStudentId,
        status: rec.status,
        confidenceScore: rec.confidence,
        markedAt: new Date(rec.capturedAt),
        backboneVersion: payload.backboneVersion,
        classifierVersion: payload.classifierVersion,
      },
    });

    // 3b. If there's a crop image + embedding, store as training data
    if (rec.cropImageBase64 && rec.embeddingVector) {
      try {
        const stripped = rec.cropImageBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(stripped, "base64");

        const cropSubdir = targetStudentId ? targetStudentId : "unknown";
        const relativeDir = `schools/${school.id}/class_${standard.value}/section_${sanitizedSectionName}/crop_attendance/${cropSubdir}/${dateFolder}`;
        const fname = `session-${session.id}-roll-${rec.rollNumber}.jpg`;

        const cropUrl = await saveLocalBuffer(buffer, relativeDir, fname);

        // Also update the AttendanceRecord with the crop URL + embedding
        await prisma.attendanceRecord.update({
          where: { id: attendanceRecord.id },
          data: {
            cropImageUrl: cropUrl,
            embeddingVector: rec.embeddingVector, // 512-dim — stored for retraining
          },
        });

        // Create AttendanceCropImage entry (the retraining dataset table)
        await prisma.attendanceCropImage.create({
          data: {
            attendanceSessionId: session.id,
            studentId: targetStudentId,
            imageUrl: cropUrl,
            embeddingVector: rec.embeddingVector, // 512-dim MobileFaceNet vector
            backboneVersion: payload.backboneVersion,
            isVerified: rec.status === "PRESENT", // confirmed present = verified label
            capturedAt: new Date(rec.capturedAt),
          },
        });

        cropCount++;
      } catch (err: any) {
        // Non-fatal — attendance record already saved, just skip crop
        console.error(
          `Failed to save crop for roll ${rec.rollNumber}:`,
          err.message
        );
      }
    }
  }

  const stats = {
    sessionId: session.id,
    totalRecords: payload.records.length,
    present: payload.records.filter((r) => r.status === "PRESENT").length,
    absent: payload.records.filter((r) => r.status === "ABSENT").length,
    manual: payload.records.filter((r) => r.status === "MANUAL").length,
    cropsStored: cropCount,
  };

  console.log(`Offline sync complete:`, stats);
  return stats;
};

