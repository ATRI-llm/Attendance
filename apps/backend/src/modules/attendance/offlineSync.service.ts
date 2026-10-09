import prisma from "../../database/prisma";
import {
  saveBuffer,
  generateStorageFilename,
  getPublicUrl,
} from "../../common/utils/storage";

/*
 * ------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------
 */

export interface OfflineSyncPayload {
  /*
   * These IDs may exist in older clients.
   *
   * IMPORTANT:
   * The mobile/local session ID is NOT the PostgreSQL
   * AttendanceSession ID.
   *
   * The server creates/resolves the PostgreSQL session
   * using sectionId + date.
   */
  sessionId?: string;
  attendanceSessionId?: string;

  sectionId?: string;
  date?: string;

  deviceId?: string;
  backboneVersion?: string;
  classifierVersion?: string;

  latitude?: number;
  longitude?: number;

  images?: Array<{
    filename?: string;
    base64: string;
  }>;

  records?: Array<{
    studentId: string;

    status: string;

    confidence?: number;

    cropImage?: string;
    cropImageBase64?: string;
    imageBase64?: string;

    /*
     * Mobile stores the 512-D face embedding locally and
     * sends it during Sync.
     */
    embeddingVector?: number[];

    /*
     * Original capture timestamp from the mobile device.
     */
    capturedAt?: string;

    /*
     * Teacher may have manually corrected the prediction
     * during the review step.
     */
    isManualOverride?: boolean;
  }>;
}

/*
 * ------------------------------------------------------------
 * BASE64 IMAGE STORAGE
 * ------------------------------------------------------------
 *
 * Compatibility wrapper.
 *
 * The file is stored in shared local storage under:
 *
 *   storage/uploads/...
 *
 * No cloud storage code is used here.
 *
 * The function name is preserved so existing callers do not
 * break.
 * ------------------------------------------------------------
 */

export const saveBase64File = async (
  base64: string,
  folder: string,
  filename: string
): Promise<string> => {
  if (!base64) {
    throw new Error("Base64 image data is required");
  }

  if (!folder) {
    throw new Error("Storage folder is required");
  }

  /*
   * Remove a data URI prefix if one exists.
   *
   * Example:
   *
   * data:image/jpeg;base64,/9j/4AAQ...
   *
   * becomes:
   *
   * /9j/4AAQ...
   */
  const stripped = base64.replace(
    /^data:image\/[\w.+-]+;base64,/,
    ""
  );

  const buffer = Buffer.from(stripped, "base64");

  if (!buffer.length) {
    throw new Error("Decoded image is empty");
  }

  /*
   * Never trust the filename supplied by the device.
   * Generate a safe unique filename instead.
   */
  const safeFilename = generateStorageFilename(
    filename || "image.jpg"
  );

  const storageKey =
    `uploads/${folder}/${safeFilename}`;

  await saveBuffer(storageKey, buffer);

  return getPublicUrl(storageKey);
};

/*
 * ------------------------------------------------------------
 * OFFLINE SYNC SERVICE
 * ------------------------------------------------------------
 */

export const offlineSyncService = async (
  userId: string,
  payload: OfflineSyncPayload
) => {
  /*
   * ----------------------------------------------------------
   * VALIDATE SECTION
   * ----------------------------------------------------------
   *
   * Offline attendance is created locally on the teacher's
   * device.
   *
   * Therefore:
   *
   *   local SQLite session ID
   *          !=
   *   PostgreSQL AttendanceSession.id
   *
   * The real PostgreSQL session is created here, when the
   * teacher synchronizes the reviewed attendance.
   * ----------------------------------------------------------
   */

  if (!payload.sectionId) {
    throw new Error("Section ID is required");
  }

  /*
   * The mobile attendance date is expected to be:
   *
   *   YYYY-MM-DD
   */
  if (
    !payload.date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)
  ) {
    throw new Error(
      "Attendance date must be in YYYY-MM-DD format"
    );
  }

  /*
   * ----------------------------------------------------------
   * VERIFY TEACHER SECTION ACCESS
   * ----------------------------------------------------------
   */

  const teacherSection =
    await prisma.teacherSection.findFirst({
      where: {
        teacher: {
          userId,
        },
        sectionId: payload.sectionId,
      },
    });

  if (!teacherSection) {
    throw new Error(
      "Section not assigned to this teacher"
    );
  }

  /*
   * ----------------------------------------------------------
   * RESOLVE ATTENDANCE DATE
   * ----------------------------------------------------------
   *
   * Store the attendance session at the beginning of the
   * requested attendance day.
   *
   * The lookup uses a full-day range so the server can still
   * find sessions if another workflow stored a non-midnight
   * timestamp.
   * ----------------------------------------------------------
   */

  const dayStart =
    new Date(
      `${payload.date}T00:00:00.000Z`
    );

  const dayEnd =
    new Date(
      dayStart.getTime() +
      24 * 60 * 60 * 1000
    );

  /*
   * ----------------------------------------------------------
   * FIND EXISTING SERVER SESSION
   * ----------------------------------------------------------
   *
   * IMPORTANT:
   *
   * Do NOT use payload.sessionId or
   * payload.attendanceSessionId here.
   *
   * Those may refer to the mobile/local session.
   *
   * The PostgreSQL session is identified by:
   *
   *   section + attendance date
   * ----------------------------------------------------------
   */
  const existingAttendanceSession =
    await prisma.attendanceSession.findFirst({
      where: {
        sectionId: payload.sectionId,
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  /*
   * Do not mix the old server-side ML attendance
   * workflow with the mobile offline workflow.
   */
  if (
    existingAttendanceSession &&
    !existingAttendanceSession.isOfflineSync
  ) {
    throw new Error(
      "Attendance has already been started for this section today"
    );
  }

  /*
   * The database has @@unique([sectionId, date]).
   *
   * Use upsert so two retry/concurrent sync requests cannot
   * both create a new AttendanceSession.
   */
  const attendanceSession =
    await prisma.attendanceSession.upsert({
      where: {
        sectionId_date: {
          sectionId: payload.sectionId,
          date: dayStart,
        },
      },

      update: {
        teacherUserId: userId,
        status: "PROCESSED",
        isOfflineSync: true,
        deviceId: (payload as any).deviceId,
        backboneVersion: (payload as any).backboneVersion,
        classifierVersion: (payload as any).classifierVersion,
      },

      create: {
        sectionId: payload.sectionId,
        teacherUserId: userId,
        date: dayStart,
        status: "PROCESSED",
        isOfflineSync: true,
        deviceId: (payload as any).deviceId,
        backboneVersion: (payload as any).backboneVersion,
        classifierVersion: (payload as any).classifierVersion,
      },
    });

  /*
   * ----------------------------------------------------------
   * PROTECT AGAINST THE OLD ONLINE WORKFLOW
   * ----------------------------------------------------------
   *
   * The upsert above already resolved the server session.
   * Do not convert a legacy/server ML session into an
   * offline mobile session.
   */

  if (!attendanceSession.isOfflineSync) {
    throw new Error(
      "Attendance has already been started for this section today"
    );
  }

  /*
 * ----------------------------------------------------------
 * VALIDATE ALL ATTENDANCE RECORDS BEFORE WRITING
 * ----------------------------------------------------------
 *
 * Do this before saving images or attendance records.
 * Otherwise a later invalid record could cause the sync
 * to fail after earlier records have already been persisted.
 * ----------------------------------------------------------
 */

  if (payload.records && payload.records.length > 0) {
    for (const record of payload.records) {
      const student = await prisma.student.findFirst({
        where: {
          id: record.studentId,
          sectionId: attendanceSession.sectionId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        throw new Error(
          `Attendance record contains an unresolved student ID: ${record.studentId}. ` +
          "Please review and assign the face to a student before syncing."
        );
      }
    }
  }

  /*
   * ----------------------------------------------------------
   * PROCESS OFFLINE IMAGES
   * ----------------------------------------------------------
   */

  const uploadedImages: string[] = [];

  if (
    payload.images &&
    payload.images.length > 0
  ) {
    for (const image of payload.images) {
      if (!image.base64) {
        continue;
      }

      const imageUrl =
        await saveBase64File(
          image.base64,

          `attendance/${attendanceSession.id}/offline`,

          image.filename ||
          "offline-image.jpg"
        );

      uploadedImages.push(imageUrl);
    }
  }

  /*
   * ----------------------------------------------------------
   * PROCESS ATTENDANCE RECORDS
   * ----------------------------------------------------------
   */

  const processedRecords = [];

  if (
    payload.records &&
    payload.records.length > 0
  ) {
    for (const record of payload.records) {
      /*
 * ------------------------------------------------------
 * VERIFY STUDENT
 * ------------------------------------------------------
 *
 * Only students belonging to this section can be
 * written into this attendance session.
 *
 * Every record must already be resolved to a valid
 * student before it can be synchronized.
 * ------------------------------------------------------
 */

      const student =
        await prisma.student.findFirst({
          where: {
            id: record.studentId,

            sectionId:
              attendanceSession.sectionId,
          },
        });
      
      if (!student) {
        throw new Error(
          `Attendance record contains an unresolved student ID: ${record.studentId}. ` +
          "Please review and assign the face to a student before syncing."
        );
      }

      /*
       * ------------------------------------------------------
       * OPTIONAL FACE CROP
       * ------------------------------------------------------
       */

      const cropBase64 =
        record.cropImageBase64 ||
        record.cropImage ||
        record.imageBase64;

      let cropImageUrl:
        | string
        | undefined;

      if (cropBase64) {
        cropImageUrl =
          await saveBase64File(
            cropBase64,

            `attendance/${attendanceSession.id}/crops`,

            `${record.studentId}.jpg`
          );
      }

      /*
       * ------------------------------------------------------
       * CAPTURE TIMESTAMP
       * ------------------------------------------------------
       *
       * Use the mobile capture time when valid.
       *
       * If it is missing or invalid, Prisma will use the
       * default markedAt timestamp.
       */

      let markedAt:
        | Date
        | undefined;

      if (record.capturedAt) {
        const parsedDate =
          new Date(record.capturedAt);

        if (
          !Number.isNaN(
            parsedDate.getTime()
          )
        ) {
          markedAt = parsedDate;
        }
      }

      /*
       * ------------------------------------------------------
       * FIND EXISTING RECORD
       * ------------------------------------------------------
       *
       * Offline sync can be retried.
       *
       * Therefore, do not create duplicate attendance
       * records for the same student/session.
       * ------------------------------------------------------
       */

      const existingRecord =
        await prisma.attendanceRecord.findFirst({
          where: {
            attendanceSessionId:
              attendanceSession.id,

            studentId:
              record.studentId,
          },
        });

      let attendanceRecord;

      /*
       * ------------------------------------------------------
       * COMMON RECORD DATA
       * ------------------------------------------------------
       */

      const recordData = {
        status:
          record.status as any,

        ...(record.confidence !==
          undefined
          ? {
            confidenceScore:
              record.confidence,
          }
          : {}),

        ...(cropImageUrl
          ? {
            cropImageUrl,
          }
          : {}),

        ...(record.embeddingVector
          ? {
            embeddingVector:
              record.embeddingVector,
          }
          : {}),

        ...(record.isManualOverride !==
          undefined
          ? {
            isManualOverride:
              record.isManualOverride,
          }
          : {}),

        ...(markedAt
          ? {
            markedAt,
          }
          : {}),

        /*
         * Keep the model versions that actually produced
         * this attendance result.
         */
        ...(payload.backboneVersion
          ? {
            backboneVersion:
              payload.backboneVersion,
          }
          : {}),

        ...(payload.classifierVersion
          ? {
            classifierVersion:
              payload.classifierVersion,
          }
          : {}),
      };

      /*
       * ------------------------------------------------------
       * UPDATE EXISTING RECORD
       * ------------------------------------------------------
       */

      if (existingRecord) {
        attendanceRecord =
          await prisma.attendanceRecord.update({
            where: {
              id:
                existingRecord.id,
            },

            data: recordData,
          });
      } else {
        /*
         * ----------------------------------------------------
         * CREATE NEW RECORD
         * ----------------------------------------------------
         */

        attendanceRecord =
          await prisma.attendanceRecord.create({
            data: {
              attendanceSessionId:
                attendanceSession.id,

              studentId:
                record.studentId,

              ...recordData,
            },
          });
      }

      processedRecords.push(
        attendanceRecord
      );
    }
  }

  /*
   * ----------------------------------------------------------
   * FINALIZE SERVER-SIDE SYNC STATE
   * ----------------------------------------------------------
   *
   * The mobile device has already completed inference and
   * teacher review.
   *
   * Therefore the synced server session is PROCESSED.
   *
   * Do not use COMPLETED because that value does not exist
   * in the AttendanceSessionStatus enum.
   * ----------------------------------------------------------
   */

  await prisma.attendanceSession.update({
    where: {
      id:
        attendanceSession.id,
    },

    data: {
      status: "PROCESSED",

      isOfflineSync: true,

      deviceId:
        payload.deviceId,

      backboneVersion:
        payload.backboneVersion,

      classifierVersion:
        payload.classifierVersion,
    },
  });

  /*
   * ----------------------------------------------------------
   * RESPONSE
   * ----------------------------------------------------------
   *
   * The mobile sync manager currently reads:
   *
   *   response.data.data.sessionId
   *
   * Therefore sessionId MUST be returned.
   *
   * attendanceSessionId is retained for compatibility with
   * older callers.
   * ----------------------------------------------------------
   */

  return {
    success: true,

    /*
     * PostgreSQL AttendanceSession ID.
     */
    sessionId:
      attendanceSession.id,

    /*
     * Backward-compatible field.
     */
    attendanceSessionId:
      attendanceSession.id,

    uploadedImages,

    processedRecords:
      processedRecords.length,

    records:
      processedRecords,
  };
};