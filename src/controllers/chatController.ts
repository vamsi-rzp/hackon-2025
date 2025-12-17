import type { Request, Response, NextFunction } from "express";
import { mcpClientManager, McpError } from "../services/McpClientManager.js";
import { bedrockService, type ToolCall, type ToolResult, type ChatOptions } from "../services/BedrockService.js";
import type { ErrorResponse, ChatRequest, ChatResponseBody, ChatMessage, PromptOptions } from "../types/index.js";
import { sendError } from "../utils/index.js";
import { config } from "../config/index.js";

/**
 * Convert API prompt options to BedrockService ChatOptions
 */
function buildChatOptions(promptOptions?: PromptOptions, legacySystemPrompt?: string): ChatOptions {
  return {
    systemPrompt: promptOptions?.systemPrompt ?? legacySystemPrompt,
    toolResultPrompt: promptOptions?.toolResultPrompt,
    temperature: promptOptions?.temperature,
    maxTokens: promptOptions?.maxTokens,
  };
}

/**
 * POST /api/chat
 * 
 * Standalone LLM chat endpoint - no MCP session required.
 * Pure conversation with the LLM without tool calling.
 */
export async function chatStandalone(
  req: Request<object, ChatResponseBody | ErrorResponse, ChatRequest>,
  res: Response<ChatResponseBody | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { message, history = [], promptOptions, systemPrompt } = req.body;

    if (!message || typeof message !== "string") {
      sendError(res, "message is required and must be a string", "INVALID_REQUEST", 400);
      return;
    }

    console.log(`[ChatController] Standalone chat request: "${message.slice(0, 50)}..."`);

    // Build chat options from prompt config
    const chatOptions = buildChatOptions(promptOptions, systemPrompt);
    // Use standalone prompt as default for no-tools chat
    if (!chatOptions.systemPrompt) {
      chatOptions.systemPrompt = config.prompts.standalonePrompt;
    }

    // Call LLM without tools
    const llmResponse = await bedrockService.chat(
      message, 
      history as ChatMessage[], 
      undefined, // No tools
      chatOptions
    );

    res.json({
      reply: llmResponse.message,
      usage: llmResponse.usage,
    });
  } catch (error) {
    console.error("[ChatController] Standalone chat error:", error);

    if (error instanceof Error && error.message.includes("Bedrock")) {
      sendError(res, error.message, "BEDROCK_ERROR", 503);
      return;
    }

    next(error);
  }
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
    const { message, history = [], promptOptions, systemPrompt } = req.body;

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

    // Build chat options from prompt config
    const chatOptions = buildChatOptions(promptOptions, systemPrompt);

    // Get available tools for this session
    const tools = mcpClientManager.getTools(sessionId);

    // Call LLM with tools
    const llmResponse = await bedrockService.chat(message, history as ChatMessage[], tools, chatOptions);

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
        history as ChatMessage[],
        message,
        llmResponse.toolCalls,
        toolResults,
        tools,
        chatOptions
      );

      res.json({
        reply: finalResponse.message,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        usage: finalResponse.usage,
      });
    } else {
      // No tool calls, return LLM response directly
      res.json({
        reply: llmResponse.message,
        usage: llmResponse.usage,
      });
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
 * POST /api/chat/aggregated
 * 
 * LLM chat with tools aggregated from ALL connected MCP sessions.
 * Automatically routes tool calls to the correct session.
 * Supports multi-step tool chaining (agentic loop).
 */
export async function chatAggregated(
  req: Request<object, ChatResponseBody | ErrorResponse, ChatRequest>,
  res: Response<ChatResponseBody | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  const MAX_TOOL_ITERATIONS = 10; // Safety limit to prevent infinite loops

  try {
    const { message, history = [], promptOptions, systemPrompt } = req.body;

    if (!message || typeof message !== "string") {
      sendError(res, "message is required and must be a string", "INVALID_REQUEST", 400);
      return;
    }

    // Build chat options from prompt config
    const chatOptions = buildChatOptions(promptOptions, systemPrompt);

    // Get ALL tools from ALL connected sessions
    const allTools = mcpClientManager.getAllTools();
    
    // Deduplicate tools by name (keep first occurrence) and strip session metadata for LLM
    const seenTools = new Set<string>();
    const toolsForLlm = allTools
      .filter(tool => {
        if (seenTools.has(tool.name)) {
          return false;
        }
        seenTools.add(tool.name);
        return true;
      })
      .map(({ _sessionId, _serverUrl, ...tool }) => tool);

    console.log(`[ChatController] Aggregated chat with ${toolsForLlm.length} unique tools (${allTools.length} total) from ${mcpClientManager.getSessionCount()} sessions`);

    // Call LLM with all tools
    let llmResponse = await bedrockService.chat(
      message, 
      history as ChatMessage[], 
      toolsForLlm.length > 0 ? toolsForLlm : undefined, 
      chatOptions
    );

    const allToolsUsed: ChatResponseBody["toolsUsed"] = [];
    let iterations = 0;

    // Agentic loop: keep executing tools until LLM stops requesting them
    // Track conversation for multi-turn tool use
    let allToolCalls: ToolCall[] = [];
    let allToolResults: ToolResult[] = [];

    while (llmResponse.toolCalls && llmResponse.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      console.log(`[ChatController] Tool iteration ${iterations}: LLM requested ${llmResponse.toolCalls.length} tool call(s)`);

      const toolResults: ToolResult[] = [];

      for (const toolCall of llmResponse.toolCalls) {
        console.log(`[ChatController] Executing tool: ${toolCall.toolName}`);
        const startTime = Date.now();

        try {
          // Use the cross-session tool call method
          const result = await mcpClientManager.callToolAcrossSessions(
            toolCall.toolName,
            toolCall.arguments
          );

          const executionTime = Date.now() - startTime;

          toolResults.push({
            toolUseId: toolCall.toolUseId,
            result: result.content,
            isError: false,
          });

          allToolsUsed.push({
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

          allToolsUsed.push({
            name: toolCall.toolName,
            arguments: toolCall.arguments,
            result: { error: error instanceof Error ? error.message : "Unknown error" },
            executionTime: Date.now() - startTime,
          });
        }
      }

      // Accumulate tool calls and results for context
      allToolCalls = [...allToolCalls, ...llmResponse.toolCalls];
      allToolResults = [...allToolResults, ...toolResults];

      // Continue conversation with tool results - LLM may request more tools
      llmResponse = await bedrockService.continueWithToolResults(
        history as ChatMessage[],
        message,
        allToolCalls,
        allToolResults,
        toolsForLlm,
        chatOptions
      );

      console.log(`[ChatController] After tool results: LLM ${llmResponse.toolCalls ? `wants ${llmResponse.toolCalls.length} more tools` : 'is done'}`);
    }

    if (iterations >= MAX_TOOL_ITERATIONS) {
      console.warn(`[ChatController] Hit max tool iterations (${MAX_TOOL_ITERATIONS})`);
    }

    console.log(`[ChatController] Completed with ${allToolsUsed.length} total tool calls across ${iterations} iteration(s)`);

    res.json({
      reply: llmResponse.message,
      toolsUsed: allToolsUsed.length > 0 ? allToolsUsed : undefined,
      usage: llmResponse.usage,
    });
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode);
      return;
    }

    console.error("[ChatController] Aggregated chat error:", error);

    if (error instanceof Error && error.message.includes("Bedrock")) {
      sendError(res, error.message, "BEDROCK_ERROR", 503);
      return;
    }

    next(error);
  }
}

/**
 * GET /api/tools
 * 
 * Get all tools from all connected sessions (aggregated)
 */
export function getAllTools(
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const allTools = mcpClientManager.getAllTools();
  
  res.json({
    tools: allTools.map(({ _sessionId, _serverUrl, ...tool }) => ({
      ...tool,
      source: { sessionId: _sessionId, serverUrl: _serverUrl },
    })),
    count: allTools.length,
    sessionCount: mcpClientManager.getSessionCount(),
  });
}

/**
 * POST /api/session/:sessionId/chat/stream
 * 
 * Streaming version of chat (placeholder for future implementation)
 */
export async function chatStream(
  _req: Request<{ sessionId: string }>,
  res: Response,
  _next: NextFunction
): Promise<void> {
  res.status(501).json({
    error: "Streaming not yet implemented",
    code: "NOT_IMPLEMENTED",
  });
}

/**
 * GET /api/prompts
 * 
 * Get the current prompt configuration (defaults)
 */
export function getPromptConfig(
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.json({
    prompts: config.prompts,
    description: {
      systemPrompt: "Used when LLM decides which tools to use based on user message",
      toolResultPrompt: "Used when LLM processes and summarizes tool execution results",
      standalonePrompt: "Used for pure LLM conversations without tools",
    },
    usage: {
      note: "These are default prompts. You can override them per-request using promptOptions.",
      example: {
        message: "What's the weather?",
        promptOptions: {
          systemPrompt: "You are a weather expert assistant.",
          toolResultPrompt: "Summarize the weather data in a friendly way.",
          temperature: 0.8,
        },
      },
    },
  });
}
