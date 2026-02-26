import type { Request, Response, NextFunction } from "express";
import type { ZodType, ZodError } from "zod";

export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = (result.error as ZodError).issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({ error: "Validation error", details });
      return;
    }
    req.body = result.data;
    next();
  };
}
