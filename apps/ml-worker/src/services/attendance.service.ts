import prisma from "../config/prisma";
import axios from "axios";
import { resolveImageUrls } from "../utils/storageUrls";

const ML_URL = process.env.MODEL_URL || "http://localhost:8000";

export const processAttendanceJob = async (data: any) => {
    console.log("Attendance Processing:", data);

    await prisma.mlProcessingJob.update({
        where: { id: data.mlJobId },
        data: { status: "PROCESSING", startedAt: new Date() }
    });

    try {
        // Step 1: Fetch attendance images
        const images = await prisma.attendanceImage.findMany({
            where: { attendanceSessionId: data.attendanceSessionId }
        });

        // Step 2: Fetch all stored embeddings for this section's students
        const students = await prisma.student.findMany({
            where: { sectionId: data.sectionId },
            include: { faceEmbeddings: true }
        });

        // Build embedding list for ML API
        const studentEmbeddings: any[] = [];
        for (const student of students) {
            for (const emb of student.faceEmbeddings) {
                studentEmbeddings.push({
                    studentId: student.id,
                    embedding: emb.embedding   // JSON array from DB
                });
            }
        }

        if (studentEmbeddings.length === 0) {
            throw new Error("No student embeddings found for this section");
        }

        // Step 3: Call Python ML API
        const imageUrls = await resolveImageUrls(images.map((img) => img.imageUrl));

        const mlResponse = await axios.post(`${ML_URL}/attendance`, {
            attendanceSessionId: data.attendanceSessionId,
            sectionId: data.sectionId,
            imageUrls: imageUrls,
            studentEmbeddings: studentEmbeddings
        }, { timeout: 120000 });

        const result = mlResponse.data;
        console.log(`Detected: ${result.detectedCount}, Absent: ${result.absentCount}, Heads: ${result.totalHeads}`);

        // Step 4: Create attendance records
        for (const rec of result.results) {
            await prisma.attendanceRecord.create({
                data: {
                    attendanceSessionId: data.attendanceSessionId,
                    studentId: rec.studentId || undefined,
                    status: rec.status as any,
                    confidenceScore: rec.confidence
                }
            });
        }

        // Step 5: Update session
        await prisma.attendanceSession.update({
            where: { id: data.attendanceSessionId },
            data: {
                status: "PROCESSED",
                confidenceScore: result.avgConfidence
            }
        });

        // Step 6: Complete job
        await prisma.mlProcessingJob.update({
            where: { id: data.mlJobId },
            data: {
                status: "COMPLETED",
                completedAt: new Date(),
                responsePayload: {
                    totalHeads: result.totalHeads,
                    detectedCount: result.detectedCount,
                    absentCount: result.absentCount,
                    avgConfidence: result.avgConfidence
                }
            }
        });

    } catch (error: any) {
        console.error("Attendance failed:", error.message);

        await prisma.attendanceSession.update({
            where: { id: data.attendanceSessionId },
            data: { status: "PROCESSED" }
        });

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


