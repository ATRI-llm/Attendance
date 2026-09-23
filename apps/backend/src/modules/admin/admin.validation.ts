import { z } from "zod";

export const createTeacherSchema = z.object({
  firstName: z.string().min(2, "First name required"),
  lastName: z.string().min(2, "Last name required"),
  mobileNumber: z.string().min(10, "Mobile number must be 10 digits").max(10, "Mobile number must be 10 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  sectionIds: z.array(z.string()).min(1, "At least one section required"),
});

export const createStudentSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  mobileNumber: z.string().regex(/^\d{10}$/, "Mobile number must be 10 digits"),
  password: z.string().min(6),
  sectionId: z.string().uuid(),
  rollNumber: z.coerce.number().int().positive(),
  dateOfBirth: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date of birth"),
  profileImage: z.string().optional(),
});


export const createSchoolSchema = z.object({
  name: z.string().min(3, "School name must be at least 3 chars"),
  address: z.string().min(5, "Address is too short"),

  district: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  contactNumber: z.string().optional(),

  latitude: z.number(),
  longitude: z.number(),
  geoRadius: z.number().positive(),
});


export const createSectionSchema = z.object({
  name: z
    .string()
    .length(1, "Section must be a single character")
    .regex(/^[A-Z]$/, "Section must be a capital letter A–Z"),
  standardId: z.string(),
});