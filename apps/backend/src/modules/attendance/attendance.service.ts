import prisma from "../../database/prisma";
import { validateGeofence } from "../../common/utils/geofence";
import { mlQueue } from "../../queues/ml.queue";

import {
  saveMulterFile,
  generateStorageFilename,
  getPublicUrl,
} from "../../common/utils/storage";

export const createAttendanceService = async (
  userId: string,
  body: any,
  files: Express.Multer.File[]
) => {
  /*
   * ----------------------------------------------------------
   * VALIDATE TEACHER SECTION
   * ----------------------------------------------------------
   */

  const teacherSection =
    await prisma.teacherSection.findFirst({
      where: {
        teacher: {
          userId,
        },

        sectionId:
          body.sectionId,
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
    throw new Error(
      "Section not assigned"
    );
  }

  /*
   * ----------------------------------------------------------
   * VALIDATE FILES
   * ----------------------------------------------------------
   */

  if (!files || files.length === 0) {
    throw new Error(
      "At least one attendance image is required"
    );
  }

  /*
   * ----------------------------------------------------------
   * GEOFENCE
   * ----------------------------------------------------------
   */

  const school =
    teacherSection.section.standard.school;

  const geoResult =
    validateGeofence(
      Number(body.latitude),
      Number(body.longitude),
      school
    );

  await prisma.geofenceValidation.create({
    data: {
      teacherUserId:
        userId,

      validationType:
        "ATTENDANCE",

      latitude:
        Number(body.latitude),

      longitude:
        Number(body.longitude),

      distance:
        geoResult.distance,

      isWithinGeofence:
        geoResult.isInside,

      schoolId:
        school.id,
    },
  });

  if (!geoResult.isInside) {
    throw new Error(
      "Outside school premises"
    );
  }

  /*
   * ----------------------------------------------------------
   * CREATE ATTENDANCE SESSION
   * ----------------------------------------------------------
   */

  const attendanceSession =
    await prisma.attendanceSession.create({
      data: {
        sectionId:
          body.sectionId,

        teacherUserId:
          userId,

        date:
          new Date(),

        status:
          "PENDING",
      },
    });

  /*
   * ----------------------------------------------------------
   * SAVE ATTENDANCE IMAGES
   * ----------------------------------------------------------
   *
   * storage/
   *   uploads/
   *     attendance/
   *       <attendanceSessionId>/
   *         original/
   *           <file>.jpg
   */

  for (const file of files) {
    const filename =
      generateStorageFilename(
        file.originalname
      );

    const storageKey =
      `uploads/attendance/${attendanceSession.id}/original/${filename}`;

    await saveMulterFile(
      file,
      storageKey
    );

    /*
     * Keep imageUrl in DB for API compatibility.
     *
     * It is now a local backend URL.
     */

    const imageUrl =
      getPublicUrl(storageKey);

    await prisma.attendanceImage.create({
      data: {
        attendanceSessionId:
          attendanceSession.id,

        imageUrl,

        mimeType:
          file.mimetype,

        fileSize:
          file.size,
      },
    });
  }

  /*
   * ----------------------------------------------------------
   * CREATE ML JOB
   * ----------------------------------------------------------
   */

  const mlJob =
    await prisma.mlProcessingJob.create({
      data: {
        attendanceSessionId:
          attendanceSession.id,

        jobType:
          "ATTENDANCE_PROCESSING",

        status:
          "PENDING",
      },
    });

  /*
   * ----------------------------------------------------------
   * QUEUE ML PROCESSING
   * ----------------------------------------------------------
   */

  await mlQueue.add(
    "ATTENDANCE_PROCESSING",
    {
      mlJobId:
        mlJob.id,

      attendanceSessionId:
        attendanceSession.id,

      sectionId:
        body.sectionId,
    }
  );

  return attendanceSession;
};

/*
 * ------------------------------------------------------------
 * GET ATTENDANCE SESSION
 * ------------------------------------------------------------
 */

export const getAttendanceSessionService =
  async (
    sessionId: string
  ) => {
    return prisma.attendanceSession.findUnique({
      where: {
        id: sessionId,
      },

      include: {
        images: true,
        records: {
          include: {
            student: true,
          },
        },
      },
    });
  };

/*
 * ------------------------------------------------------------
 * FINALIZE ATTENDANCE
 * ------------------------------------------------------------
 */

export const finalizeAttendanceService =
  async (
    sessionId: string
  ) => {
    return prisma.attendanceSession.update({
      where: {
        id: sessionId,
      },

      data: {
        status: "FINALIZED",
      },
    });
  };

/*
 * ------------------------------------------------------------
 * UPDATE ATTENDANCE RECORD
 * ------------------------------------------------------------
 */

export const updateAttendanceRecordService =
  async (
    recordId: string,
    status: string
  ) => {
    return prisma.attendanceRecord.update({
      where: {
        id: recordId,
      },

      data: {
        status: status as any,
      },
    });
  };

/*
 * ------------------------------------------------------------
 * ATTENDANCE HISTORY
 * ------------------------------------------------------------
 */

export const getAttendanceHistoryService =
  async (
    userId: string
  ) => {
    return prisma.attendanceSession.findMany({
      where: {
        teacherUserId:
          userId,
      },

      orderBy: {
        createdAt:
          "desc",
      },

      include: {
        section: true,
        records: true,
      },
    });
  };