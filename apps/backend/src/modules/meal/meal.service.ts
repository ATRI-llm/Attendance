import prisma from "../../database/prisma";
import {validateGeofence,} from "../../common/utils/geofence";
import { mlQueue } from "../../queues/ml.queue";
import { saveUploadedFile } from "../../common/utils/storageUpload";

export const createMealSessionService = async (
  userId:string,
  body:any,
  files:Express.Multer.File[]
) => {
  const teacherSection = await prisma.teacherSection.findFirst({
      where:{
        teacher:{
          userId,
        },

        sectionId:body.sectionId,
      },

      include:{
        section:{
          include:{
            standard:{
              include:{
                school:true,
              },
            },
          },
        },
      },
    });

  if (!teacherSection) {throw new Error("Section not assigned");}

  const school = teacherSection.section.standard.school;
  const geoResult =validateGeofence(body.latitude,body.longitude,school);

  await prisma.geofenceValidation.create({
    data:{
      teacherUserId:userId,
      validationType:"MEAL_COUNT",

      latitude:Number(body.latitude),
      longitude:Number(body.longitude),

      distance:geoResult.distance,
      isWithinGeofence:geoResult.isInside,

      schoolId:school.id,
    },
  });

  if (!geoResult.isInside) {
    throw new Error("Outside school premises");
  }

  const mealSession = await prisma.mealSession.create({
      data:{
        sectionId:body.sectionId,
        teacherUserId:userId,
        date:new Date(),
        totalDetected:0,
        status:"PENDING",
      },
    });

  for (const file of files) {
    const imageUrl =await saveUploadedFile(file,"meals");

    await prisma.mealImage.create({
      data:{
        mealSessionId:mealSession.id,
        imageUrl,
        mimeType:file.mimetype,
        fileSize:file.size,
      },
    });
  }

  const mlJob = await prisma.mlProcessingJob.create({
      data:{
        mealSessionId:mealSession.id,
        jobType:"MEAL_COUNT_PROCESSING",
        status:"PENDING",
      },
    });

  await mlQueue.add("MEAL_COUNT_PROCESSING",
    {
      mlJobId:mlJob.id,
      mealSessionId:mealSession.id,
      sectionId:body.sectionId,
    }
  );

  return mealSession;
};

export const getMealSessionService =async (sessionId:string) => {
    return prisma.mealSession.findUnique({
      where:{
        id:sessionId,
      },
    });
};

export const finalizeMealSessionService =async (sessionId:string) => {
    return prisma.mealSession.update({
      where:{
        id:sessionId,
      },

      data:{
        status:"CONFIRMED",
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
  
  const mealSession = await prisma.mealSession.upsert({
    where: {
      sectionId_date: {
        sectionId: payload.sectionId,
        date: parsedDate,
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
      date: parsedDate,
      totalDetected: payload.totalDetected,
      status: "CONFIRMED",
      isOfflineSync: true,
      deviceId: payload.deviceId,
      detectorVersion: payload.detectorVersion,
    },
  });

  return { sessionId: mealSession.id };
};
