import prisma from "../../database/prisma";
import bcrypt from "bcrypt";
import { generateUserCode } from "../../common/utils/UserCodes";
import { Role } from "@prisma/client";

const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const createSchoolService = async (data: {
  name: string;
  address: string;
  district?: string;
  state?: string;
  pinCode?: string;
  contactNumber?: string;
  latitude: number;
  longitude: number;
  geoRadius: number;
}) => {
  return prisma.school.create({ data });
};


export const createStandardService = async (data: { name: string; schoolId: string; }) => {
  const school = await prisma.school.findUnique({
    where: {
      id: data.schoolId
    }
  });

  if (!school) {
    throw new Error("School Not Found");
  }

  const num = Number(data.name);

  if (isNaN(num)) {
    throw new Error("Standard must be a number");
  }

  const standard = await prisma.standard.create({
    data: {
      value: num,
      schoolId: data.schoolId,
    },
  });

  return standard;
}


export const getSectionsByStandardService = async (standardId: string) => {
  return prisma.section.findMany({
    where: { standardId },
    select: {
      id: true,
      name: true,
    },
  });
};

export const createSectionService = async (data: {
  name: string;
  standardId: string;
}) => {
  const standard = await prisma.standard.findUnique({
    where: { id: data.standardId },
  });

  if (!standard) {
    throw new Error("Standard not found");
  }

  const section = await prisma.section.create({
    data: {
      name: data.name,
      standardId: data.standardId,
    },
  });

  return section;
};


export const updateStandardService = async (id: string, name: string) => {
  return prisma.standard.update({
    where: { id },
    data: { value: Number(name) }
  });
};

export const deleteStandardService = async (id: string) => {
  return prisma.standard.delete({
    where: { id },
  });
};

export const updateSectionService = async (id: string, name: string) => {
  return prisma.section.update({
    where: { id },
    data: { name },
  });
};

export const deleteSectionService = async (id: string) => {
  return prisma.section.delete({
    where: { id },
  });
};


export const getSchoolsService = async () => {
  const schools = await prisma.school.findMany({
    include: {
      standards: {
        include: {
          sections: true,
        },
      },
    },
  });

  return schools;
};


export const getStandardsBySchool = async (schoolId: string) => {
  const standards = await prisma.standard.findMany({
    where: { schoolId },
    include: {
      sections: true,
    },
  });

  return standards;
};

export const deleteSchoolService = async (id: string) => {
  const school = await prisma.school.findUnique({
    where: { id },
    include: {
      standards: {
        include: {
          sections: {
            include: {
              students: true,
              teachers: true,
              attendanceSessions: true,
              mealSessions: true,
              FaceOnboardingSession: true,
              modelAssets: true,
            },
          },
        },
      },
    },
  });

  if (!school) {
    throw new Error("School not found");
  }

  const sections = school.standards.flatMap(
    (standard) => standard.sections
  );

  const studentCount = sections.reduce(
    (total, section) => total + section.students.length,
    0
  );

  const teacherAssignmentCount = sections.reduce(
    (total, section) => total + section.teachers.length,
    0
  );

  const attendanceSessionCount = sections.reduce(
    (total, section) => total + section.attendanceSessions.length,
    0
  );

  const mealSessionCount = sections.reduce(
    (total, section) => total + section.mealSessions.length,
    0
  );

  const onboardingSessionCount = sections.reduce(
    (total, section) =>
      total + section.FaceOnboardingSession.length,
    0
  );

  const modelAssetCount = sections.reduce(
    (total, section) => total + section.modelAssets.length,
    0
  );

  const hasDependentData =
    studentCount > 0 ||
    teacherAssignmentCount > 0 ||
    attendanceSessionCount > 0 ||
    mealSessionCount > 0 ||
    onboardingSessionCount > 0 ||
    modelAssetCount > 0;

  if (hasDependentData) {
    throw new Error(
      `Cannot delete school because it contains dependent data. ` +
      `Students: ${studentCount}, ` +
      `Teacher assignments: ${teacherAssignmentCount}, ` +
      `Attendance sessions: ${attendanceSessionCount}, ` +
      `Meal sessions: ${mealSessionCount}, ` +
      `Face onboarding sessions: ${onboardingSessionCount}, ` +
      `Model assets: ${modelAssetCount}. ` +
      `Remove/archive the dependent data before deleting the school.`
    );
  }

  await prisma.$transaction(async (tx) => {
    /*
     * GeofenceValidation does not currently have
     * onDelete: Cascade, so remove its history first.
     */
    await tx.geofenceValidation.deleteMany({
      where: {
        schoolId: id,
      },
    });

    /*
     * Standard -> Section uses database cascade,
     * and Section -> Standard also uses cascade.
     *
     * At this point there must be no students,
     * teacher assignments, attendance sessions,
     * meal sessions, onboarding sessions or model
     * assets preventing deletion.
     */
    await tx.school.delete({
      where: {
        id,
      },
    });
  });

  return true;
};

export const updateSchoolService = async (
  id: string,
  data: {
    name: string;
    address: string;
    district?: string;
    state?: string;
    pinCode?: string;
    contactNumber?: string;
    latitude: number;
    longitude: number;
    geoRadius: number;
  }
) => {
  const school = await prisma.school.findUnique({
    where: { id },
  });

  if (!school) {
    throw new Error("School not found");
  }

  const updated = await prisma.school.update({
    where: { id },
    data,
  });

  return updated;
};


// teacher section

export const createTeacherService = async (data: {
  firstName: string;
  lastName: string;
  mobileNumber: string;
  password: string;
  sectionIds: string[];
}) => {

  const existingUser = await prisma.user.findFirst({
    where: { mobileNumber: data.mobileNumber },
  });

  if (existingUser) {
    throw new Error("User with this mobile number already exists");
  }

  const sections = await prisma.section.findMany({
    where: {
      id: { in: data.sectionIds },
    },
  });

  if (sections.length !== data.sectionIds.length) {
    throw new Error("One or more sections are invalid");
  }

  const count = await prisma.user.count({
    where: { role: "TEACHER" },
  });

  const userCode = generateUserCode("TEACHER", count);

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const teacher = await prisma.teacher.create({
    data: {
      user: {
        create: {
          userCode,
          role: "TEACHER",
          firstName: data.firstName,
          lastName: data.lastName,
          mobileNumber: data.mobileNumber,
          passwordHash: hashedPassword,
          status: "ACTIVE",
        },
      },
      sections: {
        create: data.sectionIds.map((sectionId) => ({
          sectionId,
        })),
      },
    },
    include: {
      user: true,
      sections: true,
    },
  });

  return teacher;
};


export const getTeachersService = async (query: {
  page?: number;
  limit?: number;
  search?: string;
}) => {
  const page = query.page || 1;
  const limit = query.limit || 10;
  const skip = (page - 1) * limit;

  const whereCondition: any = query.search
    ? {
      user: {
        OR: [
          { firstName: { contains: query.search, mode: "insensitive" } },
          { lastName: { contains: query.search, mode: "insensitive" } },
          { userCode: { contains: query.search, mode: "insensitive" } },
        ],
      },
    }
    : {};

  const [teachers, total] = await Promise.all([
    prisma.teacher.findMany({
      where: whereCondition,
      skip,
      take: limit,
      include: {
        user: true,
        sections: {
          include: {
            section: {
              include: {
                standard: {
                  include: {
                    school: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.teacher.count({ where: whereCondition }),
  ]);

  return {
    teachers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};


export const getTeacherById = async (id: string) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: {
      user: true,
      sections: {
        include: {
          section: true,
        },
      },
    },
  });

  if (!teacher) throw new Error("Teacher not found");

  return teacher;
};


export const updateTeacherService = async (id: string, data: any) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id },
  });

  if (!teacher) throw new Error("Teacher not found");

  if (data.mobileNumber) {
    const conflictingUser = await prisma.user.findFirst({
      where: { mobileNumber: data.mobileNumber, NOT: { id: teacher.userId } },
    });
    if (conflictingUser) throw new Error("User with this mobile number already exists");
  }

  // update user fields
  await prisma.user.update({
    where: { id: teacher.userId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      mobileNumber: data.mobileNumber,
      ...(data.password && {
        passwordHash: await hashPassword(data.password),
      }),
    },
  });

  // delete old sections
  await prisma.teacherSection.deleteMany({
    where: { teacherId: id },
  });

  // add new sections
  await prisma.teacherSection.createMany({
    data: data.sectionIds.map((sectionId: string) => ({
      teacherId: id,
      sectionId,
    })),
  });

  return { success: true };
};


export const deleteTeacherService = async (id: string) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id },
  });

  if (!teacher) throw new Error("Teacher not found");


  await prisma.teacherSection.deleteMany({
    where: { teacherId: id },
  });

  await prisma.teacher.delete({
    where: { id },
  });

  await prisma.user.delete({
    where: { id: teacher.userId },
  });

  return true;
};



// studetn handling
export const createStudentService = async (data: {
  firstName: string;
  lastName: string;
  mobileNumber: string;
  password: string;
  sectionId: string;
  rollNumber: number;
  dateOfBirth: string;
  profileImage?: string;
}) => {

  const section = await prisma.section.findUnique({
    where: { id: data.sectionId },
  });

  if (!section) {
    throw new Error("Section not found");
  }

  const existingUser = await prisma.user.findFirst({
    where: { mobileNumber: data.mobileNumber },
  });
  if (existingUser) {
    throw new Error("User with this mobile number already exists");
  }

  const existingStudent = await prisma.student.findFirst({
    where: {
      sectionId: data.sectionId,
      rollNumber: Number(data.rollNumber),
    },
  });

  if (existingStudent) {
    throw new Error("Roll number already exists in this section");
  }

  const count = await prisma.user.count({
    where: { role: "STUDENT" },
  });

  const userCode = generateUserCode("STUDENT", count);

  const hashedPassword = await bcrypt.hash(data.password, 10);


  const student = await prisma.student.create({
    data: {
      user: {
        create: {
          userCode,
          role: "STUDENT",
          firstName: data.firstName,
          lastName: data.lastName,
          mobileNumber: data.mobileNumber,
          passwordHash: hashedPassword,
          status: "ACTIVE",
        },
      },

      section: {
        connect: {
          id: data.sectionId,
        },
      },

      rollNumber: Number(data.rollNumber),

      dateOfBirth: new Date(data.dateOfBirth),

      profileImage: data.profileImage,
    },

    include: {
      user: true,
      section: true,
    },
  });

  return student;
};


export const getStudentsService = async (query: {
  page?: number;
  limit?: number;
  search?: string;
  sectionId?: string;
  faceStatus?: string;
}) => {
  const page = query.page || 1;
  const limit = query.limit || 10;
  const skip = (page - 1) * limit;

  const whereCondition: any = {};

  if (query.sectionId) {
    whereCondition.sectionId = query.sectionId;
  }

  if (query.faceStatus) {
    whereCondition.faceStatus = query.faceStatus;
  }

  if (query.search) {
    whereCondition.user = {
      OR: [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { userCode: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where: whereCondition,
      skip,
      take: limit,
      include: {
        user: true,
        section: {
          include: {
            standard: {
              include: {
                school: true,
              },
            },
          },
        },
      }
    }),
    prisma.student.count({ where: whereCondition }),
  ]);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};


export const getStudentById = async (id: string) => {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      user: true,
      section: true,
    },
  });

  if (!student) throw new Error("Student not found");

  return student;
};


export const updateStudentService = async (id: string, data: any) => {
  const existingStudent = await prisma.student.findUnique({ where: { id } });
  if (!existingStudent) throw new Error("Student not found");

  if (data.mobileNumber) {
    const conflictingUser = await prisma.user.findFirst({
      where: { mobileNumber: data.mobileNumber, NOT: { id: existingStudent.userId } },
    });
    if (conflictingUser) throw new Error("User with this mobile number already exists");
  }

  const updated = await prisma.student.update({
    where: { id },

    data: {
      ...(data.rollNumber !== undefined && { rollNumber: Number(data.rollNumber), }),

      ...(data.sectionId && {
        section: {
          connect: { id: data.sectionId },
        },
      }),

      ...(data.dateOfBirth && {
        dateOfBirth: new Date(data.dateOfBirth),
      }),

      ...(data.profileImage && {
        profileImage: data.profileImage,
      }),

      user: {
        update: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.mobileNumber && { mobileNumber: data.mobileNumber }),

          ...(data.password && {
            passwordHash: await bcrypt.hash(data.password, 10),
          }),
        },
      },
    },

    include: {
      user: true,
      section: {
        include: {
          standard: {
            include: {
              school: true,
            },
          },
        },
      },
    },
  });

  return updated;
};


export const deleteStudentService = async (id: string) => {
  const student = await prisma.student.findUnique({
    where: { id },
  });

  if (!student) throw new Error("Student not found");

  await prisma.student.delete({
    where: { id },
  });

  return true;
};


export const getAllSchoolsService = async () => {
  return prisma.school.findMany({
    select: {
      id: true,
      name: true,
    },
  });
};


export const getDashboardStatsService = async () => {
  const [students, teachers, schools, sections, standards, added, pending, rescan] = await Promise.all([
    prisma.student.count(),
    prisma.teacher.count(),
    prisma.school.count(),
    prisma.section.count(),
    prisma.standard.count(),
    prisma.student.count({ where: { faceStatus: "ADDED" } }),
    prisma.student.count({ where: { faceStatus: "PENDING" } }),
    prisma.student.count({ where: { faceStatus: "RESCAN" } }),
  ]);

  return {
    totalStudents: students,
    totalTeachers: teachers,
    totalSchools: schools,
    totalSections: sections,
    totalStandards: standards,
    faceStatus: { added, pending, rescan },
  };
};


// update face status
export const updateFaceStatusService = async (
  studentId: string,
  faceStatus: "NOT_ADDED" | "PENDING" | "ADDED" | "RESCAN"
) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
  });

  if (!student) throw new Error("Student not found");

  return prisma.student.update({
    where: { id: studentId },
    data: { faceStatus },
  });
};