const getBackendBaseUrl = (): string => {
  return (
    process.env.BACKEND_BASE_URL ||
    process.env.BACKEND_URL?.replace(/\/api\/?$/, "") ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");
};

/**
 * Convert stored local storage references into URLs
 * that the Python ML service can access.
 *
 * No cloud signing is required; files are served from local shared storage.
 */
export async function resolveImageUrls(
  urls: string[]
): Promise<string[]> {
  const baseUrl = getBackendBaseUrl();

  return urls.map((value) => {
    if (!value) {
      return value;
    }

    // Already a complete URL.
    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    const normalized = value
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    if (normalized.startsWith("uploads/")) {
      return `${baseUrl}/${normalized}`;
    }

    return `${baseUrl}/uploads/${normalized}`;
  });
}
