import { Request, Response } from "express";
import {
  createMealSessionService,
  getMealSessionService,
  finalizeMealSessionService,
  offlineMealSyncService,
} from "./meal.service";

export const createMealSession = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await createMealSessionService(
      req.user!.userId,
      req.body,
      req.files as Express.Multer.File[]
    );

    return res.status(201).json({
      success: true,
      message: "Meal session started",
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getMealSession = async (
  req: Request,
  res: Response
) => {
  try {
    const sessionId = req.params.sessionId as string;

    const data = await getMealSessionService(
      req.user!.userId,
      sessionId
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const finalizeMealSession = async (
  req: Request,
  res: Response
) => {
  try {
    const sessionId = req.params.sessionId as string;

    const data = await finalizeMealSessionService(
      req.user!.userId,
      sessionId
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const offlineMealSync = async (
  req: Request,
  res: Response
) => {
  try {
    const payload = req.body;

    if (
      !payload.sectionId ||
      !payload.date ||
      payload.totalDetected === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "sectionId, date, and totalDetected are required",
      });
    }

    const data = await offlineMealSyncService(
      req.user!.userId,
      payload
    );

    return res.status(201).json({
      success: true,
      message: "Offline meal synced successfully",
      data,
    });
  } catch (error: any) {
    console.error(
      "[offlineMealSync] Error:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};