
import prisma from "../../database/prisma";
import { mlQueue } from "../../queues/ml.queue";

export interface RegisterModelAssetInput {
  sectionId: string;
  backboneVersion: string;
  classifierVersion: string;
  backboneUrl: string;
  classifierUrl: string;
  labelMap?: Record<string, number>;
  description?: string;
}

/**
 * Convert a local model storage key or backend model URL
 * into a URL served by the backend.
 *
 * Supported storage keys:
 *
 *   models/shared/Rec_Mobile_Net.onnx
 *   models/shared/Det_Retina_Net.onnx
 *   models/sections/<sectionId>/<version>/model.onnx
 *
 * Physical files live under:
 *
 *   <project-root>/storage/models/
 *
 * and are exposed by the backend at:
 *
 *   /models/...
 */
const getLocalModelUrl = (value: string): string => {
  if (!value) {
    return value;
  }

  const baseUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.LOCAL_UPLOAD_BASE_URL ||
    process.env.BACKEND_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || 5000}`;

  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

  /*
   * Already a backend model URL.
   */
  if (value.includes("/models/")) {
    const modelsIndex = value.indexOf("/models/");
    const key = value
      .substring(modelsIndex + 1)
      .replace(/^\/+/, "");

    return `${cleanBaseUrl}/${key}`;
  }

  /*
   * Already a backend upload URL from the local-storage
   * implementation.
   */
  if (value.includes("/uploads/models/")) {
    const modelsIndex = value.indexOf("/uploads/models/");
    const key = value
      .substring(modelsIndex + "/uploads/".length)
      .replace(/^\/+/, "");

    return `${cleanBaseUrl}/${key}`;
  }

  /*
   * Local storage key.
   *
   * Example:
   *
   *   models/shared/Rec_Mobile_Net.onnx
   */
  if (
    !value.startsWith("http://") &&
    !value.startsWith("https://") &&
    !value.startsWith("/")
  ) {
    const normalized = value
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    if (normalized.startsWith("models/")) {
      return `${cleanBaseUrl}/${normalized}`;
    }

    return `${cleanBaseUrl}/models/${normalized}`;
  }

  /*
   * Absolute URLs and root-relative paths are returned unchanged.
   */
  return value;
};

/**
 * Register a newly trained model.
 *
 * The training pipeline provides local model storage keys.
 * The new model becomes active for the section and all
 * previous active models are deactivated.
 */
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

  /*
   * Verify section exists.
   */
  const section = await prisma.section.findUnique({
    where: {
      id: sectionId,
    },
  });

  if (!section) {
    throw new Error(`Section not found: ${sectionId}`);
  }

  /*
   * Deactivate existing active models.
   */
  await prisma.modelAsset.updateMany({
    where: {
      sectionId,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });

  /*
   * Keep label-map audit information.
   */
  const auditDescription = [
    description ?? "",
    labelMap
      ? `LabelMap: ${JSON.stringify(labelMap)}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  /*
   * Store local model references.
   */
  const asset = await prisma.modelAsset.create({
    data: {
      sectionId,
      backboneVersion,
      classifierVersion,
      backboneUrl: getLocalModelUrl(backboneUrl),
      classifierUrl: getLocalModelUrl(classifierUrl),
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
    backboneUrl: getLocalModelUrl(asset.backboneUrl),
    classifierUrl: getLocalModelUrl(asset.classifierUrl),
    isActive: asset.isActive,
    trainedAt: asset.trainedAt,
    description: asset.description,
  };
};

/**
 * Return the currently active model for a section.
 *
 * The teacher app receives backend URLs pointing to
 * locally stored model files.
 */
export const getActiveModelAssetService = async (
  userId: string,
  sectionId: string
) => {
  /*
   * Verify the teacher is assigned to this section.
   */
  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: {
        userId,
      },
      sectionId,
    },
  });

  if (!teacherSection) {
    throw new Error("Section not assigned to this teacher");
  }

  /*
   * Find active model.
   */
  const asset = await prisma.modelAsset.findFirst({
    where: {
      sectionId,
      isActive: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!asset) {
    return null;
  }

  return {
    id: asset.id,
    backboneVersion: asset.backboneVersion,
    classifierVersion: asset.classifierVersion,
    backboneUrl: getLocalModelUrl(asset.backboneUrl),
    classifierUrl: getLocalModelUrl(asset.classifierUrl),
    trainedAt: asset.trainedAt,
    description: asset.description,
  };
};

/**
 * Return all students and their stored face embeddings
 * for offline teacher-side inference.
 *
 * Each student may have multiple embeddings, one per
 * onboarding photo and/or verified attendance crop.
 */
export const getSectionEmbeddingsService = async (
  userId: string,
  sectionId: string
) => {
  /*
   * Verify teacher assignment.
   */
  const teacherSection = await prisma.teacherSection.findFirst({
    where: {
      teacher: {
        userId,
      },
      sectionId,
    },
  });

  if (!teacherSection) {
    throw new Error("Section not assigned to this teacher");
  }

  /*
   * Get students and all face embeddings.
   */
  const students = await prisma.student.findMany({
    where: {
      sectionId,
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      faceEmbeddings: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      rollNumber: "asc",
    },
  });

  /*
   * Only students with at least one embedding
   * are ready for offline inference.
   */
  const studentsWithEmbeddings = students.filter(
    (student) => student.faceEmbeddings.length > 0
  );

  return {
    sectionId,
    totalStudents: students.length,
    readyStudents: studentsWithEmbeddings.length,

    students: studentsWithEmbeddings.map((student) => ({
      studentId: student.id,
      rollNumber: student.rollNumber,
      firstName: student.user.firstName,
      lastName: student.user.lastName,
      faceStatus: student.faceStatus,

      embeddingVectors: student.faceEmbeddings.map(
        (embedding) => ({
          id: embedding.id,
          embedding: embedding.embedding,
          modelVersion: embedding.modelVersion,
          createdAt: embedding.createdAt,
        })
      ),
    })),
  };
};

/**
 * Queue classifier training for a section.
 */
export const triggerTrainingService = async (
  sectionId: string,
  userId: string,
  role: string
) => {
  /*
   * Teachers can only train their own sections.
   * Admins are allowed through the route authorization.
   */
  if (role === "TEACHER") {
    const teacherSection = await prisma.teacherSection.findFirst({
      where: {
        teacher: {
          userId,
        },
        sectionId,
      },
    });

    if (!teacherSection) {
      throw new Error("Section not assigned to this teacher");
    }
  }

  /*
   * Create the ML processing job.
   */
  const job = await prisma.mlProcessingJob.create({
    data: {
      jobType: "TRAIN_CLASSIFIER",
      status: "PENDING",
      sectionId,
    },
  });

  /*
   * Enqueue classifier training.
   */
  await mlQueue.add("TRAIN_CLASSIFIER", {
    type: "TRAIN_CLASSIFIER",
    mlJobId: job.id,
    sectionId,
    version: "v1",
  });

  return {
    jobId: job.id,
    message: "Classifier training job enqueued",
  };
};