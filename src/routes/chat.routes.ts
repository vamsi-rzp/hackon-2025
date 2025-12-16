import { Router } from "express";
import { chat, chatStream } from "../controllers/chatController.js";

const router = Router();

/**
 * LLM Chat Routes
 * 
 * These routes handle LLM-powered chat with tool calling.
 * Requires AWS Bedrock credentials to be configured.
 */

// Chat with LLM (with tool calling support)
router.post("/session/:sessionId/chat", chat);

// Streaming chat (placeholder for future implementation)
router.post("/session/:sessionId/chat/stream", chatStream);

export default router;

