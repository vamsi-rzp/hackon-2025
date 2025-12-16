import express, { type Request, type Response } from "express";
import routes from "./routes/index.js";
import {
  corsMiddleware,
  preflightHandler,
  requestLogger,
  errorHandler,
  notFoundHandler,
} from "./middleware/index.js";
import { config } from "./config/index.js";

/**
 * Create and configure Express application
 */
export function createApp() {
  const app = express();

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  if (config.features.enableRequestLogging) {
    app.use(requestLogger);
  }

  // CORS
  app.use(corsMiddleware);
  app.options("*", preflightHandler);

  // API routes
  app.use("/api", routes);

  // Root endpoint - API info
  app.get("/", (_req: Request, res: Response) => {
    res.json({
      name: "Universal MCP Gateway Service",
      version: "1.0.0",
      description: "A RESTful intermediary for connecting to remote MCP Servers via SSE",
      endpoints: {
        // Health
        health: "GET /api/health",
        // Presets (pre-configured servers)
        presets: "GET /api/presets",
        preset: "GET /api/presets/:presetId",
        connectPreset: "POST /api/presets/:presetId/connect",
        disconnectPreset: "POST /api/presets/:presetId/disconnect",
        connectAllPresets: "POST /api/presets/connect-all",
        // Dynamic connections
        connect: "POST /api/connect",
        sessions: "GET /api/sessions",
        session: "GET /api/session/:sessionId",
        tools: "GET /api/session/:sessionId/tools",
        refreshTools: "POST /api/session/:sessionId/tools/refresh",
        execute: "POST /api/session/:sessionId/execute",
        chat: "POST /api/session/:sessionId/chat",
        disconnect: "DELETE /api/session/:sessionId",
      },
    });
  });

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

