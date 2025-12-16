import type { Request, Response, NextFunction } from "express";
import { mcpClientManager, McpError } from "../services/McpClientManager.js";
import { bedrockService, type ChatMessage, type ToolCall, type ToolResult } from "../services/BedrockService.js";
import type { ErrorResponse } from "../types/index.js";

/**
 * Request body for chat endpoint
 */
interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  systemPrompt?: string;
}

/**
 * Response from chat endpoint
 */
interface ChatResponseBody {
  reply: string;
  toolsUsed?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
    executionTime: number;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Helper to send error responses
 */
function sendError(
  res: Response,
  message: string,
  code: string,
  statusCode: number = 500
): void {
  const errorResponse: ErrorResponse = { error: message, code };
  res.status(statusCode).json(errorResponse);
}

/**
 * POST /api/session/:sessionId/chat
 * 
 * LLM-powered chat endpoint that intelligently uses MCP tools
 * based on natural language input.
 */
export async function chat(
  req: Request<{ sessionId: string }, ChatResponseBody | ErrorResponse, ChatRequest>,
  res: Response<ChatResponseBody | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { message, history = [], systemPrompt } = req.body;

    // Validate inputs
    if (!sessionId) {
      sendError(res, "sessionId is required", "INVALID_REQUEST", 400);
      return;
    }

    if (!message || typeof message !== "string") {
      sendError(res, "message is required and must be a string", "INVALID_REQUEST", 400);
      return;
    }

    console.log(`[ChatController] Chat request for session ${sessionId}: "${message.slice(0, 50)}..."`);

    // Get available tools for this session
    const tools = mcpClientManager.getTools(sessionId);

    // Call LLM with tools
    const llmResponse = await bedrockService.chat(message, history, tools, systemPrompt);

    const toolsUsed: ChatResponseBody["toolsUsed"] = [];

    // If LLM wants to use tools, execute them
    if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
      console.log(`[ChatController] LLM requested ${llmResponse.toolCalls.length} tool call(s)`);

      const toolResults: ToolResult[] = [];

      for (const toolCall of llmResponse.toolCalls) {
        console.log(`[ChatController] Executing tool: ${toolCall.toolName}`);
        const startTime = Date.now();

        try {
          const result = await mcpClientManager.callTool(
            sessionId,
            toolCall.toolName,
            toolCall.arguments
          );

          const executionTime = Date.now() - startTime;

          toolResults.push({
            toolUseId: toolCall.toolUseId,
            result: result.content,
            isError: false,
          });

          toolsUsed.push({
            name: toolCall.toolName,
            arguments: toolCall.arguments,
            result: result.content,
            executionTime,
          });

          console.log(`[ChatController] Tool ${toolCall.toolName} executed in ${executionTime}ms`);
        } catch (error) {
          console.error(`[ChatController] Tool ${toolCall.toolName} failed:`, error);

          toolResults.push({
            toolUseId: toolCall.toolUseId,
            result: error instanceof Error ? error.message : "Tool execution failed",
            isError: true,
          });

          toolsUsed.push({
            name: toolCall.toolName,
            arguments: toolCall.arguments,
            result: { error: error instanceof Error ? error.message : "Unknown error" },
            executionTime: Date.now() - startTime,
          });
        }
      }

      // Continue conversation with tool results
      const finalResponse = await bedrockService.continueWithToolResults(
        history,
        message,
        llmResponse.toolCalls,
        toolResults,
        tools,
        systemPrompt
      );

      // Check if LLM wants to call more tools (recursive tool calling)
      // For simplicity, we'll limit to one round of tool calls
      const response: ChatResponseBody = {
        reply: finalResponse.message,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        usage: finalResponse.usage,
      };

      res.json(response);
    } else {
      // No tool calls, return LLM response directly
      const response: ChatResponseBody = {
        reply: llmResponse.message,
        usage: llmResponse.usage,
      };

      res.json(response);
    }
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode);
      return;
    }

    console.error("[ChatController] Error:", error);

    if (error instanceof Error && error.message.includes("Bedrock")) {
      sendError(res, error.message, "BEDROCK_ERROR", 503);
      return;
    }

    next(error);
  }
}

/**
 * POST /api/session/:sessionId/chat/stream
 * 
 * Streaming version of chat (placeholder for future implementation)
 */
export async function chatStream(
  req: Request<{ sessionId: string }>,
  res: Response,
  _next: NextFunction
): Promise<void> {
  res.status(501).json({
    error: "Streaming not yet implemented",
    code: "NOT_IMPLEMENTED",
  });
}

