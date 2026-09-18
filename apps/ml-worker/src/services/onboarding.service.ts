/**
 * services/onboarding.service.ts
 *
 * BullMQ job handler for FACE_EMBEDDING_GENERATION.
 *
 * Delegates all ML computation to the Python ml-service via HTTP.
 * The ml-service runs ONNX models in-process (loaded once at startup),
 * so there is no cold-start overhead per job.
 *
 * Flow:
 *   1. Fetch face images for the onboarding session
 *   2. Prepare local storage URLs so the ml-service can access the files
 *   3. POST to ml-service /onboard → get 512-dim embeddings
 *   4. Store embeddings in StudentFaceEmbedding table
 *   5. Update session + student status
 */

import axios, { AxiosError } from "axios";
import prisma from "../config/prisma";
import { resolveImageUrls } from "../utils/storageUrls";
import { mlQueue } from "../queues/ml.queue";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────

interface OnboardResponse {
  success: boolean;
  embeddings: number[][];
  facesFound: number;
  modelVersion: string;
  skippedImages: number;
}

// ── Job handler ──────────────────────────────────────────────────

export const processFaceOnboardingJob = async (data: any) => {
  console.log("[onboarding] Processing job:", data.mlJobId, "| student:", data.studentId);

  await prisma.mlProcessingJob.update({
    where: { id: data.mlJobId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  try {
    // 1. Fetch image records
    const images = await prisma.studentFaceImage.findMany({
      where: { onboardingSessionId: data.onboardingSessionId },
    });

    if (images.length === 0) {
      throw new Error("No images found for onboarding session");
    }

    // 2. Prepare local storage URLs for the ml-service
    const imageUrls = await resolveImageUrls(images.map((img) => img.imageUrl));

    // 3. Call ml-service — models are already loaded in memory
    console.log(`[onboarding] Calling ml-service with ${imageUrls.length} image(s)...`);

    let result: OnboardResponse;
    try {
      const response = await axios.post<OnboardResponse>(
        `${ML_SERVICE_URL}/onboard`,
        {
          imageUrls,
          studentId: data.studentId,
        },
        { timeout: 120_000 } // 2 min max for large batches
      );
      result = response.data;
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ detail: string }>;
      const detail = axiosErr.response?.data?.detail || axiosErr.message;
      throw new Error(`ml-service /onboard failed: ${detail}`);
    }

    if (!result.success || result.embeddings.length === 0) {
      throw new Error(
        `ml-service returned no embeddings. Faces found: ${result.facesFound}`
      );
    }

    // 4. Store each embedding separately (one row per detected face)
    for (const embedding of result.embeddings) {
      await prisma.studentFaceEmbedding.create({
        data: {
          studentId: data.studentId,
          embedding: embedding,
          modelVersion: result.modelVersion,
        },
      });
    }

    // 5. Update session + student
    await prisma.faceOnboardingSession.update({
      where: { id: data.onboardingSessionId },
      data: { status: "COMPLETED" },
    });

    const student = await prisma.student.update({
      where: { id: data.studentId },
      data: { faceStatus: "ADDED" },
    });

    await prisma.mlProcessingJob.update({
      where: { id: data.mlJobId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    console.log(
      `[onboarding] Done. Embeddings stored: ${result.facesFound} | Skipped: ${result.skippedImages}`
    );
  } catch (error: any) {
    console.error("[onboarding] Job failed:", error.message);

    await prisma.faceOnboardingSession.update({
      where: { id: data.onboardingSessionId },
      data: { status: "FAILED" },
    });

    await prisma.student.update({
      where: { id: data.studentId },
      data: { faceStatus: "RESCAN" },
    });

    await prisma.mlProcessingJob.update({
      where: { id: data.mlJobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });
  }
};

export const processBatchOnboardingForSection = async (sectionId: string) => {
  console.log(`[onboarding] Processing batch onboarding for section: ${sectionId}`);

  const pendingSessions = await prisma.faceOnboardingSession.findMany({
    where: {
      sectionId,
      status: "IMAGES_CAPTURED",
    }
  });

  // RECOVERY: Find students who have images but no embeddings (e.g., if DB was partially wiped)
  const students = await prisma.student.findMany({
    where: { sectionId },
    include: { faceImages: true, faceEmbeddings: true }
  });

  for (const student of students) {
    if (student.faceEmbeddings.length === 0 && student.faceImages.length > 0) {
      // Check if this student is already in pendingSessions to avoid duplicates
      if (!pendingSessions.some(s => s.studentId === student.id)) {
        console.log(`[onboarding] Recovery: Found missing embeddings for student ${student.id}. Queuing for extraction.`);
        pendingSessions.push({
          id: `RECOVERY_${student.id}`,
          studentId: student.id,
          sectionId: sectionId,
          status: "IMAGES_CAPTURED",
          createdAt: new Date(),
          updatedAt: new Date()
        } as any);
      }
    }
  }

  if (pendingSessions.length === 0) {
    console.log(`[onboarding] No pending onboarding sessions found for section ${sectionId}.`);
    return;
  }

  console.log(`[onboarding] Found ${pendingSessions.length} pending sessions. Starting extraction...`);

  for (const session of pendingSessions) {
    try {
      console.log(`[onboarding] Extracting embeddings for student: ${session.studentId}`);

      // Fetch images by studentId so we find them even if the session record was deleted
      const images = await prisma.studentFaceImage.findMany({
        where: { studentId: session.studentId },
      });

      if (images.length === 0) {
        throw new Error("No images found for student");
      }

      const imageUrls = await resolveImageUrls(images.map((img) => img.imageUrl));

      let result: OnboardResponse;
      try {
        const response = await axios.post<OnboardResponse>(
          `${ML_SERVICE_URL}/onboard`,
          {
            imageUrls,
            studentId: session.studentId,
          },
          { timeout: 120_000 }
        );
        result = response.data;
      } catch (err: any) {
        const axiosErr = err as AxiosError<{ detail: string }>;
        const detail = axiosErr.response?.data?.detail || axiosErr.message;
        throw new Error(`ml-service /onboard failed: ${detail}`);
      }

      if (!result.success || result.embeddings.length === 0) {
        throw new Error(`ml-service returned no embeddings. Faces found: ${result.facesFound}`);
      }

      await prisma.studentFaceEmbedding.deleteMany({
        where: { studentId: session.studentId }
      });

      for (const embedding of result.embeddings) {
        await prisma.studentFaceEmbedding.create({
          data: {
            studentId: session.studentId,
            embedding: embedding,
            modelVersion: result.modelVersion,
          },
        });
      }

      if (!session.id.startsWith("RECOVERY_")) {
        await prisma.faceOnboardingSession.update({
          where: { id: session.id },
          data: { status: "COMPLETED" },
        });
      }

      await prisma.student.update({
        where: { id: session.studentId },
        data: { faceStatus: "ADDED" },
      });

      console.log(`[onboarding] Success for student ${session.studentId}. Embeddings stored: ${result.facesFound}`);
    } catch (error: any) {
      console.error(`[onboarding] Failed for student ${session.studentId}:`, error.message);

      if (!session.id.startsWith("RECOVERY_")) {
        await prisma.faceOnboardingSession.update({
          where: { id: session.id },
          data: { status: "FAILED" },
        });
      }

      await prisma.student.update({
        where: { id: session.studentId },
        data: { faceStatus: "RESCAN" },
      });
    }
  }

  console.log(`[onboarding] Batch processing completed for section ${sectionId}.`);
};



