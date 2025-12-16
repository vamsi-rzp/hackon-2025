import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Transport type for MCP connections
 */
export type TransportType = "sse" | "stdio" | "streamable-http";

/**
 * Session connection status
 */
export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * Represents an active MCP session with a server
 */
export interface ActiveSession {
  /** Unique identifier for this session */
  sessionId: string;
  /** For SSE/HTTP: URL, For stdio: command description */
  serverUrl: string;
  /** The MCP Client instance */
  client: Client;
  /** The transport used for communication */
  transport: Transport;
  /** Type of transport being used */
  transportType: TransportType;
  /** Cached list of tools available on this server */
  tools: Tool[];
  /** Timestamp when the session was created */
  createdAt: Date;
  /** Connection status */
  status: SessionStatus;
  /** For stdio transport: the process ID */
  pid?: number;
}

/**
 * Session info for API responses (excludes internal details)
 */
export interface SessionInfo {
  sessionId: string;
  serverUrl: string;
  transportType: TransportType;
  toolCount: number;
  status: SessionStatus;
  createdAt: string;
  pid?: number;
}
