import { z } from "zod";

export const createOnboardingSchema = z.object({
  studentId: z.string().uuid(),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
});