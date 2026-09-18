import {
  saveMulterFile,
  generateStorageFilename,
  getPublicUrl,
} from "./storage";

/**
 * Local shared-storage upload helper.
 *
 * IMPORTANT:
 * This helper stores uploaded files in local shared storage.
 * so any remaining callers can continue compiling while
 * we migrate them one by one.
 *
 * Files are stored directly in the shared local storage directory.
 *
 * This compatibility wrapper can be deleted later once
 * every caller has been changed to use StorageService directly.
 */
export const saveUploadedFile = async (
  file: Express.Multer.File,
  folder: string
): Promise<string> => {
  if (!file) {
    throw new Error("Uploaded file is required");
  }

  if (!folder) {
    throw new Error("Storage folder is required");
  }

  const filename =
    generateStorageFilename(
      file.originalname
    );

  const storageKey =
    `uploads/${folder}/${filename}`;

  await saveMulterFile(
    file,
    storageKey
  );

  return getPublicUrl(
    storageKey
  );
};

