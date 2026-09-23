import { Router } from "express";
import { createSchool, createStandard, createSection, getSchools, getStandards, createStudent, createTeacher, getTeacher, getTeachers, getStudent, getStudents, updateStudent, updateTeacher, deleteStudent, deleteTeacher, getAllSchools, getSectionsByStandard, getDashboardStats, updateFaceStatus, deleteSchool, updateSchool, updateSection, updateStandard, deleteSection, deleteStandard } from "./admin.controller";
import { authenticate } from "../../common/middlewares/auth.middleware";
import { authorise } from "../../common/middlewares/role.guard";
import { validate } from "../../common/middlewares/validate.middleware";
import { createTeacherSchema, createStudentSchema, createSchoolSchema, createSectionSchema } from "./admin.validation";
import { uploadStudentImage } from "../../common/middlewares/upload.middleware";

const router = Router();

router.post('/schools', authenticate, authorise(["ADMIN"]), validate(createSchoolSchema), createSchool);
router.get("/schools-list", authenticate, authorise(["ADMIN"]), getAllSchools);
router.post('/standards', authenticate, authorise(["ADMIN"]), createStandard);
router.get("/standards/:standardId/sections", authenticate, authorise(["ADMIN"]), getSectionsByStandard);
router.post("/sections", authenticate, authorise(["ADMIN"]), validate(createSectionSchema), createSection);

router.put("/standards/:id", authenticate, authorise(["ADMIN"]), updateStandard);
router.delete("/standards/:id", authenticate, authorise(["ADMIN"]), deleteStandard);
router.put("/sections/:id", authenticate, authorise(["ADMIN"]), updateSection);
router.delete("/sections/:id", authenticate, authorise(["ADMIN"]), deleteSection);

router.get("/schools", authenticate, authorise(["ADMIN"]), getSchools);
router.get("/schools/:schoolId/standards", authenticate, authorise(["ADMIN"]), getStandards);

router.put("/schools/:id", authenticate, authorise(["ADMIN"]), updateSchool);
router.delete("/schools/:id", authenticate, authorise(["ADMIN"]), deleteSchool);

router.post("/teachers", authenticate, authorise(["ADMIN"]), validate(createTeacherSchema), createTeacher);
// router.post("/students",authenticate, authorise(["ADMIN"]),validate(createStudentSchema),createStudent);
router.post(
  "/students",
  authenticate,
  authorise(["ADMIN"]),
  uploadStudentImage.single("profileImage"),
  validate(createStudentSchema),
  createStudent
);

router.get("/teachers", authenticate, authorise(["ADMIN"]), getTeachers);
router.get("/students", authenticate, authorise(["ADMIN"]), getStudents);
router.get("/teachers/:id", authenticate, authorise(["ADMIN"]), getTeacher);
router.get("/students/:id", authenticate, authorise(["ADMIN"]), getStudent);


// router.put("/students/:id",authenticate,authorise(["ADMIN"]),updateStudent);
router.put(
  "/students/:id",
  authenticate,
  authorise(["ADMIN"]),
  uploadStudentImage.single("profileImage"),
  updateStudent
);

router.put("/teachers/:id", authenticate, authorise(["ADMIN"]), updateTeacher);

// DELETE
router.delete("/students/:id", authenticate, authorise(["ADMIN"]), deleteStudent);
router.delete("/teachers/:id", authenticate, authorise(["ADMIN"]), deleteTeacher);

// dashboard stats
router.get("/dashboard", authenticate, authorise(["ADMIN"]), getDashboardStats);

// update face statsu
router.patch("/students/:id/face-status", authenticate, authorise(["ADMIN"]), updateFaceStatus);

export default router;