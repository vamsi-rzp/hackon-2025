/**
 * Centralized configuration for the MCP Gateway Service
 */

/**
 * Pre-configured MCP server definition
 */
export interface McpPreset {
  /** Unique identifier for this preset */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this MCP server provides */
  description: string;
  /** SSE endpoint URL */
  url: string;
  /** Whether to auto-connect on startup */
  autoConnect: boolean;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Parse MCP presets from environment variable
 * Format: JSON array of McpPreset objects
 */
function parsePresets(): McpPreset[] {
  const presetsJson = process.env.MCP_PRESETS;
  if (presetsJson) {
    try {
      return JSON.parse(presetsJson);
    } catch (e) {
      console.warn("[Config] Failed to parse MCP_PRESETS:", e);
    }
  }
  return [];
}

export const config = {
  // Server settings
  server: {
    port: parseInt(process.env.PORT ?? "3000", 10),
    host: process.env.HOST ?? "0.0.0.0",
    env: process.env.NODE_ENV ?? "development",
  },

  // AWS Bedrock settings
  bedrock: {
    region: process.env.AWS_REGION ?? "us-east-1",
    modelId: process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-sonnet-20240229-v1:0",
    maxTokens: parseInt(process.env.BEDROCK_MAX_TOKENS ?? "2048", 10),
  },

  // Feature flags
  features: {
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== "false",
    enableDetailedErrors: process.env.NODE_ENV === "development",
    autoConnectPresets: process.env.AUTO_CONNECT_PRESETS !== "false",
  },

  // Pre-configured MCP servers
  mcpPresets: [
    // Built-in presets (can be overridden by MCP_PRESETS env var)
    {
      id: "sample-tools",
      name: "Sample Tools Server",
      description: "Demo MCP server with echo, calculator, weather, and utility tools",
      url: "http://localhost:8080/sse",
      autoConnect: true,
      tags: ["demo", "utilities"],
    },

    {
      id: "mermaid-mcp",
      name: "Mermaid MCP",
      description: "Mermaid MCP server",
      url: "https://mcp.mermaidchart.com/sse",
      autoConnect: true,
      tags: ["mermaid", "mcp"],
    },
    // Add more built-in presets here as needed
    ...parsePresets(),
  ] as McpPreset[],
} as const;

export type Config = typeof config;
