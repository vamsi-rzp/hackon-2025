import type { Request, Response, NextFunction } from "express";
import type { ErrorResponse } from "../types/index.js";
import { config } from "../config/index.js";

/**
 * Global error handler middleware
 * Catches all errors and returns a standardized error response
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[Error]", err);

  const response: ErrorResponse = {
    error: err.message || "Internal Server Error",
    code: "INTERNAL_ERROR",
    details: config.features.enableDetailedErrors ? err.stack : undefined,
  };

  res.status(500).json(response);
}

