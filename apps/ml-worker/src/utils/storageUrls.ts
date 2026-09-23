const getBackendBaseUrl = (): string => {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.BACKEND_BASE_URL ||
    process.env.BACKEND_URL?.replace(/\/api\/?$/, "") ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");
};

/**
 * Convert stored upload references into URLs that the ML service can access.
 *
 * PUBLIC_BASE_URL should point to a hostname reachable from the ML service.
 * In Docker Compose this should normally be the backend's public/reverse-proxy
 * URL rather than the internal hostname `backend` when the URL will also be
 * exposed to phones or other clients.
 */
export async function resolveImageUrls(urls: string[]): Promise<string[]> {
  const baseUrl = getBackendBaseUrl();

  return urls.map((value) => {
    if (!value) return value;

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");

    if (normalized.startsWith("uploads/")) {
      return `${baseUrl}/${normalized}`;
    }

    return `${baseUrl}/uploads/${normalized}`;
  });
}
