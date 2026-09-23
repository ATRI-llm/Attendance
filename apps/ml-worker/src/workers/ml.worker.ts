import { Worker } from "bullmq";
import { redisConnection } from "../config/redis";
import { processFaceOnboardingJob } from "../services/onboarding.service";
import { processTrainClassifierJob } from "../services/train_classifier.service";
import { processAttendanceJob } from "../services/attendance.service";
import { processMealJob } from "../services/meal.service";

export const mlWorker = new Worker(
  "ml-processing",
  async (job) => {
    console.log(`[worker] Processing job ${job.id} (${job.name})`);

    switch (job.name) {
      case "FACE_EMBEDDING_GENERATION":
        await processFaceOnboardingJob(job.data);
        return;

      case "ATTENDANCE_PROCESSING":
        await processAttendanceJob(job.data);
        return;

      case "MEAL_COUNT_PROCESSING":
        await processMealJob(job.data);
        return;

      case "TRAIN_CLASSIFIER":
        await processTrainClassifierJob(job.data);
        return;

      default:
        throw new Error(`Unknown ML job type: ${job.name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.ML_WORKER_CONCURRENCY || 2),
  }
);

mlWorker.on("ready", () => {
  console.log("[worker] ML worker is ready");
});

mlWorker.on("completed", (job) => {
  console.log(`[worker] Completed job ${job.id} (${job.name})`);
});

mlWorker.on("failed", (job, error) => {
  console.error(
    `[worker] Failed job ${job?.id ?? "unknown"} (${job?.name ?? "unknown"}): ${error.message}`
  );
});

mlWorker.on("error", (error) => {
  console.error(`[worker] Worker error: ${error.message}`);
});
