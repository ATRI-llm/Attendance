import { api } from "../lib/api";
import { LoginResponse } from "../types/auth.types";

export const loginTeacher = async (identifier: string, password: string): Promise<LoginResponse> => {
  try {
    const response = await api.post("/auth/login", { identifier, password });
    if (!response.data?.token || !response.data?.user) {
      throw new Error("Backend returned an invalid login response.");
    }
    return response.data as LoginResponse;
  } catch (error: any) {
    if (error?.response) {
      throw new Error(error.response.data?.message || "Login failed");
    }
    if (error?.request) {
      throw new Error("Cannot connect to the backend. Check USB reverse/ADB or network settings.");
    }
    throw new Error(error?.message || "Unexpected login error");
  }
};
