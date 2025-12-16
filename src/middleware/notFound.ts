import type { Request, Response } from "express";
import type { ErrorResponse } from "../types/index.js";

/**
 * 404 Not Found handler
 * Catches all unmatched routes
 */
export function notFoundHandler(_req: Request, res: Response): void {
  const response: ErrorResponse = {
    error: "Not Found",
    code: "NOT_FOUND",
  };
  res.status(404).json(response);
}

