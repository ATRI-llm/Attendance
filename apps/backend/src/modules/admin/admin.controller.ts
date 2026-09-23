
import { Request, Response } from "express";
import { createStudentSchema } from "./admin.validation";
import { saveMulterFile, generateStorageFilename, getPublicUrl } from "../../common/utils/storage";
import { createSchoolService, createStandardService, createSectionService, getSchoolsService, getStandardsBySchool, createTeacherService, createStudentService, getTeachersService, getStudentsService, getTeacherById, getStudentById, updateStudentService, updateTeacherService, deleteStudentService, deleteTeacherService, getAllSchoolsService, getSectionsByStandardService, getDashboardStatsService, updateFaceStatusService, deleteSchoolService, updateSchoolService, deleteSectionService, deleteStandardService, updateSectionService, updateStandardService } from "./admin.service";


export const createSchool = async (req: Request, res: Response) => {
  try {
    const {
      name,
      address,
      district,
      state,
      pinCode,
      contactNumber,
      latitude,
      longitude,
      geoRadius,
    } = req.body;

    const school = await createSchoolService({
      name,
      address,
      district,
      state,
      pinCode,
      contactNumber,
      latitude,
      longitude,
      geoRadius,
    });

    return res.status(201).json({
      success: true,
      message: "School created",
      data: school,
    });;
  }
  catch (error: any) {
    res.status(400).json({ message: error.message });
  }

}

export const getAllSchools = async (req: Request, res: Response) => {
  const schools = await getAllSchoolsService();

  return res.status(200).json({
    success: true,
    message: "Schools fetched successfully",
    data: schools,
  });
};

export const createStandard = async (req: Request, res: Response) => {
  try {
    const standard = await createStandardService(req.body);

    return res.json({
      success: true,
      message: "Standard created",
      data: standard,
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(400).json({
        success: false,
        message: "Standard already exists in this school",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
}


export const deleteSchool = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    await deleteSchoolService(id);

    return res.status(200).json({
      success: true,
      message: "School deleted successfully",
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


export const updateSchool = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const updated = await updateSchoolService(id, req.body);

    return res.status(200).json({
      success: true,
      message: "School updated successfully",
      data: updated,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


export const getSectionsByStandard = async (req: Request, res: Response) => {
  const sections = await getSectionsByStandardService(
    req.params.standardId as string
  );

  return res.status(200).json({
    success: true,
    message: "Sections fetched successfully",
    data: sections,
  });
};

export const createSection = async (req: Request, res: Response) => {
  try {
    const section = await createSectionService(req.body);

    return res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: section,
    });
  } catch (error: any) {

    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        message: "Section already exists in this standard",
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};


export const getSchools = async (req: Request, res: Response) => {
  try {
    const schools = await getSchoolsService();

    return res.status(200).json({
      success: true,
      message: "Schools fetched successfully",
      data: schools,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};



export const getStandards = async (req: Request, res: Response) => {
  try {
    const schoolId = req.params.schoolId as string;

    const standards = await getStandardsBySchool(schoolId);

    return res.status(200).json({
      success: true,
      message: "Standards fetched successfully",
      data: standards,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};



export const updateStandard = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;

    const standard = await updateStandardService(id, name);

    return res.json({
      success: true,
      message: "Standard updated",
      data: standard,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: "Update failed",
    });
  }
};

export const deleteStandard = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    await deleteStandardService(id);

    return res.json({
      success: true,
      message: "Standard deleted",
    });
  } catch {
    return res.status(400).json({
      success: false,
      message: "Delete failed",
    });
  }
};

export const updateSection = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;

    const section = await updateSectionService(id, name);

    return res.json({
      success: true,
      message: "Section updated",
      data: section,
    });
  } catch {
    return res.status(400).json({
      success: false,
      message: "Update failed",
    });
  }
};

export const deleteSection = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    await deleteSectionService(id);

    return res.json({
      success: true,
      message: "Section deleted",
    });
  } catch {
    return res.status(400).json({
      success: false,
      message: "Delete failed",
    });
  }
};

// teacher section

export const createTeacher = async (req: Request, res: Response) => {
  try {
    const teacher = await createTeacherService(req.body);

    return res.status(201).json({
      success: true,
      message: "Teacher created successfully",
      data: teacher,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};

export const getTeachers = async (req: Request, res: Response) => {
  const { page, limit, search } = req.query;

  const result = await getTeachersService({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
  });

  return res.status(200).json({
    success: true,
    message: "Teacher fetched successfully!",
    data: result,
  })
}

export const getTeacher = async (req: Request, res: Response) => {
  const teacher = await getTeacherById(req.params.id as string);

  return res.status(200).json({
    success: true,
    mesaage: "Teacher fetched successfully!",
    data: teacher,
  })

}

export const updateTeacher = async (req: Request, res: Response) => {
  try {
    const updated = await updateTeacherService(
      req.params.id as string,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Teacher updated successfully",
      data: updated,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update teacher",
      data: null,
    });
  }
};

export const deleteTeacher = async (req: Request, res: Response) => {
  await deleteTeacherService(req.params.id as string);

  return res.status(200).json({
    success: true,
    message: "Teacher deleted successfully",
    data: null,
  });
};



export const createStudent = async (req: Request, res: Response) => {
  try {
    // const student = await createStudentService(req.body);
    const parsed = createStudentSchema.parse({
      ...req.body,
      rollNumber: Number(req.body.rollNumber),
    });

    let profileImage: string | undefined;
    if (req.file) {
      const storageKey = `uploads/students/${parsed.sectionId}/${generateStorageFilename(req.file.originalname)}`;
      await saveMulterFile(req.file, storageKey);
      profileImage = getPublicUrl(storageKey);
    }

    const student = await createStudentService({
      ...parsed,
      profileImage,
    });

    return res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: student,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};


export const getStudents = async (req: Request, res: Response) => {
  const { page, limit, search, sectionId } = req.query;

  const result = await getStudentsService({
    page: Number(page),
    limit: Number(limit),
    search: search as string,
    sectionId: sectionId as string,
  });

  return res.status(200).json({
    success: true,
    message: "Students fetched successfully",
    data: result,
  });
};

export const getStudent = async (req: Request, res: Response) => {
  const student = await getStudentById(req.params.id as string);

  return res.status(200).json({
    success: true,
    message: "Student fetched successfully",
    data: student,
  });
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    let profileImage: string | undefined;
    if (req.file) {
      const storageKey = `uploads/students/${req.params.id}/${generateStorageFilename(req.file.originalname)}`;
      await saveMulterFile(req.file, storageKey);
      profileImage = getPublicUrl(storageKey);
    }

    const updated = await updateStudentService(
      req.params.id as string,
      {
        ...req.body,
        rollNumber: req.body.rollNumber ? Number(req.body.rollNumber) : undefined,
        profileImage,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Student updated successfully",
      data: updated,
    });
  } catch (error: any) {

    return res.status(400).json({
      success: false,
      message: error.message || "Update failed",
    });
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  await deleteStudentService(req.params.id as string);

  return res.status(200).json({
    success: true,
    message: "Student deleted successfully",
    data: null,
  });
};


export const getDashboardStats = async (req: Request, res: Response) => {
  const stats = await getDashboardStatsService();

  return res.status(200).json({
    success: true,
    message: "Dashboard stats fetched successfully",
    data: stats,
  });
};


export const updateFaceStatus = async (req: Request, res: Response) => {
  const { faceStatus } = req.body;

  const updated = await updateFaceStatusService(
    req.params.id as string,
    faceStatus
  );

  return res.status(200).json({
    success: true,
    message: "Face status updated successfully",
    data: updated,
  });
};


