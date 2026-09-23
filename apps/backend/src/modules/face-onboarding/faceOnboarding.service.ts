
import prisma from "../../database/prisma";
import { validateGeofence } from "../../common/utils/geofence";
import { mlQueue } from "../../queues/ml.queue";

import {
  saveMulterFile,
  generateStorageFilename,
  getPublicUrl,
} from "../../common/utils/storage";

export const createFaceOnboardingService = async (
  userId: string,
  body: any,
  files: Express.Multer.File[]
) => {
  /*
   * ----------------------------------------------------------
   * FIND STUDENT
   * ----------------------------------------------------------
   */

  const student =
    await prisma.student.findUnique({
      where: {
        id: body.studentId,
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

  if (!student) {
    throw new Error(
      "Student not found"
    );
  }

  /*
   * ----------------------------------------------------------
   * VALIDATE FILES
   * ----------------------------------------------------------
   */

  if (!files || files.length === 0) {
    throw new Error(
      "At least one face image is required"
    );
  }

  /*
   * ----------------------------------------------------------
   * SCHOOL / GEOFENCE
   * ----------------------------------------------------------
   */

  const school =
    student.section.standard.school;

  const latitude =
    Number(body.latitude);

  const longitude =
    Number(body.longitude);

  const geoResult =
    validateGeofence(
      latitude,
      longitude,
      school
    );

  await prisma.geofenceValidation.create({
    data: {
      teacherUserId: userId,

      validationType:
        "FACE_ONBOARDING",

      latitude,

      longitude,

      distance:
        geoResult.distance,

      isWithinGeofence:
        geoResult.isInside,

      schoolId:
        school.id,

      referenceId:
        student.id,
    },
  });

  if (!geoResult.isInside) {
    throw new Error(
      "You are outside school premises"
    );
  }

  /*
   * ----------------------------------------------------------
   * CREATE ONBOARDING SESSION
   * ----------------------------------------------------------
   */

  const onboarding =
    await prisma.faceOnboardingSession.create({
      data: {
        studentId:
          student.id,

        teacherUserId:
          userId,

        sectionId:
          student.sectionId,

        status:
          "IMAGES_CAPTURED",

        totalImages:
          files.length,
      },
    });

  /*
   * ----------------------------------------------------------
   * SAVE FACE IMAGES
   * ----------------------------------------------------------
   *
   * New storage structure:
   *
   * storage/
   *   uploads/
   *     face-onboarding/
   *       <studentId>/
   *         <onboardingSessionId>/
   *           <unique-file>.jpg
   *
   * The database continues to use `imageUrl`
   * for compatibility with the existing application.
   *
   * The URL points to the backend local storage endpoint.
   */

  for (const file of files) {
    const filename =
      generateStorageFilename(
        file.originalname
      );

    const storageKey =
      `uploads/face-onboarding/${student.id}/${onboarding.id}/${filename}`;

    await saveMulterFile(
      file,
      storageKey
    );

    const imageUrl =
      getPublicUrl(storageKey);

    await prisma.studentFaceImage.create({
      data: {
        studentId:
          student.id,

        onboardingSessionId:
          onboarding.id,

        imageUrl,

        fileSize:
          file.size,

        mimeType:
          file.mimetype,
      },
    });
  }

  /*
   * ----------------------------------------------------------
   * UPDATE FACE STATUS
   * ----------------------------------------------------------
   */

  await prisma.student.update({
    where: {
      id: student.id,
    },

    data: {
      faceStatus:
        "PENDING",
    },
  });

  // Queue the actual embedding extraction. The previous implementation
  // stopped after setting PENDING, leaving every onboarding job stranded.
  const mlJob = await prisma.mlProcessingJob.create({
    data: {
      onboardingSessionId: onboarding.id,
      sectionId: student.sectionId,
      jobType: "FACE_EMBEDDING_GENERATION",
      status: "PENDING",
    },
  });

  await mlQueue.add("FACE_EMBEDDING_GENERATION", {
    mlJobId: mlJob.id,
    onboardingSessionId: onboarding.id,
    studentId: student.id,
    sectionId: student.sectionId,
  }, {
    removeOnComplete: 100,
    removeOnFail: 100,
  });

  return {
    ...onboarding,
    mlJobId: mlJob.id,
  };
};