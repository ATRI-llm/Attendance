import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;

interface JwtUserPayload extends jwt.JwtPayload {
    userId: string;
    role: string;
    teacherId?: string;
    studentId?: string;
    schoolId?: string;
}

const isJwtUserPayload = (
    value: string | jwt.JwtPayload
): value is JwtUserPayload => {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof value.userId === "string" &&
        typeof value.role === "string"
    );
};

export const authenticate = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "No Token Provided",
        });
    }

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Invalid token format",
        });
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
        return res.status(401).json({
            message: "Invalid token format",
        });
    }

    // Internal service authentication uses a dedicated token.
    // Never accept JWT_SECRET itself as a bearer token.
    if (BACKEND_TOKEN && token === BACKEND_TOKEN) {
        req.user = {
            userId: "system-ml",
            role: "ADMIN",
        };

        return next();
    }

    try {
        if (!JWT_SECRET) {
            return res.status(500).json({
                message: "JWT secret is not configured",
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        if (!isJwtUserPayload(decoded)) {
            return res.status(401).json({
                message: "Invalid Token",
            });
        }

        req.user = {
            userId: decoded.userId,
            role: decoded.role,
            ...(decoded.teacherId
                ? { teacherId: decoded.teacherId }
                : {}),
            ...(decoded.studentId
                ? { studentId: decoded.studentId }
                : {}),
            ...(decoded.schoolId
                ? { schoolId: decoded.schoolId }
                : {}),
        };

        return next();
    } catch {
        return res.status(401).json({
            message: "Invalid Token",
        });
    }
};