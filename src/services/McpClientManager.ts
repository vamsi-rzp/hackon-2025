import EventSource from "eventsource";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from "uuid";
import type { McpTransportConfig, StdioTransportConfig } from "../config/index.js";

// Apply EventSource polyfill for Node.js environment
if (typeof globalThis.EventSource === "undefined") {
  // @ts-expect-error - Polyfilling global EventSource
  globalThis.EventSource = EventSource;
}

/**
 * Transport type identifier
 */
export type TransportType = "sse" | "stdio" | "streamable-http";

/**
 * Session status
 */
export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * Active session with transport metadata
 */
export interface ActiveSession {
  sessionId: string;
  /** For SSE/HTTP: URL, For stdio: command description */
  serverUrl: string;
  client: Client;
  transport: Transport;
  transportType: TransportType;
  tools: Tool[];
  createdAt: Date;
  status: SessionStatus;
  /** For stdio: the process ID */
  pid?: number;
}

/**
 * Result type for tool execution
 */
export interface ToolResult {
  content: unknown;
  isError?: boolean;
}

/**
 * Custom error class for MCP-related errors
 */
export class McpError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = "McpError";
  }
}

/**
 * McpClientManager - Manages MCP client connections to remote servers
 * 
 * Supports multiple transport types:
 * - SSE (Server-Sent Events) - for remote HTTP-based servers
 * - Stdio - for local process-based servers
 * - Streamable HTTP - for the new MCP HTTP transport
 */
export class McpClientManager {
  private sessions: Map<string, ActiveSession> = new Map();

  constructor() {
    console.log("[McpClientManager] Initialized with SSE and Stdio support");
  }

  /**
   * Connect to an MCP server using the appropriate transport
   */
  async connectWithConfig(config: McpTransportConfig): Promise<{ sessionId: string; tools: Tool[] }> {
    switch (config.type) {
      case "sse":
        return this.connectSse(config.url);
      case "stdio":
        return this.connectStdio(config);
      case "streamable-http":
        // For now, fall back to SSE transport for streamable-http
        // TODO: Implement StreamableHTTPClientTransport when available
        return this.connectSse(config.url);
      default:
        throw new McpError(
          `Unsupported transport type: ${(config as { type: string }).type}`,
          "UNSUPPORTED_TRANSPORT",
          400
        );
    }
  }

  /**
   * Connect to a remote MCP server via SSE
   */
  async connectSse(serverUrl: string): Promise<{ sessionId: string; tools: Tool[] }> {
    const sessionId = uuidv4();
    console.log(`[McpClientManager] Connecting via SSE to ${serverUrl} (Session: ${sessionId})`);

    // Validate URL
    try {
      new URL(serverUrl);
    } catch {
      throw new McpError("Invalid server URL provided", "INVALID_URL", 400);
    }

    // Create the SSE transport
    let transport: SSEClientTransport;
    try {
      transport = new SSEClientTransport(new URL(serverUrl));
    } catch (error) {
      console.error(`[McpClientManager] Failed to create SSE transport:`, error);
      throw new McpError("Failed to create SSE transport", "TRANSPORT_ERROR", 500, error);
    }

    return this.connectWithTransport(sessionId, serverUrl, transport, "sse");
  }

  /**
   * Connect to a local MCP server via stdio (spawns a child process)
   */
  async connectStdio(config: StdioTransportConfig): Promise<{ sessionId: string; tools: Tool[] }> {
    const sessionId = uuidv4();
    const description = `${config.command} ${(config.args || []).join(" ")}`;
    console.log(`[McpClientManager] Connecting via stdio: ${description} (Session: ${sessionId})`);

    // Create the stdio transport
    let transport: StdioClientTransport;
    try {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd: config.cwd,
        stderr: "pipe", // Capture stderr for debugging
      });
    } catch (error) {
      console.error(`[McpClientManager] Failed to create stdio transport:`, error);
      throw new McpError("Failed to create stdio transport", "TRANSPORT_ERROR", 500, error);
    }

    // Log stderr output for debugging (can attach before start)
    if (transport.stderr) {
      transport.stderr.on("data", (data: Buffer) => {
        console.log(`[McpClientManager] [${sessionId.slice(0, 8)}] stderr: ${data.toString().trim()}`);
      });
    }

    // Note: We don't call start() here - client.connect() does that automatically
    const result = await this.connectWithTransport(sessionId, description, transport, "stdio");
    
    // Get PID after connection (process is now started)
    const session = this.sessions.get(sessionId);
    if (session && transport.pid) {
      session.pid = transport.pid;
      console.log(`[McpClientManager] Stdio process PID: ${transport.pid}`);
    }
    
    return result;
  }

  /**
   * Common connection logic for all transport types
   */
  private async connectWithTransport(
    sessionId: string,
    serverUrl: string,
    transport: Transport,
    transportType: TransportType,
    pid?: number
  ): Promise<{ sessionId: string; tools: Tool[] }> {
    // Create the MCP client
    const client = new Client(
      { name: "universal-mcp-gateway", version: "1.0.0" },
      { capabilities: {} }
    );

    // Create session object
    const session: ActiveSession = {
      sessionId,
      serverUrl,
      client,
      transport,
      transportType,
      tools: [],
      createdAt: new Date(),
      status: "connecting",
      pid,
    };

    // Store session before connecting
    this.sessions.set(sessionId, session);

    try {
      console.log(`[McpClientManager] Establishing ${transportType} connection (Session: ${sessionId})`);
      await client.connect(transport);
      
      session.status = "connected";
      console.log(`[McpClientManager] Connected successfully via ${transportType} (Session: ${sessionId})`);

      // Discover tools
      const tools = await this.discoverTools(sessionId);
      console.log(`[McpClientManager] Session ${sessionId} ready with ${tools.length} tools`);
      
      return { sessionId, tools };
    } catch (error) {
      console.error(`[McpClientManager] Connection failed (Session: ${sessionId}):`, error);
      session.status = "error";
      
      try {
        await transport.close();
      } catch {
        // Ignore cleanup errors
      }
      
      this.sessions.delete(sessionId);
      
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
        "CONNECTION_FAILED",
        503,
        error
      );
    }
  }

  /**
   * Legacy connect method (SSE only) - for backward compatibility
   */
  async connect(serverUrl: string): Promise<{ sessionId: string; tools: Tool[] }> {
    return this.connectSse(serverUrl);
  }

  /**
   * Discover tools available on the connected MCP server
   */
  private async discoverTools(sessionId: string): Promise<Tool[]> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(`Session ${sessionId} not found`, "SESSION_NOT_FOUND", 404);
    }

    console.log(`[McpClientManager] Discovering tools (Session: ${sessionId})`);

    try {
      const response = await session.client.listTools();
      session.tools = response.tools;
      
      console.log(`[McpClientManager] Discovered ${session.tools.length} tools:`, 
        session.tools.map(t => t.name).join(", ")
      );
      
      return session.tools;
    } catch (error) {
      console.error(`[McpClientManager] Tool discovery failed (Session: ${sessionId}):`, error);
      throw new McpError(
        `Failed to list tools: ${error instanceof Error ? error.message : String(error)}`,
        "TOOL_DISCOVERY_FAILED",
        500,
        error
      );
    }
  }

  /**
   * Get tools for a session (from cache)
   */
  getTools(sessionId: string): Tool[] {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(`Session ${sessionId} not found`, "SESSION_NOT_FOUND", 404);
    }

    if (session.status !== "connected") {
      throw new McpError(
        `Session ${sessionId} is not connected (status: ${session.status})`,
        "SESSION_NOT_CONNECTED",
        400
      );
    }

    return session.tools;
  }

  /**
   * Refresh tools list from the server
   */
  async refreshTools(sessionId: string): Promise<Tool[]> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(`Session ${sessionId} not found`, "SESSION_NOT_FOUND", 404);
    }

    if (session.status !== "connected") {
      throw new McpError(
        `Session ${sessionId} is not connected (status: ${session.status})`,
        "SESSION_NOT_CONNECTED",
        400
      );
    }

    return this.discoverTools(sessionId);
  }

  /**
   * Execute a tool on the MCP server
   */
  async callTool(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(`Session ${sessionId} not found`, "SESSION_NOT_FOUND", 404);
    }

    if (session.status !== "connected") {
      throw new McpError(
        `Session ${sessionId} is not connected (status: ${session.status})`,
        "SESSION_NOT_CONNECTED",
        400
      );
    }

    // Verify the tool exists
    const tool = session.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new McpError(
        `Tool '${toolName}' not found. Available tools: ${session.tools.map(t => t.name).join(", ")}`,
        "TOOL_NOT_FOUND",
        404
      );
    }

    console.log(`[McpClientManager] Calling tool '${toolName}' via ${session.transportType} (Session: ${sessionId})`);

    try {
      const startTime = Date.now();
      const result = await session.client.callTool({
        name: toolName,
        arguments: args,
      });
      const executionTime = Date.now() - startTime;

      console.log(`[McpClientManager] Tool '${toolName}' executed in ${executionTime}ms`);
      
      if (result.isError) {
        console.warn(`[McpClientManager] Tool '${toolName}' returned an error:`, result.content);
        throw new McpError("Tool execution returned an error", "TOOL_EXECUTION_ERROR", 400, result.content);
      }

      return {
        content: result.content,
        isError: Boolean(result.isError),
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      console.error(`[McpClientManager] Tool execution failed (Session: ${sessionId}):`, error);
      throw new McpError(
        `Failed to execute tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`,
        "TOOL_EXECUTION_FAILED",
        500,
        error
      );
    }
  }

  /**
   * Disconnect a session and clean up resources
   */
  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(`Session ${sessionId} not found`, "SESSION_NOT_FOUND", 404);
    }

    console.log(`[McpClientManager] Disconnecting ${session.transportType} session ${sessionId}`);

    try {
      await session.transport.close();
      session.status = "disconnected";
      console.log(`[McpClientManager] Session ${sessionId} disconnected successfully`);
    } catch (error) {
      console.error(`[McpClientManager] Error during disconnect (Session: ${sessionId}):`, error);
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get session information
   */
  getSessionInfo(sessionId: string): Omit<ActiveSession, "client" | "transport"> | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      serverUrl: session.serverUrl,
      transportType: session.transportType,
      tools: session.tools,
      createdAt: session.createdAt,
      status: session.status,
      pid: session.pid,
    };
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Array<Omit<ActiveSession, "client" | "transport">> {
    const sessions: Array<Omit<ActiveSession, "client" | "transport">> = [];
    
    for (const session of this.sessions.values()) {
      sessions.push({
        sessionId: session.sessionId,
        serverUrl: session.serverUrl,
        transportType: session.transportType,
        tools: session.tools,
        createdAt: session.createdAt,
        status: session.status,
        pid: session.pid,
      });
    }
    
    return sessions;
  }

  /**
   * Get the number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all tools from all connected sessions (aggregated)
   */
  getAllTools(): Array<Tool & { _sessionId: string; _serverUrl: string; _transportType: TransportType }> {
    const allTools: Array<Tool & { _sessionId: string; _serverUrl: string; _transportType: TransportType }> = [];
    
    for (const session of this.sessions.values()) {
      if (session.status === "connected") {
        for (const tool of session.tools) {
          allTools.push({
            ...tool,
            _sessionId: session.sessionId,
            _serverUrl: session.serverUrl,
            _transportType: session.transportType,
          });
        }
      }
    }
    
    return allTools;
  }

  /**
   * Find which session has a specific tool
   */
  findSessionForTool(toolName: string): string | null {
    for (const session of this.sessions.values()) {
      if (session.status === "connected") {
        const hasTool = session.tools.some(t => t.name === toolName);
        if (hasTool) {
          return session.sessionId;
        }
      }
    }
    return null;
  }

  /**
   * Call a tool by name, automatically routing to the correct session
   */
  async callToolAcrossSessions(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const sessionId = this.findSessionForTool(toolName);
    
    if (!sessionId) {
      const allTools = this.getAllTools();
      throw new McpError(
        `Tool '${toolName}' not found in any connected session. Available tools: ${allTools.map(t => t.name).join(", ")}`,
        "TOOL_NOT_FOUND",
        404
      );
    }

    return this.callTool(sessionId, toolName, args);
  }

  /**
   * Disconnect all sessions (for graceful shutdown)
   */
  async disconnectAll(): Promise<void> {
    console.log(`[McpClientManager] Disconnecting all sessions (${this.sessions.size} active)`);
    
    const disconnectPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.disconnect(sessionId).catch(error => {
        console.error(`[McpClientManager] Error disconnecting session ${sessionId}:`, error);
      })
    );
    
    await Promise.all(disconnectPromises);
    console.log("[McpClientManager] All sessions disconnected");
  }
}

// Export a singleton instance
export const mcpClientManager = new McpClientManager();
