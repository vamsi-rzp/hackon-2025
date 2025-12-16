import type { Request, Response, NextFunction } from "express";

/**
 * Request logging middleware
 * Logs all incoming requests with timestamp, method, and path
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
}

