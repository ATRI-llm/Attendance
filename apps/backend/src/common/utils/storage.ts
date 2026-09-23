
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Server-side local storage service.
 *
 * Storage layout:
 *
 * project-root/
 * └── storage/
 *     ├── uploads/
 *     ├── models/
 *     ├── artifacts/
 *     ├── output/
 *     └── temp/
 *
 * Docker:
 *   STORAGE_ROOT=/app/storage
 *
 * Local development:
 *   STORAGE_ROOT=./storage
 *
 * IMPORTANT:
 * The database should store storage keys such as:
 *
 *   uploads/face-onboarding/<studentId>/<sessionId>/<file>.jpg
 *
 * It should NOT store absolute filesystem paths.
 */

const DEFAULT_STORAGE_ROOT = path.resolve(
  __dirname,
  "../../../../storage"
);

const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT
);

/**
 * Convert a storage key into a safe relative path.
 *
 * This prevents paths such as:
 *   ../../something
 * from escaping the storage root.
 */
const normalizeStorageKey = (storageKey: string): string => {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("Storage key is required");
  }

  // Storage keys always use forward slashes.
  const normalized = storageKey
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  const resolved = path.resolve(STORAGE_ROOT, normalized);

  const relative = path.relative(STORAGE_ROOT, resolved);

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Invalid storage key");
  }

  return normalized;
};

/**
 * Get the absolute filesystem path for a storage key.
 */
export const getStoragePath = (
  storageKey: string
): string => {
  const safeKey = normalizeStorageKey(storageKey);

  return path.join(
    STORAGE_ROOT,
    ...safeKey.split("/")
  );
};

/**
 * Make sure a directory exists.
 */
export const ensureStorageDirectory = async (
  directory: string
): Promise<void> => {
  await fs.mkdir(directory, {
    recursive: true,
  });
};

/**
 * Save a Buffer to local storage.
 *
 * Returns the storage key, NOT an HTTP URL.
 */
export const saveBuffer = async (
  storageKey: string,
  buffer: Buffer
): Promise<string> => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("A Buffer is required");
  }

  const safeKey = normalizeStorageKey(storageKey);
  const absolutePath = getStoragePath(safeKey);

  await ensureStorageDirectory(
    path.dirname(absolutePath)
  );

  await fs.writeFile(
    absolutePath,
    buffer
  );

  return safeKey;
};

/**
 * Save a Multer uploaded file.
 *
 * Returns the storage key.
 */
export const saveMulterFile = async (
  file: Express.Multer.File,
  storageKey: string
): Promise<string> => {
  if (!file) {
    throw new Error("Uploaded file is required");
  }

  return saveBuffer(
    storageKey,
    file.buffer
  );
};

/**
 * Read a stored file.
 */
export const readFile = async (
  storageKey: string
): Promise<Buffer> => {
  const absolutePath = getStoragePath(storageKey);

  return fs.readFile(absolutePath);
};

/**
 * Check whether a stored file exists.
 */
export const fileExists = async (
  storageKey: string
): Promise<boolean> => {
  try {
    const absolutePath = getStoragePath(storageKey);

    await fs.access(absolutePath);

    return true;
  } catch {
    return false;
  }
};

/**
 * Delete a stored file.
 */
export const deleteFile = async (
  storageKey: string
): Promise<void> => {
  const absolutePath = getStoragePath(storageKey);

  try {
    await fs.unlink(absolutePath);
  } catch (error: any) {
    // Ignore "file does not exist".
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
};

/**
 * Generate a unique filename.
 *
 * Example:
 *   20260918-550e8400-e29b-41d4-a716-446655440000.jpg
 */
export const generateStorageFilename = (
  originalName?: string
): string => {
  const extension = originalName
    ? path.extname(originalName).toLowerCase()
    : "";

  const safeExtension =
    /^[.][a-z0-9]{1,10}$/.test(extension)
      ? extension
      : "";

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const uuid = crypto.randomUUID();

  return `${timestamp}-${uuid}${safeExtension}`;
};

/**
 * Build a public HTTP URL for a stored file.
 *
 * Example:
 *
 * storage key:
 *   uploads/attendance/abc/original/photo.jpg
 *
 * public URL:
 *   http://localhost:5000/uploads/attendance/abc/original/photo.jpg
 *
 * The actual /uploads route will be implemented separately
 * in the backend.
 */
export const getPublicUrl = (
  storageKey: string
): string => {
  const safeKey = normalizeStorageKey(storageKey);

  const baseUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.LOCAL_UPLOAD_BASE_URL ||
    process.env.BACKEND_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || 5000}`;

  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

  const encodedPath = safeKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${cleanBaseUrl}/uploads/${encodedPath}`;
};

/**
 * Return the configured storage root.
 *
 * Useful for startup logs and diagnostics.
 */
export const getStorageRoot = (): string => {
  return STORAGE_ROOT;
};

/**
 * Create the standard storage directories.
 *
 * Safe to call multiple times.
 */
export const initializeStorage = async (): Promise<void> => {
  const directories = [
    "uploads/face-onboarding",
    "uploads/attendance",
    "uploads/meals",

    "models/shared",
    "models/sections",

    "artifacts/sections",

    "output/attendance",
    "output/meal",

    "temp/onboarding",
    "temp/attendance",
    "temp/meal",
    "temp/training",
  ];

  await Promise.all(
    directories.map((directory) =>
      ensureStorageDirectory(
        path.join(
          STORAGE_ROOT,
          ...directory.split("/")
        )
      )
    )
  );

  console.log(
    `[Storage] Storage root: ${STORAGE_ROOT}`
  );
};


