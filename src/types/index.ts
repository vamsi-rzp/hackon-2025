import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Represents an active MCP session with a remote server
 */
export interface ActiveSession {
  /** Unique identifier for this session */
  sessionId: string;
  /** The URL of the connected MCP server */
  serverUrl: string;
  /** The MCP Client instance */
  client: Client;
  /** The SSE transport used for communication */
  transport: SSEClientTransport;
  /** Cached list of tools available on this server */
  tools: Tool[];
  /** Timestamp when the session was created */
  createdAt: Date;
  /** Connection status */
  status: SessionStatus;
}

/**
 * Session connection status
 */
export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

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
 * Session info for listing endpoints
 */
export interface SessionInfo {
  sessionId: string;
  serverUrl: string;
  toolCount: number;
  status: SessionStatus;
  createdAt: string;
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

