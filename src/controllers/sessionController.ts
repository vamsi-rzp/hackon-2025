import type { Request, Response, NextFunction } from "express";
import { mcpClientManager, McpError } from "../services/McpClientManager.js";
import type {
  ConnectRequest,
  ConnectResponse,
  ExecuteToolRequest,
  ExecuteToolResponse,
  ToolsListResponse,
  DisconnectResponse,
  ErrorResponse,
  SessionInfo,
  HealthResponse,
  ConnectStdioRequest,
} from "../types/index.js";
import { sendError } from "../utils/index.js";

/**
 * POST /api/connect
 * Create a new session and connect to an MCP server via SSE
 */
export async function connectToServer(
  req: Request<object, ConnectResponse | ErrorResponse, ConnectRequest>,
  res: Response<ConnectResponse | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { serverUrl } = req.body;

    if (!serverUrl || typeof serverUrl !== "string") {
      sendError(res, "serverUrl is required and must be a string", "INVALID_REQUEST", 400);
      return;
    }

    console.log(`[SessionController] SSE connection request for: ${serverUrl}`);

    const { sessionId, tools } = await mcpClientManager.connectSse(serverUrl);

    const response: ConnectResponse = {
      sessionId,
      tools,
      serverUrl,
      connectedAt: new Date().toISOString(),
    };

    console.log(`[SessionController] Session ${sessionId} created successfully`);
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode, error.details);
      return;
    }
    next(error);
  }
}

/**
 * POST /api/connect/stdio
 * Create a new session and connect to an MCP server via stdio (spawns a process)
 */
export async function connectStdio(
  req: Request<object, ConnectResponse | ErrorResponse, ConnectStdioRequest>,
  res: Response<ConnectResponse | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { command, args, env, cwd } = req.body;

    if (!command || typeof command !== "string") {
      sendError(res, "command is required and must be a string", "INVALID_REQUEST", 400);
      return;
    }

    if (args !== undefined && !Array.isArray(args)) {
      sendError(res, "args must be an array of strings", "INVALID_REQUEST", 400);
      return;
    }

    const description = `${command} ${(args || []).join(" ")}`;
    console.log(`[SessionController] Stdio connection request for: ${description}`);

    const { sessionId, tools } = await mcpClientManager.connectStdio({
      type: "stdio",
      command,
      args,
      env,
      cwd,
    });

    const response: ConnectResponse = {
      sessionId,
      tools,
      serverUrl: `stdio://${command}`,
      connectedAt: new Date().toISOString(),
    };

    console.log(`[SessionController] Stdio session ${sessionId} created successfully`);
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode, error.details);
      return;
    }
    next(error);
  }
}

/**
 * GET /api/session/:sessionId/tools
 * Get the list of tools for an active session
 */
export function getTools(
  req: Request<{ sessionId: string }, ToolsListResponse | ErrorResponse>,
  res: Response<ToolsListResponse | ErrorResponse>,
  next: NextFunction
): void {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      sendError(res, "sessionId is required", "INVALID_REQUEST", 400);
      return;
    }

    console.log(`[SessionController] Tools request for session: ${sessionId}`);

    const tools = mcpClientManager.getTools(sessionId);

    res.json({
      sessionId,
      tools,
      count: tools.length,
    });
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode, error.details);
      return;
    }
    next(error);
  }
}

/**
 * POST /api/session/:sessionId/tools/refresh
 * Refresh the tools list from the server
 */
export async function refreshTools(
  req: Request<{ sessionId: string }, ToolsListResponse | ErrorResponse>,
  res: Response<ToolsListResponse | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      sendError(res, "sessionId is required", "INVALID_REQUEST", 400);
      return;
    }

    console.log(`[SessionController] Tools refresh request for session: ${sessionId}`);

    const tools = await mcpClientManager.refreshTools(sessionId);

    res.json({
      sessionId,
      tools,
      count: tools.length,
    });
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode, error.details);
      return;
    }
    next(error);
  }
}

/**
 * POST /api/session/:sessionId/execute
 * Execute a tool on the remote MCP server
 */
export async function executeTool(
  req: Request<
    { sessionId: string },
    ExecuteToolResponse | ErrorResponse,
    ExecuteToolRequest
  >,
  res: Response<ExecuteToolResponse | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { toolName, arguments: toolArgs } = req.body;

    if (!sessionId) {
      sendError(res, "sessionId is required", "INVALID_REQUEST", 400);
      return;
    }

    if (!toolName || typeof toolName !== "string") {
      sendError(res, "toolName is required and must be a string", "INVALID_REQUEST", 400);
      return;
    }

    if (toolArgs !== undefined && (typeof toolArgs !== "object" || toolArgs === null)) {
      sendError(res, "arguments must be an object if provided", "INVALID_REQUEST", 400);
      return;
    }

    const args = toolArgs ?? {};

    console.log(`[SessionController] Execute tool '${toolName}' for session: ${sessionId}`);

    const startTime = Date.now();
    const result = await mcpClientManager.callTool(sessionId, toolName, args);
    const executionTime = Date.now() - startTime;

    console.log(`[SessionController] Tool '${toolName}' executed in ${executionTime}ms`);

    res.json({
      success: true,
      result: result.content,
      toolName,
      executionTime,
    });
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode, error.details);
      return;
    }
    next(error);
  }
}

/**
 * DELETE /api/session/:sessionId
 * Disconnect a session and clean up resources
 */
export async function disconnectSession(
  req: Request<{ sessionId: string }, DisconnectResponse | ErrorResponse>,
  res: Response<DisconnectResponse | ErrorResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      sendError(res, "sessionId is required", "INVALID_REQUEST", 400);
      return;
    }

    console.log(`[SessionController] Disconnect request for session: ${sessionId}`);

    await mcpClientManager.disconnect(sessionId);

    console.log(`[SessionController] Session ${sessionId} disconnected`);

    res.json({
      success: true,
      sessionId,
      message: "Session disconnected successfully",
    });
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode, error.details);
      return;
    }
    next(error);
  }
}

/**
 * GET /api/session/:sessionId
 * Get information about a specific session
 */
export function getSession(
  req: Request<{ sessionId: string }, SessionInfo | ErrorResponse>,
  res: Response<SessionInfo | ErrorResponse>,
  next: NextFunction
): void {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      sendError(res, "sessionId is required", "INVALID_REQUEST", 400);
      return;
    }

    console.log(`[SessionController] Session info request for: ${sessionId}`);

    const session = mcpClientManager.getSessionInfo(sessionId);

    if (!session) {
      sendError(res, `Session ${sessionId} not found`, "SESSION_NOT_FOUND", 404);
      return;
    }

    res.json({
      sessionId: session.sessionId,
      serverUrl: session.serverUrl,
      transportType: session.transportType,
      toolCount: session.tools.length,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      pid: session.pid,
    });
  } catch (error) {
    if (error instanceof McpError) {
      sendError(res, error.message, error.code, error.statusCode, error.details);
      return;
    }
    next(error);
  }
}

/**
 * GET /api/sessions
 * List all active sessions
 */
export function listSessions(
  _req: Request,
  res: Response<{ sessions: SessionInfo[]; count: number }>
): void {
  console.log("[SessionController] List all sessions request");

  const sessions = mcpClientManager.getAllSessions();

  res.json({
    sessions: sessions.map(session => ({
      sessionId: session.sessionId,
      serverUrl: session.serverUrl,
      transportType: session.transportType,
      toolCount: session.tools.length,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      pid: session.pid,
    })),
    count: sessions.length,
  });
}

/**
 * GET /api/health
 * Health check endpoint
 */
export function healthCheck(
  _req: Request,
  res: Response<HealthResponse>
): void {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    activeSessions: mcpClientManager.getSessionCount(),
  });
}
