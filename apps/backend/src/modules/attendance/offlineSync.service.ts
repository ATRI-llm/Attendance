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
  sessionId?: string;

  attendanceSessionId?: string;

  sectionId?: string;

  date?: string;

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
  }>;
}

/*
 * ------------------------------------------------------------
 * BASE64 IMAGE STORAGE
 * ------------------------------------------------------------
 *
 * Compatibility wrapper.
 *
 * The file is now stored in local shared storage.
 *
 * It now stores the file locally under:
 *
 *   storage/uploads/...
 *
 * No cloud storage code is used here.
 *
 * The function name is temporarily preserved so existing
 * callers do not break.
 * ------------------------------------------------------------
 */

export const saveBase64File = async (
  base64: string,
  folder: string,
  filename: string
): Promise<string> => {
  if (!base64) {
    throw new Error(
      "Base64 image data is required"
    );
  }

  if (!folder) {
    throw new Error(
      "Storage folder is required"
    );
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
  const stripped =
    base64.replace(
      /^data:image\/[\w.+-]+;base64,/,
      ""
    );

  const buffer =
    Buffer.from(
      stripped,
      "base64"
    );

  if (!buffer.length) {
    throw new Error(
      "Decoded image is empty"
    );
  }

  /*
   * Never trust the filename supplied by the device.
   * Generate a safe unique filename instead.
   */
  const safeFilename =
    generateStorageFilename(
      filename || "image.jpg"
    );

  const storageKey =
    `uploads/${folder}/${safeFilename}`;

  await saveBuffer(
    storageKey,
    buffer
  );

  return getPublicUrl(
    storageKey
  );
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
   * RESOLVE SESSION ID
   * ----------------------------------------------------------
   */

  const attendanceSessionId =
    payload.attendanceSessionId ||
    payload.sessionId;

  if (!attendanceSessionId) {
    throw new Error(
      "Attendance session ID is required"
    );
  }

  /*
   * ----------------------------------------------------------
   * FIND ATTENDANCE SESSION
   * ----------------------------------------------------------
   */

  const attendanceSession =
    await prisma.attendanceSession.findUnique({
      where: {
        id: attendanceSessionId,
      },

      include: {
        section: true,
      },
    });

  if (!attendanceSession) {
    throw new Error(
      "Attendance session not found"
    );
  }

  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: { userId },
      sectionId: attendanceSession.sectionId,
    },
  });

  if (!teacherSection) {
    throw new Error("Section not assigned to this teacher");
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
    for (
      const image of payload.images
    ) {
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

      uploadedImages.push(
        imageUrl
      );
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
    for (
      const record of payload.records
    ) {
      /*
       * Make sure the student actually belongs to
       * this attendance session's section.
       */
      const student =
        await prisma.student.findFirst({
          where: {
            id:
              record.studentId,

            sectionId:
              attendanceSession.sectionId,
          },
        });

      if (!student) {
        continue;
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
       * FIND EXISTING RECORD
       * ------------------------------------------------------
       *
       * Offline sync can be retried.
       *
       * Therefore, don't create a duplicate attendance
       * record when one already exists.
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

      if (existingRecord) {
        /*
         * Update existing record.
         */

        attendanceRecord =
          await prisma.attendanceRecord.update({
            where: {
              id:
                existingRecord.id,
            },

            data: {
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
                  cropImageUrl:
                    cropImageUrl,
                }
                : {}),
            },
          });
      } else {
        /*
         * Create new record.
         */

        attendanceRecord =
          await prisma.attendanceRecord.create({
            data: {
              attendanceSessionId:
                attendanceSession.id,

              studentId:
                record.studentId,

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
                  cropImageUrl:
                    cropImageUrl,
                }
                : {}),
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
   * IMPORTANT
   * ----------------------------------------------------------
   *
   * Do NOT force the attendance session status here.
   *
   * Your Prisma enum does not contain "COMPLETED".
   *
   * The existing attendance workflow is responsible for
   * deciding the appropriate session status.
   */

  await prisma.attendanceSession.update({
    where: { id: attendanceSession.id },
    data: {
      isOfflineSync: true,
      deviceId: (payload as any).deviceId,
      backboneVersion: (payload as any).backboneVersion,
      classifierVersion: (payload as any).classifierVersion,
    },
  });

  return {
    success: true,

    attendanceSessionId:
      attendanceSession.id,

    uploadedImages,

    processedRecords:
      processedRecords.length,

    records:
      processedRecords,
  };
};