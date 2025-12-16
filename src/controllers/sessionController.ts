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
} from "../types/index.js";

/**
 * Helper to send error responses
 */
function sendError(
  res: Response,
  message: string,
  code: string,
  statusCode: number = 500,
  details?: unknown
): void {
  const errorResponse: ErrorResponse = {
    error: message,
    code,
    details,
  };
  res.status(statusCode).json(errorResponse);
}

/**
 * POST /api/connect
 * Create a new session and connect to an MCP server
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

    console.log(`[SessionController] Connection request received for: ${serverUrl}`);

    const { sessionId, tools } = await mcpClientManager.connect(serverUrl);

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

    const response: ToolsListResponse = {
      sessionId,
      tools,
      count: tools.length,
    };

    res.json(response);
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

    const response: ToolsListResponse = {
      sessionId,
      tools,
      count: tools.length,
    };

    res.json(response);
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

    const response: ExecuteToolResponse = {
      success: true,
      result: result.content,
      toolName,
      executionTime,
    };

    console.log(`[SessionController] Tool '${toolName}' executed in ${executionTime}ms`);
    res.json(response);
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

    const response: DisconnectResponse = {
      success: true,
      sessionId,
      message: "Session disconnected successfully",
    };

    console.log(`[SessionController] Session ${sessionId} disconnected`);
    res.json(response);
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

    const response: SessionInfo = {
      sessionId: session.sessionId,
      serverUrl: session.serverUrl,
      toolCount: session.tools.length,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
    };

    res.json(response);
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
  res: Response<{ sessions: SessionInfo[]; count: number }>,
  _next: NextFunction
): void {
  console.log("[SessionController] List all sessions request");

  const sessions = mcpClientManager.getAllSessions();

  const response = {
    sessions: sessions.map(session => ({
      sessionId: session.sessionId,
      serverUrl: session.serverUrl,
      toolCount: session.tools.length,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
    })),
    count: sessions.length,
  };

  res.json(response);
}

/**
 * GET /api/health
 * Health check endpoint
 */
export function healthCheck(
  _req: Request,
  res: Response<{ status: string; timestamp: string; activeSessions: number }>,
  _next: NextFunction
): void {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    activeSessions: mcpClientManager.getSessionCount(),
  });
}

