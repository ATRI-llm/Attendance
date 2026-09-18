import { Request, Response } from "express";
import {
  getActiveModelAssetService,
  getSectionEmbeddingsService,
  registerModelAssetService,
  triggerTrainingService,
  RegisterModelAssetInput,
} from "./modelSync.service";

// GET /api/model-sync/assets/:sectionId
// Returns the currently active model (backbone + classifier) metadata
// for the given section. Teacher app downloads the model files
// using the returned URLs.
export const getActiveModelAsset = async (req: any, res: Response) => {
  try {
    const { sectionId } = req.params;
    const data = await getActiveModelAssetService(req.user.userId, sectionId);

    if (!data) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No active model found for this section yet.",
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("[modelSync.controller] getActiveModelAsset error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

// GET /api/model-sync/embeddings/:sectionId
// Returns all students in the section with their stored 512-dim
// MobileFaceNet embeddings. Teacher app syncs this at login / on
// model update so offline inference has all reference vectors.
export const getSectionEmbeddings = async (req: any, res: Response) => {
  try {
    const { sectionId } = req.params;
    const data = await getSectionEmbeddingsService(req.user.userId, sectionId);

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
// POST /api/model-sync/register-asset
// Called by the Python training pipeline after a new classifier ONNX is
// stored in shared local storage. Marks the new model as active for the section.
// Requires ADMIN role (enforced in route).
export const registerModelAsset = async (req: any, res: Response) => {
  try {
    const input: RegisterModelAssetInput = req.body;

    if (
      !input.sectionId ||
      !input.backboneVersion ||
      !input.classifierVersion ||
      !input.backboneUrl ||
      !input.classifierUrl
    ) {
      return res.status(400).json({
        success: false,
        message:
          "sectionId, backboneVersion, classifierVersion, backboneUrl, and classifierUrl are required",
      });
    }

    const data = await registerModelAssetService(input);
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const triggerTraining = async (req: any, res: Response) => {
  try {
    const { sectionId } = req.params;
    const data = await triggerTrainingService(sectionId, req.user.userId, req.user.role);
    return res.status(202).json({ success: true, data });
  } catch (error: any) {
    console.error("[modelSync.controller] triggerTraining error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

