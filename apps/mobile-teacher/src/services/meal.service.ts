import { api } from "@/src/lib/api";

export const startMealSession = async (formData: FormData) => {
  return api.post("/meal", formData, {
    // Axios/React Native will set the multipart boundary automatically.
  });
};

export const getMealSession = async (sessionId: string) => api.get(`/meal/${sessionId}`);

export const finalizeMealSession = async (sessionId: string) => api.patch(`/meal/${sessionId}/finalize`);
