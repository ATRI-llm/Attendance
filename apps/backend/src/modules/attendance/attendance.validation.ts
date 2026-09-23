import { z } from "zod";

export const createAttendanceSchema = z.object({
    sectionId: z.string().uuid(),
    latitude: z.coerce.number().finite().min(-90).max(90),
    longitude: z.coerce.number().finite().min(-180).max(180),
});

export const finalizeAttendanceSchema = z.object({
    attendanceSessionId: z.string().uuid(),
});

export const updateAttendanceRecordSchema = z.object({
    status: z.enum([
        "PRESENT",
        "ABSENT",
        "MANUAL",
    ]),
});