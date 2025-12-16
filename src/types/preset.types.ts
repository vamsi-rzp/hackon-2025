/**
 * MCP Preset types for API responses
 */
import type { McpTransportConfig } from "../config/index.js";

/**
 * Preset info for API responses
 */
export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  /** Transport configuration */
  transport: McpTransportConfig;
  autoConnect: boolean;
  tags?: string[];
  /** Session ID if currently connected */
  sessionId?: string;
  /** Connection status */
  status: "disconnected" | "connected" | "connecting" | "error";
  /** Number of tools available (when connected) */
  toolCount?: number;
}

/**
 * Connect preset request
 */
export interface ConnectPresetRequest {
  presetId: string;
}

/**
 * Connect preset response
 */
export interface ConnectPresetResponse {
  presetId: string;
  sessionId: string;
  name: string;
  toolCount: number;
  connectedAt: string;
}

/**
 * Connect stdio request (for dynamic stdio connections)
 */
export interface ConnectStdioRequest {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}
