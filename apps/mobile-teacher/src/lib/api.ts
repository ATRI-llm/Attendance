import axios from "axios";
import { getToken } from "./storage";

const rawApiUrl =
  process.env.EXPO_PUBLIC_API_URL?.trim() || "http://127.0.0.1:5000/api";

export const API_URL = rawApiUrl.replace(/\/+$/, "");

export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export const toMobileUrl = (value: string): string => {
  if (!value) return value;

  // Backend may return Docker-internal URLs such as http://backend:5000/models/...
  // Mobile must always use the host/API origin reachable from the phone.
  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/models/") || parsed.pathname.startsWith("/uploads/")) {
      return `${API_ORIGIN}${parsed.pathname}${parsed.search}`;
    }
    if (parsed.hostname === "backend" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return `${API_ORIGIN}${parsed.pathname}${parsed.search}`;
    }
    return value;
  } catch {
    const normalized = value.replace(/^\/+/, "");
    if (normalized.startsWith("models/") || normalized.startsWith("uploads/")) {
      return `${API_ORIGIN}/${normalized}`;
    }
    return `${API_ORIGIN}/${normalized}`;
  }
};

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Network request failed";

    if (error?.response?.status === 401) {
      console.warn("[API] Unauthorized response:", message);
    }

    return Promise.reject(error);
  }
);
