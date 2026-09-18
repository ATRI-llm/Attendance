import prisma from "../config/prisma";
import axios from "axios";
import { resolveImageUrls } from "../utils/storageUrls";

const ML_URL = process.env.MODEL_URL || "http://localhost:8000";

export const processMealJob = async (data: any) => {
  console.log("Meal Processing:", data);

  await prisma.mlProcessingJob.update({
    where: { id: data.mlJobId },
    data: { status: "PROCESSING", startedAt: new Date() }
  });

  try {
    const images = await prisma.mealImage.findMany({
      where: { mealSessionId: data.mealSessionId }
    });

    const imageUrls = await resolveImageUrls(images.map((img) => img.imageUrl));

    const mlResponse = await axios.post(`${ML_URL}/meal`, {
      mealSessionId: data.mealSessionId,
      imageUrls: imageUrls
    }, { timeout: 60000 });

    const result = mlResponse.data;

    await prisma.mealSession.update({
      where: { id: data.mealSessionId },
      data: {
        totalDetected: result.totalDetected,
        confidenceScore: result.confidenceScore,
        status: "PROCESSED"
      }
    });

    await prisma.mlProcessingJob.update({
      where: { id: data.mlJobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        responsePayload: result
      }
    });

  } catch (error: any) {
    console.error("Meal failed:", error.message);

    await prisma.mlProcessingJob.update({
      where: { id: data.mlJobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error.message
      }
    });
  }
};


