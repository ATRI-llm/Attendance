import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error(err);

    if (err instanceof ZodError) {
        const message =
            err.issues?.[0]?.message || "Validation failed";

        return res.status(400).json({
            success: false,
            message,
            data: null,
        });
    }

    return res.status(500).json({
        success: false,
        message:
            err?.message || "Internal Server Error",
        data: null,
    });
};