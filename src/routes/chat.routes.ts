import { Router } from "express";
import { chat, chatStream, chatStandalone } from "../controllers/chatController.js";

const router = Router();

/**
 * LLM Chat Routes
 * 
 * These routes handle LLM-powered chat.
 * Requires AWS Bedrock credentials to be configured.
 */

// Standalone chat - no MCP session required
router.post("/chat", chatStandalone);

// Chat with LLM + MCP tools (session required)
router.post("/session/:sessionId/chat", chat);

// Streaming chat (placeholder for future implementation)
router.post("/session/:sessionId/chat/stream", chatStream);

export default router;

