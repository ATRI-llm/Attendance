
import prisma from "../../database/prisma";
import { validateGeofence, } from "../../common/utils/geofence";
import { mlQueue } from "../../queues/ml.queue";
import { saveUploadedFile } from "../../common/utils/storageUpload";

export const createMealSessionService = async (
  userId: string,
  body: any,
  files: Express.Multer.File[]
) => {
  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: {
        userId,
      },

      sectionId: body.sectionId,
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

  if (!teacherSection) { throw new Error("Section not assigned"); }

  if (!files || files.length === 0) {
    throw new Error("At least one meal image is required");
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Valid latitude and longitude are required");
  }

  const school = teacherSection.section.standard.school;
  const geoResult = validateGeofence(latitude, longitude, school);

  await prisma.geofenceValidation.create({
    data: {
      teacherUserId: userId,
      validationType: "MEAL_COUNT",

      latitude,
      longitude,

      distance: geoResult.distance,
      isWithinGeofence: geoResult.isInside,

      schoolId: school.id,
    },
  });

  if (!geoResult.isInside) {
    throw new Error("Outside school premises");
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const existingSession = await prisma.mealSession.findFirst({
    where: { sectionId: body.sectionId, date: { gte: dayStart, lt: dayEnd } },
    orderBy: { createdAt: "desc" },
  });
  if (existingSession) {
    throw new Error("Meal count has already been started for this section today");
  }

  const mealSession = await prisma.mealSession.create({
    data: {
      sectionId: body.sectionId,
      teacherUserId: userId,
      date: dayStart,
      totalDetected: 0,
      status: "PENDING",
    },
  });

  for (const file of files) {
    const imageUrl = await saveUploadedFile(file, "meals");

    await prisma.mealImage.create({
      data: {
        mealSessionId: mealSession.id,
        imageUrl,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
    });
  }

  const mlJob = await prisma.mlProcessingJob.create({
    data: {
      mealSessionId: mealSession.id,
      jobType: "MEAL_COUNT_PROCESSING",
      status: "PENDING",
    },
  });

  await mlQueue.add("MEAL_COUNT_PROCESSING",
    {
      mlJobId: mlJob.id,
      mealSessionId: mealSession.id,
      sectionId: body.sectionId,
    }
  );

  return mealSession;
};

export const getMealSessionService = async (userId: string, sessionId: string) => {
  const session = await prisma.mealSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return null;

  const teacherSection = await prisma.teacherSection.findFirst({
    where: { teacher: { userId }, sectionId: session.sectionId },
  });
  if (!teacherSection) throw new Error("Meal session not accessible");

  return session;
};

export const finalizeMealSessionService = async (userId: string, sessionId: string) => {
  const session = await prisma.mealSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Meal session not found");
  const teacherSection = await prisma.teacherSection.findFirst({
    where: { teacher: { userId }, sectionId: session.sectionId },
  });
  if (!teacherSection) throw new Error("Meal session not accessible");

  return prisma.mealSession.update({
    where: {
      id: sessionId,
    },

    data: {
      status: "CONFIRMED",
    },
  });
};

export const offlineMealSyncService = async (userId: string, payload: any) => {
  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: { userId },
      sectionId: payload.sectionId,
    },
  });

  if (!teacherSection) {
    throw new Error("Section not assigned to this teacher");
  }

  // Upsert the meal session to avoid unique constraint errors if
  // multiple syncs happen for the same section and date.
  const parsedDate = new Date(payload.date);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid meal session date");
  }
  const normalizedDate = new Date(Date.UTC(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate()
  ));

  const mealSession = await prisma.mealSession.upsert({
    where: {
      sectionId_date: {
        sectionId: payload.sectionId,
        date: normalizedDate,
      },
    },
    update: {
      teacherUserId: userId,
      totalDetected: payload.totalDetected,
      status: "CONFIRMED",
      isOfflineSync: true,
      deviceId: payload.deviceId,
      detectorVersion: payload.detectorVersion,
    },
    create: {
      sectionId: payload.sectionId,
      teacherUserId: userId,
      date: normalizedDate,
      totalDetected: payload.totalDetected,
      status: "CONFIRMED",
      isOfflineSync: true,
      deviceId: payload.deviceId,
      detectorVersion: payload.detectorVersion,
    },
  });

  return { sessionId: mealSession.id };
};