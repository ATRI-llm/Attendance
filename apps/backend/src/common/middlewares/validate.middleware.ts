import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export const validate = (schema: any) => {
    return (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            schema.parse(req.body);
            return next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message:
                        error.issues?.[0]?.message ||
                        "Validation failed",
                    errors: error.issues,
                    data: null,
                });
            }

            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: [],
                data: null,
            });
        }
    };
};