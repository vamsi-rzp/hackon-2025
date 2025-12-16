import type { Response } from "express";
import type { ErrorResponse } from "../types/index.js";

/**
 * Send a standardized error response
 */
export function sendError(
  res: Response,
  message: string,
  code: string,
  statusCode: number = 500,
  details?: unknown
): void {
  const errorResponse: ErrorResponse = { error: message, code, details };
  res.status(statusCode).json(errorResponse);
}

/**
 * Send a success response with data
 */
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json(data);
}

