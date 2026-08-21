import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from "./modules/auth/auth.routes";
import adminRoutes from './modules/admin/admin.routes';
import teacherRoutes from './modules/teachers/teacher.routes';
import { errorHandler } from './common/middlewares/error.middleware';
import path from "path";
import faceOnboardingRoutes from "./modules/face-onboarding/faceOnboarding.routes";
import attendanceRoutes from "./modules/attendance/attendance.routes";
import mealRoutes from "./modules/meal/meal.routes";
import modelSyncRoutes from "./modules/model-sync/modelSync.routes";

dotenv.config();

import fs from "fs";

// Initialize base models for local development/first-time setup
const initBaseModels = () => {
  const uploadsModelsSharedDir = path.join(__dirname, "../uploads/models/shared");
  const uploadsModelsDir = path.join(__dirname, "../uploads/models");
  
  fs.mkdirSync(uploadsModelsSharedDir, { recursive: true });

  const baseModels = ["Det_Retina_Net.onnx", "Rec_Mobile_Net.onnx"];
  const candidateDirs = [
    path.join(__dirname, "../../ml-worker/src/ml/attendance_system/models"),
    path.join(__dirname, "../models"),
    path.join(__dirname, "../../models"),
  ];

  baseModels.forEach((modelName) => {
    let sourcePath: string | null = null;
    for (const dir of candidateDirs) {
      const p = path.join(dir, modelName);
      if (fs.existsSync(p)) {
        sourcePath = p;
        break;
      }
    }

    if (sourcePath) {
      const destShared = path.join(uploadsModelsSharedDir, modelName);
      const destRoot = path.join(uploadsModelsDir, modelName);

      if (!fs.existsSync(destShared)) {
        console.log(`[Init] Copying base model ${modelName} to uploads/models/shared/...`);
        fs.copyFileSync(sourcePath, destShared);
      }
      if (!fs.existsSync(destRoot)) {
        fs.copyFileSync(sourcePath, destRoot);
      }
    }
  });
};

initBaseModels();

const app = express();

app.use(cors());
// Increase JSON limit to 50mb — offline sync sends base64 crop images
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api/auth", authRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api/face-onboarding", faceOnboardingRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/meal", mealRoutes);
app.use("/api/model-sync", modelSyncRoutes);

app.use(errorHandler);

app.get('/', (req, res) => {
  res.send("API is Running!");
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

