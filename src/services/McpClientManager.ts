import EventSource from "eventsource";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from "uuid";
import type { ActiveSession, SessionStatus } from "../types/index.js";

// Apply EventSource polyfill for Node.js environment
// This is required because Node.js doesn't have native EventSource support
if (typeof globalThis.EventSource === "undefined") {
  // @ts-expect-error - Polyfilling global EventSource
  globalThis.EventSource = EventSource;
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
 * This class is responsible for:
 * - Establishing SSE connections to MCP servers
 * - Discovering and caching available tools
 * - Executing tools on remote servers
 * - Managing session lifecycle
 */
export class McpClientManager {
  private sessions: Map<string, ActiveSession> = new Map();

  constructor() {
    console.log("[McpClientManager] Initialized with EventSource polyfill");
  }

  /**
   * Connect to a remote MCP server and create a new session
   * 
   * @param serverUrl - The URL of the MCP server's SSE endpoint
   * @returns The session ID and list of available tools
   */
  async connect(serverUrl: string): Promise<{ sessionId: string; tools: Tool[] }> {
    const sessionId = uuidv4();
    console.log(`[McpClientManager] Connecting to ${serverUrl} (Session: ${sessionId})`);

    // Validate URL
    try {
      new URL(serverUrl);
    } catch {
      throw new McpError(
        "Invalid server URL provided",
        "INVALID_URL",
        400
      );
    }

    // Create the SSE transport
    let transport: SSEClientTransport;
    try {
      transport = new SSEClientTransport(new URL(serverUrl));
    } catch (error) {
      console.error(`[McpClientManager] Failed to create transport:`, error);
      throw new McpError(
        "Failed to create SSE transport",
        "TRANSPORT_ERROR",
        500,
        error
      );
    }

    // Create the MCP client
    const client = new Client(
      {
        name: "universal-mcp-gateway",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    // Create session object (initially connecting)
    const session: ActiveSession = {
      sessionId,
      serverUrl,
      client,
      transport,
      tools: [],
      createdAt: new Date(),
      status: "connecting",
    };

    // Store session before connecting (for cleanup on failure)
    this.sessions.set(sessionId, session);

    try {
      // Connect the client to the transport
      console.log(`[McpClientManager] Establishing connection (Session: ${sessionId})`);
      await client.connect(transport);
      
      session.status = "connected";
      console.log(`[McpClientManager] Connected successfully (Session: ${sessionId})`);

      // Discover tools immediately after connection
      const tools = await this.discoverTools(sessionId);
      
      console.log(`[McpClientManager] Session ${sessionId} ready with ${tools.length} tools`);
      
      return { sessionId, tools };
    } catch (error) {
      // Clean up on connection failure
      console.error(`[McpClientManager] Connection failed (Session: ${sessionId}):`, error);
      session.status = "error";
      
      // Attempt cleanup
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
   * Discover tools available on the connected MCP server
   * 
   * @param sessionId - The session ID to discover tools for
   * @returns List of available tools
   */
  private async discoverTools(sessionId: string): Promise<Tool[]> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(
        `Session ${sessionId} not found`,
        "SESSION_NOT_FOUND",
        404
      );
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
   * 
   * @param sessionId - The session ID
   * @returns Cached list of tools
   */
  getTools(sessionId: string): Tool[] {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(
        `Session ${sessionId} not found`,
        "SESSION_NOT_FOUND",
        404
      );
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
   * 
   * @param sessionId - The session ID
   * @returns Updated list of tools
   */
  async refreshTools(sessionId: string): Promise<Tool[]> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(
        `Session ${sessionId} not found`,
        "SESSION_NOT_FOUND",
        404
      );
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
   * Execute a tool on the remote MCP server
   * 
   * @param sessionId - The session ID
   * @param toolName - The name of the tool to execute
   * @param args - Arguments to pass to the tool
   * @returns The tool execution result
   */
  async callTool(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(
        `Session ${sessionId} not found`,
        "SESSION_NOT_FOUND",
        404
      );
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

    console.log(`[McpClientManager] Calling tool '${toolName}' (Session: ${sessionId})`);
    console.log(`[McpClientManager] Arguments:`, JSON.stringify(args, null, 2));

    try {
      const startTime = Date.now();
      const result = await session.client.callTool({
        name: toolName,
        arguments: args,
      });
      const executionTime = Date.now() - startTime;

      console.log(`[McpClientManager] Tool '${toolName}' executed in ${executionTime}ms`);
      
      // Check if the result indicates an error
      if (result.isError) {
        console.warn(`[McpClientManager] Tool '${toolName}' returned an error:`, result.content);
        throw new McpError(
          `Tool execution returned an error`,
          "TOOL_EXECUTION_ERROR",
          400,
          result.content
        );
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
   * 
   * @param sessionId - The session ID to disconnect
   */
  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new McpError(
        `Session ${sessionId} not found`,
        "SESSION_NOT_FOUND",
        404
      );
    }

    console.log(`[McpClientManager] Disconnecting session ${sessionId}`);

    try {
      // Close the transport
      await session.transport.close();
      session.status = "disconnected";
      
      console.log(`[McpClientManager] Session ${sessionId} disconnected successfully`);
    } catch (error) {
      console.error(`[McpClientManager] Error during disconnect (Session: ${sessionId}):`, error);
      // Still remove the session even if close fails
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get session information
   * 
   * @param sessionId - The session ID
   * @returns Session information (without internal client details)
   */
  getSessionInfo(sessionId: string): Omit<ActiveSession, "client" | "transport"> | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      serverUrl: session.serverUrl,
      tools: session.tools,
      createdAt: session.createdAt,
      status: session.status,
    };
  }

  /**
   * Check if a session exists
   * 
   * @param sessionId - The session ID
   * @returns Whether the session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active sessions
   * 
   * @returns List of all active session IDs and their info
   */
  getAllSessions(): Array<Omit<ActiveSession, "client" | "transport">> {
    const sessions: Array<Omit<ActiveSession, "client" | "transport">> = [];
    
    for (const session of this.sessions.values()) {
      sessions.push({
        sessionId: session.sessionId,
        serverUrl: session.serverUrl,
        tools: session.tools,
        createdAt: session.createdAt,
        status: session.status,
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
   * Each tool includes metadata about which session it belongs to
   */
  getAllTools(): Array<Tool & { _sessionId: string; _serverUrl: string }> {
    const allTools: Array<Tool & { _sessionId: string; _serverUrl: string }> = [];
    
    for (const session of this.sessions.values()) {
      if (session.status === "connected") {
        for (const tool of session.tools) {
          allTools.push({
            ...tool,
            _sessionId: session.sessionId,
            _serverUrl: session.serverUrl,
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

