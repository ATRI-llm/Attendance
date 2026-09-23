import axios, { AxiosError } from "axios";
import prisma from "../config/prisma";
import { resolveImageUrls } from "../utils/storageUrls";

const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL || process.env.MODEL_URL || "http://localhost:8000"
).replace(/\/$/, "");

interface OnboardResponse {
  success: boolean;
  embeddings: number[][];
  facesFound: number;
  modelVersion: string;
  skippedImages: number;
}

async function extractEmbeddings(studentId: string, imageUrls: string[]): Promise<OnboardResponse> {
  try {
    const response = await axios.post<OnboardResponse>(
      `${ML_SERVICE_URL}/onboard`,
      { imageUrls, studentId },
      { timeout: 120_000 }
    );
    return response.data;
  } catch (error: any) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    const detail = axiosError.response?.data?.detail || axiosError.message;
    throw new Error(`ml-service /onboard failed: ${detail}`);
  }
}

async function replaceStudentEmbeddings(
  studentId: string,
  result: OnboardResponse
): Promise<void> {
  if (!result.success || !Array.isArray(result.embeddings) || result.embeddings.length === 0) {
    throw new Error(`ml-service returned no embeddings. Faces found: ${result.facesFound}`);
  }

  await prisma.$transaction(async (tx) => {
    // Makes retries safe: a partially completed previous attempt cannot duplicate embeddings.
    await tx.studentFaceEmbedding.deleteMany({ where: { studentId } });

    await tx.studentFaceEmbedding.createMany({
      data: result.embeddings.map((embedding) => ({
        studentId,
        embedding,
        modelVersion: result.modelVersion,
      })),
    });
  });
}

export const processFaceOnboardingJob = async (data: any) => {
  const { mlJobId, onboardingSessionId, studentId } = data;

  if (!mlJobId || !onboardingSessionId || !studentId) {
    throw new Error("FACE_EMBEDDING_GENERATION job is missing required identifiers");
  }

  console.log(`[onboarding] Processing job ${mlJobId} | student=${studentId}`);

  await prisma.mlProcessingJob.update({
    where: { id: mlJobId },
    data: { status: "PROCESSING", startedAt: new Date(), errorMessage: null },
  });

  try {
    await prisma.faceOnboardingSession.update({
      where: { id: onboardingSessionId },
      data: { status: "PROCESSING" },
    });

    const images = await prisma.studentFaceImage.findMany({
      where: { onboardingSessionId, studentId },
      select: { imageUrl: true },
      orderBy: { createdAt: "asc" },
    });

    if (images.length === 0) {
      throw new Error("No images found for onboarding session");
    }

    const imageUrls = await resolveImageUrls(images.map((image) => image.imageUrl));
    const result = await extractEmbeddings(studentId, imageUrls);

    await replaceStudentEmbeddings(studentId, result);

    await prisma.$transaction([
      prisma.faceOnboardingSession.update({
        where: { id: onboardingSessionId },
        data: { status: "COMPLETED" },
      }),
      prisma.student.update({
        where: { id: studentId },
        data: { faceStatus: "ADDED" },
      }),
      prisma.mlProcessingJob.update({
        where: { id: mlJobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          responsePayload: {
            facesFound: result.facesFound,
            skippedImages: result.skippedImages,
            embeddingCount: result.embeddings.length,
            modelVersion: result.modelVersion,
          },
        },
      }),
    ]);

    console.log(
      `[onboarding] Completed ${mlJobId}: embeddings=${result.embeddings.length}, skipped=${result.skippedImages}`
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[onboarding] Job ${mlJobId} failed: ${message}`);

    await prisma.$transaction([
      prisma.faceOnboardingSession.update({
        where: { id: onboardingSessionId },
        data: { status: "FAILED" },
      }),
      prisma.student.update({
        where: { id: studentId },
        data: { faceStatus: "RESCAN" },
      }),
      prisma.mlProcessingJob.update({
        where: { id: mlJobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: message,
        },
      }),
    ]);

    throw error;
  }
};

export const processBatchOnboardingForSection = async (sectionId: string) => {
  const pendingSessions = await prisma.faceOnboardingSession.findMany({
    where: { sectionId, status: "IMAGES_CAPTURED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, studentId: true },
  });

  // Recovery covers older data where images exist but the original ML job was lost.
  const studentsMissingEmbeddings = await prisma.student.findMany({
    where: {
      sectionId,
      faceEmbeddings: { none: {} },
      faceImages: { some: {} },
    },
    select: { id: true },
  });

  const pendingStudentIds = new Set(pendingSessions.map((session) => session.studentId));
  const recoveryStudents = studentsMissingEmbeddings.filter(
    (student) => !pendingStudentIds.has(student.id)
  );

  let failures = 0;
  const sessions = [
    ...pendingSessions.map((session) => ({ sessionId: session.id, studentId: session.studentId })),
    ...recoveryStudents.map((student) => ({ sessionId: null, studentId: student.id })),
  ];

  for (const item of sessions) {
    try {
      const images = await prisma.studentFaceImage.findMany({
        where: item.sessionId
          ? { onboardingSessionId: item.sessionId, studentId: item.studentId }
          : { studentId: item.studentId },
        select: { imageUrl: true },
        orderBy: { createdAt: "asc" },
      });

      if (images.length === 0) {
        throw new Error(`No face images found for student ${item.studentId}`);
      }

      const result = await extractEmbeddings(
        item.studentId,
        await resolveImageUrls(images.map((image) => image.imageUrl))
      );
      await replaceStudentEmbeddings(item.studentId, result);

      if (item.sessionId) {
        await prisma.faceOnboardingSession.update({
          where: { id: item.sessionId },
          data: { status: "COMPLETED" },
        });
      }

      await prisma.student.update({
        where: { id: item.studentId },
        data: { faceStatus: "ADDED" },
      });
    } catch (error: any) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[onboarding] Batch extraction failed for ${item.studentId}: ${message}`);

      if (item.sessionId) {
        await prisma.faceOnboardingSession.update({
          where: { id: item.sessionId },
          data: { status: "FAILED" },
        });
      }

      await prisma.student.update({
        where: { id: item.studentId },
        data: { faceStatus: "RESCAN" },
      });
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} face onboarding item(s) failed before classifier training`);
  }
};
