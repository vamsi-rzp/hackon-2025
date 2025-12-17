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

IMPORTANT: For multi-step tasks, you can and SHOULD use multiple tools in sequence. After each tool returns results, analyze if you need to use another tool to complete the user's request.

For example, if the user asks to "fetch rules, generate test cases, and run tests":
1. First use fetch_merchant_rules to get the rules
2. Then use generate_test_cases with the results
3. Finally use execute_test_cases to run and validate them

When a user asks for something that requires multiple steps:
- Break it down into individual tool calls
- Use each tool's output as input for the next step
- Continue until you have completed all requested tasks

Be concise and friendly in your responses. If you use tools, briefly explain what you're doing at each step.`,

  toolResultPrompt: process.env.LLM_TOOL_RESULT_PROMPT ?? `You are a helpful AI assistant. You just used some tools and received results.

IMPORTANT: Check if the user's original request requires MORE tools to be called.
- If yes, call the next appropriate tool(s) to continue the workflow
- If no, summarize the final results naturally for the user

For multi-step workflows like "fetch rules, generate tests, execute tests":
- After fetching rules, you should call generate_test_cases
- After generating test cases, you should call execute_test_cases
- Only summarize when ALL requested steps are complete

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
    // {
    //   id: "sample-tools",
    //   name: "Sample Tools Server",
    //   description: "Demo MCP server with echo, calculator, weather, and utility tools",
    //   transport: { type: "sse", url: "http://localhost:8080/sse" },
    //   autoConnect: true,
    //   tags: ["demo", "utilities"],
    // },
    {
      id: "mock-payment-rules",
      name: "Mock Payment Rules Server",
      description: "Mock server for testing payment routing rules - fetch rules, generate test cases, create payment requests, and execute tests",
      transport: { type: "sse", url: "http://localhost:8081/sse" },
      autoConnect: true,
      tags: ["mock", "payment", "testing"],
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
