import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Request body for creating a new connection
 */
export interface ConnectRequest {
  serverUrl: string;
}

/**
 * Response when a connection is successfully established
 */
export interface ConnectResponse {
  sessionId: string;
  tools: Tool[];
  serverUrl: string;
  connectedAt: string;
}

/**
 * Request body for executing a tool
 */
export interface ExecuteToolRequest {
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Response from tool execution
 */
export interface ExecuteToolResponse {
  success: boolean;
  result: unknown;
  toolName: string;
  executionTime: number;
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Tools list response
 */
export interface ToolsListResponse {
  sessionId: string;
  tools: Tool[];
  count: number;
}

/**
 * Disconnect response
 */
export interface DisconnectResponse {
  success: boolean;
  sessionId: string;
  message: string;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: string;
  timestamp: string;
  activeSessions: number;
}

/**
 * Chat request body
 */
export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  systemPrompt?: string;
}

/**
 * Chat message in history
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Chat response body
 */
export interface ChatResponseBody {
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

