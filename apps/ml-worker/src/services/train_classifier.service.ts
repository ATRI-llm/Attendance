import axios, { AxiosError } from "axios";
import prisma from "../config/prisma";
import { processBatchOnboardingForSection } from "./onboarding.service";

const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL || "http://localhost:8000"
).replace(/\/$/, "");
const POLL_INTERVAL_MS = Number(process.env.ML_TRAIN_POLL_INTERVAL_MS || 10_000);
const MAX_POLL_ATTEMPTS = Number(process.env.ML_TRAIN_MAX_POLL_ATTEMPTS || 180);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TrainJobStatus {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: {
    classifierVersion: string;
    backboneVersion: string;
    classifierUrl: string;
    backboneUrl: string;
    numClasses: number;
    numSamples: number;
  };
  error?: string;
  completedAt?: string;
}

export const processTrainClassifierJob = async (data: any) => {
  const { mlJobId, sectionId } = data;

  if (!mlJobId || !sectionId) {
    throw new Error("TRAIN_CLASSIFIER job is missing required identifiers");
  }

  console.log(`[trainer] Processing job ${mlJobId} | section=${sectionId}`);

  await prisma.mlProcessingJob.update({
    where: { id: mlJobId },
    data: { status: "PROCESSING", startedAt: new Date(), errorMessage: null },
  });

  try {
    await processBatchOnboardingForSection(sectionId);

    let remoteJobId: string;
    try {
      const response = await axios.post(
        `${ML_SERVICE_URL}/train`,
        { sectionId, version: data.version || "v1" },
        { timeout: 30_000 }
      );
      remoteJobId = response.data?.jobId;
      if (!remoteJobId) {
        throw new Error("ml-service /train did not return jobId");
      }
    } catch (error: any) {
      const axiosError = error as AxiosError<{ detail?: string }>;
      const detail = axiosError.response?.data?.detail || axiosError.message;
      throw new Error(`ml-service /train failed: ${detail}`);
    }

    let completed = false;
    let finalStatus: TrainJobStatus | undefined;

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
      await sleep(POLL_INTERVAL_MS);

      let jobStatus: TrainJobStatus;
      try {
        const response = await axios.get<TrainJobStatus>(
          `${ML_SERVICE_URL}/train/${remoteJobId}`,
          { timeout: 15_000 }
        );
        jobStatus = response.data;
      } catch (error: any) {
        const axiosError = error as AxiosError<{ detail?: string }>;
        const detail = axiosError.response?.data?.detail || axiosError.message;
        throw new Error(`ml-service training status check failed: ${detail}`);
      }

      finalStatus = jobStatus;
      console.log(
        `[trainer] Poll #${attempt} | remote=${remoteJobId} | status=${jobStatus.status}`
      );

      if (jobStatus.status === "completed") {
        completed = true;
        break;
      }

      if (jobStatus.status === "failed") {
        throw new Error(
          `ml-service training failed: ${jobStatus.error || "unknown error"}`
        );
      }
    }

    // Check the final observed status before declaring a timeout. This avoids
    // a false timeout when the last polling request reports completion.
    if (!completed && finalStatus?.status !== "completed") {
      throw new Error(`Training timed out after ${MAX_POLL_ATTEMPTS} polling attempts`);
    }

    await prisma.mlProcessingJob.update({
      where: { id: mlJobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        responsePayload: finalStatus?.result
          ? {
              remoteJobId,
              classifierVersion: finalStatus.result.classifierVersion,
              backboneVersion: finalStatus.result.backboneVersion,
              classifierUrl: finalStatus.result.classifierUrl,
              backboneUrl: finalStatus.result.backboneUrl,
              numClasses: finalStatus.result.numClasses,
              numSamples: finalStatus.result.numSamples,
            }
          : { remoteJobId },
      },
    });

    console.log(`[trainer] Job ${mlJobId} completed successfully`);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[trainer] Job ${mlJobId} failed: ${message}`);

    await prisma.mlProcessingJob.update({
      where: { id: mlJobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: message,
      },
    });

    throw error;
  }
};
