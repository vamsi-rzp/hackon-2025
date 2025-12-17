import { Router } from "express";
import { 
  chat, 
  chatStream, 
  chatStandalone, 
  chatAggregated, 
  getAllTools,
  getPromptConfig 
} from "../controllers/chatController.js";

const router = Router();

/**
 * LLM Chat Routes
 * 
 * These routes handle LLM-powered chat.
 * Requires AWS Bedrock credentials to be configured.
 */

// Get default prompt configuration
router.get("/prompts", getPromptConfig);

// Standalone chat - no MCP session required
router.post("/chat", chatStandalone);

// Aggregated chat - uses tools from ALL connected sessions
router.post("/chat/aggregated", chatAggregated);

// Get all tools from all sessions
router.get("/tools", getAllTools);

// Chat with LLM + MCP tools (session required)
router.post("/session/:sessionId/chat", chat);

// Streaming chat (placeholder for future implementation)
router.post("/session/:sessionId/chat/stream", chatStream);

export default router;

