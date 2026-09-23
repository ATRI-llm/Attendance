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

  const now = new Date();
  const dayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const existingSession = await prisma.attendanceSession.findFirst({
    where: {
      sectionId: body.sectionId,
      date: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingSession) {
    throw new Error("Attendance has already been started for this section today");
  }

  const attendanceSession =
    await prisma.attendanceSession.create({
      data: {
        sectionId: body.sectionId,
        teacherUserId: userId,
        date: dayStart,
        status: "PENDING",
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
    userId: string,
    sessionId: string
  ) => {
    const session = await prisma.attendanceSession.findUnique({
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
        mlJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!session) return null;

    const teacherSection = await prisma.teacherSection.findFirst({
      where: {
        teacher: { userId },
        sectionId: session.sectionId,
      },
    });

    if (!teacherSection) {
      throw new Error("Attendance session not accessible");
    }

    return session;
  };

/*
 * ------------------------------------------------------------
 * FINALIZE ATTENDANCE
 * ------------------------------------------------------------
 */

export const finalizeAttendanceService =
  async (
    userId: string,
    sessionId: string
  ) => {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new Error("Attendance session not found");

    const teacherSection = await prisma.teacherSection.findFirst({
      where: { teacher: { userId }, sectionId: session.sectionId },
    });
    if (!teacherSection) throw new Error("Attendance session not accessible");

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
    userId: string,
    recordId: string,
    status: string
  ) => {
    const record = await prisma.attendanceRecord.findUnique({
      where: { id: recordId },
      include: { attendanceSession: true },
    });
    if (!record) throw new Error("Attendance record not found");

    const teacherSection = await prisma.teacherSection.findFirst({
      where: {
        teacher: { userId },
        sectionId: record.attendanceSession.sectionId,
      },
    });
    if (!teacherSection) throw new Error("Attendance record not accessible");

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