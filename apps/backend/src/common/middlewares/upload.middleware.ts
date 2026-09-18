import multer from "multer";

/*
 * All uploaded files are kept in memory first.
 *
 * The individual services decide where the file should be
 * stored using the centralized StorageService.
 *
 * Uploads are stored in local shared storage.
 */

const storage = multer.memoryStorage();

const commonConfig = {
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Only JPG, JPEG and PNG images are allowed"
        )
      );
    }

    cb(null, true);
  },
};

export const uploadStudentImage =
  multer(commonConfig);
