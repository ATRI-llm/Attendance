import { Router } from "express";
import {
  createMealSession,
  getMealSession,
  finalizeMealSession,
  offlineMealSync,
} from "./meal.controller";

import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorise } from "../../common/middlewares/role.guard";
import { uploadMealImages, } from "../../common/middlewares/uploadFace.middleware";
import { validate } from "../../common/middlewares/validate.middleware";
import { createMealSessionSchema } from "./meal.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  authorise(["TEACHER"]),
  uploadMealImages.array("images", 10),
  validate(createMealSessionSchema),
  createMealSession
);

router.get(
  "/:sessionId",
  authenticate,
  authorise(["TEACHER"]),
  getMealSession
);

router.patch(
  "/:sessionId/finalize",
  authenticate,
  authorise(["TEACHER"]),
  finalizeMealSession
);

router.post(
  "/offline-sync",
  authenticate,
  authorise(["TEACHER"]),
  offlineMealSync
);

export default router;