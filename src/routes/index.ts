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
import { chat, chatStream } from "../controllers/chatController.js";

const router = Router();

// Health check
router.get("/health", healthCheck);

// Session management
router.get("/sessions", listSessions);
router.post("/connect", connectToServer);

// Session-specific endpoints
router.get("/session/:sessionId", getSession);
router.get("/session/:sessionId/tools", getTools);
router.post("/session/:sessionId/tools/refresh", refreshTools);
router.post("/session/:sessionId/execute", executeTool);
router.delete("/session/:sessionId", disconnectSession);

// LLM-powered chat endpoints (requires AWS Bedrock)
router.post("/session/:sessionId/chat", chat);
router.post("/session/:sessionId/chat/stream", chatStream);

export default router;

