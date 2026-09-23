import crypto from "crypto";

export const generateUserCode = (
  role: string,
  _count?: number
): string => {
  const prefix =
    role === "ADMIN"
      ? "ADM"
      : role === "TEACHER"
        ? "TCH"
        : role === "STUDENT"
          ? "STU"
          : "USR";

  const timestamp = Date.now().toString(36).toUpperCase();

  const random = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  return `${prefix}_${timestamp}_${random}`;
};