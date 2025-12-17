import { config, type McpPreset, type McpTransportConfig } from "../config/index.js";
import { mcpClientManager } from "./McpClientManager.js";
import type { PresetInfo } from "../types/index.js";

/**
 * Helper to get a display URL for a transport config
 */
function getTransportUrl(transport: McpTransportConfig): string {
  switch (transport.type) {
    case "sse":
    case "streamable-http":
      return transport.url;
    case "stdio":
      return `stdio://${transport.command}`;
  }
}

/**
 * PresetManager - Manages pre-configured MCP server connections
 * 
 * Handles:
 * - Loading preset configurations
 * - Auto-connecting to presets on startup
 * - Mapping presets to sessions
 * - Supporting both SSE and stdio transports
 */
export class PresetManager {
  /** Map of preset ID to session ID (for connected presets) */
  private presetSessions: Map<string, string> = new Map();

  constructor() {
    console.log(`[PresetManager] Initialized with ${config.mcpPresets.length} preset(s)`);
  }

  /**
   * Get all available presets
   */
  getPresets(): McpPreset[] {
    return config.mcpPresets;
  }

  /**
   * Get a specific preset by ID
   */
  getPreset(presetId: string): McpPreset | undefined {
    return config.mcpPresets.find(p => p.id === presetId);
  }

  /**
   * Get preset info with connection status
   */
  getPresetInfo(presetId: string): PresetInfo | undefined {
    const preset = this.getPreset(presetId);
    if (!preset) return undefined;

    const sessionId = this.presetSessions.get(presetId);
    const session = sessionId ? mcpClientManager.getSessionInfo(sessionId) : null;

    return {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      transport: preset.transport,
      autoConnect: preset.autoConnect,
      tags: preset.tags,
      sessionId: sessionId,
      status: session?.status ?? "disconnected",
      toolCount: session?.tools.length ?? 0,
    };
  }

  /**
   * Get all presets with their connection status
   */
  getAllPresetInfo(): PresetInfo[] {
    return config.mcpPresets.map(preset => {
      const sessionId = this.presetSessions.get(preset.id);
      const session = sessionId ? mcpClientManager.getSessionInfo(sessionId) : null;

      return {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        transport: preset.transport,
        autoConnect: preset.autoConnect,
        tags: preset.tags,
        sessionId: sessionId,
        status: session?.status ?? "disconnected",
        toolCount: session?.tools.length ?? 0,
      };
    });
  }

  /**
   * Connect to a preset by ID
   */
  async connectPreset(presetId: string): Promise<{ sessionId: string; toolCount: number }> {
    const preset = this.getPreset(presetId);
    if (!preset) {
      throw new Error(`Preset '${presetId}' not found`);
    }

    // Check if already connected
    const existingSessionId = this.presetSessions.get(presetId);
    if (existingSessionId) {
      const session = mcpClientManager.getSessionInfo(existingSessionId);
      if (session && session.status === "connected") {
        console.log(`[PresetManager] Preset '${presetId}' already connected (session: ${existingSessionId})`);
        return { sessionId: existingSessionId, toolCount: session.tools.length };
      }
      // Clean up stale session mapping
      this.presetSessions.delete(presetId);
    }

    const transportUrl = getTransportUrl(preset.transport);
    console.log(`[PresetManager] Connecting to preset '${preset.name}' (${preset.transport.type}: ${transportUrl})`);

    try {
      // Use the new transport-aware connect method
      const { sessionId, tools } = await mcpClientManager.connectWithConfig(preset.transport);
      this.presetSessions.set(presetId, sessionId);
      
      console.log(`[PresetManager] Preset '${preset.name}' connected with ${tools.length} tools`);
      return { sessionId, toolCount: tools.length };
    } catch (error) {
      console.error(`[PresetManager] Failed to connect preset '${preset.name}':`, error);
      throw error;
    }
  }

  /**
   * Disconnect a preset by ID
   */
  async disconnectPreset(presetId: string): Promise<void> {
    const sessionId = this.presetSessions.get(presetId);
    if (!sessionId) {
      console.log(`[PresetManager] Preset '${presetId}' is not connected`);
      return;
    }

    console.log(`[PresetManager] Disconnecting preset '${presetId}'`);
    
    try {
      await mcpClientManager.disconnect(sessionId);
    } catch (error) {
      console.error(`[PresetManager] Error disconnecting preset '${presetId}':`, error);
    } finally {
      this.presetSessions.delete(presetId);
    }
  }

  /**
   * Get session ID for a preset
   */
  getSessionIdForPreset(presetId: string): string | undefined {
    return this.presetSessions.get(presetId);
  }

  /**
   * Auto-connect to all presets marked with autoConnect: true
   */
  async autoConnectPresets(): Promise<void> {
    if (!config.features.autoConnectPresets) {
      console.log("[PresetManager] Auto-connect disabled");
      return;
    }

    const autoConnectPresets = config.mcpPresets.filter(p => p.autoConnect);
    
    if (autoConnectPresets.length === 0) {
      console.log("[PresetManager] No presets configured for auto-connect");
      return;
    }

    console.log(`[PresetManager] Auto-connecting to ${autoConnectPresets.length} preset(s)...`);

    const results = await Promise.allSettled(
      autoConnectPresets.map(preset => this.connectPreset(preset.id))
    );

    let connected = 0;
    let failed = 0;

    results.forEach((result, index) => {
      const preset = autoConnectPresets[index];
      if (result.status === "fulfilled") {
        connected++;
      } else {
        failed++;
        console.error(`[PresetManager] Failed to auto-connect '${preset?.name}':`, result.reason);
      }
    });

    console.log(`[PresetManager] Auto-connect complete: ${connected} connected, ${failed} failed`);
  }
}

// Export singleton instance
export const presetManager = new PresetManager();
