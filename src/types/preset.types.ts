/**
 * MCP Preset types for API responses
 */

/**
 * Preset info for API responses
 */
export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  url: string;
  autoConnect: boolean;
  tags?: string[];
  /** Session ID if currently connected */
  sessionId?: string;
  /** Connection status */
  status: "disconnected" | "connected" | "connecting" | "error";
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

