/**
 * Centralized configuration for the MCP Gateway Service
 */

/**
 * Transport type for MCP connections
 */
export type McpTransportType = "sse" | "stdio" | "streamable-http";

/**
 * SSE transport configuration
 */
export interface SseTransportConfig {
  type: "sse";
  /** SSE endpoint URL */
  url: string;
}

/**
 * Streamable HTTP transport configuration
 */
export interface StreamableHttpTransportConfig {
  type: "streamable-http";
  /** HTTP endpoint URL */
  url: string;
}

/**
 * Stdio transport configuration
 */
export interface StdioTransportConfig {
  type: "stdio";
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
}

/**
 * Union type for all transport configurations
 */
export type McpTransportConfig = SseTransportConfig | StdioTransportConfig | StreamableHttpTransportConfig;

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
  /** Transport configuration */
  transport: McpTransportConfig;
  /** Whether to auto-connect on startup */
  autoConnect: boolean;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Legacy preset format (for backward compatibility)
 */
interface LegacyMcpPreset {
  id: string;
  name: string;
  description: string;
  url: string;
  autoConnect: boolean;
  tags?: string[];
}

/**
 * Parse MCP presets from environment variable
 * Supports both new format (with transport) and legacy format (with url)
 */
function parsePresets(): McpPreset[] {
  const presetsJson = process.env.MCP_PRESETS;
  if (presetsJson) {
    try {
      const parsed = JSON.parse(presetsJson) as (McpPreset | LegacyMcpPreset)[];
      return parsed.map(p => {
        // Handle legacy format
        if ('url' in p && !('transport' in p)) {
          return {
            id: p.id,
            name: p.name,
            description: p.description,
            transport: { type: "sse", url: p.url } as SseTransportConfig,
            autoConnect: p.autoConnect,
            tags: p.tags,
          };
        }
        return p as McpPreset;
      });
    } catch (e) {
      console.warn("[Config] Failed to parse MCP_PRESETS:", e);
    }
  }
  return [];
}

/**
 * Prompt configuration for LLM interactions
 */
export interface PromptConfig {
  /** System prompt for tool selection phase */
  systemPrompt: string;
  /** System prompt for processing tool results */
  toolResultPrompt: string;
  /** Prompt for standalone chat (no tools) */
  standalonePrompt: string;
}

/**
 * Default prompts - can be overridden via environment or API
 */
const defaultPrompts: PromptConfig = {
  systemPrompt: process.env.LLM_SYSTEM_PROMPT ?? `You are a helpful AI assistant with access to various tools.
When a user asks for something that can be accomplished with one of your tools, use the appropriate tool.
Be concise and friendly in your responses. If you use a tool, briefly explain what you did.
If the user's request doesn't match any available tool, respond helpfully with what you can do.`,

  toolResultPrompt: process.env.LLM_TOOL_RESULT_PROMPT ?? `You are a helpful AI assistant. You just used some tools and received results.
Summarize the results naturally for the user. Be concise and friendly.
If the result contains images, charts, or diagrams (URLs), display them using markdown.
If there were errors, explain them clearly and suggest alternatives.`,

  standalonePrompt: process.env.LLM_STANDALONE_PROMPT ?? `You are a helpful AI assistant. Be concise and friendly in your responses.`,
};

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

  // LLM Prompt configuration
  prompts: defaultPrompts,

  // Feature flags
  features: {
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== "false",
    enableDetailedErrors: process.env.NODE_ENV === "development",
    autoConnectPresets: process.env.AUTO_CONNECT_PRESETS !== "false",
  },

  // Pre-configured MCP servers
  mcpPresets: [
    // SSE-based servers
    {
      id: "sample-tools",
      name: "Sample Tools Server",
      description: "Demo MCP server with echo, calculator, weather, and utility tools",
      transport: { type: "sse", url: "http://localhost:8080/sse" },
      autoConnect: true,
      tags: ["demo", "utilities"],
    },
    {
      id: "mermaid-mcp",
      name: "Mermaid MCP",
      description: "Mermaid diagram creation and rendering",
      transport: { type: "sse", url: "https://mcp.mermaidchart.com/sse" },
      autoConnect: true,
      tags: ["visualization", "diagrams"],
    },

    // Example stdio-based server (commented out - uncomment if you have npx available)
    // {
    //   id: "filesystem-mcp",
    //   name: "Filesystem MCP",
    //   description: "File system operations MCP server",
    //   transport: {
    //     type: "stdio",
    //     command: "npx",
    //     args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    //   },
    //   autoConnect: false,
    //   tags: ["filesystem", "files"],
    // },

    // Add more built-in presets here as needed
    ...parsePresets(),
  ] as McpPreset[],
} as const;

export type Config = typeof config;
