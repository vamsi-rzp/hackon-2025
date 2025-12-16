import type { Request, Response, NextFunction } from "express";

/**
 * CORS middleware - Permissive for development
 * Configure appropriately for production
 */
export function corsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
}

/**
 * Handle preflight OPTIONS requests
 */
export function preflightHandler(_req: Request, res: Response): void {
  res.sendStatus(204);
}

