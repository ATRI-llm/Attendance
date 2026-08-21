import fs from "fs";
import path from "path";
import prisma from "../../database/prisma";

export interface SectionHierarchy {
  schoolId: string;
  classValue: number | string;
  sectionName: string;
  sectionId: string;
}

/**
 * Resolves the school ID, class/standard number, and section name for a given section.
 */
export const getSectionHierarchy = async (
  sectionId: string
): Promise<SectionHierarchy> => {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: {
      standard: {
        include: {
          school: true,
        },
      },
    },
  });

  if (!section) {
    throw new Error(`Section with id ${sectionId} not found`);
  }

  return {
    schoolId: section.standard.school.id,
    classValue: section.standard.value,
    sectionName: section.name,
    sectionId: section.id,
  };
};

/**
 * Returns the base relative directory for a section:
 * schools/{schoolId}/class_{classValue}/section_{sectionName}
 */
export const getSectionBaseDir = (hierarchy: SectionHierarchy): string => {
  const sanitizedSectionName = hierarchy.sectionName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `schools/${hierarchy.schoolId}/class_${hierarchy.classValue}/section_${sanitizedSectionName}`;
};

/**
 * Formats a Date object to YYYY-MM-DD string
 */
export const formatDateFolder = (date: Date = new Date()): string => {
  return date.toISOString().split("T")[0];
};

/**
 * Saves a Multer file to the local uploads directory and returns its accessible URL.
 */
export const saveLocalFile = async (
  file: Express.Multer.File,
  relativeSubdir: string,
  customFilename?: string
): Promise<string> => {
  const uploadsRoot = path.join(__dirname, "../../../uploads");
  const targetDir = path.join(uploadsRoot, relativeSubdir);

  await fs.promises.mkdir(targetDir, { recursive: true });

  const filename = customFilename || `${Date.now()}-${file.originalname}`;
  const filePath = path.join(targetDir, filename);

  await fs.promises.writeFile(filePath, file.buffer);

  const base =
    process.env.LOCAL_UPLOAD_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || 5000}`;

  // Normalize path separators to forward slashes for URLs
  const urlPath = path.posix.join("uploads", relativeSubdir.replace(/\\/g, "/"), filename);
  const fullUrl = `${base}/${urlPath}`;

  console.log(`[LocalStorage] Saved file: ${filePath} -> ${fullUrl}`);
  return fullUrl;
};

/**
 * Saves a raw Buffer (e.g. decoded from Base64) to the local uploads directory.
 */
export const saveLocalBuffer = async (
  buffer: Buffer,
  relativeSubdir: string,
  filename: string
): Promise<string> => {
  const uploadsRoot = path.join(__dirname, "../../../uploads");
  const targetDir = path.join(uploadsRoot, relativeSubdir);

  await fs.promises.mkdir(targetDir, { recursive: true });

  const filePath = path.join(targetDir, filename);
  await fs.promises.writeFile(filePath, buffer);

  const base =
    process.env.LOCAL_UPLOAD_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || 5000}`;

  const urlPath = path.posix.join("uploads", relativeSubdir.replace(/\\/g, "/"), filename);
  const fullUrl = `${base}/${urlPath}`;

  console.log(`[LocalStorage] Saved buffer: ${filePath} -> ${fullUrl}`);
  return fullUrl;
};
