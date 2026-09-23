import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorise } from "../../common/middlewares/role.guard";
import {
  getActiveModelAsset,
  getSectionEmbeddings,
  registerModelAsset,
  triggerTraining,
} from "./modelSync.controller";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/model-sync/assets/:sectionId
// Returns active model (backbone + classifier) metadata + download URLs
router.get("/assets/:sectionId", getActiveModelAsset);

// GET /api/model-sync/embeddings/:sectionId
// Returns all students with their stored 512-dim
// MobileFaceNet embeddings. Teacher app syncs this at login / on
// model update so offline inference has all reference vectors.
router.get("/embeddings/:sectionId", getSectionEmbeddings);

// POST /api/model-sync/register-asset  (ADMIN only)
// Called by the Python training pipeline after training completes.
// Uploads the new ONNX model metadata and marks it active for the section.
router.post(
  "/register-asset",
  authorise(["ADMIN"]),
  registerModelAsset
);

// POST /api/model-sync/train/:sectionId
// Trigger ML classifier training for a section
router.post("/train/:sectionId", authorise(["ADMIN", "TEACHER"]), triggerTraining);

export default router;