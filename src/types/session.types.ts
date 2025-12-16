import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Session connection status
 */
export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

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
 * Session info for API responses (excludes internal details)
 */
export interface SessionInfo {
  sessionId: string;
  serverUrl: string;
  toolCount: number;
  status: SessionStatus;
  createdAt: string;
}

