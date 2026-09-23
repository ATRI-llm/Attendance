
import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorise } from "../../common/middlewares/role.guard";
import { uploadFaceImages } from "../../common/middlewares/uploadFace.middleware";
import { createFaceOnboarding } from "./faceOnboarding.controller";
import { validate } from "../../common/middlewares/validate.middleware";
import { createOnboardingSchema } from "./faceOnboarding.validation";

const router = Router();

router.post("/", authenticate, authorise(["TEACHER"]), uploadFaceImages.array("images", 10), validate(createOnboardingSchema), createFaceOnboarding);

export default router;


