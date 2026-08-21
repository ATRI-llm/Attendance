import prisma from "../../database/prisma";

export interface RegisterModelAssetInput {
  sectionId: string;
  backboneVersion: string;
  classifierVersion: string;
  backboneUrl: string;
  classifierUrl: string;
  labelMap?: Record<string, number>;  // roll_str -> class_id (stored as description audit)
  description?: string;
}

// ─────────────────────────────────────────────────────────────────
// registerModelAssetService
// Called by the Python training pipeline (via POST /model-sync/register-asset)
// after a new classifier ONNX is uploaded to S3.
// Marks the new model as active and deactivates all previous models for this section.
// ─────────────────────────────────────────────────────────────────
export const registerModelAssetService = async (
  input: RegisterModelAssetInput
) => {
  const {
    sectionId,
    backboneVersion,
    classifierVersion,
    backboneUrl,
    classifierUrl,
    labelMap,
    description,
  } = input;

  // Verify section exists
  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) {
    throw new Error(`Section not found: ${sectionId}`);
  }

  // Deactivate all existing models for this section
  await prisma.modelAsset.updateMany({
    where: { sectionId, isActive: true },
    data: { isActive: false },
  });

  // Build description string including label map audit
  const auditDescription = [
    description ?? "",
    labelMap
      ? `LabelMap: ${JSON.stringify(labelMap)}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  // Create new active model asset
  const asset = await prisma.modelAsset.create({
    data: {
      sectionId,
      backboneVersion,
      classifierVersion,
      backboneUrl,
      classifierUrl,
      isActive: true,
      trainedAt: new Date(),
      description: auditDescription || undefined,
    },
  });

  console.log(
    `[ModelSync] Registered new model asset ${asset.id} ` +
    `for section ${sectionId} (${classifierVersion})`
  );

  return {
    id: asset.id,
    sectionId: asset.sectionId,
    backboneVersion: asset.backboneVersion,
    classifierVersion: asset.classifierVersion,
    backboneUrl: asset.backboneUrl,
    classifierUrl: asset.classifierUrl,
    isActive: asset.isActive,
    trainedAt: asset.trainedAt,
  };
};

export const getActiveModelAssetService = async (
  userId: string,
  sectionId: string
) => {
  // Verify the teacher is assigned to this section
  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: { userId },
      sectionId,
    },
  });

  if (!teacherSection) {
    throw new Error("Section not assigned to this teacher");
  }

  const asset = await prisma.modelAsset.findFirst({
    where: { sectionId, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!asset) {
    return null; // No model registered yet — app should warn teacher
  }

  return {
    id: asset.id,
    backboneVersion: asset.backboneVersion,
    classifierVersion: asset.classifierVersion,
    backboneUrl: asset.backboneUrl,
    classifierUrl: asset.classifierUrl,
    trainedAt: asset.trainedAt,
    description: asset.description,
  };
};

// ─────────────────────────────────────────────────────────────────
// getSectionEmbeddingsService
// Returns all students in the section with their stored 512-dim
// MobileFaceNet embedding vectors. Teacher app syncs these locally
// (SQLite) so the on-device NN classifier can run offline.
//
// Each student may have multiple embeddings (one per onboarding
// photo). The app receives all of them.
// ─────────────────────────────────────────────────────────────────
export const getSectionEmbeddingsService = async (
  userId: string,
  sectionId: string
) => {
  // Verify the teacher is assigned to this section
  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: { userId },
      sectionId,
    },
  });

  if (!teacherSection) {
    throw new Error("Section not assigned to this teacher");
  }

  const students = await prisma.student.findMany({
    where: { sectionId },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      faceEmbeddings: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { rollNumber: "asc" },
  });

  // Only include students who have at least one embedding (onboarding done)
  const studentsWithEmbeddings = students.filter(
    (s) => s.faceEmbeddings.length > 0
  );

  return {
    sectionId,
    totalStudents: students.length,
    readyStudents: studentsWithEmbeddings.length,
    students: studentsWithEmbeddings.map((s) => ({
      studentId: s.id,
      rollNumber: s.rollNumber,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      faceStatus: s.faceStatus,
      // All 512-dim embedding vectors for this student.
      // App stores these locally and the on-device classifier
      // uses them for inference.
      embeddingVectors: s.faceEmbeddings.map((e) => ({
        id: e.id,
        embedding: e.embedding, // 512-dim array (Json in DB)
        modelVersion: e.modelVersion,
        createdAt: e.createdAt,
      })),
    })),
  };
};

import { mlQueue } from "../../queues/ml.queue";

export const triggerTrainingService = async (sectionId: string, userId: string, role: string) => {
  if (role === "TEACHER") {
    const teacherSection = await prisma.teacherSection.findFirst({
      where: { teacher: { userId }, sectionId },
    });
    if (!teacherSection) {
      throw new Error("Section not assigned to this teacher");
    }
  }

  const job = await prisma.mlProcessingJob.create({
    data: {
      jobType: "TRAIN_CLASSIFIER",
      status: "PENDING",
      sectionId,
    },
  });

  await mlQueue.add("TRAIN_CLASSIFIER", {
    type: "TRAIN_CLASSIFIER",
    mlJobId: job.id,
    sectionId,
    version: "v1",
  });

  return { jobId: job.id, message: "Classifier training job enqueued" };
};
