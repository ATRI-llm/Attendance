import multer from "multer";

const commonConfig = {
  storage: multer.memoryStorage(),

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

export const uploadFaceImages =
  multer(commonConfig);

export const uploadAttendanceImages =
  multer(commonConfig);

export const uploadMealImages =
  multer(commonConfig);