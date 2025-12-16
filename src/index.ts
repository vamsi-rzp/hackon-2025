import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import routes from "./routes/index.js";
import { mcpClientManager } from "./services/McpClientManager.js";
import type { ErrorResponse } from "./types/index.js";

// Configuration
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

// Create Express application
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// CORS middleware (permissive for development)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

// Handle preflight requests
app.options("*", (_req: Request, res: Response) => {
  res.sendStatus(204);
});

// API routes
app.use("/api", routes);

// Root endpoint
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Universal MCP Gateway Service",
    version: "1.0.0",
    description: "A RESTful intermediary for connecting to remote MCP Servers via SSE",
    endpoints: {
      health: "GET /api/health",
      connect: "POST /api/connect",
      sessions: "GET /api/sessions",
      session: "GET /api/session/:sessionId",
      tools: "GET /api/session/:sessionId/tools",
      refreshTools: "POST /api/session/:sessionId/tools/refresh",
      execute: "POST /api/session/:sessionId/execute",
      disconnect: "DELETE /api/session/:sessionId",
    },
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  const response: ErrorResponse = {
    error: "Not Found",
    code: "NOT_FOUND",
  };
  res.status(404).json(response);
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err);
  
  const response: ErrorResponse = {
    error: err.message || "Internal Server Error",
    code: "INTERNAL_ERROR",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined,
  };
  
  res.status(500).json(response);
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Disconnect all MCP sessions
    await mcpClientManager.disconnectAll();
    console.log("[Shutdown] All sessions disconnected");
    
    // Exit process
    console.log("[Shutdown] Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[Shutdown] Error during shutdown:", error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("[Fatal] Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Fatal] Unhandled Rejection at:", promise, "reason:", reason);
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Universal MCP Gateway Service                       ║
╠══════════════════════════════════════════════════════════════╣
║  Server running at: http://${HOST}:${PORT.toString().padEnd(27)}║
║  Environment: ${(process.env.NODE_ENV ?? "development").padEnd(45)}║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    POST   /api/connect              Connect to MCP server    ║
║    GET    /api/sessions             List active sessions     ║
║    GET    /api/session/:id          Get session info         ║
║    GET    /api/session/:id/tools    List available tools     ║
║    POST   /api/session/:id/execute  Execute a tool           ║
║    DELETE /api/session/:id          Disconnect session       ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Handle server errors
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[Error] Port ${PORT} is already in use`);
  } else {
    console.error("[Error] Server error:", error);
  }
  process.exit(1);
});

export default app;

