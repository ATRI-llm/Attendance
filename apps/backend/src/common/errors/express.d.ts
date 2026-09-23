import "express";
import type { Request } from "express";

export interface AuthUser {
  userId: string;
  role: string;
  teacherId?: string;
  studentId?: string;
  schoolId?: string;
}

export type AuthRequest = Request;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export { };