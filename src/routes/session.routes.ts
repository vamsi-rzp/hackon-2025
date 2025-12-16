import { Router } from "express";
import {
  connectToServer,
  getTools,
  refreshTools,
  executeTool,
  disconnectSession,
  getSession,
  listSessions,
  healthCheck,
} from "../controllers/sessionController.js";

const router = Router();

/**
 * Session Management Routes
 * 
 * These routes handle MCP server connections and tool operations.
 */

// Health check
router.get("/health", healthCheck);

// Session listing and creation
router.get("/sessions", listSessions);
router.post("/connect", connectToServer);

// Session-specific operations
router.get("/session/:sessionId", getSession);
router.get("/session/:sessionId/tools", getTools);
router.post("/session/:sessionId/tools/refresh", refreshTools);
router.post("/session/:sessionId/execute", executeTool);
router.delete("/session/:sessionId", disconnectSession);

export default router;

