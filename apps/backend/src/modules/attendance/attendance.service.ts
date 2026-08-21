import prisma from "../../database/prisma";
import { validateGeofence }from "../../common/utils/geofence";
import { mlQueue }from "../../queues/ml.queue";
import { saveLocalFile, formatDateFolder } from "../../common/utils/localStorage";

export const createAttendanceService =async (userId: string,body: any,files: Express.Multer.File[]) => {
    const teacherSection = await prisma.teacherSection.findFirst({
        where: {
          teacher: {
            userId,
          },

          sectionId: body.sectionId,
        },

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
      });

    if (!teacherSection) {
      throw new Error("Section not assigned");
    }

    const school = teacherSection.section.standard.school;
    const standard = teacherSection.section.standard;
    const section = teacherSection.section;

    const geoResult =validateGeofence(body.latitude,body.longitude,school);

    await prisma.geofenceValidation.create({
      data: {
        teacherUserId: userId,
        validationType:"ATTENDANCE",
        latitude:Number(body.latitude),
        longitude:Number(body.longitude),
        distance:geoResult.distance,
        isWithinGeofence:geoResult.isInside,
        schoolId: school.id,
      },
    });

    if (!geoResult.isInside) {
      throw new Error("Outside school premises");
    }

    const sessionDate = new Date();
    const attendanceSession =
      await prisma.attendanceSession.create({
        data: {
          sectionId: body.sectionId,
          teacherUserId:userId,
          date: sessionDate,
          status: "PENDING",
        },
      });

    const dateFolder = formatDateFolder(sessionDate);
    const sanitizedSectionName = section.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const relativeDir = `schools/${school.id}/class_${standard.value}/section_${sanitizedSectionName}/attendance/${dateFolder}`;

    for (const file of files) {
      const imageUrl = await saveLocalFile(file, relativeDir);

      await prisma.attendanceImage.create({
        data: {
          attendanceSessionId:attendanceSession.id,
          imageUrl,
          mimeType:file.mimetype,
          fileSize:file.size,
        },
      });
    }

    const mlJob =
      await prisma.mlProcessingJob.create({
        data: {
          attendanceSessionId: attendanceSession.id,
          jobType: "ATTENDANCE_PROCESSING",
          status: "PENDING",
        },
      });

    await mlQueue.add( "ATTENDANCE_PROCESSING",
      {
        mlJobId: mlJob.id,
        attendanceSessionId:attendanceSession.id,
        sectionId:body.sectionId,
      }
    );

    return attendanceSession;
  };

export const getAttendanceSessionService = async (sessionId: string) => {
    return prisma.attendanceSession .findUnique({
        where: {
          id: sessionId,
        },

        include: {
          records: {
            include: {
              student: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });
};

export const finalizeAttendanceService =async (sessionId: string) => {
    return prisma.attendanceSession.update({
      where: {
        id: sessionId,
      },

      data: {
        status: "FINALIZED",
      },
    });
};

export const updateAttendanceRecordService =async (recordId: string,body: any) => {
    return prisma.attendanceRecord.update({
      where: {
        id: recordId,
      },

      data: {
        status: body.status,
        isManualOverride: true,
      },
    });
};


export const getAttendanceHistoryService =async (userId:string) => {
    const teacherSection = await prisma.teacherSection.findFirst({
        where:{
          teacher:{
            userId,
          },
        },
      });

    if (!teacherSection) {
      throw new Error(
        "Teacher section not found"
      );
    }

    const sessions = await prisma.attendanceSession.findMany({
        where:{
          sectionId:
            teacherSection.sectionId,
        },

        include:{
          records:true,
        },

        orderBy:{
          createdAt:"desc",
        },
      });

    return sessions.map((session) => {
      const present = session.records.filter((record) =>record.status === "PRESENT").length;

      const absent =session.records.filter((record) =>  record.status === "ABSENT").length;

      const total =present + absent;
      return {
        id:session.id,
        date:session.date,
        status:session.status,
        present,
        absent,
        attendancePercentage: total > 0? Math.round((present / total) * 100): 0,
      };
    });
};