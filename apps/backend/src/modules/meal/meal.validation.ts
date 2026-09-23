import { z } from "zod";

export const createMealSessionSchema = z.object({
    sectionId: z.string().uuid(),
    latitude: z.coerce.number().finite().min(-90).max(90),
    longitude: z.coerce.number().finite().min(-180).max(180),
});
