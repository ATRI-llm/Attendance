import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import authRoutes from "./modules/auth/auth.routes";
import adminRoutes from "./modules/admin/admin.routes";
import teacherRoutes from "./modules/teachers/teacher.routes";
import faceOnboardingRoutes from "./modules/face-onboarding/faceOnboarding.routes";
import attendanceRoutes from "./modules/attendance/attendance.routes";
import mealRoutes from "./modules/meal/meal.routes";
import modelSyncRoutes from "./modules/model-sync/modelSync.routes";

import { errorHandler } from "./common/middlewares/error.middleware";
import {
  initializeStorage,
  getStorageRoot,
} from "./common/utils/storage";

dotenv.config();

const app = express();

/*
 * ------------------------------------------------------------
 * BODY PARSING
 * ------------------------------------------------------------
 */

app.use(cors());

app.use(
  express.json({
    limit: "50mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

/*
 * ------------------------------------------------------------
 * LOCAL STORAGE PATHS
 * ------------------------------------------------------------
 */

const storageRoot = getStorageRoot();

const storageUploadsPath = path.resolve(
  storageRoot,
  "uploads"
);

const storageModelsPath = path.resolve(
  storageRoot,
  "models"
);

/*
 * ------------------------------------------------------------
 * PUBLIC STORAGE ROUTES
 * ------------------------------------------------------------
 *
 * /uploads/... -> storage/uploads/...
 *
 * /models/...  -> storage/models/...
 *
 * We intentionally do NOT expose:
 *
 *   storage/artifacts
 *   storage/output
 *   storage/temp
 */

app.use(
  "/uploads",
  express.static(storageUploadsPath)
);

app.use(
  "/models",
  express.static(storageModelsPath)
);

/*
 * ------------------------------------------------------------
 * API ROUTES
 * ------------------------------------------------------------
 */

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/teacher",
  teacherRoutes
);

app.use(
  "/api/face-onboarding",
  faceOnboardingRoutes
);

app.use(
  "/api/attendance",
  attendanceRoutes
);

app.use(
  "/api/meal",
  mealRoutes
);

app.use(
  "/api/model-sync",
  modelSyncRoutes
);

/*
 * ------------------------------------------------------------
 * ROOT / HEALTH
 * ------------------------------------------------------------
 */

app.get("/", (_req, res) => {
  res.status(200).send(
    "API is Running!"
  );
});

/*
 * ------------------------------------------------------------
 * ERROR HANDLER
 * ------------------------------------------------------------
 */

app.use(errorHandler);

/*
 * ------------------------------------------------------------
 * START SERVER
 * ------------------------------------------------------------
 *
 * Storage must be initialized before accepting requests.
 * ------------------------------------------------------------
 */

const PORT =
  Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await initializeStorage();

    console.log(
      `[Storage] Initialized at: ${getStorageRoot()}`
    );

    console.log(
      `[Storage] Uploads served from: ${storageUploadsPath}`
    );

    console.log(
      `[Storage] Models served from: ${storageModelsPath}`
    );

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `Server running on port ${PORT}`
        );
      }
    );
  } catch (error) {
    console.error(
      "[Storage] Failed to initialize storage:",
      error
    );

    process.exit(1);
  }
};

startServer();