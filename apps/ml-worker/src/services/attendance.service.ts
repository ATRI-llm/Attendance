import axios, { AxiosError } from "axios";
import prisma from "../config/prisma";
import { resolveImageUrls } from "../utils/storageUrls";

const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL || process.env.MODEL_URL || "http://localhost:8000"
).replace(/\/$/, "");

interface AttendanceResult {
  studentId?: string | null;
  status: "PRESENT" | "ABSENT" | "MANUAL";
  confidence?: number | null;
}

interface AttendanceResponse {
  success?: boolean;
  results: AttendanceResult[];
  totalHeads: number;
  detectedCount: number;
  absentCount: number;
  avgConfidence?: number | null;
}

export const processAttendanceJob = async (data: any) => {
  const { mlJobId, attendanceSessionId, sectionId } = data;

  if (!mlJobId || !attendanceSessionId || !sectionId) {
    throw new Error("ATTENDANCE_PROCESSING job is missing required identifiers");
  }

  console.log(
    `[attendance] Processing job ${mlJobId} | session=${attendanceSessionId} | section=${sectionId}`
  );

  await prisma.mlProcessingJob.update({
    where: { id: mlJobId },
    data: { status: "PROCESSING", startedAt: new Date(), errorMessage: null },
  });

  try {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: attendanceSessionId },
      select: { id: true, sectionId: true, status: true },
    });

    if (!session) {
      throw new Error(`Attendance session not found: ${attendanceSessionId}`);
    }

    if (session.sectionId !== sectionId) {
      throw new Error("Attendance job section does not match attendance session");
    }

    const images = await prisma.attendanceImage.findMany({
      where: { attendanceSessionId },
      select: { imageUrl: true },
      orderBy: { createdAt: "asc" },
    });

    if (images.length === 0) {
      throw new Error("No attendance images found for session");
    }

    const students = await prisma.student.findMany({
      where: { sectionId },
      select: {
        id: true,
        faceEmbeddings: {
          select: { embedding: true, modelVersion: true },
        },
      },
    });

    const studentEmbeddings = students.flatMap((student) =>
      student.faceEmbeddings.map((faceEmbedding) => ({
        studentId: student.id,
        embedding: faceEmbedding.embedding,
        modelVersion: faceEmbedding.modelVersion,
      }))
    );

    if (studentEmbeddings.length === 0) {
      throw new Error("No student face embeddings found for this section");
    }

    const imageUrls = await resolveImageUrls(images.map((image) => image.imageUrl));

    let result: AttendanceResponse;
    try {
      const response = await axios.post<AttendanceResponse>(
        `${ML_SERVICE_URL}/attendance`,
        {
          attendanceSessionId,
          sectionId,
          imageUrls,
          studentEmbeddings,
        },
        { timeout: 120_000 }
      );
      result = response.data;
    } catch (error: any) {
      const axiosError = error as AxiosError<{ detail?: string }>;
      const detail = axiosError.response?.data?.detail || axiosError.message;
      throw new Error(`ml-service /attendance failed: ${detail}`);
    }

    if (!Array.isArray(result.results)) {
      throw new Error("ml-service /attendance returned an invalid results payload");
    }

    const validStudentIds = new Set(students.map((student) => student.id));
    const sanitizedResults = result.results.filter((record) => {
      if (record.status === "ABSENT") {
        return Boolean(record.studentId && validStudentIds.has(record.studentId));
      }
      return Boolean(record.studentId && validStudentIds.has(record.studentId));
    });

    const deduped = new Map<string, AttendanceResult>();
    for (const record of sanitizedResults) {
      const studentId = record.studentId as string;
      const previous = deduped.get(studentId);
      if (!previous || (record.confidence ?? 0) > (previous.confidence ?? 0)) {
        deduped.set(studentId, record);
      }
    }

    const finalResults = Array.from(deduped.values());

    await prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.deleteMany({
        where: { attendanceSessionId },
      });

      if (finalResults.length > 0) {
        await tx.attendanceRecord.createMany({
          data: finalResults.map((record) => ({
            attendanceSessionId,
            studentId: record.studentId as string,
            status: record.status,
            confidenceScore:
              typeof record.confidence === "number" && Number.isFinite(record.confidence)
                ? record.confidence
                : null,
          })),
        });
      }

      await tx.attendanceSession.update({
        where: { id: attendanceSessionId },
        data: {
          status: "PROCESSED",
          confidenceScore:
            typeof result.avgConfidence === "number" && Number.isFinite(result.avgConfidence)
              ? result.avgConfidence
              : null,
        },
      });

      await tx.mlProcessingJob.update({
        where: { id: mlJobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          responsePayload: {
            totalHeads: result.totalHeads,
            detectedCount: result.detectedCount,
            absentCount: result.absentCount,
            avgConfidence: result.avgConfidence ?? null,
            resultCount: finalResults.length,
          },
        },
      });
    });

    console.log(
      `[attendance] Completed job ${mlJobId}: heads=${result.totalHeads}, detected=${result.detectedCount}, records=${finalResults.length}`
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[attendance] Job ${mlJobId} failed: ${message}`);

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
