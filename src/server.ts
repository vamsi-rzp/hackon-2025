import type { Express } from "express";
import { config } from "./config/index.js";
import { mcpClientManager } from "./services/McpClientManager.js";
import { presetManager } from "./services/PresetManager.js";

/**
 * Start the HTTP server and set up lifecycle handlers
 */
export function startServer(app: Express) {
  const { port, host, env } = config.server;

  const server = app.listen(port, host, async () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Universal MCP Gateway Service                       ║
╠══════════════════════════════════════════════════════════════╣
║  Server running at: http://${host}:${port.toString().padEnd(27)}║
║  Environment: ${env.padEnd(45)}║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    POST   /api/connect              Connect to MCP server    ║
║    GET    /api/sessions             List active sessions     ║
║    GET    /api/presets              List MCP presets         ║
║    POST   /api/presets/:id/connect  Connect to preset        ║
║    POST   /api/session/:id/execute  Execute a tool           ║
║    POST   /api/session/:id/chat     Chat with LLM            ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Auto-connect to configured presets
    await presetManager.autoConnectPresets();
  });

  // Handle server errors
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[Error] Port ${port} is already in use`);
    } else {
      console.error("[Error] Server error:", error);
    }
    process.exit(1);
  });

  // Set up graceful shutdown
  setupGracefulShutdown(server);

  return server;
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(server: ReturnType<Express["listen"]>) {
  async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

    try {
      // Close server to stop accepting new connections
      server.close();

      // Disconnect all MCP sessions
      await mcpClientManager.disconnectAll();
      console.log("[Shutdown] All sessions disconnected");

      console.log("[Shutdown] Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[Shutdown] Error during shutdown:", error);
      process.exit(1);
    }
  }

  // Register signal handlers
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
}

