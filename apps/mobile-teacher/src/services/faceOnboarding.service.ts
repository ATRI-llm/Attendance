import { api } from "@/src/lib/api";

export const uploadFaceImages = async (formData: FormData) => {
  // Do not manually set multipart Content-Type. React Native/axios must add the boundary.
  const response = await api.post("/face-onboarding", formData, {
    // Axios/React Native will set the multipart boundary automatically.
  });
  return response.data;
};
